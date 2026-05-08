import type { PreviewScannerPort } from '../domain/ports/index.js';
import { NotFoundError } from '../config/errors.js';

export interface GetComposePreviewSourceInput {
  readonly filePath: string;
  readonly functionName: string;
}

export interface GetComposePreviewSourceOutput {
  readonly source: string;
  readonly resolvedRelativePath: string;
  readonly matchedFunctionName: string;
}

export class GetComposePreviewSourceUseCase {
  constructor(
    private readonly scanner: PreviewScannerPort,
    private readonly projectRoot: string,
  ) {}

  async execute(
    input: GetComposePreviewSourceInput,
  ): Promise<GetComposePreviewSourceOutput> {
    const result = await this.scanner.findPreviewSource(
      this.projectRoot,
      input.filePath,
      input.functionName,
    );

    if (result.found) {
      return {
        source: result.source,
        resolvedRelativePath: result.resolvedRelativePath,
        matchedFunctionName: result.matchedFunctionName,
      };
    }

    switch (result.reason) {
      case 'file_not_found':
        throw new NotFoundError(
          `No file in the project matches "${input.filePath}". ` +
            'Pass a path or path-suffix that uniquely identifies a .kt file.',
        );
      case 'file_ambiguous':
        throw new NotFoundError(
          `"${input.filePath}" matches multiple files: ${result.candidates.join(', ')}. ` +
            'Pass a longer suffix or the absolute path to disambiguate.',
        );
      case 'function_not_found': {
        const list =
          result.availableFunctions.length === 0
            ? '(no @Preview functions found in this file)'
            : result.availableFunctions.join(', ');
        throw new NotFoundError(
          `Preview "${input.functionName}" was not found in ${result.resolvedRelativePath}. ` +
            `Available previews: ${list}.`,
        );
      }
    }
  }
}
