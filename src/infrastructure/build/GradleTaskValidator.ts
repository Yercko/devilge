import { SecurityError } from '../../config/errors.js';

/**
 * Validates a Gradle task name passed in by the LLM. Defense in depth:
 *   1. Strict character class (no shell metas, no whitespace, no globs).
 *   2. Optional one or more `:module` prefixes.
 *   3. Final task segment matches a conservative shape.
 *   4. Deny-list a few patterns we never want auto-invoked (publish, release).
 *
 * Even with this, the user is ultimately running tasks defined in *their own*
 * build.gradle.kts. The validator stops syntax injection — it does not stop a
 * user-defined task from doing whatever it wants.
 */
const TASK_RE = /^(:[A-Za-z][A-Za-z0-9_-]*)*:?[a-zA-Z][a-zA-Z0-9]*$/;

const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /(?:^|:)publish/i,                 // publishToMavenLocal, publishApi*
  /(?:^|:)release(?!Build)/i,        // *release deploy hooks (allow assembleRelease etc.)
  /uninstall/i,                      // uninstallAll, uninstallDebug
  /uploadArchives/i,
  /signingReport/i,
];

const EXTRA_ARG_RE = /^[A-Za-z0-9._=:/+\-#,]+$/;

export class GradleTaskValidator {
  static task(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
      throw new SecurityError('Gradle task must be a 1..128 char string.');
    }
    if (!TASK_RE.test(value)) {
      throw new SecurityError(
        'Gradle task may contain only letters, digits, dashes, underscores, ' +
          'and `:` module separators (e.g. ":app:assembleDebug").',
      );
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        throw new SecurityError(
          `Gradle task "${value}" matches a denied pattern (${pattern.source}). ` +
            'Run it manually if intentional.',
        );
      }
    }
    return value;
  }

  static extraArgs(args: readonly string[] | undefined): string[] {
    if (!args) {
      return [];
    }
    if (args.length > 16) {
      throw new SecurityError('Too many extra Gradle arguments (max 16).');
    }
    return args.map((a, i) => {
      if (typeof a !== 'string' || a.length === 0 || a.length > 256) {
        throw new SecurityError(`extraArgs[${i}] must be a 1..256 char string.`);
      }
      if (!EXTRA_ARG_RE.test(a)) {
        throw new SecurityError(
          `extraArgs[${i}] contains forbidden characters. Allowed: letters, ` +
            'digits, ".", "_", "=", ":", "/", "+", "-".',
        );
      }
      return a;
    });
  }
}
