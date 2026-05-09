import { z } from 'zod';
import type { RunGradleTaskUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const runGradleTaskToolName = 'devilge_run_gradle_task';

export const runGradleTaskInputSchema = {
  task: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'Gradle task to run, e.g. "assembleDebug", "test", "lint", "detekt", ' +
        '":app:assembleDebug", ":modules:feature:appointment:test". Some destructive ' +
        'patterns (publish*, *release deploys, uninstall*) are blocked.',
    ),
  extraArgs: z
    .array(z.string().min(1).max(256))
    .max(16)
    .optional()
    .describe('Additional arguments forwarded to Gradle (e.g. ["-PenvName=staging"]).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30 * 60 * 1000)
    .optional()
    .describe('Hard timeout in ms. Default 300000 (5 min). Cap 1800000 (30 min).'),
  tailBytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024)
    .optional()
    .describe('How many bytes of tail output to retain (default 262144 = 256 KiB).'),
};

export const runGradleTaskToolDefinition = {
  title: 'Run a Gradle task',
  description:
    'Runs a Gradle task in the configured Android/KMM project (via the project\'s ' +
    'gradlew wrapper) and returns a structured summary: success flag, parsed compile ' +
    'errors (kotlinc/javac/kapt/ksp), JUnit test results from build/test-results, ' +
    'Android Lint findings, "What went wrong" failure blocks, plus the tail of stdout/stderr.',
  inputSchema: runGradleTaskInputSchema,
  annotations: {
    title: 'Run a Gradle task',
    readOnlyHint: false,
    // Some Gradle tasks (assemble, test) are not idempotent in time and may
    // produce different outputs depending on caches and inputs.
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};

export function buildRunGradleTaskHandler(useCase: RunGradleTaskUseCase) {
  return async (args: {
    task: string;
    extraArgs?: string[];
    timeoutMs?: number;
    tailBytes?: number;
  }) => {
    try {
      const result = await useCase.execute({
        task: args.task,
        ...(args.extraArgs ? { extraArgs: args.extraArgs } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
        ...(args.tailBytes !== undefined ? { tailBytes: args.tailBytes } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
