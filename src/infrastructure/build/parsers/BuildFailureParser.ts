import type { BuildFailure } from '../../../domain/entities/index.js';

/**
 * Extracts the high-level "* What went wrong:" failure summaries from Gradle's
 * `--console=plain` output. Each block looks like:
 *
 *   * What went wrong:
 *   Execution failed for task ':app:compileDebugKotlin'.
 *   > Compilation error. See log for more details
 *
 *   * Try:
 *   > Run with --stacktrace option to get the stack trace.
 */
export class BuildFailureParser {
  static parse(combined: string): readonly BuildFailure[] {
    const lines = combined.split(/\r?\n/);
    const failures: BuildFailure[] = [];

    let i = 0;
    while (i < lines.length) {
      if (lines[i] === '* What went wrong:') {
        const descLines: string[] = [];
        i += 1;
        while (i < lines.length && lines[i] !== '' && !lines[i]?.startsWith('* ')) {
          const l = lines[i];
          if (l !== undefined) {
            descLines.push(l);
          }
          i += 1;
        }
        let suggestion: string | undefined;
        // Next "* Try:" block, if present.
        while (i < lines.length && lines[i] !== '* Try:') {
          if (lines[i]?.startsWith('* ')) {
            break;
          }
          i += 1;
        }
        if (lines[i] === '* Try:') {
          i += 1;
          const tryLines: string[] = [];
          while (i < lines.length && lines[i] !== '' && !lines[i]?.startsWith('* ')) {
            const l = lines[i];
            if (l !== undefined) {
              tryLines.push(l);
            }
            i += 1;
          }
          suggestion = tryLines.join('\n').trim() || undefined;
        }
        failures.push({
          description: descLines.join('\n').trim(),
          ...(suggestion ? { suggestion } : {}),
        });
        continue;
      }
      i += 1;
    }
    return failures;
  }
}
