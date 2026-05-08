import type {
  AdbPort,
  GetLogcatOptions,
} from '../../domain/ports/index.js';
import type {
  AndroidDevice,
  DeviceState,
  LogcatEntry,
} from '../../domain/entities/index.js';
import { AdbError } from '../../config/errors.js';
import { CommandSanitizer } from '../security/CommandSanitizer.js';
import { AdbProcessRunner } from './AdbProcessRunner.js';
import { parseLogcatLine } from './LogcatParser.js';

const VALID_DEVICE_STATES: ReadonlySet<DeviceState> = new Set<DeviceState>([
  'device',
  'offline',
  'unauthorized',
  'recovery',
  'sideload',
  'bootloader',
  'unknown',
]);

export class AdbAdapter implements AdbPort {
  constructor(private readonly runner: AdbProcessRunner) {}

  async listDevices(): Promise<readonly AndroidDevice[]> {
    const result = await this.runner.run(['devices', '-l']);
    if (result.exitCode !== 0) {
      throw new AdbError(`adb devices failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
    }
    return parseDevicesOutput(result.stdout);
  }

  async getLogcat(options: GetLogcatOptions): Promise<readonly LogcatEntry[]> {
    const max = CommandSanitizer.positiveInt(options.maxLines, 'maxLines', 5000);
    const args = await this.buildLogcatArgs(options, /* dump= */ true, max);

    const result = await this.runner.run(args, 20_000);
    if (result.exitCode !== 0) {
      throw new AdbError(`adb logcat failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
    }
    return parseStdout(result.stdout, max);
  }

  async streamLogcat(
    options: GetLogcatOptions,
    durationMs: number,
  ): Promise<readonly LogcatEntry[]> {
    const max = CommandSanitizer.positiveInt(options.maxLines, 'maxLines', 5000);
    const args = await this.buildLogcatArgs(options, /* dump= */ false, max);
    const result = await this.runner.runForDuration(args, durationMs);
    return parseStdout(result.stdout, max);
  }

  /**
   * Builds the argv for `adb logcat`. Returns null when packageName is set
   * but the app is not running — the caller decides whether that is silent
   * (snapshot) or an error (streaming).
   */
  private async buildLogcatArgs(
    options: GetLogcatOptions,
    dump: boolean,
    max: number,
  ): Promise<string[]> {
    const args: string[] = [];
    if (options.serial) {
      args.push('-s', CommandSanitizer.deviceSerial(options.serial));
    }
    args.push('logcat', '-v', 'threadtime');
    if (dump) {
      args.push('-d');
    }

    const hasFilter =
      !!options.tagFilter ||
      !!options.minLevel ||
      !!options.packageName ||
      !!(options.excludeTags && options.excludeTags.length > 0);

    // -T is only safe in dump mode without filters; otherwise it slices the
    // recent buffer before filtering and silently discards matching entries.
    if (dump && !hasFilter) {
      args.push('-T', String(max));
    }

    if (options.packageName) {
      const pids = await this.resolveAppPids(options.serial, options.packageName);
      if (pids.length === 0) {
        const installed = await this.isPackageInstalled(
          options.serial,
          options.packageName,
        );
        if (!installed) {
          throw new AdbError(
            `Package "${options.packageName}" is not installed on the device. ` +
              'Use devilge_inspect_packages with a partial name (e.g. "myapp") to find the correct applicationId.',
          );
        }
        throw new AdbError(
          `Package "${options.packageName}" is installed but no process is running. ` +
            'Open the app on the device first, then call again.',
        );
      }
      const firstPid = pids[0];
      if (firstPid !== undefined) {
        args.push(`--pid=${firstPid}`);
      }
    }

    const filterSpec: string[] = [];
    const excluded = (options.excludeTags ?? []).map((t) =>
      CommandSanitizer.logcatTag(t),
    );
    if (options.minLevel) {
      filterSpec.push(
        options.tagFilter
          ? `${CommandSanitizer.logcatTag(options.tagFilter)}:${options.minLevel}`
          : `*:${options.minLevel}`,
      );
    } else if (options.tagFilter) {
      filterSpec.push(`${CommandSanitizer.logcatTag(options.tagFilter)}:V`);
    }
    for (const t of excluded) {
      filterSpec.push(`${t}:S`);
    }
    if (filterSpec.length > 0 && (options.tagFilter || options.minLevel)) {
      filterSpec.push('*:S');
    }
    args.push(...filterSpec);
    return args;
  }

  async resolveAppPids(
    serial: string | undefined,
    packageName: string,
  ): Promise<readonly number[]> {
    const pkg = CommandSanitizer.packageName(packageName);
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    args.push('shell', 'pidof', pkg);
    const result = await this.runner.run(args, 5_000);
    if (result.exitCode !== 0) {
      // pidof exits 1 when no process found — that is not a failure.
      return [];
    }
    const pids: number[] = [];
    for (const tok of result.stdout.trim().split(/\s+/)) {
      const n = Number.parseInt(tok, 10);
      if (Number.isFinite(n) && n > 0) {
        pids.push(n);
      }
    }
    return pids;
  }

  async isPackageInstalled(
    serial: string | undefined,
    packageName: string,
  ): Promise<boolean> {
    const pkg = CommandSanitizer.packageName(packageName);
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    args.push('shell', 'pm', 'list', 'packages', pkg);
    const result = await this.runner.run(args, 5_000);
    if (result.exitCode !== 0) {
      return false;
    }
    const target = `package:${pkg}`;
    return result.stdout.split(/\r?\n/).some((line) => line.trim() === target);
  }

  async listInstalledPackages(
    serial: string | undefined,
    filter?: string,
  ): Promise<readonly string[]> {
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    args.push('shell', 'pm', 'list', 'packages');
    if (filter) {
      args.push(CommandSanitizer.packageFilter(filter));
    }
    const result = await this.runner.run(args, 10_000);
    if (result.exitCode !== 0) {
      throw new AdbError(
        `pm list packages failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('package:'))
      .map((line) => line.slice('package:'.length))
      .filter((pkg) => pkg.length > 0);
  }

  /**
   * Resize the device-side logcat ring buffer. Without this, busy debug
   * sessions evict entries within seconds. Apply to the "main" buffer (where
   * app logs land) for typical workflows.
   *
   * Allowed sizes per `adb logcat -G --help`: an integer + optional unit
   * (K, M, G). We restrict to a conservative whitelist to keep this safe.
   */
  async resizeLogcatBuffer(serial: string, sizeMb: number): Promise<void> {
    const cleanSerial = CommandSanitizer.deviceSerial(serial);
    const size = CommandSanitizer.positiveInt(sizeMb, 'sizeMb', 256);
    const result = await this.runner.run(
      ['-s', cleanSerial, 'logcat', '-G', `${size}M`],
      10_000,
    );
    if (result.exitCode !== 0) {
      throw new AdbError(
        `adb logcat -G failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
  }

  async getProp(serial: string, key: string): Promise<string | null> {
    const cleanSerial = CommandSanitizer.deviceSerial(serial);
    const cleanKey = CommandSanitizer.systemProperty(key);
    const result = await this.runner.run(
      ['-s', cleanSerial, 'shell', 'getprop', cleanKey],
      5_000,
    );
    if (result.exitCode !== 0) {
      throw new AdbError(`adb getprop failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
    }
    const trimmed = result.stdout.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}

function parseStdout(stdout: string, max: number): readonly LogcatEntry[] {
  const lines = stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(parseLogcatLine);
  return lines.slice(-max);
}

function parseDevicesOutput(stdout: string): readonly AndroidDevice[] {
  const devices: AndroidDevice[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) {
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const serial = parts[0];
    const stateRaw = parts[1];
    if (!serial || !stateRaw) {
      continue;
    }
    const state: DeviceState = VALID_DEVICE_STATES.has(stateRaw as DeviceState)
      ? (stateRaw as DeviceState)
      : 'unknown';

    const meta: Record<string, string> = {};
    for (let i = 2; i < parts.length; i += 1) {
      const piece = parts[i];
      if (!piece) {
        continue;
      }
      const eqIdx = piece.indexOf(':');
      if (eqIdx > 0) {
        const key = piece.slice(0, eqIdx);
        const value = piece.slice(eqIdx + 1);
        meta[key] = value;
      }
    }
    devices.push({
      serial,
      state,
      ...(meta.product ? { product: meta.product } : {}),
      ...(meta.model ? { model: meta.model } : {}),
      ...(meta.transport_id ? { transportId: meta.transport_id } : {}),
    });
  }
  return devices;
}
