import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppControlPort } from '../domain/ports/index.js';
import type { LaunchResult } from '../domain/entities/index.js';
import { NotFoundError, SecurityError } from '../config/errors.js';
import type { PathValidator } from '../infrastructure/security/PathValidator.js';

abstract class LifecycleBase {
  constructor(
    protected readonly app: AppControlPort,
    protected readonly defaultSerial: string | undefined,
  ) {}

  protected resolveSerial(serial: string | undefined): string | undefined {
    return serial ?? this.defaultSerial;
  }
}

export interface LaunchAppUseCaseInput {
  readonly serial?: string;
  readonly packageName: string;
  readonly activity?: string;
  readonly deepLink?: string;
  readonly clean?: boolean;
}

export class LaunchAppUseCase extends LifecycleBase {
  async execute(input: LaunchAppUseCaseInput): Promise<LaunchResult> {
    return await this.app.launchApp(this.resolveSerial(input.serial), {
      packageName: input.packageName,
      ...(input.activity ? { activity: input.activity } : {}),
      ...(input.deepLink ? { deepLink: input.deepLink } : {}),
      ...(input.clean !== undefined ? { clean: input.clean } : {}),
    });
  }
}

export interface ForceStopAppInput {
  readonly serial?: string;
  readonly packageName: string;
}

export class ForceStopAppUseCase extends LifecycleBase {
  async execute(input: ForceStopAppInput): Promise<{ packageName: string }> {
    await this.app.forceStopApp(this.resolveSerial(input.serial), input.packageName);
    return { packageName: input.packageName };
  }
}

export interface ClearAppDataInput {
  readonly serial?: string;
  readonly packageName: string;
}

export class ClearAppDataUseCase extends LifecycleBase {
  async execute(input: ClearAppDataInput): Promise<{ packageName: string; cleared: true }> {
    await this.app.clearAppData(this.resolveSerial(input.serial), input.packageName);
    return { packageName: input.packageName, cleared: true };
  }
}

export interface InstallApkInput {
  readonly serial?: string;
  /** Direct APK path (absolute or relative to project root). Mutually exclusive with `module`. */
  readonly apkPath?: string;
  /** Gradle module path (e.g. ":app", ":composeApp"). Used to auto-locate the built APK. */
  readonly module?: string;
  /** Build variant (default "debug"). */
  readonly variant?: string;
}

const VARIANT_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;
const MODULE_RE = /^(:[A-Za-z][A-Za-z0-9_-]*)+$/;

export class InstallApkUseCase {
  constructor(
    private readonly app: AppControlPort,
    private readonly defaultSerial: string | undefined,
    private readonly pathValidator: PathValidator,
  ) {}

  async execute(input: InstallApkInput): Promise<{ apkPath: string }> {
    if (!input.apkPath && !input.module) {
      throw new Error('Provide either `apkPath` or `module`.');
    }
    if (input.apkPath && input.module) {
      throw new Error('Provide either `apkPath` or `module`, not both.');
    }

    let absoluteApk: string;
    if (input.apkPath) {
      absoluteApk = this.pathValidator.resolveInsideProject(input.apkPath);
    } else if (input.module) {
      if (!MODULE_RE.test(input.module)) {
        throw new SecurityError(
          'module must be a Gradle path like ":app" or ":modules:feature:login".',
        );
      }
      const variant = input.variant ?? 'debug';
      if (!VARIANT_RE.test(variant)) {
        throw new SecurityError('variant must be alphanumeric.');
      }
      absoluteApk = await this.locateApk(input.module, variant);
    } else {
      throw new Error('unreachable');
    }

    return await this.app.installApk(
      input.serial ?? this.defaultSerial,
      absoluteApk,
    );
  }

  /**
   * Look under `<projectRoot>/<module-path>/build/outputs/apk/<variant>/`
   * and return the .apk in there. Errors when zero or >1 APKs are found.
   */
  private async locateApk(moduleName: string, variant: string): Promise<string> {
    const relativePath = moduleName.replace(/^:/, '').replace(/:/g, path.sep);
    const apkDir = path.join(
      this.pathValidator.root,
      relativePath,
      'build',
      'outputs',
      'apk',
      variant,
    );
    // Check existence BEFORE PathValidator.resolveInsideProject — that helper
    // throws SecurityError when the path doesn't exist (since it uses realpath),
    // and the right user-facing message in that case is "you haven't built yet".
    try {
      await fs.access(apkDir);
    } catch {
      const variantTitle = variant.charAt(0).toUpperCase() + variant.slice(1);
      throw new NotFoundError(
        `No APK output dir at ${apkDir}. Run \`run_gradle_task\` with task "${moduleName}:assemble${variantTitle}" first.`,
      );
    }
    const safeDir = this.pathValidator.resolveInsideProject(apkDir);
    let entries: string[];
    try {
      entries = await fs.readdir(safeDir);
    } catch {
      throw new NotFoundError(
        `No APK output dir at ${apkDir} after path resolution.`,
      );
    }
    const apks = entries.filter((e) => e.endsWith('.apk'));
    if (apks.length === 0) {
      throw new NotFoundError(
        `No .apk found in ${apkDir}. Run an assemble task first.`,
      );
    }
    if (apks.length > 1) {
      throw new NotFoundError(
        `Multiple APKs in ${apkDir}: ${apks.join(', ')}. Pass \`apkPath\` explicitly to disambiguate.`,
      );
    }
    return path.join(safeDir, apks[0]!);
  }
}
