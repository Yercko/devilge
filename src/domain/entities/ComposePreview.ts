/**
 * A Jetpack Compose @Preview function discovered by static analysis.
 * Coordinates use 1-based line numbers to match how IDEs report them.
 */
export interface ComposePreview {
  readonly functionName: string;
  readonly filePath: string;        // absolute, validated against project root
  readonly relativePath: string;    // relative to project root, for display
  readonly startLine: number;
  readonly endLine: number;
  readonly previewName?: string;
  readonly group?: string;
  readonly device?: string;
  readonly showBackground?: boolean;
  readonly fontScale?: number;
  readonly widthDp?: number;
  readonly heightDp?: number;
  readonly uiMode?: string;
  readonly locale?: string;
  readonly snippet: string;         // bounded source snippet for context
}
