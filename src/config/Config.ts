import path from 'node:path';
import fs from 'node:fs';
import { ConfigurationError } from './errors.js';

/**
 * Validated, immutable runtime configuration.
 * All filesystem paths are resolved to absolute, real paths at load time so the
 * security layer can reason about them without re-resolving.
 */
export type HttpLogFormat = 'ktor' | 'okhttp' | 'auto';

export interface Config {
  readonly androidProjectRoot: string;
  readonly adbPath: string;
  readonly defaultDeviceSerial: string | undefined;
  readonly logcatMaxLines: number;
  readonly logLevel: LogLevel;
  /** @deprecated Kept for backward compat — read `defaultHttpLogTags` instead. */
  readonly defaultKtorLogTag: string;
  /**
   * Tags that `get_network_calls` queries by default when the caller doesn't
   * pass one. Tries common defaults so a user with Retrofit doesn't see
   * `count: 0` just because their logger uses tag "OkHttp" instead of "HttpClient".
   */
  readonly defaultHttpLogTags: readonly string[];
  readonly httpLogFormat: HttpLogFormat;
  /**
   * Root for any artifact devilge writes to disk: screenshots, UI dumps,
   * Compose preview renders, etc. Defaults to `<projectRoot>/.devilge-outputs/`
   * which the operator should add to .gitignore. Override via DEVILGE_OUTPUTS_ROOT.
   * Always created at startup if missing.
   */
  readonly outputsRoot: string;
  /**
   * Root directory containing Maestro YAML flows. Defaults to
   * `<projectRoot>/devilge-flows/`. Override via DEVILGE_FLOWS_ROOT.
   * Created at startup if missing.
   */
  readonly flowsRoot: string;
  /** Absolute path to the maestro binary, or null when not detected. */
  readonly maestroBinPath: string | null;
  /** Whether `runScript:` blocks in flow YAML are allowed (default false). */
  readonly allowFlowScripts: boolean;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ABSOLUTE_LOGCAT_CAP = 5000;
const DEFAULT_LOGCAT_LINES = 500;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawRoot = env.DEVILGE_ANDROID_PROJECT_ROOT?.trim();
  if (!rawRoot) {
    throw new ConfigurationError(
      'DEVILGE_ANDROID_PROJECT_ROOT is required (absolute path to the Android project).',
    );
  }
  if (!path.isAbsolute(rawRoot)) {
    throw new ConfigurationError(
      'DEVILGE_ANDROID_PROJECT_ROOT must be an absolute path.',
    );
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(rawRoot);
  } catch {
    throw new ConfigurationError(
      `DEVILGE_ANDROID_PROJECT_ROOT does not exist or is not accessible: ${rawRoot}`,
    );
  }
  const stat = fs.statSync(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new ConfigurationError(
      'DEVILGE_ANDROID_PROJECT_ROOT must point to a directory.',
    );
  }

  const adbPath = resolveAdbPath(env.DEVILGE_ADB_PATH);
  const logcatMaxLines = parseLogcatMax(env.DEVILGE_LOGCAT_MAX_LINES);
  const logLevel = parseLogLevel(env.DEVILGE_LOG_LEVEL);

  const defaultHttpLogTags = parseHttpLogTags(
    env.DEVILGE_HTTP_LOG_TAGS,
    env.DEVILGE_KTOR_LOG_TAG ?? env.DEVILGE_HTTP_LOG_TAG,
  );
  const defaultKtorLogTag = defaultHttpLogTags[0] ?? 'HttpClient';
  const httpLogFormat = parseHttpLogFormat(env.DEVILGE_HTTP_LOG_FORMAT);
  const outputsRoot = resolveOutputsRoot(env.DEVILGE_OUTPUTS_ROOT, resolvedRoot);
  const flowsRoot = resolveFlowsRoot(env.DEVILGE_FLOWS_ROOT, resolvedRoot);
  const maestroBinPath = resolveMaestroBin(env.DEVILGE_MAESTRO_BIN_PATH);
  const allowFlowScripts = env.DEVILGE_ALLOW_FLOW_SCRIPTS === 'true';

  return Object.freeze({
    androidProjectRoot: resolvedRoot,
    adbPath,
    defaultDeviceSerial: env.DEVILGE_DEFAULT_DEVICE_SERIAL?.trim() || undefined,
    logcatMaxLines,
    logLevel,
    defaultKtorLogTag,
    defaultHttpLogTags,
    httpLogFormat,
    outputsRoot,
    flowsRoot,
    maestroBinPath,
    allowFlowScripts,
  });
}

function parseHttpLogFormat(raw: string | undefined): HttpLogFormat {
  const value = (raw ?? 'auto').toLowerCase();
  if (value === 'ktor' || value === 'okhttp' || value === 'auto') {
    return value;
  }
  throw new ConfigurationError(
    `DEVILGE_HTTP_LOG_FORMAT must be one of: ktor, okhttp, auto (got "${raw}").`,
  );
}

/**
 * Resolve the list of HTTP-log tags devilge will sweep when the caller
 * doesn't pass one. Order of precedence:
 *   1. DEVILGE_HTTP_LOG_TAGS (comma-separated, multiple tags).
 *   2. DEVILGE_KTOR_LOG_TAG / DEVILGE_HTTP_LOG_TAG (single tag, legacy).
 *   3. Default: ['HttpClient', 'OkHttp'] — covers Ktor and OkHttp/Retrofit
 *      out of the box.
 */
function parseHttpLogTags(
  manyRaw: string | undefined,
  singleRaw: string | undefined,
): readonly string[] {
  if (manyRaw && manyRaw.trim().length > 0) {
    return manyRaw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map(validateLogTag);
  }
  if (singleRaw && singleRaw.trim().length > 0) {
    return [validateLogTag(singleRaw.trim())];
  }
  return ['HttpClient', 'OkHttp'];
}

function validateLogTag(value: string): string {
  if (!KTOR_LOG_TAG_RE.test(value)) {
    throw new ConfigurationError(
      `HTTP log tag "${value}" may only contain letters, digits, ".", "_" and "-" (max 64 chars).`,
    );
  }
  return value;
}

function resolveFlowsRoot(raw: string | undefined, projectRoot: string): string {
  const target = raw?.trim()
    ? raw.trim()
    : path.join(projectRoot, 'devilge-flows');
  if (!path.isAbsolute(target)) {
    throw new ConfigurationError('DEVILGE_FLOWS_ROOT must be an absolute path.');
  }
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    throw new ConfigurationError(
      `Could not create flows directory ${target}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return fs.realpathSync(target);
}

function resolveMaestroBin(raw: string | undefined): string | null {
  // Explicit override takes precedence.
  if (raw && raw.trim() !== '') {
    const trimmed = raw.trim();
    // Hard error only on syntax issues (relative path) — Maestro is optional,
    // so a missing-binary value is degraded to "no Maestro available", not a boot crash.
    if (!path.isAbsolute(trimmed)) {
      throw new ConfigurationError('DEVILGE_MAESTRO_BIN_PATH must be an absolute path.');
    }
    if (!fs.existsSync(trimmed)) {
      process.stderr.write(
        `[devilge] DEVILGE_MAESTRO_BIN_PATH points to a missing binary: ${trimmed}. ` +
          'Maestro tools will return MAESTRO_NOT_INSTALLED until this is fixed.\n',
      );
      return null;
    }
    return trimmed;
  }
  // Otherwise, search PATH for `maestro` binary.
  const which = process.env.PATH?.split(':') ?? [];
  for (const dir of which) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, 'maestro');
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function resolveOutputsRoot(raw: string | undefined, projectRoot: string): string {
  const target = raw?.trim()
    ? raw.trim()
    : path.join(projectRoot, '.devilge-outputs');
  if (!path.isAbsolute(target)) {
    throw new ConfigurationError('DEVILGE_OUTPUTS_ROOT must be an absolute path.');
  }
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    throw new ConfigurationError(
      `Could not create outputs directory ${target}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return fs.realpathSync(target);
}

const KTOR_LOG_TAG_RE = /^[A-Za-z0-9._-]{1,64}$/;

function resolveAdbPath(raw: string | undefined): string {
  if (!raw || raw.trim() === '') {
    return 'adb';
  }
  const trimmed = raw.trim();
  if (!path.isAbsolute(trimmed)) {
    throw new ConfigurationError('DEVILGE_ADB_PATH must be an absolute path.');
  }
  if (!fs.existsSync(trimmed)) {
    throw new ConfigurationError(`DEVILGE_ADB_PATH does not exist: ${trimmed}`);
  }
  return trimmed;
}

function parseLogcatMax(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_LOGCAT_LINES;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigurationError(
      'DEVILGE_LOGCAT_MAX_LINES must be a positive integer.',
    );
  }
  return Math.min(parsed, ABSOLUTE_LOGCAT_CAP);
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? 'info').toLowerCase();
  if (value === 'error' || value === 'warn' || value === 'info' || value === 'debug') {
    return value;
  }
  throw new ConfigurationError(
    `DEVILGE_LOG_LEVEL must be one of: error, warn, info, debug (got "${raw}").`,
  );
}

export const ABSOLUTE_LOGCAT_CAP_VALUE = ABSOLUTE_LOGCAT_CAP;
