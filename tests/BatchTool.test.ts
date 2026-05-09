import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  batchToolName,
  batchInputSchema,
  buildBatchToolHandler,
  BATCH_FORBIDDEN_TOOLS,
  BATCH_MAX_ACTIONS,
  type BatchToolEntry,
  type BatchToolRegistry,
} from '../src/presentation/tools/batchTool.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRegistry(entries: Record<string, BatchToolEntry>): BatchToolRegistry {
  return new Map(Object.entries(entries));
}

function asText(item: unknown): string {
  if (
    typeof item === 'object' &&
    item !== null &&
    (item as { type?: string }).type === 'text'
  ) {
    return (item as { text: string }).text;
  }
  return JSON.stringify(item);
}

function joinText(content: { type: string; [key: string]: unknown }[]): string {
  return content.map(asText).join('\n');
}

// A no-arg tool that just records being called.
function makeNoArgTool(label: string, calls: string[]): BatchToolEntry {
  return {
    inputSchema: {},
    handler: async () => {
      calls.push(label);
      return { content: [{ type: 'text', text: `executed ${label}` }] };
    },
  };
}

// A tool that requires a `text` string.
function makeTextTool(label: string, calls: { label: string; input: unknown }[]): BatchToolEntry {
  return {
    inputSchema: {
      text: z.string().min(1).max(64),
    },
    handler: async (input) => {
      calls.push({ label, input });
      return {
        content: [{ type: 'text', text: `${label} got "${(input as { text: string }).text}"` }],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// schema-level validation (bounds)
// ---------------------------------------------------------------------------

describe('batchInputSchema', () => {
  it('rejects an empty actions array', () => {
    const schema = z.object(batchInputSchema);
    const result = schema.safeParse({ actions: [] });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BATCH_MAX_ACTIONS} actions`, () => {
    const schema = z.object(batchInputSchema);
    const tooMany = Array.from({ length: BATCH_MAX_ACTIONS + 1 }, () => ({
      name: 'devilge_some_tool',
      input: {},
    }));
    const result = schema.safeParse({ actions: tooMany });
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${BATCH_MAX_ACTIONS} actions`, () => {
    const schema = z.object(batchInputSchema);
    const max = Array.from({ length: BATCH_MAX_ACTIONS }, () => ({
      name: 'devilge_some_tool',
      input: {},
    }));
    const result = schema.safeParse({ actions: max });
    expect(result.success).toBe(true);
  });

  it('rejects names that do not start with devilge_', () => {
    const schema = z.object(batchInputSchema);
    const result = schema.safeParse({ actions: [{ name: 'evil_tool' }] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runtime: sequential execution
// ---------------------------------------------------------------------------

describe('buildBatchToolHandler — sequential execution', () => {
  it('runs each action in order and returns concatenated output', async () => {
    const calls: string[] = [];
    const registry = makeRegistry({
      devilge_a: makeNoArgTool('A', calls),
      devilge_b: makeNoArgTool('B', calls),
      devilge_c: makeNoArgTool('C', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_a' },
        { name: 'devilge_b' },
        { name: 'devilge_c' },
      ],
    });

    expect(calls).toEqual(['A', 'B', 'C']);
    expect(result.isError).toBeUndefined();
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_OK] ran 3/3 steps');
    expect(txt).toContain('--- step 1/3: devilge_a ---');
    expect(txt).toContain('--- step 2/3: devilge_b ---');
    expect(txt).toContain('--- step 3/3: devilge_c ---');
    expect(txt).toContain('executed A');
    expect(txt).toContain('executed B');
    expect(txt).toContain('executed C');
  });

  it('passes validated input to each sub-tool', async () => {
    const calls: { label: string; input: unknown }[] = [];
    const registry = makeRegistry({
      devilge_say: makeTextTool('say', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_say', input: { text: 'hello' } },
        { name: 'devilge_say', input: { text: 'world' } },
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(calls).toEqual([
      { label: 'say', input: { text: 'hello' } },
      { label: 'say', input: { text: 'world' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// runtime: error stopping
// ---------------------------------------------------------------------------

describe('buildBatchToolHandler — error stopping', () => {
  it('stops on first sub-tool that throws', async () => {
    const calls: string[] = [];
    const throwing: BatchToolEntry = {
      inputSchema: {},
      handler: async () => {
        throw new Error('boom from B');
      },
    };
    const registry = makeRegistry({
      devilge_a: makeNoArgTool('A', calls),
      devilge_b: throwing,
      devilge_c: makeNoArgTool('C', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_a' },
        { name: 'devilge_b' },
        { name: 'devilge_c' },
      ],
    });

    expect(calls).toEqual(['A']); // only A ran; B threw; C never reached
    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_ABORTED] stopped at step 2/3');
    expect(txt).toContain('[BATCH_STEP_THREW] step 2/3 (devilge_b): boom from B');
  });

  it('stops on first sub-tool that returns isError', async () => {
    const calls: string[] = [];
    const erroring: BatchToolEntry = {
      inputSchema: {},
      handler: async () => ({
        content: [{ type: 'text', text: '[ADB_ERROR] device not found' }],
        isError: true,
      }),
    };
    const registry = makeRegistry({
      devilge_a: makeNoArgTool('A', calls),
      devilge_b: erroring,
      devilge_c: makeNoArgTool('C', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_a' },
        { name: 'devilge_b' },
        { name: 'devilge_c' },
      ],
    });

    expect(calls).toEqual(['A']); // C never reached
    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_ABORTED] stopped at step 2/3');
    expect(txt).toContain("sub-tool 'devilge_b' returned isError");
    // The error text from B should still be present in the output.
    expect(txt).toContain('[ADB_ERROR] device not found');
  });
});

// ---------------------------------------------------------------------------
// runtime: guards
// ---------------------------------------------------------------------------

describe('buildBatchToolHandler — guards', () => {
  it('refuses to nest batch inside batch', async () => {
    const calls: string[] = [];
    const registry = makeRegistry({
      devilge_a: makeNoArgTool('A', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_a' },
        { name: batchToolName, input: { actions: [{ name: 'devilge_a' }] } },
      ],
    });

    expect(calls).toEqual(['A']);
    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_NESTING_FORBIDDEN]');
    expect(txt).toContain('cannot be nested');
  });

  it('refuses destructive sub-tools (clear_app_data, install_apk)', async () => {
    expect(BATCH_FORBIDDEN_TOOLS.has('devilge_clear_app_data')).toBe(true);
    expect(BATCH_FORBIDDEN_TOOLS.has('devilge_install_apk')).toBe(true);

    // Even if the destructive tools are *registered*, the batch must reject
    // them. Register fake stand-ins to prove the gate runs before lookup.
    const registry = makeRegistry({
      devilge_clear_app_data: {
        inputSchema: {},
        handler: async () => ({ content: [{ type: 'text', text: 'should not run' }] }),
      },
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [{ name: 'devilge_clear_app_data' }],
    });

    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_DESTRUCTIVE_FORBIDDEN]');
    expect(txt).toContain("'devilge_clear_app_data' is destructive");
  });

  it('rejects unknown tools', async () => {
    const registry = makeRegistry({});
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [{ name: 'devilge_phantom' }],
    });

    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_UNKNOWN_TOOL]');
    expect(txt).toContain("tool 'devilge_phantom' is not registered");
  });

  it('rejects sub-tool input that fails its schema', async () => {
    const calls: { label: string; input: unknown }[] = [];
    const registry = makeRegistry({
      devilge_say: makeTextTool('say', calls),
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [{ name: 'devilge_say', input: { text: '' } }], // min(1) violation
    });

    expect(calls).toEqual([]); // handler never invoked
    expect(result.isError).toBe(true);
    const txt = joinText(result.content);
    expect(txt).toContain('[BATCH_INVALID_INPUT]');
    expect(txt).toContain('devilge_say');
  });
});

// ---------------------------------------------------------------------------
// runtime: content shape
// ---------------------------------------------------------------------------

describe('buildBatchToolHandler — content layout', () => {
  it('appends non-text content items at the end of the response', async () => {
    const registry = makeRegistry({
      devilge_capture: {
        inputSchema: {},
        handler: async () => ({
          content: [
            { type: 'text', text: 'screenshot saved at /tmp/x.png' },
            { type: 'image', data: 'base64-bytes', mimeType: 'image/png' },
          ],
        }),
      },
      devilge_after: {
        inputSchema: {},
        handler: async () => ({
          content: [{ type: 'text', text: 'after capture' }],
        }),
      },
    });
    const handler = buildBatchToolHandler(registry);

    const result = await handler({
      actions: [
        { name: 'devilge_capture' },
        { name: 'devilge_after' },
      ],
    });

    expect(result.isError).toBeUndefined();
    // The image must be the last item, after the trailing summary's text.
    const lastItem = result.content[result.content.length - 1];
    expect((lastItem as { type: string }).type).toBe('image');
    // The 'after capture' text must come BEFORE the image.
    const lastTextIdx = result.content.findIndex(
      (c) => (c as { type: string; text?: string }).text === 'after capture',
    );
    const imageIdx = result.content.length - 1;
    expect(lastTextIdx).toBeGreaterThan(-1);
    expect(lastTextIdx).toBeLessThan(imageIdx);
  });
});
