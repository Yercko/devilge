import type { AndroidDevice, LogcatEntry, LogLevel } from '../entities/index.js';

/**
 * Outbound port (hexagonal architecture) for talking to ADB.
 * The application layer depends only on this interface, never on a concrete shell wrapper.
 */
export interface AdbPort {
  listDevices(): Promise<readonly AndroidDevice[]>;

  getLogcat(options: GetLogcatOptions): Promise<readonly LogcatEntry[]>;

  /**
   * Streams logcat entries for `durationMs` and returns everything that
   * arrived during that window. Same filtering options as getLogcat.
   * Throws AdbError if `packageName` is set and the app is not running.
   */
  streamLogcat(
    options: GetLogcatOptions,
    durationMs: number,
  ): Promise<readonly LogcatEntry[]>;

  /**
   * Reads a system property from the device (e.g., `ro.build.version.release`).
   * Returns `null` if the property is unset.
   */
  getProp(serial: string, key: string): Promise<string | null>;

  /**
   * Resize the device's logcat ring buffer, in megabytes. Affects subsequent
   * captures only — entries already evicted are gone. Useful when busy debug
   * sessions cause `HttpClient` / `OkHttp` entries to vanish
   * within seconds of being written.
   */
  resizeLogcatBuffer(serial: string, sizeMb: number): Promise<void>;

  /**
   * Returns the PID(s) of the running app. Returns empty if the app is not running
   * or pidof is unavailable on the device.
   */
  resolveAppPids(serial: string | undefined, packageName: string): Promise<readonly number[]>;

  /** Returns true when the given package is installed on the device. */
  isPackageInstalled(serial: string | undefined, packageName: string): Promise<boolean>;

  /**
   * Lists installed package names. `filter` is a substring match (Android's
   * `pm list packages <FILTER>` semantics). Sanitized upstream.
   */
  listInstalledPackages(
    serial: string | undefined,
    filter?: string,
  ): Promise<readonly string[]>;
}

export interface GetLogcatOptions {
  readonly serial?: string;
  readonly maxLines: number;
  readonly minLevel?: LogLevel;
  readonly tagFilter?: string;            // exact tag match; sanitized upstream
  readonly excludeTags?: readonly string[]; // tags to silence; sanitized upstream
  readonly packageName?: string;          // resolved to --pid=<PID> on the device
  readonly sinceSeconds?: number;         // tail recent entries only
}
