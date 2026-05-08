/**
 * Lightweight static validation of a Maestro flow YAML file. We deliberately
 * do NOT bring in a full YAML parser — Maestro flows have a fixed shape and
 * regex-level checks are enough for what we need:
 *
 *   1. Basic structural sanity (appId, separator, at least one step).
 *   2. Detect `runScript:` blocks (must be denied unless the operator opted in).
 *   3. Surface obvious errors in friendly messages.
 */
export interface FlowValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly hasRunScript: boolean;
}

const APP_ID_LINE = /^\s*appId\s*:/m;
const FRONTMATTER_SEPARATOR = /^---\s*$/m;
const STEP_LINE = /^\s*-\s+\S/m;
const RUN_SCRIPT_RE = /^\s*-?\s*runScript\s*:/m;

export class FlowYamlValidator {
  static validate(yaml: string): FlowValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (yaml.length === 0) {
      errors.push('Flow file is empty.');
      return { valid: false, errors, warnings, hasRunScript: false };
    }

    if (!APP_ID_LINE.test(yaml)) {
      errors.push('Missing required `appId:` declaration.');
    }
    if (!FRONTMATTER_SEPARATOR.test(yaml)) {
      errors.push('Missing `---` separator between frontmatter and steps.');
    } else {
      const after = yaml.split(FRONTMATTER_SEPARATOR)[1] ?? '';
      if (!STEP_LINE.test(after)) {
        errors.push('No steps found after the `---` separator.');
      }
    }

    const hasRunScript = RUN_SCRIPT_RE.test(yaml);
    if (hasRunScript) {
      warnings.push(
        '`runScript:` block detected — denied by default for security. Set DEVILGE_ALLOW_FLOW_SCRIPTS=true to enable.',
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      hasRunScript,
    };
  }
}
