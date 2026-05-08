import type { ProjectScannerPort } from '../domain/ports/index.js';
import type { ProjectStructure } from '../domain/entities/index.js';

export class GetProjectStructureUseCase {
  constructor(
    private readonly scanner: ProjectScannerPort,
    private readonly projectRoot: string,
  ) {}

  async execute(): Promise<ProjectStructure> {
    return await this.scanner.describe(this.projectRoot);
  }
}
