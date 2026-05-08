/**
 * A single parsed logcat line.
 * Fields beyond `raw` are best-effort; if parsing fails, only `raw` is guaranteed.
 */
export interface LogcatEntry {
  readonly raw: string;
  readonly timestamp?: string;
  readonly pid?: number;
  readonly tid?: number;
  readonly level?: LogLevel;
  readonly tag?: string;
  readonly message?: string;
}

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

export const ALL_LOG_LEVELS: readonly LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F', 'S'];
