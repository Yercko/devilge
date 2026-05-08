import { describe, it, expect } from 'vitest';
import type { LogcatEntry } from '../src/domain/entities/index.js';
import { OkHttpLogParser } from '../src/infrastructure/network/OkHttpLogParser.js';

function entry(timestamp: string, message: string, tag = 'OkHttp'): LogcatEntry {
  return {
    raw: `${timestamp}  1  1 I ${tag}: ${message}`,
    timestamp,
    pid: 1,
    tid: 1,
    level: 'I',
    tag,
    message,
  };
}

describe('OkHttpLogParser — Level.BODY', () => {
  it('parses a request/response pair with body', () => {
    const lines = [
      '--> POST https://api.example.com/login http/1.1',
      'Content-Type: application/json',
      'Authorization: Bearer secret',
      'Content-Length: 47',
      '',
      '{"email":"u@e.com","password":"hunter2"}',
      '--> END POST (47-byte body)',
      '',
      '<-- 200 OK https://api.example.com/login (234ms)',
      'Content-Type: application/json',
      'server: nginx',
      '',
      '{"token":"xyz"}',
      '<-- END HTTP (16-byte body)',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.source).toBe('okhttp-logcat');
    expect(call.request.method).toBe('POST');
    expect(call.request.url).toBe('https://api.example.com/login');
    expect(call.request.body).toBe('{"email":"u@e.com","password":"hunter2"}');
    expect(call.request.headers['Content-Type']).toBe('application/json');
    expect(call.request.headers['Authorization']).toBe('[REDACTED]');
    expect(call.response?.statusCode).toBe(200);
    expect(call.response?.statusText).toBe('OK');
    expect(call.response?.fromUrl).toBe('https://api.example.com/login');
    expect(call.response?.body).toBe('{"token":"xyz"}');
  });
});

describe('OkHttpLogParser — Level.HEADERS (no body)', () => {
  it('parses with headers only', () => {
    const lines = [
      '--> GET https://api.example.com/users http/1.1',
      'Accept: application/json',
      '--> END GET',
      '',
      '<-- 200 OK https://api.example.com/users (123ms)',
      'Content-Type: application/json',
      '<-- END HTTP',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.request.body).toBeUndefined();
    expect(call.response?.statusCode).toBe(200);
    expect(call.response?.body).toBeUndefined();
  });
});

describe('OkHttpLogParser — multi-word reason phrase', () => {
  it('parses 500 Internal Server Error correctly', () => {
    const lines = [
      '--> GET https://api.example.com/x http/1.1',
      '--> END GET',
      '',
      '<-- 500 Internal Server Error https://api.example.com/x (234ms)',
      '<-- END HTTP',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.response?.statusCode).toBe(500);
    expect(calls[0]?.response?.statusText).toBe('Internal Server Error');
    expect(calls[0]?.response?.fromUrl).toBe('https://api.example.com/x');
  });
});

describe('OkHttpLogParser — concurrent requests to different URLs', () => {
  it('matches each request with the correct response', () => {
    const lines = [
      '--> GET https://api/a http/1.1',
      '--> END GET',
      '',
      '--> POST https://api/b http/1.1',
      '--> END POST',
      '',
      '<-- 500 Server Error https://api/b (50ms)',
      '<-- END HTTP',
      '',
      '<-- 200 OK https://api/a (100ms)',
      '<-- END HTTP',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(2);
    const a = calls.find((c) => c.request.url === 'https://api/a');
    const b = calls.find((c) => c.request.url === 'https://api/b');
    expect(a?.response?.statusCode).toBe(200);
    expect(b?.response?.statusCode).toBe(500);
    expect(b?.request.method).toBe('POST');
  });
});

describe('OkHttpLogParser — BASIC level (single line)', () => {
  it('parses request/response on single lines without END markers', () => {
    const lines = [
      '--> POST https://api/login http/1.1 (47-byte body)',
      '<-- 200 OK https://api/login (234ms, 16-byte body)',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.method).toBe('POST');
    expect(calls[0]?.request.bodyBytes).toBe(47);
    expect(calls[0]?.response?.statusCode).toBe(200);
    expect(calls[0]?.response?.bodyBytes).toBe(16);
  });
});

describe('OkHttpLogParser — request without response', () => {
  it('returns the request alone when the response is missing from the buffer', () => {
    const lines = [
      '--> POST https://api/x http/1.1',
      '--> END POST',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.url).toBe('https://api/x');
    expect(calls[0]?.response).toBeUndefined();
  });
});

describe('OkHttpLogParser — sensitive headers redaction', () => {
  it('redacts Authorization, Cookie, Set-Cookie', () => {
    const lines = [
      '--> GET https://api/x http/1.1',
      'Authorization: Bearer s3cr3t',
      'Cookie: session=abc',
      'X-Api-Key: my-key',
      '--> END GET',
      '',
      '<-- 200 OK https://api/x (10ms)',
      'Set-Cookie: session=xyz',
      'Content-Type: application/json',
      '<-- END HTTP',
    ].map((m) => entry('05-07 12:00:00.000', m));

    const calls = OkHttpLogParser.parse(lines);
    const req = calls[0]!.request;
    expect(req.headers['Authorization']).toBe('[REDACTED]');
    expect(req.headers['Cookie']).toBe('[REDACTED]');
    expect(req.headers['X-Api-Key']).toBe('[REDACTED]');
    const res = calls[0]!.response!;
    expect(res.headers['Set-Cookie']).toBe('[REDACTED]');
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

describe('OkHttpLogParser — duration computation', () => {
  it('computes durationMs from logcat timestamps', () => {
    const lines = [
      entry('05-07 12:00:00.000', '--> GET https://api/x http/1.1'),
      entry('05-07 12:00:00.000', '--> END GET'),
      entry('05-07 12:00:00.500', '<-- 200 OK https://api/x (234ms)'),
      entry('05-07 12:00:00.500', '<-- END HTTP'),
    ];
    const calls = OkHttpLogParser.parse(lines);
    expect(calls[0]?.durationMs).toBe(500);
  });
});
