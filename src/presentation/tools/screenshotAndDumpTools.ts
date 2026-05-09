import { z } from 'zod';
import type {
  TakeScreenshotUseCase,
  DumpUiUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

// ---------------------------------------------------------------------------
// devilge_take_screenshot
// ---------------------------------------------------------------------------

export const takeScreenshotToolName = 'devilge_take_screenshot';

export const takeScreenshotInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.'),
};

export const takeScreenshotToolDefinition = {
  title: 'Capture device screenshot',
  description:
    'Captures the current device screen (`adb exec-out screencap -p`) and saves a PNG ' +
    'under the configured outputs directory. Returns the absolute path so the LLM client ' +
    'can read the image. Default outputs root: `<projectRoot>/.devilge-outputs/screenshots/`.',
  inputSchema: takeScreenshotInputSchema,
  annotations: {
    title: 'Capture device screenshot',
    // Reads the framebuffer; the only side effect is writing a PNG to the
    // configured outputs directory (already inside a path the user opted in
    // to). Treat as readOnly from the user's perspective.
    readOnlyHint: true,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export function buildTakeScreenshotHandler(useCase: TakeScreenshotUseCase) {
  return async (args: { serial?: string }) => {
    try {
      const result = await useCase.execute(args.serial);
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

// ---------------------------------------------------------------------------
// devilge_dump_ui
// ---------------------------------------------------------------------------

export const dumpUiToolName = 'devilge_dump_ui';

export const dumpUiInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.'),
};

export const dumpUiToolDefinition = {
  title: 'Dump current UI hierarchy',
  description:
    'Captures the current foreground UI tree using `uiautomator dump`. Returns a structured ' +
    'tree of nodes (text, resourceId, contentDescription, bounds, clickable, etc.). Useful for ' +
    'finding elements by text/ID before tapping, or for reasoning about layout state.',
  inputSchema: dumpUiInputSchema,
  annotations: {
    title: 'Dump current UI hierarchy',
    readOnlyHint: true,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export function buildDumpUiHandler(useCase: DumpUiUseCase) {
  return async (args: { serial?: string }) => {
    try {
      const result = await useCase.execute(args.serial);
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
