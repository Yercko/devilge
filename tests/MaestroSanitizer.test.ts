import { describe, it, expect } from 'vitest';
import { CommandSanitizer } from '../src/infrastructure/security/CommandSanitizer.js';
import { SecurityError } from '../src/config/errors.js';

describe('CommandSanitizer.flowName', () => {
  it.each(['login', 'login_happy_path', 'search-property', 'A1'])(
    'accepts %s',
    (s) => {
      expect(CommandSanitizer.flowName(s)).toBe(s);
    },
  );

  it.each(['', '1starts_with_digit', 'with space', '../escape', 'path/segment', 'a.b'])(
    'rejects %s',
    (s) => {
      expect(() => CommandSanitizer.flowName(s)).toThrow(SecurityError);
    },
  );
});

describe('CommandSanitizer.flowEnvKey', () => {
  it.each(['EMAIL', 'user_id', 'apiKey', '_internal'])('accepts %s', (s) => {
    expect(CommandSanitizer.flowEnvKey(s)).toBe(s);
  });

  it.each(['', 'with space', '1bad', 'with-dash', 'with.dot'])('rejects %s', (s) => {
    expect(() => CommandSanitizer.flowEnvKey(s)).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.flowEnvValue', () => {
  it('accepts a normal string', () => {
    expect(CommandSanitizer.flowEnvValue('user@example.com')).toBe('user@example.com');
  });

  it('rejects newlines and NUL', () => {
    expect(() => CommandSanitizer.flowEnvValue('a\nb')).toThrow(SecurityError);
    expect(() => CommandSanitizer.flowEnvValue('a\rb')).toThrow(SecurityError);
    expect(() => CommandSanitizer.flowEnvValue('a\0b')).toThrow(SecurityError);
  });

  it('rejects too-long values', () => {
    expect(() => CommandSanitizer.flowEnvValue('x'.repeat(2000))).toThrow(SecurityError);
  });
});
