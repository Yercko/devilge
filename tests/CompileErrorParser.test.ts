import { describe, it, expect } from 'vitest';
import { CompileErrorParser } from '../src/infrastructure/build/parsers/CompileErrorParser.js';

describe('CompileErrorParser', () => {
  it('parses a kotlinc error with file:// URI', () => {
    const out = `e: file:///Users/foo/bar/App.kt:42:11 Unresolved reference: foo
> Task :app:compileDebugKotlin FAILED`;
    const errors = CompileErrorParser.parse(out);
    expect(errors).toHaveLength(1);
    const first = errors[0]!;
    expect(first.source).toBe('kotlinc');
    expect(first.severity).toBe('error');
    expect(first.file).toBe('/Users/foo/bar/App.kt');
    expect(first.line).toBe(42);
    expect(first.column).toBe(11);
    expect(first.message).toBe('Unresolved reference: foo');
  });

  it('parses a kotlinc warning', () => {
    const out = `w: file:///x/Y.kt:1:1 deprecated thing`;
    const errors = CompileErrorParser.parse(out);
    expect(errors[0]?.severity).toBe('warning');
  });

  it('parses a javac error', () => {
    const out = `src/main/java/Foo.java:42: error: cannot find symbol
  baz();`;
    const errors = CompileErrorParser.parse(out);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('javac');
    expect(errors[0]?.line).toBe(42);
  });

  it('parses ksp errors', () => {
    const out = `[ksp] /abs/path/Foo.kt:10: Some KSP message`;
    const errors = CompileErrorParser.parse(out);
    expect(errors[0]?.source).toBe('ksp');
    expect(errors[0]?.line).toBe(10);
  });

  it('returns empty for clean output', () => {
    expect(
      CompileErrorParser.parse('BUILD SUCCESSFUL in 12s\n4 actionable tasks: 4 executed'),
    ).toHaveLength(0);
  });
});
