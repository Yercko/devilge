import fs from 'node:fs';
import path from 'node:path';
import type {
  BuildSystemPort,
  RunTaskInput,
} from '../../domain/ports/index.js';
import type { GradleTaskResult } from '../../domain/entities/index.js';
import { DevilgeError } from '../../config/errors.js';
import type { PathValidator } from '../security/PathValidator.js';
import { GradleProcessRunner } from './GradleProcessRunner.js';
import { GradleTaskValidator } from './GradleTaskValidator.js';
import { CompileErrorParser } from './parsers/CompileErrorParser.js';
import { BuildFailureParser } from './parsers/BuildFailureParser.js';
import { JUnitXmlParser } from './parsers/JUnitXmlParser.js';
import { LintXmlParser } from './parsers/LintXmlParser.js';

export class GradleAdapter implements BuildSystemPort {
  constructor(
    private readonly pathValidator: PathValidator,
    private readonly runner: GradleProcessRunner,
    private readonly junit: JUnitXmlParser,
    private readonly lint: LintXmlParser,
  ) {}

  async runTask(input: RunTaskInput): Promise<GradleTaskResult> {
    const task = GradleTaskValidator.task(input.task);
    const extraArgs = GradleTaskValidator.extraArgs(input.extraArgs);

    const root = this.pathValidator.root;
    const wrapper = pickWrapper(root);
    if (!wrapper) {
      throw new DevilgeError(
        'GRADLE_ERROR',
        `No Gradle wrapper found at ${root}. Expected gradlew (or gradlew.bat on Windows).`,
      );
    }

    const t0 = Date.now();
    const args = [task, '--console=plain', ...extraArgs];
    const result = await this.runner.run(
      wrapper,
      args,
      root,
      input.timeoutMs,
      input.tailBytes,
    );
    const durationMs = Date.now() - t0;

    if (result.timedOut) {
      throw new DevilgeError(
        'GRADLE_ERROR',
        `Gradle task "${task}" exceeded the ${input.timeoutMs}ms timeout.`,
      );
    }

    const combinedOutput = `${result.stdoutTail}\n${result.stderrTail}`;
    const compileErrors = CompileErrorParser.parse(combinedOutput);
    const buildFailures = BuildFailureParser.parse(combinedOutput);

    // Test + Lint reports are written to disk by Gradle; pick them up.
    const [testResults, lintFindings] = await Promise.all([
      this.junit.collect(root),
      this.lint.collect(root),
    ]);

    return {
      task,
      success: result.exitCode === 0,
      durationMs,
      exitCode: result.exitCode,
      compileErrors,
      testResults,
      lintFindings,
      buildFailures,
      rawOutputTail: combinedOutput,
      rawOutputBytesTotal: result.stdoutBytesTotal,
    };
  }
}

function pickWrapper(root: string): string | null {
  const isWindows = process.platform === 'win32';
  const candidate = path.join(root, isWindows ? 'gradlew.bat' : 'gradlew');
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }
  } catch {
    /* fall through */
  }
  return null;
}
