import { z } from 'zod';
import type { InspectPackagesUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const inspectPackagesToolName = 'devilge_inspect_packages';

export const inspectPackagesInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.'),
  query: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional()
    .describe('Substring filter (e.g. "myapp", "staging", "com.example"). Empty returns up to maxResults installed packages.'),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Maximum results to return. Default 50.'),
};

export const inspectPackagesToolDefinition = {
  title: 'Inspect installed packages',
  description:
    'Lists Android applicationIds installed on the device, optionally filtered by a substring. ' +
    'For each match, reports whether a process is currently running and its PID. ' +
    'Use this to discover the right `packageName` value before calling devilge_get_app_errors.',
  inputSchema: inspectPackagesInputSchema,
};

export function buildInspectPackagesHandler(useCase: InspectPackagesUseCase) {
  return async (args: { serial?: string; query?: string; maxResults?: number }) => {
    try {
      const packages = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.query ? { query: args.query } : {}),
        ...(args.maxResults !== undefined ? { maxResults: args.maxResults } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: packages.length, packages }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
