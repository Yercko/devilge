import type { AdbPort } from '../domain/ports/index.js';

export interface InspectPackagesInput {
  readonly serial?: string;
  readonly query?: string;          // substring filter; "myapp" / "staging" / etc
  readonly maxResults?: number;
}

export interface PackageInfo {
  readonly packageName: string;
  readonly running: boolean;
  readonly pid?: number;
}

const DEFAULT_MAX_RESULTS = 50;

/**
 * Lists installed packages on the device, optionally filtered by substring,
 * and tells the caller which ones currently have a running process and the PID.
 */
export class InspectPackagesUseCase {
  constructor(
    private readonly adb: AdbPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(input: InspectPackagesInput = {}): Promise<readonly PackageInfo[]> {
    const serial = input.serial ?? this.defaultSerial;
    const max = input.maxResults ?? DEFAULT_MAX_RESULTS;

    const installed = await this.adb.listInstalledPackages(
      serial,
      input.query,
    );
    const truncated = installed.slice(0, max);

    // For each candidate, resolve the running PID (if any) in parallel.
    const results = await Promise.all(
      truncated.map(async (pkg) => {
        const pids = await this.adb.resolveAppPids(serial, pkg);
        return {
          packageName: pkg,
          running: pids.length > 0,
          ...(pids[0] !== undefined ? { pid: pids[0] } : {}),
        };
      }),
    );

    // Sort: running first, then alphabetical.
    return results.sort((a, b) => {
      if (a.running !== b.running) {
        return a.running ? -1 : 1;
      }
      return a.packageName.localeCompare(b.packageName);
    });
  }
}
