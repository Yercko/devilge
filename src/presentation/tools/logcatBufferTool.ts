import { z } from 'zod';
import type { ResizeLogcatBufferUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const resizeLogcatBufferToolName = 'devilge_resize_logcat_buffer';

export const resizeLogcatBufferInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.'),
  sizeMb: z
    .number()
    .int()
    .positive()
    .max(256)
    .describe('New logcat buffer size in MiB (1-256). 16 is a sensible default for verbose Ktor logging.'),
};

export const resizeLogcatBufferToolDefinition = {
  title: 'Resize logcat ring buffer',
  description:
    'Increase the device-side logcat ring buffer so that recent HTTP / app logs are not evicted ' +
    'within seconds. Applies to subsequent captures only — entries already lost are gone. ' +
    'Recommended whenever Ktor LogLevel.ALL produces dozens of lines per request.',
  inputSchema: resizeLogcatBufferInputSchema,
};

export function buildResizeLogcatBufferHandler(useCase: ResizeLogcatBufferUseCase) {
  return async (args: { serial?: string; sizeMb: number }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        sizeMb: args.sizeMb,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { resized: true, ...result, note: 'Already-evicted entries cannot be recovered.' },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
