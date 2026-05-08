import type { LogcatEntry } from '../../domain/entities/index.js';
import type {
  NetworkCall,
  NetworkRequest,
  NetworkResponse,
} from '../../domain/entities/index.js';
import { HeaderSanitizer } from './HeaderSanitizer.js';

/**
 * Parses Ktor-Logging plugin output as it appears in Android logcat.
 *
 * Sample request block (LogLevel.ALL):
 *   REQUEST: https://api.example.com/users
 *   METHOD: HttpMethod(value=GET)
 *   COMMON HEADERS
 *   -> Accept: application/json
 *   CONTENT HEADERS
 *   -> Content-Type: application/json
 *   BODY Content-Type: application/json
 *   BODY START
 *   {"foo":"bar"}
 *   BODY END
 *
 * Sample response block:
 *   RESPONSE: 200 OK
 *   METHOD: HttpMethod(value=GET)
 *   FROM: https://api.example.com/users
 *   COMMON HEADERS
 *   -> content-type: application/json
 *   BODY Content-Type: application/json
 *   BODY START
 *   {"users":[]}
 *   BODY END
 *
 * The parser is forgiving: missing sections are tolerated, only the
 * REQUEST/RESPONSE delimiters are required.
 */
export class KtorLogParser {
  /**
   * Concatenates all messages, then walks block-by-block. Pairs responses
   * to requests by URL using a FIFO queue per URL (handles concurrent calls
   * to *different* URLs perfectly; concurrent calls to the same URL get
   * matched in the order they were issued, which is the right approximation).
   */
  static parse(entries: readonly LogcatEntry[]): NetworkCall[] {
    const lines: { text: string; timestamp?: string }[] = [];
    for (const entry of entries) {
      const message = entry.message ?? entry.raw;
      // Do not skip empty-string messages: they're meaningful as body/header
      // separators in some HTTP-logger formats. Only drop entries with no field.
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

    const blocks = splitBlocks(lines);

    const requests: NetworkRequest[] = [];
    const responses: NetworkResponse[] = [];
    for (const block of blocks) {
      if (block.kind === 'request') {
        const r = parseRequest(block);
        if (r) {
          requests.push(r);
        }
      } else {
        const r = parseResponse(block);
        if (r) {
          responses.push(r);
        }
      }
    }

    return matchPairs(requests, responses);
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Line {
  text: string;
  timestamp?: string;
}

interface RawBlock {
  kind: 'request' | 'response';
  header: string;
  lines: Line[];
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Block splitting
// ---------------------------------------------------------------------------

const REQUEST_HEADER = /^REQUEST:\s*(.+)$/;
const RESPONSE_HEADER = /^RESPONSE:\s*(\d+)\s*(.*)$/;

function splitBlocks(lines: readonly Line[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  for (const line of lines) {
    if (REQUEST_HEADER.test(line.text)) {
      if (current) {
        blocks.push(current);
      }
      current = {
        kind: 'request',
        header: line.text,
        lines: [],
        ...(line.timestamp ? { timestamp: line.timestamp } : {}),
      };
      continue;
    }
    if (RESPONSE_HEADER.test(line.text)) {
      if (current) {
        blocks.push(current);
      }
      current = {
        kind: 'response',
        header: line.text,
        lines: [],
        ...(line.timestamp ? { timestamp: line.timestamp } : {}),
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    blocks.push(current);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Per-block parsers
// ---------------------------------------------------------------------------

const METHOD_RE = /^METHOD:\s*(?:HttpMethod\(value=)?([A-Za-z]+)\)?/;
const FROM_RE = /^FROM:\s*(.+)$/;
const HEADER_RE = /^->\s*([^:]+):\s*(.*)$/;
const BODY_CONTENT_TYPE_RE = /^BODY Content-Type:\s*(.*)$/;
const BODY_START = /^BODY START\s*$/;
const BODY_END = /^BODY END\s*$/;

interface BlockParseState {
  method?: string;
  fromUrl?: string;
  headers: Record<string, string>;
  bodyContentType?: string;
  body?: string;
}

function readBlockBody(block: RawBlock): BlockParseState {
  const state: BlockParseState = { headers: {} };
  let inBody = false;
  let bodyLines: string[] = [];

  for (const line of block.lines) {
    if (BODY_END.test(line.text)) {
      inBody = false;
      state.body = bodyLines.join('\n');
      bodyLines = [];
      continue;
    }
    if (inBody) {
      bodyLines.push(line.text);
      continue;
    }
    if (BODY_START.test(line.text)) {
      inBody = true;
      bodyLines = [];
      continue;
    }
    const methodMatch = METHOD_RE.exec(line.text);
    if (methodMatch && methodMatch[1]) {
      state.method = methodMatch[1].toUpperCase();
      continue;
    }
    const fromMatch = FROM_RE.exec(line.text);
    if (fromMatch && fromMatch[1]) {
      state.fromUrl = fromMatch[1].trim();
      continue;
    }
    const headerMatch = HEADER_RE.exec(line.text);
    if (headerMatch && headerMatch[1]) {
      const name = headerMatch[1].trim();
      const value = headerMatch[2]?.trim() ?? '';
      state.headers[name] = value;
      continue;
    }
    const bodyTypeMatch = BODY_CONTENT_TYPE_RE.exec(line.text);
    if (bodyTypeMatch && bodyTypeMatch[1]) {
      state.bodyContentType = bodyTypeMatch[1].trim() || undefined;
      continue;
    }
    // ignore section dividers ("COMMON HEADERS", "CONTENT HEADERS", blank lines)
  }
  return state;
}

function parseRequest(block: RawBlock): NetworkRequest | null {
  const m = REQUEST_HEADER.exec(block.header);
  if (!m || !m[1]) {
    return null;
  }
  const url = m[1].trim();
  const state = readBlockBody(block);
  const sanitized = HeaderSanitizer.sanitize(state.headers);

  return {
    method: state.method ?? 'UNKNOWN',
    url,
    headers: sanitized,
    ...(block.timestamp ? { timestamp: block.timestamp } : {}),
    ...(state.bodyContentType ? { bodyContentType: state.bodyContentType } : {}),
    ...(state.body !== undefined ? { body: state.body, bodyBytes: byteLength(state.body) } : {}),
  };
}

function parseResponse(block: RawBlock): NetworkResponse | null {
  const m = RESPONSE_HEADER.exec(block.header);
  if (!m || !m[1]) {
    return null;
  }
  const statusCode = Number.parseInt(m[1], 10);
  if (!Number.isFinite(statusCode)) {
    return null;
  }
  const statusText = (m[2] ?? '').trim();
  const state = readBlockBody(block);
  const sanitized = HeaderSanitizer.sanitize(state.headers);

  return {
    statusCode,
    headers: sanitized,
    ...(statusText ? { statusText } : {}),
    ...(state.fromUrl ? { fromUrl: state.fromUrl } : {}),
    ...(block.timestamp ? { timestamp: block.timestamp } : {}),
    ...(state.bodyContentType ? { bodyContentType: state.bodyContentType } : {}),
    ...(state.body !== undefined ? { body: state.body, bodyBytes: byteLength(state.body) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Pairing
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
      id: `call-${nextId++}`,
      source: 'ktor-logcat',
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
        id: `call-${nextId++}`,
        source: 'ktor-logcat',
        request: { method: 'UNKNOWN', url, headers: {} },
        response: res,
      });
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * Threadtime logcat timestamps look like `04-30 14:30:15.234` (no year).
 * We can compute a relative duration if both timestamps are present and on the
 * same day; otherwise we return undefined.
 */
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
  // Day rollover: if response appears slightly before request, assume it
  // crossed midnight (24h shift). Anything bigger is an unrelated mismatch.
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
