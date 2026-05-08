import { z } from 'zod';
import type {
  LaunchAppUseCase,
  ForceStopAppUseCase,
  ClearAppDataUseCase,
  RunInstrumentedTestsUseCase,
  InstallApkUseCase,
} from '../../application/index.js';
import { toToolError } from '../toolError.js';

const SERIAL = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe('Device serial. Defaults to DEVILGE_DEFAULT_DEVICE_SERIAL or the only attached device.');

const PACKAGE_NAME = z
  .string()
  .min(3)
  .max(256)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+(:[a-zA-Z0-9._-]+)?$/);

// ---------------------------------------------------------------------------
// devilge_launch_app
// ---------------------------------------------------------------------------

export const launchAppToolName = 'devilge_launch_app';
export const launchAppInputSchema = {
  serial: SERIAL,
  packageName: PACKAGE_NAME.describe('App applicationId, e.g. "com.example.app".'),
  activity: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\.?[a-zA-Z][\w$]*(\.[a-zA-Z][\w$]*)*$/)
    .optional()
    .describe('Activity name (relative ".MainActivity" or fully-qualified). If omitted, devilge tries to resolve the launcher activity.'),
  deepLink: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/)
    .optional()
    .describe('Deep link URI to open instead of the main activity (mutually compatible with `activity`).'),
  clean: z
    .boolean()
    .optional()
    .describe('If true, run force-stop + pm clear before launch — guaranteed cold start with empty state. Default false.'),
};
export const launchAppToolDefinition = {
  title: 'Launch the app',
  description:
    'Launches the app via `am start -W`. Returns cold-start metrics (waitTimeMs / totalTimeMs / thisTimeMs) ' +
    'when available. With `clean=true`, force-stops and wipes app data first. With `deepLink`, opens an ' +
    'arbitrary URI handled by the app. With `activity`, targets a specific component. Without either, ' +
    'devilge resolves the launcher activity automatically (falls back to `monkey` if resolution fails).',
  inputSchema: launchAppInputSchema,
};
export function buildLaunchAppHandler(useCase: LaunchAppUseCase) {
  return async (args: {
    serial?: string;
    packageName: string;
    activity?: string;
    deepLink?: string;
    clean?: boolean;
  }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        packageName: args.packageName,
        ...(args.activity ? { activity: args.activity } : {}),
        ...(args.deepLink ? { deepLink: args.deepLink } : {}),
        ...(args.clean !== undefined ? { clean: args.clean } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_force_stop_app
// ---------------------------------------------------------------------------

export const forceStopAppToolName = 'devilge_force_stop_app';
export const forceStopAppInputSchema = {
  serial: SERIAL,
  packageName: PACKAGE_NAME.describe('App applicationId to kill.'),
};
export const forceStopAppToolDefinition = {
  title: 'Force-stop an app',
  description:
    'Runs `am force-stop <pkg>` — kills every process of the given app. Useful before relaunch to ensure ' +
    'a cold start, or when an app is hung.',
  inputSchema: forceStopAppInputSchema,
};
export function buildForceStopAppHandler(useCase: ForceStopAppUseCase) {
  return async (args: { serial?: string; packageName: string }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        packageName: args.packageName,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...result }) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_clear_app_data
// ---------------------------------------------------------------------------

export const clearAppDataToolName = 'devilge_clear_app_data';
export const clearAppDataInputSchema = {
  serial: SERIAL,
  packageName: PACKAGE_NAME.describe('App applicationId whose data will be wiped.'),
};
export const clearAppDataToolDefinition = {
  title: 'Wipe app data (DESTRUCTIVE)',
  description:
    'Runs `pm clear <pkg>` — wipes all app data including caches, databases, SharedPreferences, ' +
    'tokens. The app behaves like a fresh install on next launch. **DESTRUCTIVE.** Recommended only ' +
    'on dev emulators or wiped test devices, never on personal devices with logged-in apps.',
  inputSchema: clearAppDataInputSchema,
};
export function buildClearAppDataHandler(useCase: ClearAppDataUseCase) {
  return async (args: { serial?: string; packageName: string }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        packageName: args.packageName,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_run_instrumented_tests
// ---------------------------------------------------------------------------

export const runInstrumentedTestsToolName = 'devilge_run_instrumented_tests';
export const runInstrumentedTestsInputSchema = {
  module: z
    .string()
    .min(1)
    .max(256)
    .regex(/^(:[A-Za-z][A-Za-z0-9_-]*)+$/)
    .optional()
    .describe('Gradle module path, e.g. ":app" or ":modules:feature:login". Default ":app".'),
  testClass: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-zA-Z_][\w$]*(\.[a-zA-Z_][\w$]*)+$/)
    .optional()
    .describe('Optional fully-qualified test class to filter (e.g. "com.example.LoginInstrumentedTest").'),
  testMethod: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z_][\w$]*$/)
    .optional()
    .describe('Optional method to filter. Requires `testClass`.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30 * 60 * 1000)
    .optional()
    .describe('Hard timeout in ms. Default 600000 (10 min). Cap 1800000 (30 min).'),
  tailBytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024)
    .optional()
    .describe('Bytes of stdout/stderr to retain. Default 262144 (256 KiB).'),
};
export const runInstrumentedTestsToolDefinition = {
  title: 'Run Espresso/UI instrumented tests',
  description:
    'Runs `:<module>:connectedDebugAndroidTest` against an attached device, optionally filtered to ' +
    'a single class or class#method. Returns the same structured result as `devilge_run_gradle_task` ' +
    '(success, JUnit-parsed `testResults`, compile errors, build failures, raw output tail). Reuses ' +
    'the existing JUnitXmlParser to read androidTest results.',
  inputSchema: runInstrumentedTestsInputSchema,
};
export function buildRunInstrumentedTestsHandler(useCase: RunInstrumentedTestsUseCase) {
  return async (args: {
    module?: string;
    testClass?: string;
    testMethod?: string;
    timeoutMs?: number;
    tailBytes?: number;
  }) => {
    try {
      const result = await useCase.execute({
        ...(args.module ? { module: args.module } : {}),
        ...(args.testClass ? { testClass: args.testClass } : {}),
        ...(args.testMethod ? { testMethod: args.testMethod } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
        ...(args.tailBytes !== undefined ? { tailBytes: args.tailBytes } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// devilge_install_apk — fast install bypassing Gradle's configuration phase
// ---------------------------------------------------------------------------

export const installApkToolName = 'devilge_install_apk';
export const installApkInputSchema = {
  serial: SERIAL,
  apkPath: z
    .string()
    .min(1)
    .max(1024)
    .optional()
    .describe('Absolute or project-relative path to a .apk file. Mutually exclusive with `module`.'),
  module: z
    .string()
    .min(1)
    .max(256)
    .regex(/^(:[A-Za-z][A-Za-z0-9_-]*)+$/)
    .optional()
    .describe('Gradle module path, e.g. ":app". devilge auto-locates the APK under <module>/build/outputs/apk/<variant>/.'),
  variant: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/)
    .optional()
    .describe('Build variant (default "debug"). Used only when `module` is given.'),
};
export const installApkToolDefinition = {
  title: 'Install APK on device (fast)',
  description:
    'Installs an APK via `adb install -r` directly, bypassing Gradle. Much faster than `run_gradle_task ' +
    'installDebug` for the iterate-on-source-then-reinstall loop. Pass either `apkPath` (explicit file) ' +
    'or `module` (auto-locate `<projectRoot>/<module>/build/outputs/apk/<variant>/*.apk`). Recommended ' +
    'workflow: assemble once with `run_gradle_task assembleDebug`, then re-install with this tool on each ' +
    'iteration — saves the Gradle configuration overhead each time.',
  inputSchema: installApkInputSchema,
};
export function buildInstallApkHandler(useCase: InstallApkUseCase) {
  return async (args: { serial?: string; apkPath?: string; module?: string; variant?: string }) => {
    try {
      const result = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.apkPath ? { apkPath: args.apkPath } : {}),
        ...(args.module ? { module: args.module } : {}),
        ...(args.variant ? { variant: args.variant } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...result }) }] };
    } catch (err) {
      return toToolError(err);
    }
  };
}
