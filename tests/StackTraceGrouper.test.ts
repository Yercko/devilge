import { describe, it, expect } from 'vitest';
import type { LogcatEntry } from '../src/domain/entities/index.js';
import { StackTraceGrouper } from '../src/infrastructure/log/StackTraceGrouper.js';

function entry(message: string, tag = 'LoginViewModel'): LogcatEntry {
  return {
    raw: `04-30 16:58:18.722  7134  7134 E ${tag}: ${message}`,
    timestamp: '04-30 16:58:18.722',
    pid: 7134,
    tid: 7134,
    level: 'E',
    tag,
    message,
  };
}

describe('StackTraceGrouper', () => {
  it('coalesces consecutive `at ` frames into the previous entry', () => {
    const entries = [
      entry('Error loginUseCase'),
      entry('io.ktor.client.plugins.ClientRequestException: Client request failed'),
      entry('    at io.ktor.client.plugins.DefaultResponseValidationKt$add$1.invokeSuspend(SourceFile:42)'),
      entry('    at io.ktor.client.plugins.HttpCallValidatorKt.HttpCallValidator(SourceFile:24)'),
      entry('    at kotlin.coroutines.jvm.internal.BaseContinuationImpl.resumeWith(BaseContinuation.kt:33)'),
    ];
    const out = StackTraceGrouper.group(entries);
    // 'Error loginUseCase' is its own entry (no continuation pattern).
    // 'io.ktor...' is a fresh entry (doesn't start with `at`/`Caused by`).
    // The 3 `at ...` frames attach to 'io.ktor...'.
    expect(out).toHaveLength(2);
    expect(out[1]?.message).toContain('ClientRequestException');
    expect(out[1]?.stackTrace).toHaveLength(3);
    expect(out[1]?.stackTrace[0]).toContain('DefaultResponseValidationKt');
  });

  it('chains `Caused by:` blocks with their frames', () => {
    const entries = [
      entry('java.lang.RuntimeException: outer'),
      entry('    at com.example.Foo.bar(Foo.kt:10)'),
      entry('Caused by: java.io.IOException: inner'),
      entry('    at com.example.Foo.read(Foo.kt:5)'),
    ];
    const out = StackTraceGrouper.group(entries);
    expect(out).toHaveLength(1);
    expect(out[0]?.stackTrace).toHaveLength(3);
    expect(out[0]?.stackTrace[1]).toContain('Caused by');
  });

  it('keeps unrelated entries separate', () => {
    const entries = [
      entry('first error'),
      entry('second error'),
      entry('third error'),
    ];
    const out = StackTraceGrouper.group(entries);
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.stackTrace.length === 0)).toBe(true);
  });

  it('handles ellipsis "... 12 more" frames', () => {
    const entries = [
      entry('java.lang.RuntimeException: oops'),
      entry('    at com.example.A.foo(A.kt:1)'),
      entry('    ... 12 more'),
    ];
    const out = StackTraceGrouper.group(entries);
    expect(out).toHaveLength(1);
    expect(out[0]?.stackTrace).toHaveLength(2);
  });
});
