import { z } from 'zod';
import { ALLOWED_KEY_CODES, type AllowedKeyCode } from '../../domain/entities/index.js';
import type {
  InputTapUseCase,
  InputTextUseCase,
  InputKeyUseCase,
  InputSwipeUseCase,
  SetInputVisualizationUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

const SERIAL = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.');

const COORD = z.number().int().min(0).max(10_000);

// ---------------------------------------------------------------------------
// devilge_input_tap
// ---------------------------------------------------------------------------

export const inputTapToolName = 'devilge_input_tap';
export const inputTapInputSchema = {
  serial: SERIAL,
  x: COORD.describe('Horizontal coordinate in device pixels.'),
  y: COORD.describe('Vertical coordinate in device pixels.'),
};
export const inputTapToolDefinition = {
  title: 'Tap at device coordinates',
  description:
    'Sends a tap (`adb shell input tap`) at the given device pixel coordinates. ' +
    'Prefer the higher-level `devilge_tap_text` (Phase 13) when available — it is more ' +
    'resilient to layout changes than raw coordinates.',
  inputSchema: inputTapInputSchema,
  annotations: {
    title: 'Tap at device coordinates',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildInputTapHandler(useCase: InputTapUseCase) {
  return async (args: { serial?: string; x: number; y: number }) => {
    try {
      await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        x: args.x,
        y: args.y,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'tap', x: args.x, y: args.y }) }],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_input_text
// ---------------------------------------------------------------------------

export const inputTextToolName = 'devilge_input_text';
export const inputTextInputSchema = {
  serial: SERIAL,
  text: z
    .string()
    .min(1)
    .max(1024)
    .describe('Text to type into the currently focused field. Newlines are rejected — use input_key=ENTER.'),
};
export const inputTextToolDefinition = {
  title: 'Type text into focused field',
  description:
    'Types the given text into whatever field currently has focus on the device ' +
    '(`adb shell input text`). Spaces are escaped to %s by adb. NUL bytes and newlines are rejected.',
  inputSchema: inputTextInputSchema,
  annotations: {
    title: 'Type text into focused field',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildInputTextHandler(useCase: InputTextUseCase) {
  return async (args: { serial?: string; text: string }) => {
    try {
      await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        text: args.text,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'text', length: args.text.length }) }],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_input_key
// ---------------------------------------------------------------------------

export const inputKeyToolName = 'devilge_input_key';
export const inputKeyInputSchema = {
  serial: SERIAL,
  code: z
    .enum(ALLOWED_KEY_CODES as readonly [AllowedKeyCode, ...AllowedKeyCode[]])
    .describe('Hardware/system key to press. Mapped internally to KEYCODE_<NAME>.'),
};
export const inputKeyToolDefinition = {
  title: 'Press a hardware/system key',
  description:
    'Sends a key event (`adb shell input keyevent KEYCODE_<NAME>`). Allowed keys: ' +
    `${ALLOWED_KEY_CODES.join(', ')}.`,
  inputSchema: inputKeyInputSchema,
  annotations: {
    title: 'Press a hardware/system key',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildInputKeyHandler(useCase: InputKeyUseCase) {
  return async (args: { serial?: string; code: AllowedKeyCode }) => {
    try {
      await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        code: args.code,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'key', code: args.code }) }],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_input_swipe
// ---------------------------------------------------------------------------

export const inputSwipeToolName = 'devilge_input_swipe';
export const inputSwipeInputSchema = {
  serial: SERIAL,
  x1: COORD,
  y1: COORD,
  x2: COORD,
  y2: COORD,
  durationMs: z
    .number()
    .int()
    .min(1)
    .max(60_000)
    .optional()
    .describe('Swipe duration in milliseconds. Defaults to 300.'),
};
export const inputSwipeToolDefinition = {
  title: 'Swipe between two coordinates',
  description:
    'Sends a swipe gesture (`adb shell input swipe`) from (x1,y1) to (x2,y2) over `durationMs` ' +
    '(default 300). Useful for scrolling lists, dismissing overlays, performing simple gestures.',
  inputSchema: inputSwipeInputSchema,
  annotations: {
    title: 'Swipe between two coordinates',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildInputSwipeHandler(useCase: InputSwipeUseCase) {
  return async (args: {
    serial?: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    durationMs?: number;
  }) => {
    try {
      await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        x1: args.x1,
        y1: args.y1,
        x2: args.x2,
        y2: args.y2,
        ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'swipe', durationMs: args.durationMs ?? 300 }) }],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_set_input_visualization
// ---------------------------------------------------------------------------

export const setInputVisualizationToolName = 'devilge_set_input_visualization';
export const setInputVisualizationInputSchema = {
  serial: SERIAL,
  enabled: z
    .boolean()
    .describe('true → enable Show Touches + Pointer Location; false → disable both.'),
};
export const setInputVisualizationToolDefinition = {
  title: 'Toggle on-device input visualization',
  description:
    'Toggles the device-side developer options "Show touches" and "Pointer location". ' +
    'When enabled, every tap/swipe leaves a visible marker on screen and the live coords ' +
    'appear in a debug strip — useful to confirm input_tap/input_swipe are landing where ' +
    'expected. Persists until the device reboots. Recommended: enable once at start of a ' +
    'driving session, disable when done.',
  inputSchema: setInputVisualizationInputSchema,
  annotations: {
    title: 'Toggle on-device input visualization',
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildSetInputVisualizationHandler(useCase: SetInputVisualizationUseCase) {
  return async (args: { serial?: string; enabled: boolean }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        enabled: args.enabled,
      });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: true, ...result }) },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
