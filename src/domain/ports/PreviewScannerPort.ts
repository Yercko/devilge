import type { ComposePreview } from '../entities/index.js';

/**
 * Outbound port that finds Jetpack Compose `@Preview` functions in a project.
 * Implementations may use AST parsing or regex; the application layer does not care.
 */
export interface PreviewScannerPort {
  scan(projectRoot: string, options?: ScanOptions): Promise<readonly ComposePreview[]>;

  /**
   * Locate a single preview by file path + function name, with helpful diagnostics
   * when the lookup fails. Implementations should support tolerant matching:
   *   - exact absolute / relative path first, then path-suffix match;
   *   - exact function name first, then case-insensitive match.
   */
  findPreviewSource(
    projectRoot: string,
    filePath: string,
    functionName: string,
  ): Promise<FindPreviewSourceResult>;
}

export interface ScanOptions {
  readonly moduleFilter?: string;      // restrict to a Gradle module path
  readonly maxFiles?: number;          // safety cap on traversal
  readonly snippetContextLines?: number;
}

export type FindPreviewSourceResult =
  | {
      readonly found: true;
      readonly source: string;
      readonly resolvedRelativePath: string;
      readonly matchedFunctionName: string;
    }
  | {
      readonly found: false;
      readonly reason: 'file_not_found';
      readonly candidates: readonly string[]; // suffix-match candidates, if any
    }
  | {
      readonly found: false;
      readonly reason: 'file_ambiguous';
      readonly candidates: readonly string[];
    }
  | {
      readonly found: false;
      readonly reason: 'function_not_found';
      readonly resolvedRelativePath: string;
      readonly availableFunctions: readonly string[];
    };
