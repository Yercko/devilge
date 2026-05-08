import { describe, it, expect } from 'vitest';
import { CommandSanitizer } from '../src/infrastructure/security/CommandSanitizer.js';
import { SecurityError } from '../src/config/errors.js';

describe('CommandSanitizer.deviceSerial', () => {
  it.each([
    'emulator-5554',
    'XPLAB1234',
    '192.168.1.10:5555',
    'A1.B2_C3-D4',
  ])('accepts valid serial %s', (serial) => {
    expect(CommandSanitizer.deviceSerial(serial)).toBe(serial);
  });

  it.each([
    'emulator;rm -rf /',
    'foo bar',
    '`whoami`',
    '$(id)',
    '',
    'a'.repeat(200),
    '../etc/passwd',
  ])('rejects invalid serial %s', (serial) => {
    expect(() => CommandSanitizer.deviceSerial(serial)).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.logcatTag', () => {
  it('accepts well-formed tags', () => {
    expect(CommandSanitizer.logcatTag('MyApp.Network')).toBe('MyApp.Network');
  });

  it('rejects shell metacharacters', () => {
    expect(() => CommandSanitizer.logcatTag('foo;bar')).toThrow(SecurityError);
    expect(() => CommandSanitizer.logcatTag('foo|bar')).toThrow(SecurityError);
    expect(() => CommandSanitizer.logcatTag('')).toThrow(SecurityError);
  });
});

describe('CommandSanitizer.positiveInt', () => {
  it('accepts integers within bounds', () => {
    expect(CommandSanitizer.positiveInt(10, 'maxLines', 1000)).toBe(10);
  });
  it('rejects negatives, zero, non-integers, and too-large', () => {
    expect(() => CommandSanitizer.positiveInt(0, 'maxLines', 1000)).toThrow(SecurityError);
    expect(() => CommandSanitizer.positiveInt(-1, 'maxLines', 1000)).toThrow(SecurityError);
    expect(() => CommandSanitizer.positiveInt(1.5, 'maxLines', 1000)).toThrow(SecurityError);
    expect(() => CommandSanitizer.positiveInt(2000, 'maxLines', 1000)).toThrow(SecurityError);
  });
});
