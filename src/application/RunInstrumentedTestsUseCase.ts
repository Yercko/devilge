import type { BuildSystemPort } from '../domain/ports/index.js';
import type { GradleTaskResult } from '../domain/entities/index.js';

export interface RunInstrumentedTestsInput {
  /** Gradle module path (e.g. ":app", ":modules:feature:login"). Defaults to ":app". */
  readonly module?: string;
  /** Optional FQ test class name to filter (e.g. "com.example.LoginTest"). */
  readonly testClass?: string;
  /** Optional method to filter (requires testClass). */
  readonly testMethod?: string;
  readonly timeoutMs?: number;
  readonly tailBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TAIL_BYTES = 256 * 1024;
const ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Wraps `BuildSystemPort.runTask("connectedDebugAndroidTest")` adding an
 * optional class/method filter via `-Pandroid.testInstrumentationRunnerArguments.class=…`.
 *
 * Reuses the existing GradleAdapter, which means JUnit XML output is already
 * parsed into structured testResults. The instrumented test results land in
 * `<module>/build/outputs/androidTest-results/connected/<variant>/TEST-*.xml`,
 * which the JUnitXmlParser walks just like unit tests.
 */
export class RunInstrumentedTestsUseCase {
  constructor(private readonly buildSystem: BuildSystemPort) {}

  async execute(input: RunInstrumentedTestsInput = {}): Promise<GradleTaskResult> {
    const module = input.module ?? ':app';
    if (input.testMethod && !input.testClass) {
      throw new Error('testMethod requires testClass.');
    }
    const task = `${module}:connectedDebugAndroidTest`;

    const extraArgs: string[] = [];
    if (input.testClass) {
      const filter = input.testMethod
        ? `${input.testClass}#${input.testMethod}`
        : input.testClass;
      extraArgs.push(
        `-Pandroid.testInstrumentationRunnerArguments.class=${filter}`,
      );
    }

    const requestedTimeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.max(
      1_000,
      Math.min(ABSOLUTE_TIMEOUT_MS, requestedTimeout),
    );
    const tailBytes = Math.max(
      8 * 1024,
      Math.min(2 * 1024 * 1024, input.tailBytes ?? DEFAULT_TAIL_BYTES),
    );

    return await this.buildSystem.runTask({
      task,
      ...(extraArgs.length > 0 ? { extraArgs } : {}),
      timeoutMs,
      tailBytes,
    });
  }
}
