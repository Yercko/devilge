/**
 * Redacts well-known sensitive headers before exposing them to the LLM.
 * Keep this list conservative — over-redaction is safer than under-redaction.
 */
const SENSITIVE_HEADERS = new Set<string>([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'api-key',
  'apikey',
  'x-access-token',
  'x-session-id',
  'x-amz-security-token',
]);

const REDACTED = '[REDACTED]';

export class HeaderSanitizer {
  static sanitize(
    headers: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
        out[name] = REDACTED;
      } else {
        out[name] = value;
      }
    }
    return out;
  }

  static isSensitive(headerName: string): boolean {
    return SENSITIVE_HEADERS.has(headerName.toLowerCase());
  }
}
