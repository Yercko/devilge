import { describe, it, expect } from 'vitest';
import type { LogcatEntry } from '../src/domain/entities/index.js';
import { KtorLogParser } from '../src/infrastructure/network/KtorLogParser.js';

function entry(timestamp: string, message: string): LogcatEntry {
  return {
    raw: `${timestamp}  1  1 I HttpClient: ${message}`,
    timestamp,
    pid: 1,
    tid: 1,
    level: 'I',
    tag: 'HttpClient',
    message,
  };
}

const REQUEST_BLOCK = [
  'REQUEST: https://api.example.com/users',
  'METHOD: HttpMethod(value=GET)',
  'COMMON HEADERS',
  '-> Accept: application/json',
  '-> Authorization: Bearer secret-token',
  'CONTENT HEADERS',
  'BODY Content-Type: ',
  'BODY START',
  '',
  'BODY END',
];

const RESPONSE_BLOCK = [
  'RESPONSE: 200 OK',
  'METHOD: HttpMethod(value=GET)',
  'FROM: https://api.example.com/users',
  'COMMON HEADERS',
  '-> content-type: application/json',
  '-> server: nginx',
  'BODY Content-Type: application/json',
  'BODY START',
  '{"users":[{"id":1}]}',
  'BODY END',
];

describe('KtorLogParser', () => {
  it('parses a single request/response pair', () => {
    const lines = [
      ...REQUEST_BLOCK.map((m) => entry('04-30 14:30:15.000', m)),
      ...RESPONSE_BLOCK.map((m) => entry('04-30 14:30:15.250', m)),
    ];

    const calls = KtorLogParser.parse(lines);
    expect(calls).toHaveLength(1);

    const call = calls[0]!;
    expect(call.source).toBe('ktor-logcat');
    expect(call.request.method).toBe('GET');
    expect(call.request.url).toBe('https://api.example.com/users');
    expect(call.request.headers['Authorization']).toBe('[REDACTED]');
    expect(call.request.headers['Accept']).toBe('application/json');
    expect(call.response?.statusCode).toBe(200);
    expect(call.response?.statusText).toBe('OK');
    expect(call.response?.fromUrl).toBe('https://api.example.com/users');
    expect(call.response?.body).toBe('{"users":[{"id":1}]}');
    expect(call.response?.bodyContentType).toBe('application/json');
    expect(call.durationMs).toBe(250);
  });

  it('matches concurrent calls to different URLs correctly', () => {
    const lines = [
      ...['REQUEST: https://api/a', 'METHOD: HttpMethod(value=GET)'].map((m) =>
        entry('04-30 14:30:15.000', m),
      ),
      ...['REQUEST: https://api/b', 'METHOD: HttpMethod(value=POST)'].map((m) =>
        entry('04-30 14:30:15.010', m),
      ),
      ...[
        'RESPONSE: 500 Server Error',
        'METHOD: HttpMethod(value=POST)',
        'FROM: https://api/b',
      ].map((m) => entry('04-30 14:30:15.100', m)),
      ...[
        'RESPONSE: 200 OK',
        'METHOD: HttpMethod(value=GET)',
        'FROM: https://api/a',
      ].map((m) => entry('04-30 14:30:15.200', m)),
    ];

    const calls = KtorLogParser.parse(lines);
    expect(calls).toHaveLength(2);

    const aCall = calls.find((c) => c.request.url === 'https://api/a');
    const bCall = calls.find((c) => c.request.url === 'https://api/b');
    expect(aCall?.response?.statusCode).toBe(200);
    expect(bCall?.response?.statusCode).toBe(500);
    expect(bCall?.request.method).toBe('POST');
  });

  it('returns request-only calls when no response is logged', () => {
    const lines = REQUEST_BLOCK.map((m) => entry('04-30 14:30:15.000', m));
    const calls = KtorLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.response).toBeUndefined();
  });

  it('handles multi-line bodies', () => {
    const lines = [
      'REQUEST: https://api/payload',
      'METHOD: HttpMethod(value=POST)',
      'BODY Content-Type: application/json',
      'BODY START',
      '{',
      '  "first": 1,',
      '  "second": 2',
      '}',
      'BODY END',
    ].map((m) => entry('04-30 14:30:15.000', m));
    const calls = KtorLogParser.parse(lines);
    expect(calls[0]?.request.body).toBe('{\n  "first": 1,\n  "second": 2\n}');
    expect(calls[0]?.request.bodyBytes).toBeGreaterThan(0);
  });
});
