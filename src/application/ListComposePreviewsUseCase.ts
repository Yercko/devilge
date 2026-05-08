import type { PreviewScannerPort } from '../domain/ports/index.js';
import type { ComposePreview } from '../domain/entities/index.js';

export interface ListComposePreviewsInput {
  readonly moduleFilter?: string;
  readonly maxFiles?: number;
}

export class ListComposePreviewsUseCase {
  constructor(
    private readonly scanner: PreviewScannerPort,
    private readonly projectRoot: string,
  ) {}

  async execute(input: ListComposePreviewsInput = {}): Promise<readonly ComposePreview[]> {
    return await this.scanner.scan(this.projectRoot, {
      ...(input.moduleFilter ? { moduleFilter: input.moduleFilter } : {}),
      ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
    });
  }
}
