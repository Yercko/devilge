import { z } from 'zod';
import type {
  TapByTextUseCase,
  TapByResourceIdUseCase,
  SetTextUseCase,
  WaitForTextUseCase,
  WaitForResourceIdUseCase,
  WaitForIdleUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

const SERIAL = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.');

// ---------------------------------------------------------------------------
// devilge_tap_text
// ---------------------------------------------------------------------------

export const tapTextToolName = 'devilge_tap_text';
export const tapTextInputSchema = {
  serial: SERIAL,
  text: z
    .string()
    .min(1)
    .max(256)
    .describe('Visible text or contentDescription of the node to tap.'),
  contains: z
    .boolean()
    .optional()
    .describe('If true, substring match (case-insensitive). Default false (exact match).'),
};
export const tapTextToolDefinition = {
  title: 'Tap node by visible text',
  description:
    'Internally dumps the UI, finds the unique node whose `text` or `contentDescription` ' +
    'matches, and taps its bounds center. Errors when 0 or >1 matches — the caller must ' +
    'disambiguate with a more specific text or use `contains` for substring match.',
  inputSchema: tapTextInputSchema,
};
export function buildTapByTextHandler(useCase: TapByTextUseCase) {
  return async (args: { serial?: string; text: string; contains?: boolean }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        text: args.text,
        ...(args.contains !== undefined ? { contains: args.contains } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_tap_resource_id
// ---------------------------------------------------------------------------

export const tapResourceIdToolName = 'devilge_tap_resource_id';
export const tapResourceIdInputSchema = {
  serial: SERIAL,
  id: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-zA-Z][\w.:_/-]*$/)
    .describe('Resource id (Compose `Modifier.testTag` or Android resource-id) of the node to tap.'),
};
export const tapResourceIdToolDefinition = {
  title: 'Tap node by resource id',
  description:
    'Like devilge_tap_text but matches by `resource-id`. More stable across copy/locale changes ' +
    'than text matching when the project uses Modifier.testTag.',
  inputSchema: tapResourceIdInputSchema,
};
export function buildTapByResourceIdHandler(useCase: TapByResourceIdUseCase) {
  return async (args: { serial?: string; id: string }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        id: args.id,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_set_text
// ---------------------------------------------------------------------------

export const setTextToolName = 'devilge_set_text';
export const setTextInputSchema = {
  serial: SERIAL,
  label: z
    .string()
    .min(1)
    .max(128)
    .describe('Visible label of the input field (e.g. "Email"). Heuristic match against contentDescription, hint, or sibling label.'),
  value: z
    .string()
    .min(1)
    .max(1024)
    .describe('Text to type after focusing the field.'),
};
export const setTextToolDefinition = {
  title: 'Find input field by label and type into it',
  description:
    'Locates the input field associated with a label, taps to focus it, and types the given value. ' +
    'Heuristic: focused EditText → contentDescription match → text match → EditText after a label TextView. ' +
    'Returns the matched field summary.',
  inputSchema: setTextInputSchema,
};
export function buildSetTextHandler(useCase: SetTextUseCase) {
  return async (args: { serial?: string; label: string; value: string }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        label: args.label,
        value: args.value,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_wait_for_text
// ---------------------------------------------------------------------------

const TIMEOUT = z.number().int().min(500).max(60_000).optional();

export const waitForTextToolName = 'devilge_wait_for_text';
export const waitForTextInputSchema = {
  serial: SERIAL,
  text: z.string().min(1).max(256).describe('Text to wait for.'),
  contains: z.boolean().optional().describe('Substring match. Default true.'),
  timeoutMs: TIMEOUT.describe('Max wait in ms (500..60000). Default 10000.'),
};
export const waitForTextToolDefinition = {
  title: 'Wait until text appears on screen',
  description:
    'Polls the UI dump until a node whose text or contentDescription matches appears, or the ' +
    'timeout elapses. Returns `{matched, attempts, elapsedMs, matchedNode?}`. Never throws — the ' +
    'caller branches on `matched`.',
  inputSchema: waitForTextInputSchema,
};
export function buildWaitForTextHandler(useCase: WaitForTextUseCase) {
  return async (args: { serial?: string; text: string; contains?: boolean; timeoutMs?: number }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        text: args.text,
        ...(args.contains !== undefined ? { contains: args.contains } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_wait_for_resource_id
// ---------------------------------------------------------------------------

export const waitForResourceIdToolName = 'devilge_wait_for_resource_id';
export const waitForResourceIdInputSchema = {
  serial: SERIAL,
  id: z.string().min(1).max(256).regex(/^[a-zA-Z][\w.:_/-]*$/).describe('Resource id to wait for.'),
  timeoutMs: TIMEOUT.describe('Max wait in ms (500..60000). Default 10000.'),
};
export const waitForResourceIdToolDefinition = {
  title: 'Wait until a resource-id appears on screen',
  description:
    'Polls the UI dump until a node with the given resource-id appears, or timeout.',
  inputSchema: waitForResourceIdInputSchema,
};
export function buildWaitForResourceIdHandler(useCase: WaitForResourceIdUseCase) {
  return async (args: { serial?: string; id: string; timeoutMs?: number }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        id: args.id,
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_wait_for_idle
// ---------------------------------------------------------------------------

export const waitForIdleToolName = 'devilge_wait_for_idle';
export const waitForIdleInputSchema = {
  serial: SERIAL,
  timeoutMs: TIMEOUT.describe('Max wait in ms (500..60000). Default 10000.'),
  stableSamples: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .describe('Number of consecutive identical UI dumps to declare idle. Default 3.'),
};
export const waitForIdleToolDefinition = {
  title: 'Wait until the UI settles',
  description:
    'Polls the UI dump and returns when N consecutive dumps have an identical structural digest, ' +
    'or the timeout elapses. Useful between a tap and the next action to absorb animations / ' +
    'asynchronous updates without sleeps.',
  inputSchema: waitForIdleInputSchema,
};
export function buildWaitForIdleHandler(useCase: WaitForIdleUseCase) {
  return async (args: { serial?: string; timeoutMs?: number; stableSamples?: number }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
        ...(args.stableSamples !== undefined ? { stableSamples: args.stableSamples } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}
