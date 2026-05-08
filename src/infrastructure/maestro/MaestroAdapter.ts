import fs from 'node:fs/promises';
import path from 'node:path';

import type { FlowRunnerPort } from '../../domain/ports/index.js';
import type {
  MaestroFlowResult,
  MaestroFlowSummary,
  MaestroFlowValidation,
} from '../../domain/entities/index.js';
import { DevilgeError, NotFoundError } from '../../config/errors.js';
import type { PathValidator } from '../security/PathValidator.js';
import { CommandSanitizer } from '../security/CommandSanitizer.js';
import { MaestroProcessRunner } from './MaestroProcessRunner.js';
import { FlowYamlValidator } from './FlowYamlValidator.js';

const RUN_FLOW_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_FLOW_FILE_BYTES = 200_000;
const MAX_FLOW_FILES_LISTED = 200;

/**
 * Implements `FlowRunnerPort` over the Maestro CLI.
 *
 * Optional by design: when the binary path is null, every method throws
 * `DevilgeError(MAESTRO_NOT_INSTALLED)` with an install hint. Tools register
 * unconditionally so Claude can still see them and tell the user what to install.
 */
export class MaestroAdapter implements FlowRunnerPort {
  constructor(
    private readonly binPath: string | null,
    private readonly flowsValidator: PathValidator,
    private readonly allowScripts: boolean,
    private readonly runner: MaestroProcessRunner,
  ) {}

  isAvailable(): boolean {
    return this.binPath !== null;
  }

  async runFlow(
    name: string,
    params: Readonly<Record<string, string>>,
  ): Promise<MaestroFlowResult> {
    const bin = this.requireBin();
    const flowName = CommandSanitizer.flowName(name);
    const flowPath = await this.resolveFlowPath(flowName);

    const yaml = await this.readFlow(flowPath);
    const validation = FlowYamlValidator.validate(yaml);
    if (!validation.valid) {
      throw new DevilgeError(
        'INVALID_FLOW',
        `Flow "${flowName}" failed validation: ${validation.errors.join('; ')}`,
      );
    }
    if (validation.hasRunScript && !this.allowScripts) {
      throw new DevilgeError(
        'SECURITY_ERROR',
        `Flow "${flowName}" contains runScript: blocks. They are denied by default. ` +
          'Set DEVILGE_ALLOW_FLOW_SCRIPTS=true if you trust every flow file in DEVILGE_FLOWS_ROOT.',
      );
    }

    const args: string[] = ['test', flowPath];
    const paramKeys: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      const safeKey = CommandSanitizer.flowEnvKey(k);
      const safeValue = CommandSanitizer.flowEnvValue(v);
      args.push('-e', `${safeKey}=${safeValue}`);
      paramKeys.push(safeKey);
    }

    const t0 = Date.now();
    const result = await this.runner.run(
      bin,
      args,
      this.flowsValidator.root,
      RUN_FLOW_TIMEOUT_MS,
    );
    const durationMs = Date.now() - t0;

    if (result.timedOut) {
      throw new DevilgeError(
        'MAESTRO_ERROR',
        `Maestro flow "${flowName}" exceeded the ${RUN_FLOW_TIMEOUT_MS}ms timeout.`,
      );
    }

    return {
      flowName,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      durationMs,
      rawOutputTail: stitchOutput(result.stdoutTail, result.stderrTail),
      paramsApplied: paramKeys,
    };
  }

  async listFlows(): Promise<readonly MaestroFlowSummary[]> {
    // Discoverable even without Maestro installed — useful for "what flows do I have?".
    const out: MaestroFlowSummary[] = [];
    const root = this.flowsValidator.root;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith('.yaml') && !lower.endsWith('.yml')) {
        continue;
      }
      const abs = path.join(root, entry.name);
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      if (stat.size > MAX_FLOW_FILE_BYTES) {
        continue;
      }
      let content = '';
      try {
        content = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      const baseName = entry.name.replace(/\.(ya?ml)$/i, '');
      out.push({
        name: baseName,
        relativePath: entry.name,
        sizeBytes: stat.size,
        preview: content.split(/\r?\n/).slice(0, 5).join('\n'),
      });
      if (out.length >= MAX_FLOW_FILES_LISTED) {
        break;
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  async validateFlow(name: string): Promise<MaestroFlowValidation> {
    const flowName = CommandSanitizer.flowName(name);
    const flowPath = await this.resolveFlowPath(flowName);
    const yaml = await this.readFlow(flowPath);
    const v = FlowYamlValidator.validate(yaml);
    return {
      flowName,
      valid: v.valid && (!v.hasRunScript || this.allowScripts),
      errors: v.errors,
      warnings: v.warnings,
      hasRunScript: v.hasRunScript,
    };
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the binary path or throws MAESTRO_NOT_INSTALLED. We no longer
   * pre-verify with `--version` because:
   *   1. Maestro is JVM-backed; cold-start can be 5-15 s, longer than any
   *      reasonable preflight timeout.
   *   2. If the binary is broken, the real `maestro test` invocation will
   *      surface a far more useful error than a generic preflight failure.
   */
  private requireBin(): string {
    if (!this.binPath) {
      throw new DevilgeError(
        'MAESTRO_NOT_INSTALLED',
        'Maestro is not installed. Install it with `brew tap mobile-dev-inc/tap && brew install maestro` ' +
          'or via `curl -Ls "https://get.maestro.mobile.dev" | bash`. ' +
          'After installing, restart the inspector or set DEVILGE_MAESTRO_BIN_PATH to the absolute binary path.',
      );
    }
    return this.binPath;
  }

  private async resolveFlowPath(flowName: string): Promise<string> {
    const candidates = [`${flowName}.yaml`, `${flowName}.yml`];
    for (const candidate of candidates) {
      const abs = path.join(this.flowsValidator.root, candidate);
      try {
        const safe = this.flowsValidator.resolveInsideProject(abs);
        const stat = await fs.stat(safe);
        if (stat.isFile()) {
          return safe;
        }
      } catch {
        // continue
      }
    }
    throw new NotFoundError(
      `Flow "${flowName}" not found under ${this.flowsValidator.root}. Tried: ${candidates.join(', ')}.`,
    );
  }

  private async readFlow(absPath: string): Promise<string> {
    const stat = await fs.stat(absPath);
    if (stat.size > MAX_FLOW_FILE_BYTES) {
      throw new DevilgeError(
        'INVALID_FLOW',
        `Flow file exceeds the ${MAX_FLOW_FILE_BYTES}-byte cap.`,
      );
    }
    return await fs.readFile(absPath, 'utf8');
  }
}

function stitchOutput(stdout: string, stderr: string): string {
  if (stderr.trim().length === 0) {
    return stdout;
  }
  return `${stdout}\n--- stderr ---\n${stderr}`;
}
