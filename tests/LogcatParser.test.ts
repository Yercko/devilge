import { describe, it, expect } from 'vitest';
import { parseLogcatLine } from '../src/infrastructure/adb/LogcatParser.js';

describe('parseLogcatLine', () => {
  it('parses a threadtime-format line', () => {
    const line = '04-30 12:34:56.789  1234  5678 I MyTag: hello world';
    const entry = parseLogcatLine(line);
    expect(entry.timestamp).toBe('04-30 12:34:56.789');
    expect(entry.pid).toBe(1234);
    expect(entry.tid).toBe(5678);
    expect(entry.level).toBe('I');
    expect(entry.tag).toBe('MyTag');
    expect(entry.message).toBe('hello world');
  });

  it('falls back to raw on unparseable lines', () => {
    const entry = parseLogcatLine('something not in threadtime format');
    expect(entry.raw).toBe('something not in threadtime format');
    expect(entry.level).toBeUndefined();
    expect(entry.tag).toBeUndefined();
  });

  it('handles empty messages', () => {
    const line = '04-30 12:34:56.789  1234  5678 D Tag: ';
    const entry = parseLogcatLine(line);
    expect(entry.message).toBe('');
  });
});
