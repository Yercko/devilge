import type {
  LogcatEntry,
  NetworkCall,
  NetworkRequest,
  NetworkResponse,
} from '../../domain/entities/index.js';
import { HeaderSanitizer } from './HeaderSanitizer.js';

/**
 * Parses OkHttp's `HttpLoggingInterceptor` output as it appears in Android
 * logcat. Retrofit uses OkHttp under the hood, so this parser covers
 * Retrofit-based apps too — the format is identical.
 *
 * Default OkHttp tag in logcat: `OkHttp` (caller passes that as `tagFilter`).
 *
 * Supported levels (HttpLoggingInterceptor):
 *
 *   BASIC:
 *     --> POST https://api/login http/1.1 (47-byte body)
 *     <-- 200 OK https://api/login (234ms, 16-byte body)
 *
 *   HEADERS:
 *     --> POST https://api/login http/1.1
 *     Content-Type: application/json
 *     Content-Length: 47
 *     --> END POST
 *
 *     <-- 200 OK https://api/login (234ms)
 *     Content-Type: application/json
 *     <-- END HTTP
 *
 *   BODY:
 *     --> POST https://api/login http/1.1
 *     Content-Type: application/json
 *     Content-Length: 47
 *
 *     {"email":"…","password":"…"}
 *     --> END POST (47-byte body)
 *
 *     <-- 200 OK https://api/login (234ms)
 *     Content-Type: application/json
 *
 *     {"token":"xyz"}
 *     <-- END HTTP (16-byte body)
 *
 * BODY is the most useful for an LLM to reason about; the parser handles all
 * three gracefully and degrades by simply emitting fewer fields.
 */

const REQUEST_HEADER_RE =
  /^-->\s+([A-Z]+)\s+(\S+)(?:\s+(\S+))?(?:\s+\((\d+)-byte body\))?$/;
const RESPONSE_HEADER_RE =
  /^<--\s+(\d{3})\s+(.*?)\((\d+)ms(?:,\s*(\d+(?:[\d-]*))?-byte body)?\)$/;
const REQUEST_END_RE = /^-->\s+END\s+([A-Z]+)(?:\s+\((\d+)-byte body\))?\s*$/;
const RESPONSE_END_RE = /^<--\s+END\s+HTTP(?:\s+\((\d+)-byte body\))?\s*$/;
const HEADER_LINE_RE = /^([A-Za-z][\w-]*):\s*(.*)$/;

export class OkHttpLogParser {
  static parse(entries: readonly LogcatEntry[]): NetworkCall[] {
    const lines: { text: string; timestamp?: string }[] = [];
    for (const entry of entries) {
      const message = entry.message ?? entry.raw;
      // IMPORTANT: do not skip empty-string messages — they are the body/header
      // separator in OkHttp BODY level. Only skip when the field is absent.
      if (typeof message !== 'string') {
        continue;
      }
      for (const part of message.split('\n')) {
        lines.push({
          text: part,
          ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
        });
      }
    }

    const requests: NetworkRequest[] = [];
    const responses: NetworkResponse[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i += 1;
        continue;
      }
      const text = line.text;

      const reqMatch = REQUEST_HEADER_RE.exec(text);
      if (reqMatch) {
        const method = reqMatch[1] ?? 'UNKNOWN';
        const url = reqMatch[2] ?? '';
        const basicBytes = reqMatch[4];
        const block = readBlock(lines, i + 1, 'request');
        requests.push({
          method,
          url,
          headers: HeaderSanitizer.sanitize(block.headers),
          ...(line.timestamp ? { timestamp: line.timestamp } : {}),
          ...(block.bodyContentType
            ? { bodyContentType: block.bodyContentType }
            : {}),
          ...(block.body !== undefined
            ? {
                body: block.body,
                bodyBytes: byteLength(block.body),
              }
            : basicBytes
              ? { bodyBytes: Number.parseInt(basicBytes, 10) }
              : {}),
        });
        i = block.nextIndex;
        continue;
      }

      const resMatch = RESPONSE_HEADER_RE.exec(text);
      if (resMatch) {
        const statusCode = Number.parseInt(resMatch[1] ?? '0', 10);
        const middle = (resMatch[2] ?? '').trim();
        const tokens = middle.length > 0 ? middle.split(/\s+/) : [];
        const url = tokens.pop() ?? '';
        const reason = tokens.join(' ');
        const basicBytes = resMatch[4];
        const block = readBlock(lines, i + 1, 'response');
        responses.push({
          statusCode,
          ...(reason ? { statusText: reason } : {}),
          ...(url ? { fromUrl: url } : {}),
          ...(line.timestamp ? { timestamp: line.timestamp } : {}),
          headers: HeaderSanitizer.sanitize(block.headers),
          ...(block.bodyContentType
            ? { bodyContentType: block.bodyContentType }
            : {}),
          ...(block.body !== undefined
            ? {
                body: block.body,
                bodyBytes: byteLength(block.body),
              }
            : basicBytes
              ? { bodyBytes: Number.parseInt(basicBytes, 10) }
              : {}),
        });
        i = block.nextIndex;
        continue;
      }

      i += 1;
    }

    return matchPairs(requests, responses);
  }
}

interface BlockResult {
  headers: Record<string, string>;
  bodyContentType?: string;
  body?: string;
  nextIndex: number;
}

/**
 * Walks the lines after a `-->` or `<--` header until the matching
 * `--> END METHOD` / `<-- END HTTP` marker (or the next block header, in case
 * the END is missing — defensive).
 *
 * Headers come BEFORE the first empty line; body comes AFTER it.
 */
function readBlock(
  lines: readonly { text: string; timestamp?: string }[],
  startIdx: number,
  kind: 'request' | 'response',
): BlockResult {
  const headers: Record<string, string> = {};
  const bodyLines: string[] = [];
  let inBody = false;
  let i = startIdx;
  let hasBody = false;
  let bodyContentType: string | undefined;

  while (i < lines.length) {
    const text = lines[i]?.text ?? '';

    if (kind === 'request' && REQUEST_END_RE.test(text)) {
      i += 1;
      break;
    }
    if (kind === 'response' && RESPONSE_END_RE.test(text)) {
      i += 1;
      break;
    }
    // Defensive: if we hit the start of another block without seeing END,
    // stop without consuming the next block's start line.
    if (text.startsWith('--> ') || text.startsWith('<-- ')) {
      break;
    }

    if (!inBody) {
      if (text === '') {
        inBody = true;
        i += 1;
        continue;
      }
      const m = HEADER_LINE_RE.exec(text);
      if (m && m[1]) {
        const name = m[1];
        const value = (m[2] ?? '').trim();
        headers[name] = value;
        if (name.toLowerCase() === 'content-type') {
          bodyContentType = value;
        }
      }
    } else {
      hasBody = true;
      bodyLines.push(text);
    }
    i += 1;
  }

  const body = hasBody ? bodyLines.join('\n').replace(/\n+$/, '') : undefined;
  return {
    headers,
    ...(bodyContentType ? { bodyContentType } : {}),
    ...(body !== undefined ? { body } : {}),
    nextIndex: i,
  };
}

// ---------------------------------------------------------------------------
// pairing (mirrors KtorLogParser — FIFO queue per URL)
// ---------------------------------------------------------------------------

function matchPairs(
  requests: readonly NetworkRequest[],
  responses: readonly NetworkResponse[],
): NetworkCall[] {
  const calls: NetworkCall[] = [];
  const queueByUrl = new Map<string, NetworkCall[]>();
  let nextId = 1;

  for (const req of requests) {
    const call: NetworkCall = {
      id: `okhttp-${nextId++}`,
      source: 'okhttp-logcat',
      request: req,
    };
    calls.push(call);
    const queue = queueByUrl.get(req.url) ?? [];
    queue.push(call);
    queueByUrl.set(req.url, queue);
  }

  for (const res of responses) {
    const url = res.fromUrl ?? '';
    const queue = queueByUrl.get(url);
    const target = queue?.shift();
    if (target) {
      Object.assign(target, {
        response: res,
        durationMs: computeDurationMs(target.request.timestamp, res.timestamp),
      });
    } else {
      calls.push({
        id: `okhttp-${nextId++}`,
        source: 'okhttp-logcat',
        request: { method: 'UNKNOWN', url, headers: {} },
        response: res,
      });
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// helpers (duplicate of KtorLogParser internals; kept local to keep parsers independent)
// ---------------------------------------------------------------------------

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function computeDurationMs(start?: string, end?: string): number | undefined {
  if (!start || !end) {
    return undefined;
  }
  const a = parseLogcatStamp(start);
  const b = parseLogcatStamp(end);
  if (a === null || b === null) {
    return undefined;
  }
  let delta = b - a;
  if (delta < 0 && delta > -24 * 3600 * 1000) {
    delta += 24 * 3600 * 1000;
  }
  return delta < 0 ? undefined : delta;
}

function parseLogcatStamp(stamp: string): number | null {
  const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(stamp);
  if (!m) {
    return null;
  }
  const [, , , hh, mm, ss, ms] = m;
  if (!hh || !mm || !ss || !ms) {
    return null;
  }
  return (
    Number(hh) * 3600_000 +
    Number(mm) * 60_000 +
    Number(ss) * 1000 +
    Number(ms)
  );
}
