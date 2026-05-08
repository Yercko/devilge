import type {
  PreviewScannerPort,
  ProjectScannerPort,
  ScanOptions,
} from '../domain/ports/index.js';
import type {
  ComposePreview,
  ComposePreviewsTree,
  FilePreviews,
  FunctionPreviews,
  GradleModule,
  ModulePreviews,
  PreviewGroupSummary,
} from '../domain/entities/index.js';

export interface GetComposePreviewsTreeInput {
  readonly moduleFilter?: string;
  readonly maxFiles?: number;
}

const DEFAULT_GROUP_LABEL = 'default';

export class GetComposePreviewsTreeUseCase {
  constructor(
    private readonly previewScanner: PreviewScannerPort,
    private readonly projectScanner: ProjectScannerPort,
    private readonly projectRoot: string,
  ) {}

  async execute(input: GetComposePreviewsTreeInput = {}): Promise<ComposePreviewsTree> {
    const scanOptions: ScanOptions = {
      ...(input.moduleFilter ? { moduleFilter: input.moduleFilter } : {}),
      ...(input.maxFiles !== undefined ? { maxFiles: input.maxFiles } : {}),
    };

    const [previews, structure] = await Promise.all([
      this.previewScanner.scan(this.projectRoot, scanOptions),
      this.projectScanner.describe(this.projectRoot),
    ]);

    return buildTree(previews, structure.modules);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — no IO. Easy to unit test in isolation.
// ---------------------------------------------------------------------------

interface FunctionAccumulator {
  readonly functionName: string;
  readonly variants: ComposePreview[];
}

interface FileAccumulator {
  readonly relativePath: string;
  readonly functions: Map<string, FunctionAccumulator>;
}

interface ModuleAccumulator {
  readonly module: GradleModule;
  readonly files: Map<string, FileAccumulator>;
}

function buildTree(
  previews: readonly ComposePreview[],
  modules: readonly GradleModule[],
): ComposePreviewsTree {
  // Sort modules by path length (longest first) so nested module paths win
  // over their parents during prefix matching. e.g. ":modules:feature:appointment"
  // beats ":modules" for a file under modules/feature/appointment/...
  const sortedModules = [...modules].sort(
    (a, b) => b.relativePath.length - a.relativePath.length,
  );

  const buckets = new Map<string, ModuleAccumulator>();
  const orphans: ComposePreview[] = [];
  const groupCounts = new Map<string, number>();

  for (const preview of previews) {
    const groupKey = preview.group ?? DEFAULT_GROUP_LABEL;
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);

    const owner = findOwningModule(preview, sortedModules);
    if (!owner) {
      orphans.push(preview);
      continue;
    }

    let moduleAcc = buckets.get(owner.name);
    if (!moduleAcc) {
      moduleAcc = { module: owner, files: new Map() };
      buckets.set(owner.name, moduleAcc);
    }

    let fileAcc = moduleAcc.files.get(preview.relativePath);
    if (!fileAcc) {
      fileAcc = {
        relativePath: preview.relativePath,
        functions: new Map(),
      };
      moduleAcc.files.set(preview.relativePath, fileAcc);
    }

    let funcAcc = fileAcc.functions.get(preview.functionName);
    if (!funcAcc) {
      funcAcc = { functionName: preview.functionName, variants: [] };
      fileAcc.functions.set(preview.functionName, funcAcc);
    }
    funcAcc.variants.push(preview);
  }

  const moduleResults: ModulePreviews[] = [];
  for (const acc of buckets.values()) {
    const files = [...acc.files.values()]
      .map(toFilePreviews)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const previewCount = files.reduce((sum, f) => sum + f.previewCount, 0);
    moduleResults.push({
      moduleName: acc.module.name,
      relativePath: acc.module.relativePath,
      type: acc.module.type,
      previewCount,
      files,
    });
  }
  moduleResults.sort((a, b) => a.moduleName.localeCompare(b.moduleName));

  const groupSummary: PreviewGroupSummary[] = [...groupCounts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));

  return {
    totalCount: previews.length,
    modules: moduleResults,
    groupSummary,
    orphans,
  };
}

function toFilePreviews(file: FileAccumulator): FilePreviews {
  const functions: FunctionPreviews[] = [...file.functions.values()]
    .map((fn) => ({
      functionName: fn.functionName,
      variantCount: fn.variants.length,
      variants: [...fn.variants].sort((a, b) => a.startLine - b.startLine),
    }))
    .sort((a, b) => a.functionName.localeCompare(b.functionName));
  const previewCount = functions.reduce((sum, fn) => sum + fn.variantCount, 0);
  return {
    relativePath: file.relativePath,
    previewCount,
    functions,
  };
}

function findOwningModule(
  preview: ComposePreview,
  sortedByLongestPath: readonly GradleModule[],
): GradleModule | undefined {
  // Normalize to forward slashes — module relativePaths use the OS separator,
  // preview.relativePath also does, but we want robust prefix comparison.
  const normalized = preview.relativePath.replace(/\\/g, '/');
  for (const module of sortedByLongestPath) {
    const moduleNorm = module.relativePath.replace(/\\/g, '/');
    if (moduleNorm.length === 0) {
      continue;
    }
    if (
      normalized === moduleNorm ||
      normalized.startsWith(moduleNorm + '/')
    ) {
      return module;
    }
  }
  return undefined;
}
