import { z } from 'zod';
import type { GetAppErrorsUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const appErrorsToolName = 'devilge_get_app_errors';

export const appErrorsInputSchema = {
  packageName: z
    .string()
    .min(3)
    .max(256)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+(:[a-zA-Z0-9._-]+)?$/)
    .describe('Application package name, e.g. "com.example.app". Used to scope logs to this app\'s PID.'),
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.'),
  minLevel: z
    .enum(['V', 'D', 'I', 'W', 'E', 'F'])
    .optional()
    .describe('Minimum log level. Defaults to "E" (errors and fatals only).'),
  excludeTags: z
    .array(z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/))
    .max(32)
    .optional()
    .describe('Additional tags to silence on top of the built-in noise filter (Choreographer, OpenGLRenderer, ...).'),
  maxEntries: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Max grouped entries to return. Default 50.'),
  followMs: z
    .number()
    .int()
    .min(1000)
    .max(5 * 60 * 1000)
    .optional()
    .describe(
      'When set, listens to logcat in real time for this many milliseconds (1000–300000) and ' +
        'returns everything that arrived during the window. Use this to capture errors as they ' +
        'happen: open the app on the device, call this tool with e.g. followMs=30000, then ' +
        'reproduce the bug — the response will arrive after the window closes. Throws if the app ' +
        'is not running when the call starts.',
    ),
};

export const appErrorsToolDefinition = {
  title: 'Get app errors (curated)',
  description:
    'Returns recent error-level logs for a specific Android app, filtered by its package name ' +
    '(resolved to PID via `adb shell pidof`). Multi-line stack traces are coalesced into a single ' +
    'entry with `message` + `stackTrace[]`. Default minLevel is "E"; default exclusions filter ' +
    'common Android system noise (Choreographer, OpenGLRenderer, etc.). Returns empty if the app ' +
    'is not running.',
  inputSchema: appErrorsInputSchema,
};

export function buildAppErrorsHandler(useCase: GetAppErrorsUseCase) {
  return async (args: {
    packageName: string;
    serial?: string;
    minLevel?: 'V' | 'D' | 'I' | 'W' | 'E' | 'F';
    excludeTags?: string[];
    maxEntries?: number;
    followMs?: number;
  }) => {
    try {
      const entries = await useCase.execute({
        packageName: args.packageName,
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.minLevel ? { minLevel: args.minLevel } : {}),
        ...(args.excludeTags ? { excludeTags: args.excludeTags } : {}),
        ...(args.maxEntries !== undefined ? { maxEntries: args.maxEntries } : {}),
        ...(args.followMs !== undefined ? { followMs: args.followMs } : {}),
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
