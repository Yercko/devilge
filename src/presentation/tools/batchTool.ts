import { z } from 'zod';

// ---------------------------------------------------------------------------
// devilge_batch
//
// Executes a sequence of devilge tools in a single MCP round trip. The goal
// is to reduce permission-prompt fatigue and round-trip overhead when the
// agent already knows the next N steps (e.g. tap → wait_for_idle →
// take_screenshot, repeated for several screens).
//
// Safety rules (enforced here, not by the client):
//   - Cannot call itself (no nesting).
//   - Cannot include destructive sub-tools — those must be invoked directly
//     so the user always gets their own confirmation prompt.
//   - Sub-tool inputs are validated against each target tool's inputSchema
//     before the handler runs.
//   - Stops on the first error and reports `isError: true`. Subsequent steps
//     are not attempted.
// ---------------------------------------------------------------------------

export const batchToolName = 'devilge_batch';

export const BATCH_MAX_ACTIONS = 20;

/**
 * Tools that must never appear inside a batch. Matches the destructive set
 * declared via tool annotations. The list is enforced in the batch handler
 * so a client that auto-approves `devilge_batch` cannot inadvertently grant
 * destructive operations through it.
 */
export const BATCH_FORBIDDEN_TOOLS: ReadonlySet<string> = new Set([
  'devilge_clear_app_data',
  'devilge_install_apk',
]);

export const batchInputSchema = {
  actions: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(128)
          .regex(/^devilge_[a-z0-9_]+$/)
          .describe('Name of the devilge tool to invoke (e.g. "devilge_tap_text").'),
        input: z
          .record(z.unknown())
          .optional()
          .describe(
            'Arguments for the sub-tool, matching its inputSchema. Omit if the tool takes none.',
          ),
      }),
    )
    .min(1)
    .max(BATCH_MAX_ACTIONS)
    .describe(
      `Sequence of devilge tools to invoke in order. Capped at ${BATCH_MAX_ACTIONS} per call.`,
    ),
};

export const batchToolDefinition = {
  title: 'Run a sequence of devilge tools in one round trip',
  description:
    'Executes a sequence of devilge tools sequentially in a single MCP call. ' +
    'Stops on the first error. Use this to chain predictable steps such as ' +
    'tap → wait_for_idle → take_screenshot, reducing tool-call overhead and ' +
    'permission prompts in the host UI.\n\n' +
    'Rules:\n' +
    `  • Capped at ${BATCH_MAX_ACTIONS} actions per call.\n` +
    '  • Cannot call itself (no nesting).\n' +
    '  • Cannot include destructive tools (devilge_clear_app_data, ' +
    'devilge_install_apk). Invoke those directly so the user always sees a ' +
    'dedicated confirmation prompt.\n' +
    '  • Each sub-tool\'s input is validated before its handler runs.\n\n' +
    'Returns the concatenated content of every successful step, prefixed with ' +
    'a step label, plus a summary line. On failure, sets isError=true and ' +
    'reports which step stopped the batch and why.',
  inputSchema: batchInputSchema,
  annotations: {
    title: 'Batch — run multiple devilge tools',
    // We don't claim readOnlyHint because a batch can include state-changing
    // sub-tools (taps, launch_app, etc.). We don't claim destructiveHint
    // because we forbid destructive sub-tools at runtime — meaning batches
    // are always reversible (worst case: a force_stop or a tap on the wrong
    // element). openWorldHint signals that batches do touch external state
    // (the device).
    openWorldHint: true,
    idempotentHint: false,
  },
};

// ---------------------------------------------------------------------------
// Registry shape consumed by the handler. The composition root populates this
// as it registers each tool, then injects it here.
// ---------------------------------------------------------------------------

export type BatchSubHandler = (
  input: unknown,
) => Promise<{
  content: { type: string; [key: string]: unknown }[];
  isError?: boolean;
  [key: string]: unknown;
}>;

export type BatchToolEntry = {
  inputSchema: Record<string, z.ZodTypeAny> | Record<string, never>;
  handler: BatchSubHandler;
};

export type BatchToolRegistry = ReadonlyMap<string, BatchToolEntry>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

type ContentItem = { type: 'text'; text: string } | { type: string; [key: string]: unknown };

type BatchArgs = {
  actions: { name: string; input?: Record<string, unknown> }[];
};

export function buildBatchToolHandler(registry: BatchToolRegistry) {
  return async (args: BatchArgs) => {
    const total = args.actions.length;
    const accumulated: ContentItem[] = [];
    const trailingNonTextContent: ContentItem[] = [];

    let stoppedAt: number | null = null;
    let stopReason: string | null = null;

    for (let i = 0; i < total; i++) {
      const action = args.actions[i]!;
      const stepLabel = `step ${i + 1}/${total}`;

      // 1. Recursion guard.
      if (action.name === batchToolName) {
        accumulated.push({
          type: 'text',
          text: `[BATCH_NESTING_FORBIDDEN] ${stepLabel}: '${batchToolName}' cannot be nested inside another batch.`,
        });
        stoppedAt = i;
        stopReason = 'nesting forbidden';
        break;
      }

      // 2. Destructive guard.
      if (BATCH_FORBIDDEN_TOOLS.has(action.name)) {
        accumulated.push({
          type: 'text',
          text:
            `[BATCH_DESTRUCTIVE_FORBIDDEN] ${stepLabel}: '${action.name}' is destructive and ` +
            `must be invoked directly, not inside a batch. Forbidden tools: ` +
            `${[...BATCH_FORBIDDEN_TOOLS].join(', ')}.`,
        });
        stoppedAt = i;
        stopReason = 'destructive sub-tool';
        break;
      }

      // 3. Lookup.
      const entry = registry.get(action.name);
      if (!entry) {
        accumulated.push({
          type: 'text',
          text: `[BATCH_UNKNOWN_TOOL] ${stepLabel}: tool '${action.name}' is not registered.`,
        });
        stoppedAt = i;
        stopReason = 'unknown tool';
        break;
      }

      // 4. Validate sub-tool input via its zod schema.
      const subSchema = z.object(entry.inputSchema as Record<string, z.ZodTypeAny>);
      const parsed = subSchema.safeParse(action.input ?? {});
      if (!parsed.success) {
        const issueSummary = parsed.error.issues
          .map((iss) => `${iss.path.join('.') || '<root>'}: ${iss.message}`)
          .join('; ');
        accumulated.push({
          type: 'text',
          text: `[BATCH_INVALID_INPUT] ${stepLabel} (${action.name}): ${issueSummary}`,
        });
        stoppedAt = i;
        stopReason = 'invalid input';
        break;
      }

      // 5. Run sub-handler.
      let stepResult: Awaited<ReturnType<BatchSubHandler>>;
      try {
        stepResult = await entry.handler(parsed.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        accumulated.push({
          type: 'text',
          text: `[BATCH_STEP_THREW] ${stepLabel} (${action.name}): ${msg}`,
        });
        stoppedAt = i;
        stopReason = 'handler threw';
        break;
      }

      // 6. Inline step output.
      accumulated.push({
        type: 'text',
        text: `--- ${stepLabel}: ${action.name} ---`,
      });
      if (Array.isArray(stepResult.content)) {
        for (const c of stepResult.content) {
          if (c && typeof c === 'object' && (c as { type?: string }).type === 'text') {
            accumulated.push(c as ContentItem);
          } else {
            // Non-text items (images, resources) are appended at the end so
            // the textual narrative stays linear and readable.
            trailingNonTextContent.push(c as ContentItem);
          }
        }
      }

      // 7. Sub-tool reported isError? Stop here.
      if (stepResult.isError === true) {
        stoppedAt = i;
        stopReason = `sub-tool '${action.name}' returned isError`;
        break;
      }
    }

    const aborted = stoppedAt !== null;
    const summaryText = aborted
      ? `[BATCH_ABORTED] stopped at step ${stoppedAt! + 1}/${total}: ${stopReason}.`
      : `[BATCH_OK] ran ${total}/${total} steps.`;

    const content: ContentItem[] = [
      { type: 'text', text: summaryText },
      ...accumulated,
      ...trailingNonTextContent,
    ];

    return aborted ? { content, isError: true as const } : { content };
  };
}
