import { describe, it, expect } from 'vitest';
import { HeaderSanitizer } from '../src/infrastructure/network/HeaderSanitizer.js';

describe('HeaderSanitizer', () => {
  it('redacts Authorization regardless of casing', () => {
    const out = HeaderSanitizer.sanitize({
      Authorization: 'Bearer abc.def.ghi',
      AUTHORIZATION: 'Bearer 2',
      'content-type': 'application/json',
    });
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.AUTHORIZATION).toBe('[REDACTED]');
    expect(out['content-type']).toBe('application/json');
  });

  it('redacts the standard set of sensitive headers', () => {
    const out = HeaderSanitizer.sanitize({
      Cookie: 'session=xxx',
      'Set-Cookie': 'session=yyy',
      'X-API-Key': 'k',
      'X-Auth-Token': 't',
      'Proxy-Authorization': 'p',
    });
    expect(Object.values(out).every((v) => v === '[REDACTED]')).toBe(true);
  });

  it('isSensitive is case-insensitive', () => {
    expect(HeaderSanitizer.isSensitive('AUTHORIZATION')).toBe(true);
    expect(HeaderSanitizer.isSensitive('content-type')).toBe(false);
  });
});
