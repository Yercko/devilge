import { z } from 'zod';
import type {
  RunMaestroFlowUseCase,
  ListMaestroFlowsUseCase,
  ValidateMaestroFlowUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

const FLOW_NAME = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

// ---------------------------------------------------------------------------
// devilge_run_maestro_flow
// ---------------------------------------------------------------------------

export const runMaestroFlowToolName = 'devilge_run_maestro_flow';
export const runMaestroFlowInputSchema = {
  name: FLOW_NAME.describe('Flow name (basename without .yaml extension). Must live under DEVILGE_FLOWS_ROOT.'),
  params: z
    .record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z.string().max(1024),
    )
    .optional()
    .describe('Optional env vars passed to Maestro via -e KEY=VALUE.'),
};
export const runMaestroFlowToolDefinition = {
  title: 'Run a Maestro flow (optional)',
  description:
    'Executes a Maestro YAML flow from DEVILGE_FLOWS_ROOT (default: <projectRoot>/devilge-flows/). ' +
    'Maestro is OPTIONAL — if not installed, this tool returns MAESTRO_NOT_INSTALLED with the install ' +
    'command (`brew install maestro`). When installed, runs `maestro test <flow>` with optional ' +
    '`params` injected as -e KEY=VALUE. `runScript:` blocks in the YAML are denied by default; set ' +
    'DEVILGE_ALLOW_FLOW_SCRIPTS=true to allow. MAESTRO_DISABLE_ANALYTICS is always injected.',
  inputSchema: runMaestroFlowInputSchema,
  annotations: {
    title: 'Run a Maestro flow',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
};
export function buildRunMaestroFlowHandler(useCase: RunMaestroFlowUseCase) {
  return async (args: { name: string; params?: Record<string, string> }) => {
    try {
      const result = await useCase.execute({
        name: args.name,
        ...(args.params ? { params: args.params } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_list_maestro_flows
// ---------------------------------------------------------------------------

export const listMaestroFlowsToolName = 'devilge_list_maestro_flows';
export const listMaestroFlowsInputSchema = {};
export const listMaestroFlowsToolDefinition = {
  title: 'List available Maestro flows',
  description:
    'Lists every `*.yaml`/`*.yml` flow file under DEVILGE_FLOWS_ROOT, returning name, relative path, ' +
    'size and a 5-line preview. Works WITHOUT Maestro installed — useful to see what reusable flows ' +
    'exist before deciding whether to invest in installing Maestro.',
  inputSchema: listMaestroFlowsInputSchema,
  annotations: {
    title: 'List available Maestro flows',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};
export function buildListMaestroFlowsHandler(useCase: ListMaestroFlowsUseCase) {
  return async () => {
    try {
      const flows = await useCase.execute();
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ count: flows.length, flows }, null, 2) },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_validate_maestro_flow
// ---------------------------------------------------------------------------

export const validateMaestroFlowToolName = 'devilge_validate_maestro_flow';
export const validateMaestroFlowInputSchema = {
  name: FLOW_NAME.describe('Flow name to validate.'),
};
export const validateMaestroFlowToolDefinition = {
  title: 'Validate a Maestro flow YAML',
  description:
    'Statically validates a flow YAML: requires `appId:`, `---` separator, at least one step, and ' +
    'flags `runScript:` blocks (denied unless DEVILGE_ALLOW_FLOW_SCRIPTS=true). Does NOT execute ' +
    'Maestro — works without the binary installed. Use this before run_maestro_flow to surface ' +
    'syntactic problems quickly.',
  inputSchema: validateMaestroFlowInputSchema,
  annotations: {
    title: 'Validate a Maestro flow YAML',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};
export function buildValidateMaestroFlowHandler(useCase: ValidateMaestroFlowUseCase) {
  return async (args: { name: string }) => {
    try {
      const result = await useCase.execute({ name: args.name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}
