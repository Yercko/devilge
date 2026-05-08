import { z } from 'zod';
import type {
  ListComposePreviewsUseCase,
  GetComposePreviewSourceUseCase,
  GetComposePreviewsTreeUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const listPreviewsToolName = 'devilge_list_compose_previews';

export const listPreviewsInputSchema = {
  moduleFilter: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe('Optional path (relative to project root) to restrict the scan, e.g. "app/src/main".'),
  maxFiles: z
    .number()
    .int()
    .positive()
    .max(20_000)
    .optional()
    .describe('Maximum number of .kt files to scan. Defaults to 5000.'),
};

export const listPreviewsToolDefinition = {
  title: 'List @Preview composables',
  description:
    'Statically scans the configured Android/KMM project for Jetpack Compose @Preview ' +
    'functions and returns their locations plus parsed annotation parameters.',
  inputSchema: listPreviewsInputSchema,
};

export function buildListPreviewsHandler(useCase: ListComposePreviewsUseCase) {
  return async (args: { moduleFilter?: string; maxFiles?: number }) => {
    try {
      const previews = await useCase.execute({
        ...(args.moduleFilter ? { moduleFilter: args.moduleFilter } : {}),
        ...(args.maxFiles !== undefined ? { maxFiles: args.maxFiles } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: previews.length, previews }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}

export const getPreviewSourceToolName = 'devilge_get_compose_preview_source';

export const getPreviewSourceInputSchema = {
  filePath: z
    .string()
    .min(1)
    .describe('Path (absolute or relative to project root) of the .kt file containing the preview.'),
  functionName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .describe('Name of the @Preview function to fetch.'),
};

export const getPreviewSourceToolDefinition = {
  title: 'Get @Preview source code',
  description:
    'Returns the full source code of a @Preview composable, including its annotations and body.',
  inputSchema: getPreviewSourceInputSchema,
};

export function buildGetPreviewSourceHandler(useCase: GetComposePreviewSourceUseCase) {
  return async (args: { filePath: string; functionName: string }) => {
    try {
      const result = await useCase.execute({
        filePath: args.filePath,
        functionName: args.functionName,
      });
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
// Hierarchical tree of previews (module → file → function → variants)
// ---------------------------------------------------------------------------

export const previewsTreeToolName = 'devilge_get_compose_previews_tree';

export const previewsTreeInputSchema = {
  moduleFilter: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe('Optional path (relative to project root) to restrict the scan, e.g. "modules/feature".'),
  maxFiles: z
    .number()
    .int()
    .positive()
    .max(20_000)
    .optional()
    .describe('Maximum number of .kt files to scan. Defaults to 5000.'),
};

export const previewsTreeToolDefinition = {
  title: 'Compose previews — hierarchical tree',
  description:
    'Returns every Jetpack Compose @Preview in the project organized as ' +
    'modules → files → functions → variants. Multiple @Preview annotations on the ' +
    'same Composable are grouped as variants of one function. Includes a totals ' +
    'summary by `group` and an `orphans` bucket for previews outside any known module.',
  inputSchema: previewsTreeInputSchema,
};

export function buildPreviewsTreeHandler(useCase: GetComposePreviewsTreeUseCase) {
  return async (args: { moduleFilter?: string; maxFiles?: number }) => {
    try {
      const tree = await useCase.execute({
        ...(args.moduleFilter ? { moduleFilter: args.moduleFilter } : {}),
        ...(args.maxFiles !== undefined ? { maxFiles: args.maxFiles } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
