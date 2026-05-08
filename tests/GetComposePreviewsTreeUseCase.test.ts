import { describe, it, expect } from 'vitest';
import type {
  PreviewScannerPort,
  ProjectScannerPort,
} from '../src/domain/ports/index.js';
import type {
  ComposePreview,
  GradleModule,
  ProjectStructure,
} from '../src/domain/entities/index.js';
import { GetComposePreviewsTreeUseCase } from '../src/application/GetComposePreviewsTreeUseCase.js';

function preview(overrides: Partial<ComposePreview>): ComposePreview {
  return {
    functionName: 'Sample',
    filePath: '/abs/sample.kt',
    relativePath: 'sample.kt',
    startLine: 1,
    endLine: 10,
    snippet: '@Preview\n@Composable\nfun Sample() {}',
    ...overrides,
  };
}

function module(name: string, relativePath: string): GradleModule {
  return {
    name,
    relativePath,
    type: 'android-library',
    sourceSets: ['main'],
  };
}

class StubPreviewScanner implements PreviewScannerPort {
  constructor(private readonly fixtures: ComposePreview[]) {}
  async scan(): Promise<readonly ComposePreview[]> {
    return this.fixtures;
  }
  async findPreviewSource() {
    return { found: false, reason: 'file_not_found' as const, candidates: [] };
  }
}

class StubProjectScanner implements ProjectScannerPort {
  constructor(private readonly modules: GradleModule[]) {}
  async describe(): Promise<ProjectStructure> {
    return {
      rootPath: '/root',
      modules: this.modules,
      hasKmm: false,
      hasComposeMultiplatform: false,
    };
  }
}

describe('GetComposePreviewsTreeUseCase', () => {
  it('groups previews by module → file → function with variants', async () => {
    const previews = [
      preview({
        functionName: 'HomePreview',
        relativePath: 'composeApp/src/commonMain/kotlin/Home.kt',
        previewName: 'Light',
      }),
      preview({
        functionName: 'HomePreview',
        relativePath: 'composeApp/src/commonMain/kotlin/Home.kt',
        previewName: 'Dark',
        startLine: 20,
        endLine: 30,
      }),
      preview({
        functionName: 'AppointmentPreview',
        relativePath: 'modules/feature/appointment/src/main/kotlin/Appointment.kt',
      }),
    ];
    const modules = [
      module(':composeApp', 'composeApp'),
      module(':modules:feature:appointment', 'modules/feature/appointment'),
    ];

    const useCase = new GetComposePreviewsTreeUseCase(
      new StubPreviewScanner(previews),
      new StubProjectScanner(modules),
      '/root',
    );

    const tree = await useCase.execute();

    expect(tree.totalCount).toBe(3);
    expect(tree.modules).toHaveLength(2);

    const composeApp = tree.modules.find((m) => m.moduleName === ':composeApp');
    expect(composeApp).toBeDefined();
    expect(composeApp?.previewCount).toBe(2);
    expect(composeApp?.files).toHaveLength(1);
    expect(composeApp?.files[0]?.functions).toHaveLength(1);
    expect(composeApp?.files[0]?.functions[0]?.variantCount).toBe(2);
    const variantNames = composeApp?.files[0]?.functions[0]?.variants.map(
      (v) => v.previewName,
    );
    expect(variantNames).toEqual(['Light', 'Dark']);

    const appointmentModule = tree.modules.find(
      (m) => m.moduleName === ':modules:feature:appointment',
    );
    expect(appointmentModule?.previewCount).toBe(1);
  });

  it('prefers the deepest matching module for nested paths', async () => {
    const previews = [
      preview({
        functionName: 'DeepPreview',
        relativePath: 'modules/feature/appointment/src/main/kotlin/X.kt',
      }),
    ];
    const modules = [
      module(':modules', 'modules'),
      module(':modules:feature', 'modules/feature'),
      module(':modules:feature:appointment', 'modules/feature/appointment'),
    ];

    const useCase = new GetComposePreviewsTreeUseCase(
      new StubPreviewScanner(previews),
      new StubProjectScanner(modules),
      '/root',
    );

    const tree = await useCase.execute();

    expect(tree.modules).toHaveLength(1);
    expect(tree.modules[0]?.moduleName).toBe(':modules:feature:appointment');
  });

  it('routes previews outside any module to orphans', async () => {
    const previews = [
      preview({
        functionName: 'Floating',
        relativePath: 'tools/Floating.kt',
      }),
    ];
    const modules = [module(':app', 'app')];

    const useCase = new GetComposePreviewsTreeUseCase(
      new StubPreviewScanner(previews),
      new StubProjectScanner(modules),
      '/root',
    );

    const tree = await useCase.execute();

    expect(tree.modules).toHaveLength(0);
    expect(tree.orphans).toHaveLength(1);
    expect(tree.orphans[0]?.functionName).toBe('Floating');
  });

  it('summarizes by group, sorted by count desc', async () => {
    const previews = [
      preview({ relativePath: 'app/A.kt', functionName: 'A', group: 'Light' }),
      preview({ relativePath: 'app/B.kt', functionName: 'B', group: 'Light' }),
      preview({ relativePath: 'app/C.kt', functionName: 'C', group: 'Dark' }),
      preview({ relativePath: 'app/D.kt', functionName: 'D' }),
    ];
    const modules = [module(':app', 'app')];

    const useCase = new GetComposePreviewsTreeUseCase(
      new StubPreviewScanner(previews),
      new StubProjectScanner(modules),
      '/root',
    );

    const tree = await useCase.execute();
    expect(tree.groupSummary).toEqual([
      { group: 'Light', count: 2 },
      { group: 'Dark', count: 1 },
      { group: 'default', count: 1 },
    ]);
  });
});
