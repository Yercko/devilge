/**
 * Outcome of running a Maestro flow.
 */
export interface MaestroFlowResult {
  readonly flowName: string;
  readonly success: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly rawOutputTail: string;
  readonly paramsApplied: readonly string[]; // keys only — values are redacted from logs
}

/** Lightweight metadata for `list_maestro_flows`. */
export interface MaestroFlowSummary {
  readonly name: string;            // basename without extension
  readonly relativePath: string;    // relative to flowsRoot
  readonly sizeBytes: number;
  readonly preview: string;         // first ~5 lines of YAML
}

export interface MaestroFlowValidation {
  readonly flowName: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly hasRunScript: boolean;
}
