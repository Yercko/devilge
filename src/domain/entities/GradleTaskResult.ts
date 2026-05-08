/**
 * Outcome of running a Gradle task. The shape is intentionally rich so an LLM
 * can decide how to react without re-parsing raw stdout.
 */
export interface GradleTaskResult {
  readonly task: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly compileErrors: readonly CompileError[];
  readonly testResults: readonly TestSuiteResult[];
  readonly lintFindings: readonly LintFinding[];
  readonly buildFailures: readonly BuildFailure[];
  readonly rawOutputTail: string;       // last N kilobytes of stdout+stderr
  readonly rawOutputBytesTotal: number; // total raw bytes (for context, not necessarily returned)
}

export interface CompileError {
  readonly file: string;        // absolute or project-relative path as Gradle reports it
  readonly line?: number;
  readonly column?: number;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly source: 'kotlinc' | 'javac' | 'kapt' | 'ksp' | 'gradle' | 'unknown';
}

export interface TestSuiteResult {
  readonly suite: string;       // fully-qualified class name typically
  readonly module?: string;     // best-effort gradle module derived from path
  readonly total: number;
  readonly failures: number;
  readonly errors: number;
  readonly skipped: number;
  readonly durationSeconds: number;
  readonly failingTests: readonly TestFailure[];
}

export interface TestFailure {
  readonly testName: string;
  readonly classname: string;
  readonly type: 'failure' | 'error';
  readonly message: string;
  readonly stackTrace: string;
}

export interface LintFinding {
  readonly id: string;
  readonly severity: 'fatal' | 'error' | 'warning' | 'informational' | 'ignore';
  readonly category: string;
  readonly priority?: number;
  readonly summary: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface BuildFailure {
  readonly description: string;
  readonly suggestion?: string;
}
