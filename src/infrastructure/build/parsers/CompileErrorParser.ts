import type { CompileError } from '../../../domain/entities/index.js';

/**
 * Extracts compile-time errors and warnings from Gradle stdout.
 * Recognizes:
 *   kotlinc:   `e: file:///abs/path.kt:42:11 message`     (severity prefix e/w/v/i)
 *   kotlinc 2: `> Task :app:compileDebugKotlin FAILED`    (handled separately)
 *   javac:     `path/file.java:42: error: message`
 *   gradle:    `* What went wrong:` blocks (passed through as buildFailures)
 */
const KOTLINC_RE = /^([ewvi]):\s+(?:file:\/\/)?(\/[^:]+|[A-Za-z]:[^:]+|[^:\s][^:]*?):(\d+)(?::(\d+))?\s+(.*)$/;
const KOTLINC_NO_LINE_RE = /^([ewvi]):\s+(.*)$/;
const JAVAC_RE = /^(\S+\.java):(\d+):\s+(error|warning):\s*(.*)$/;
const KAPT_RE = /^(\S+\.java):(\d+):\s+error:\s+(.*)$/;
const KSP_RE = /^\[ksp\]\s+(.+?):(\d+):\s+(.*)$/;

const SEVERITY_BY_PREFIX: Record<string, CompileError['severity']> = {
  e: 'error',
  w: 'warning',
  v: 'info',
  i: 'info',
};

export class CompileErrorParser {
  static parse(stdout: string): readonly CompileError[] {
    const errors: CompileError[] = [];
    const lines = stdout.split(/\r?\n/);

    for (const line of lines) {
      const k = KOTLINC_RE.exec(line);
      if (k) {
        const [, sev, file, lineNum, col, message] = k;
        if (file && lineNum && message && sev) {
          errors.push({
            source: 'kotlinc',
            severity: SEVERITY_BY_PREFIX[sev] ?? 'error',
            file: stripFileUri(file),
            line: Number.parseInt(lineNum, 10),
            ...(col ? { column: Number.parseInt(col, 10) } : {}),
            message: message.trim(),
          });
          continue;
        }
      }

      const j = JAVAC_RE.exec(line);
      if (j) {
        const [, file, lineNum, sev, message] = j;
        if (file && lineNum && sev && message) {
          errors.push({
            source: 'javac',
            severity: sev === 'error' ? 'error' : 'warning',
            file,
            line: Number.parseInt(lineNum, 10),
            message: message.trim(),
          });
          continue;
        }
      }

      const kapt = KAPT_RE.exec(line);
      if (kapt) {
        const [, file, lineNum, message] = kapt;
        if (file && lineNum && message) {
          errors.push({
            source: 'kapt',
            severity: 'error',
            file,
            line: Number.parseInt(lineNum, 10),
            message: message.trim(),
          });
          continue;
        }
      }

      const ksp = KSP_RE.exec(line);
      if (ksp) {
        const [, file, lineNum, message] = ksp;
        if (file && lineNum && message) {
          errors.push({
            source: 'ksp',
            severity: 'error',
            file,
            line: Number.parseInt(lineNum, 10),
            message: message.trim(),
          });
          continue;
        }
      }

      const noLineKotlin = KOTLINC_NO_LINE_RE.exec(line);
      if (noLineKotlin && !KOTLINC_RE.test(line)) {
        const [, sev, message] = noLineKotlin;
        if (sev && message && message.trim().length > 0 && !message.includes('Task ')) {
          errors.push({
            source: 'kotlinc',
            severity: SEVERITY_BY_PREFIX[sev] ?? 'error',
            file: '(unknown)',
            message: message.trim(),
          });
        }
      }
    }

    return errors;
  }
}

function stripFileUri(p: string): string {
  return p.startsWith('file://') ? p.slice('file://'.length) : p;
}
