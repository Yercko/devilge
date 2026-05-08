import type { GradleTaskResult } from '../entities/index.js';

/**
 * Outbound port for running a build-system command (today: Gradle).
 */
export interface BuildSystemPort {
  runTask(input: RunTaskInput): Promise<GradleTaskResult>;
}

export interface RunTaskInput {
  readonly task: string;             // sanitized upstream
  readonly extraArgs?: readonly string[];
  readonly timeoutMs: number;
  readonly tailBytes: number;        // how many bytes of raw output to keep
}
