import type { LogcatEntry, LogLevel } from '../../domain/entities/index.js';

/**
 * Parses a logcat line in `threadtime` format:
 *   MM-DD HH:MM:SS.mmm  PID  TID L TAG: MESSAGE
 * Falls back gracefully when the line does not match.
 */
const THREADTIME_RE =
  /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]+):\s?(.*)$/;

export function parseLogcatLine(raw: string): LogcatEntry {
  const match = THREADTIME_RE.exec(raw);
  if (!match) {
    return { raw };
  }
  // Indices match the regex's capture groups; with `noUncheckedIndexedAccess`
  // we narrow with explicit checks rather than `!`.
  const ts = match[1];
  const pidStr = match[2];
  const tidStr = match[3];
  const level = match[4] as LogLevel | undefined;
  const tag = match[5]?.trim();
  const message = match[6] ?? '';
  if (!ts || !pidStr || !tidStr || !level || !tag) {
    return { raw };
  }
  return {
    raw,
    timestamp: ts,
    pid: Number.parseInt(pidStr, 10),
    tid: Number.parseInt(tidStr, 10),
    level,
    tag,
    message,
  };
}
