import type {
  AllowedKeyCode,
  LaunchResult,
  Screenshot,
  UiHierarchy,
  UiNodeSummary,
  WaitResult,
} from '../entities/index.js';

/**
 * Outbound port for actions that mutate device UI state and capture device
 * presentation. Implementation today is `AdbAppController`.
 *
 * Phase 12+ tier A: takeScreenshot, dumpUi, input* primitives.
 * Phase 12+ tier B (future): launchApp, forceStopApp, clearAppData.
 */
export interface AppControlPort {
  takeScreenshot(serial: string | undefined): Promise<Screenshot>;

  dumpUi(serial: string | undefined): Promise<UiHierarchy>;

  inputTap(serial: string | undefined, x: number, y: number): Promise<void>;

  inputText(serial: string | undefined, text: string): Promise<void>;

  inputKey(serial: string | undefined, code: AllowedKeyCode): Promise<void>;

  inputSwipe(
    serial: string | undefined,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number,
  ): Promise<void>;

  /**
   * Toggle the device-side "Show touches" and "Pointer location" developer
   * options. When enabled, every tap/swipe leaves a visible circle plus a
   * crosshair with live coordinates on screen — invaluable feedback when
   * driving the device via input primitives. Persists until reboot.
   */
  setInputVisualization(
    serial: string | undefined,
    enabled: boolean,
  ): Promise<void>;

  // ---------------------------------------------------------------------------
  // Phase 13.A: semantic locators (built on dump_ui + input primitives)
  // ---------------------------------------------------------------------------

  /**
   * Tap on the unique node whose visible text or contentDescription matches.
   * Throws when 0 or >1 matches are found (forces the caller to disambiguate).
   */
  tapByText(
    serial: string | undefined,
    text: string,
    contains: boolean,
  ): Promise<UiNodeSummary>;

  /** Tap on the unique node whose resource-id matches. */
  tapByResourceId(
    serial: string | undefined,
    id: string,
  ): Promise<UiNodeSummary>;

  /**
   * Find the input field associated with the given label, focus it, and type
   * the value. Heuristic: focused EditText → EditText with matching
   * contentDescription/text → EditText after a label TextView.
   */
  setText(
    serial: string | undefined,
    label: string,
    value: string,
  ): Promise<UiNodeSummary>;

  // ---------------------------------------------------------------------------
  // Phase 13.A: smart waits (poll dump_ui until condition or timeout)
  // ---------------------------------------------------------------------------

  waitForText(
    serial: string | undefined,
    text: string,
    contains: boolean,
    timeoutMs: number,
  ): Promise<WaitResult>;

  waitForResourceId(
    serial: string | undefined,
    id: string,
    timeoutMs: number,
  ): Promise<WaitResult>;

  /**
   * Returns when N consecutive dumps yield identical structures (idle), or
   * the timeout elapses. Coarse but robust signal that the UI has settled.
   */
  waitForIdle(
    serial: string | undefined,
    timeoutMs: number,
    stableSamples: number,
  ): Promise<WaitResult>;

  // ---------------------------------------------------------------------------
  // Phase 12+ tier B: app lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Launch the app, optionally to a deep link or specific activity.
   * `clean=true` performs `am force-stop` + `pm clear` first to guarantee
   * a cold start with empty state.
   */
  launchApp(
    serial: string | undefined,
    input: LaunchAppInput,
  ): Promise<LaunchResult>;

  /** `am force-stop <pkg>` — kills all processes of the app. */
  forceStopApp(serial: string | undefined, packageName: string): Promise<void>;

  /** `pm clear <pkg>` — wipes app data. Destructive. */
  clearAppData(serial: string | undefined, packageName: string): Promise<void>;

  /**
   * Install (or replace) an APK on the device via `adb install -r`. Faster
   * than running Gradle's `:installDebug` task because it skips the
   * configuration phase. Returns the resolved APK path that was installed.
   */
  installApk(
    serial: string | undefined,
    apkPath: string,
  ): Promise<{ apkPath: string }>;
}

export interface LaunchAppInput {
  readonly packageName: string;
  readonly activity?: string;
  readonly deepLink?: string;
  readonly clean?: boolean;
}
