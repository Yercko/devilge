import { z } from 'zod';
import type { GetLogcatUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const logcatToolName = 'devilge_get_logcat';

export const logcatToolInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial (from devilge_list_devices). Defaults to the only attached device.'),
  maxLines: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .describe('Maximum number of recent log lines to return.'),
  minLevel: z
    .enum(['V', 'D', 'I', 'W', 'E', 'F', 'S'])
    .optional()
    .describe('Minimum log level to include. Defaults to all.'),
  tagFilter: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional()
    .describe('Restrict output to a single logcat tag.'),
};

export const logcatToolDefinition = {
  title: 'Read Android logcat',
  description:
    'Reads recent logcat output from a connected Android device or emulator using adb. ' +
    'Useful for diagnosing crashes, ANRs, runtime errors, and tracing application logs.',
  inputSchema: logcatToolInputSchema,
  annotations: {
    title: 'Read Android logcat',
    readOnlyHint: true,
    // Logcat is a tail of a mutable buffer — calling it twice may return
    // different entries even with identical args. Hence not idempotent.
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export function buildLogcatToolHandler(useCase: GetLogcatUseCase) {
  return async (args: { serial?: string; maxLines?: number; minLevel?: 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S'; tagFilter?: string }) => {
    try {
      const entries = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.maxLines !== undefined ? { maxLines: args.maxLines } : {}),
        ...(args.minLevel ? { minLevel: args.minLevel } : {}),
        ...(args.tagFilter ? { tagFilter: args.tagFilter } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: entries.length, entries }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
