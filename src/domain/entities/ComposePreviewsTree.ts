import type { ComposePreview } from './ComposePreview.js';
import type { ModuleType } from './ProjectStructure.js';

/**
 * Hierarchical view of every Compose `@Preview` in a project, organized
 * for human / LLM navigation:
 *
 *   modules[].files[].functions[].variants[]
 *
 * "Variants" are the multiple `@Preview` annotations stacked above the same
 * Composable function (typical pattern for Light / Dark / phone / tablet).
 *
 * Plus a couple of cross-cutting summaries that are useful for dashboards.
 */
export interface ComposePreviewsTree {
  readonly totalCount: number;
  readonly modules: readonly ModulePreviews[];
  readonly groupSummary: readonly PreviewGroupSummary[];
  readonly orphans: readonly ComposePreview[]; // previews not under any known module
}

export interface ModulePreviews {
  readonly moduleName: string;        // e.g. ":composeApp"
  readonly relativePath: string;
  readonly type: ModuleType;
  readonly previewCount: number;
  readonly files: readonly FilePreviews[];
}

export interface FilePreviews {
  readonly relativePath: string;
  readonly previewCount: number;
  readonly functions: readonly FunctionPreviews[];
}

export interface FunctionPreviews {
  readonly functionName: string;
  readonly variantCount: number;
  readonly variants: readonly ComposePreview[];
}

export interface PreviewGroupSummary {
  readonly group: string;             // 'default' for previews with no `group=` param
  readonly count: number;
}
