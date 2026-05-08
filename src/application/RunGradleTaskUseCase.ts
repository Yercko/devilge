import type { BuildSystemPort } from '../domain/ports/index.js';
import type { GradleTaskResult } from '../domain/entities/index.js';

export interface RunGradleTaskInput {
  readonly task: string;
  readonly extraArgs?: readonly string[];
  readonly timeoutMs?: number;
  readonly tailBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;     // 5 minutes
const DEFAULT_TAIL_BYTES = 256 * 1024;        // 256 KiB
const ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes hard cap

export class RunGradleTaskUseCase {
  constructor(private readonly buildSystem: BuildSystemPort) {}

  async execute(input: RunGradleTaskInput): Promise<GradleTaskResult> {
    const requestedTimeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.max(1_000, Math.min(ABSOLUTE_TIMEOUT_MS, requestedTimeout));
    const tailBytes = Math.max(8 * 1024, Math.min(2 * 1024 * 1024, input.tailBytes ?? DEFAULT_TAIL_BYTES));

    return await this.buildSystem.runTask({
      task: input.task,
      ...(input.extraArgs ? { extraArgs: input.extraArgs } : {}),
      timeoutMs,
      tailBytes,
    });
  }
}
