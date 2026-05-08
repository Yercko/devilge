import type { LogcatEntry, LogLevel } from '../../domain/entities/index.js';

/**
 * Coalesces consecutive logcat entries that look like stack-trace continuations
 * into a single grouped entry.
 *
 * A continuation line is one whose message starts with:
 *   - whitespace + "at "                    (Java/Kotlin frame)
 *   - "Caused by: "                         (chained exception)
 *   - whitespace + "..." + digits           (truncated frames marker)
 *   - whitespace + "Suppressed: "
 */
const FRAME_RE = /^\s+at\s+\S/;
const CAUSED_BY_RE = /^Caused by:\s/;
const ELIDED_RE = /^\s+\.{3}\s*\d/;
const SUPPRESSED_RE = /^\s+Suppressed:\s/;

export interface GroupedLogEntry {
  readonly raw: string;
  readonly timestamp?: string;
  readonly pid?: number;
  readonly tid?: number;
  readonly level?: LogLevel;
  readonly tag?: string;
  readonly message: string;
  readonly stackTrace: readonly string[];
}

export class StackTraceGrouper {
  static group(entries: readonly LogcatEntry[]): readonly GroupedLogEntry[] {
    const out: GroupedLogEntry[] = [];
    let current: MutableEntry | null = null;

    for (const entry of entries) {
      const message = entry.message ?? '';
      if (current && isContinuation(message)) {
        current.stackTrace.push(message);
        continue;
      }
      if (current) {
        out.push(freeze(current));
      }
      current = {
        raw: entry.raw,
        ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
        ...(entry.pid !== undefined ? { pid: entry.pid } : {}),
        ...(entry.tid !== undefined ? { tid: entry.tid } : {}),
        ...(entry.level ? { level: entry.level } : {}),
        ...(entry.tag ? { tag: entry.tag } : {}),
        message,
        stackTrace: [],
      };
    }
    if (current) {
      out.push(freeze(current));
    }
    return out;
  }
}

interface MutableEntry {
  raw: string;
  timestamp?: string;
  pid?: number;
  tid?: number;
  level?: LogLevel;
  tag?: string;
  message: string;
  stackTrace: string[];
}

function isContinuation(message: string): boolean {
  return (
    FRAME_RE.test(message) ||
    CAUSED_BY_RE.test(message) ||
    ELIDED_RE.test(message) ||
    SUPPRESSED_RE.test(message)
  );
}

function freeze(e: MutableEntry): GroupedLogEntry {
  return e;
}
