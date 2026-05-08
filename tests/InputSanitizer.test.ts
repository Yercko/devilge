import { describe, it, expect } from 'vitest';
import { CommandSanitizer } from '../src/infrastructure/security/CommandSanitizer.js';
import { SecurityError } from '../src/config/errors.js';

describe('CommandSanitizer.inputText', () => {
  it('accepts a normal short string', () => {
    expect(CommandSanitizer.inputText('user@example.com')).toBe('user@example.com');
  });

  it('rejects newlines', () => {
    expect(() => CommandSanitizer.inputText('foo\nbar')).toThrow(SecurityError);
    expect(() => CommandSanitizer.inputText('foo\rbar')).toThrow(SecurityError);
  });

  it('rejects NUL bytes', () => {
    expect(() => CommandSanitizer.inputText('foo\0bar')).toThrow(SecurityError);
  });

  it('rejects too-long strings', () => {
    expect(() => CommandSanitizer.inputText('x'.repeat(2000))).toThrow(SecurityError);
  });

  it('rejects empty strings', () => {
    expect(() => CommandSanitizer.inputText('')).toThrow(SecurityError);
  });

  it('rejects non-strings', () => {
    expect(() => CommandSanitizer.inputText(123 as unknown as string)).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.coordinate', () => {
  it.each([0, 1, 540, 9999, 10_000])('accepts %s', (n) => {
    expect(CommandSanitizer.coordinate(n, 'x')).toBe(n);
  });

  it.each([-1, 10_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
    expect(() => CommandSanitizer.coordinate(n, 'x')).toThrow(SecurityError);
  });

  it('rejects non-numbers', () => {
    expect(() => CommandSanitizer.coordinate('540' as unknown as number, 'x')).toThrow(SecurityError);
  });
});
