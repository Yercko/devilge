import type { LogLevel } from './Config.js';

/**
 * Minimal structured logger. Writes ONLY to stderr because stdout is reserved
 * for the MCP JSON-RPC transport when running in stdio mode.
 */
export interface Logger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVEL_RANK[level];

  function emit(at: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[at] > threshold) {
      return;
    }
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: at,
      msg: message,
    };
    if (meta) {
      record.meta = meta;
    }
    // Always stderr — never pollute stdio MCP transport.
    process.stderr.write(`${JSON.stringify(record)}\n`);
  }

  return {
    error: (m, meta) => emit('error', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    info: (m, meta) => emit('info', m, meta),
    debug: (m, meta) => emit('debug', m, meta),
  };
}
