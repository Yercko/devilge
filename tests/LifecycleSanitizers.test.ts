import { describe, it, expect } from 'vitest';
import { CommandSanitizer } from '../src/infrastructure/security/CommandSanitizer.js';
import { SecurityError } from '../src/config/errors.js';

describe('CommandSanitizer.activityName', () => {
  it.each([
    '.MainActivity',
    'MainActivity',
    'com.example.MainActivity',
    'com.example.outer.MainActivity$Inner',
  ])('accepts %s', (s) => {
    expect(CommandSanitizer.activityName(s)).toBe(s);
  });

  it.each([
    '',
    'Main Activity',
    '..MainActivity',
    'rm -rf /',
    'Main;Activity',
    'a'.repeat(300),
  ])('rejects %s', (s) => {
    expect(() => CommandSanitizer.activityName(s)).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.deepLink', () => {
  it.each([
    'https://example.com/property/123',
    'http://example.com/foo?bar=baz',
    'myapp://property/abc',
    'app+name://path',
  ])('accepts %s', (s) => {
    expect(CommandSanitizer.deepLink(s)).toBe(s);
  });

  it.each([
    '',
    'no-scheme',
    'http:///empty-host',
    'rm -rf /',
    'http://example.com space',
    'javascript:alert(1)',
    'http://a"b',
  ])('rejects %s', (s) => {
    expect(() => CommandSanitizer.deepLink(s)).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.testClassFqn / testMethodName', () => {
  it('accepts FQ class names', () => {
    expect(CommandSanitizer.testClassFqn('com.example.LoginInstrumentedTest')).toBe(
      'com.example.LoginInstrumentedTest',
    );
  });

  it('rejects single-segment names', () => {
    expect(() => CommandSanitizer.testClassFqn('LoginTest')).toThrow(SecurityError);
  });

  it('accepts inner classes via $', () => {
    expect(CommandSanitizer.testClassFqn('com.example.Outer$Inner')).toBe(
      'com.example.Outer$Inner',
    );
  });

  it.each(['testHappyPath', '_underscoreFirst', 'method$inner'])(
    'accepts method %s',
    (s) => {
      expect(CommandSanitizer.testMethodName(s)).toBe(s);
    },
  );

  it.each(['', '1bad', 'with space', 'rm -rf'])('rejects method %s', (s) => {
    expect(() => CommandSanitizer.testMethodName(s)).toThrow(SecurityError);
  });
});
