import fs from 'node:fs/promises';
import path from 'node:path';

import type { AppControlPort, LaunchAppInput } from '../../domain/ports/index.js';
import type {
  AllowedKeyCode,
  LaunchResult,
  Screenshot,
  UiHierarchy,
  UiNode,
  UiNodeSummary,
  WaitResult,
} from '../../domain/entities/index.js';
import { ALLOWED_KEY_CODES } from '../../domain/entities/index.js';
import { AdbError, NotFoundError, SecurityError } from '../../config/errors.js';
import { CommandSanitizer } from '../security/CommandSanitizer.js';
import type { PathValidator } from '../security/PathValidator.js';
import type { AdbProcessRunner } from './AdbProcessRunner.js';
import { UiHierarchyParser } from './UiHierarchyParser.js';
import { UiNodeFinder } from './UiNodeFinder.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const SCREENSHOT_TIMEOUT_MS = 15_000;
const UIDUMP_TIMEOUT_MS = 15_000;
const INPUT_TIMEOUT_MS = 5_000;

/**
 * AppControlPort backed by `adb shell` / `adb exec-out`.
 *
 * Conventions:
 *   - All adb invocations go through AdbProcessRunner — never raw spawn.
 *   - Every text input crossing the device boundary is sanitized first.
 *   - Outputs (PNG, XML) land under the configured outputs PathValidator root.
 */
export class AdbAppController implements AppControlPort {
  constructor(
    private readonly runner: AdbProcessRunner,
    private readonly outputsValidator: PathValidator,
  ) {}

  async takeScreenshot(serial: string | undefined): Promise<Screenshot> {
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    args.push('exec-out', 'screencap', '-p');
    const result = await this.runner.runRaw(args, SCREENSHOT_TIMEOUT_MS);
    if (result.exitCode !== 0) {
      throw new AdbError(
        `screencap failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
    if (result.stdout.length < 8 || !result.stdout.subarray(0, 4).equals(PNG_MAGIC)) {
      throw new AdbError(
        'screencap returned data that does not look like PNG (no magic header).',
      );
    }
    const stamp = nowIsoSafe();
    const relative = path.join('screenshots', `${stamp}.png`);
    const absolute = path.join(this.outputsValidator.root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    if (!this.outputsValidator.isInside(absolute)) {
      throw new SecurityError(
        'Screenshot path escapes the outputs root after resolution.',
      );
    }
    await fs.writeFile(absolute, result.stdout);

    return {
      absolutePath: absolute,
      relativePath: relative,
      sizeBytes: result.stdout.length,
      capturedAtIso: new Date().toISOString(),
      ...(serial ? { serial } : {}),
    };
  }

  async dumpUi(serial: string | undefined): Promise<UiHierarchy> {
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    // `--compressed` strips zero-area decorations; `/dev/tty` makes uiautomator
    // print the dump to stdout instead of writing to /sdcard/window_dump.xml.
    args.push('exec-out', 'uiautomator', 'dump', '--compressed', '/dev/tty');
    const result = await this.runner.run(args, UIDUMP_TIMEOUT_MS);
    if (result.exitCode !== 0) {
      throw new AdbError(
        `uiautomator dump failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
    const xmlStart = result.stdout.indexOf('<?xml');
    if (xmlStart < 0) {
      throw new AdbError(
        'uiautomator dump returned no XML payload (is the screen interactive?).',
      );
    }
    const xml = result.stdout.slice(xmlStart);
    return UiHierarchyParser.parse(xml, serial);
  }

  async inputTap(
    serial: string | undefined,
    x: number,
    y: number,
  ): Promise<void> {
    const args = this.shellArgs(serial);
    const sx = CommandSanitizer.coordinate(x, 'x');
    const sy = CommandSanitizer.coordinate(y, 'y');
    args.push('input', 'tap', String(sx), String(sy));
    await this.runShell(args);
  }

  async inputText(serial: string | undefined, text: string): Promise<void> {
    const args = this.shellArgs(serial);
    const safe = CommandSanitizer.inputText(text);
    // `adb shell input text` interprets spaces as token separators on most
    // builds — escape spaces to %s. Other special chars (' " ` ; & |) are not
    // metacharacters because spawn shell:false; but the device-side `input`
    // command tokenizes by space, so we still escape.
    const escaped = safe.replace(/ /g, '%s');
    args.push('input', 'text', escaped);
    await this.runShell(args);
  }

  async inputKey(
    serial: string | undefined,
    code: AllowedKeyCode,
  ): Promise<void> {
    if (!ALLOWED_KEY_CODES.includes(code)) {
      throw new SecurityError(`key code "${code}" is not in the allowlist.`);
    }
    const args = this.shellArgs(serial);
    args.push('input', 'keyevent', `KEYCODE_${code}`);
    await this.runShell(args);
  }

  async inputSwipe(
    serial: string | undefined,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number,
  ): Promise<void> {
    const args = this.shellArgs(serial);
    const sx1 = CommandSanitizer.coordinate(x1, 'x1');
    const sy1 = CommandSanitizer.coordinate(y1, 'y1');
    const sx2 = CommandSanitizer.coordinate(x2, 'x2');
    const sy2 = CommandSanitizer.coordinate(y2, 'y2');
    const dur = CommandSanitizer.positiveInt(durationMs, 'durationMs', 60_000);
    args.push(
      'input',
      'swipe',
      String(sx1),
      String(sy1),
      String(sx2),
      String(sy2),
      String(dur),
    );
    await this.runShell(args);
  }

  async setInputVisualization(
    serial: string | undefined,
    enabled: boolean,
  ): Promise<void> {
    const value = enabled ? '1' : '0';
    // `settings put` runs as one shell call per setting; sequencing is fine.
    await this.runShell([
      ...this.shellArgs(serial),
      'settings', 'put', 'system', 'show_touches', value,
    ]);
    await this.runShell([
      ...this.shellArgs(serial),
      'settings', 'put', 'system', 'pointer_location', value,
    ]);
  }

  // ---------------------------------------------------------------------------
  // Phase 13.A: locators
  // ---------------------------------------------------------------------------

  async tapByText(
    serial: string | undefined,
    text: string,
    contains: boolean,
  ): Promise<UiNodeSummary> {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new SecurityError('text must be a non-empty string.');
    }
    if (text.length > 256) {
      throw new SecurityError('text is too long (>256 chars).');
    }
    const ui = await this.dumpUi(serial);
    const matches = UiNodeFinder.findByText(ui.root, text, contains);
    return await this.tapMatch(serial, matches, `text "${text}"`);
  }

  async tapByResourceId(
    serial: string | undefined,
    id: string,
  ): Promise<UiNodeSummary> {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new SecurityError('resourceId must be a non-empty string.');
    }
    if (id.length > 256) {
      throw new SecurityError('resourceId is too long (>256 chars).');
    }
    const ui = await this.dumpUi(serial);
    const matches = UiNodeFinder.findByResourceId(ui.root, id);
    return await this.tapMatch(serial, matches, `resource-id "${id}"`);
  }

  async setText(
    serial: string | undefined,
    label: string,
    value: string,
  ): Promise<UiNodeSummary> {
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new SecurityError('label must be a non-empty string.');
    }
    if (label.length > 128) {
      throw new SecurityError('label is too long (>128 chars).');
    }
    const safeText = CommandSanitizer.inputText(value);

    const ui = await this.dumpUi(serial);
    const target = UiNodeFinder.findInputForLabel(ui.root, label);
    if (!target) {
      throw new NotFoundError(
        `No input field could be associated with label "${label}". ` +
          'Try tapping the field first with tap_text or tap_resource_id, then call input_text directly.',
      );
    }
    const center = UiNodeFinder.centerOf(target);
    await this.inputTap(serial, center.x, center.y);
    await this.inputText(serial, safeText);
    return UiNodeFinder.toSummary(target);
  }

  // ---------------------------------------------------------------------------
  // Phase 13.A: waits
  // ---------------------------------------------------------------------------

  async waitForText(
    serial: string | undefined,
    text: string,
    contains: boolean,
    timeoutMs: number,
  ): Promise<WaitResult> {
    return await this.pollUntil(serial, timeoutMs, (ui) => {
      const matches = UiNodeFinder.findByText(ui.root, text, contains);
      return matches[0] ? UiNodeFinder.toSummary(matches[0]) : null;
    });
  }

  async waitForResourceId(
    serial: string | undefined,
    id: string,
    timeoutMs: number,
  ): Promise<WaitResult> {
    return await this.pollUntil(serial, timeoutMs, (ui) => {
      const matches = UiNodeFinder.findByResourceId(ui.root, id);
      return matches[0] ? UiNodeFinder.toSummary(matches[0]) : null;
    });
  }

  async waitForIdle(
    serial: string | undefined,
    timeoutMs: number,
    stableSamples: number,
  ): Promise<WaitResult> {
    const target = Math.max(2, Math.min(10, stableSamples));
    const start = Date.now();
    let attempts = 0;
    let lastDigest = '';
    let stableCount = 0;
    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      const ui = await this.dumpUi(serial);
      const digest = digestStructure(ui.root);
      if (digest === lastDigest) {
        stableCount += 1;
        if (stableCount >= target) {
          return {
            matched: true,
            attempts,
            elapsedMs: Date.now() - start,
          };
        }
      } else {
        stableCount = 1;
        lastDigest = digest;
      }
      await sleep(pollInterval(attempts));
    }
    return { matched: false, attempts, elapsedMs: Date.now() - start };
  }

  // ---------------------------------------------------------------------------
  // Phase 12+ tier B: lifecycle
  // ---------------------------------------------------------------------------

  async launchApp(
    serial: string | undefined,
    input: LaunchAppInput,
  ): Promise<LaunchResult> {
    const pkg = CommandSanitizer.packageName(input.packageName);
    const cleaned = !!input.clean;
    if (cleaned) {
      await this.forceStopApp(serial, pkg);
      await this.clearAppData(serial, pkg);
    }

    if (input.deepLink) {
      const link = CommandSanitizer.deepLink(input.deepLink);
      const args = this.shellArgs(serial);
      args.push(
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        link,
        pkg,
      );
      const out = await this.runShellCapture(args, 30_000);
      const metrics = parseAmStartOutput(out);
      return {
        packageName: pkg,
        deepLink: link,
        cleaned,
        launchedViaFallback: false,
        ...metrics,
      };
    }

    if (input.activity) {
      const activity = CommandSanitizer.activityName(input.activity);
      const target = activity.startsWith('.') || activity.includes('.')
        ? `${pkg}/${activity}`
        : `${pkg}/.${activity}`;
      const args = this.shellArgs(serial);
      args.push('am', 'start', '-W', '-n', target);
      const out = await this.runShellCapture(args, 30_000);
      const metrics = parseAmStartOutput(out);
      return {
        packageName: pkg,
        activity,
        cleaned,
        launchedViaFallback: false,
        ...metrics,
      };
    }

    // No activity given — try to resolve, fall back to monkey.
    const resolved = await this.resolveLauncherActivity(serial, pkg);
    if (resolved) {
      const args = this.shellArgs(serial);
      args.push('am', 'start', '-W', '-n', `${pkg}/${resolved}`);
      const out = await this.runShellCapture(args, 30_000);
      const metrics = parseAmStartOutput(out);
      return {
        packageName: pkg,
        activity: resolved,
        cleaned,
        launchedViaFallback: false,
        ...metrics,
      };
    }
    // Last resort: monkey. No metrics.
    const args = this.shellArgs(serial);
    args.push(
      'monkey',
      '-p',
      pkg,
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    );
    await this.runShell(args);
    return {
      packageName: pkg,
      cleaned,
      launchedViaFallback: true,
    };
  }

  async forceStopApp(
    serial: string | undefined,
    packageName: string,
  ): Promise<void> {
    const pkg = CommandSanitizer.packageName(packageName);
    const args = this.shellArgs(serial);
    args.push('am', 'force-stop', pkg);
    await this.runShell(args);
  }

  async clearAppData(
    serial: string | undefined,
    packageName: string,
  ): Promise<void> {
    const pkg = CommandSanitizer.packageName(packageName);
    const args = this.shellArgs(serial);
    args.push('pm', 'clear', pkg);
    const result = await this.runner.run(args, 15_000);
    if (result.exitCode !== 0 || !result.stdout.includes('Success')) {
      throw new AdbError(
        `pm clear failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
      );
    }
  }

  async installApk(
    serial: string | undefined,
    apkPath: string,
  ): Promise<{ apkPath: string }> {
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    // -r: replace existing app, -d: allow downgrade. The path is supplied as
    // a separate argv slot so spaces in the path do not break the command.
    args.push('install', '-r', '-d', apkPath);
    const result = await this.runner.run(args, 5 * 60 * 1000);
    if (result.exitCode !== 0 || !/Success/i.test(result.stdout + result.stderr)) {
      throw new AdbError(
        `adb install failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
      );
    }
    return { apkPath };
  }

  /**
   * Resolve a package's launcher activity via `cmd package resolve-activity`.
   * Returns the activity name (relative or fully-qualified) or null if it
   * cannot be determined (we fall back to `monkey` in that case).
   */
  private async resolveLauncherActivity(
    serial: string | undefined,
    pkg: string,
  ): Promise<string | null> {
    const args = this.shellArgs(serial);
    args.push('cmd', 'package', 'resolve-activity', '--brief', pkg);
    let out = '';
    try {
      out = await this.runShellCapture(args, 5_000);
    } catch {
      return null;
    }
    // Output may be:
    //   priority=0 ...
    //   <pkg>/<activity>
    // OR with --brief, just the second line.
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith(pkg + '/')) {
        return line.slice(pkg.length + 1);
      }
    }
    return null;
  }

  private async runShellCapture(
    args: readonly string[],
    timeoutMs: number,
  ): Promise<string> {
    const result = await this.runner.run(args, timeoutMs);
    if (result.exitCode !== 0) {
      throw new AdbError(
        `adb shell failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
    return result.stdout;
  }

  // ---------------------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------------------

  private async tapMatch(
    serial: string | undefined,
    matches: readonly UiNode[],
    label: string,
  ): Promise<UiNodeSummary> {
    if (matches.length === 0) {
      throw new NotFoundError(`No UI node matches ${label} on the current screen.`);
    }
    if (matches.length > 1) {
      const sample = matches
        .slice(0, 5)
        .map((n) => `${n.className}@${formatBounds(n.bounds)}`)
        .join(', ');
      throw new NotFoundError(
        `${matches.length} UI nodes match ${label} — disambiguate. First few: ${sample}.`,
      );
    }
    const node = matches[0];
    if (!node) {
      throw new NotFoundError(`No UI node matches ${label}.`);
    }
    const center = UiNodeFinder.centerOf(node);
    await this.inputTap(serial, center.x, center.y);
    return UiNodeFinder.toSummary(node);
  }

  private async pollUntil(
    serial: string | undefined,
    timeoutMs: number,
    predicate: (ui: UiHierarchy) => UiNodeSummary | null,
  ): Promise<WaitResult> {
    const start = Date.now();
    let attempts = 0;
    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      const ui = await this.dumpUi(serial);
      const matched = predicate(ui);
      if (matched) {
        return {
          matched: true,
          attempts,
          elapsedMs: Date.now() - start,
          matchedNode: matched,
        };
      }
      await sleep(pollInterval(attempts));
    }
    return { matched: false, attempts, elapsedMs: Date.now() - start };
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private shellArgs(serial: string | undefined): string[] {
    const args: string[] = [];
    if (serial) {
      args.push('-s', CommandSanitizer.deviceSerial(serial));
    }
    args.push('shell');
    return args;
  }

  private async runShell(args: readonly string[]): Promise<void> {
    const result = await this.runner.run(args, INPUT_TIMEOUT_MS);
    if (result.exitCode !== 0) {
      throw new AdbError(
        `adb shell failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
  }
}

function nowIsoSafe(): string {
  return new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded backoff: 200, 250, 300, 400, 500, ..., capped at 800ms.
 */
function pollInterval(attempt: number): number {
  if (attempt <= 1) {
    return 200;
  }
  if (attempt <= 3) {
    return 250 + (attempt - 1) * 50;
  }
  if (attempt <= 8) {
    return Math.min(800, 400 + (attempt - 4) * 100);
  }
  return 800;
}

/**
 * Cheap structural digest of a UiNode tree. We don't need cryptographic
 * strength — just enough to detect "did anything material change".
 */
function digestStructure(root: import('../../domain/entities/index.js').UiNode): string {
  const parts: string[] = [];
  const visit = (n: import('../../domain/entities/index.js').UiNode): void => {
    parts.push(
      `${n.className}|${n.resourceId}|${n.text}|${formatBounds(n.bounds)}|${n.children.length}`,
    );
    for (const c of n.children) {
      visit(c);
    }
  };
  visit(root);
  return parts.join('\n');
}

function formatBounds(b: import('../../domain/entities/index.js').UiBounds): string {
  return `[${b.left},${b.top}][${b.right},${b.bottom}]`;
}

/**
 * `am start -W` prints lines like:
 *   Status: ok
 *   LaunchState: COLD
 *   Activity: com.example.app/.MainActivity
 *   ThisTime: 1234
 *   TotalTime: 1234
 *   WaitTime: 1456
 *   Complete
 */
function parseAmStartOutput(stdout: string): {
  status?: string;
  thisTimeMs?: number;
  totalTimeMs?: number;
  waitTimeMs?: number;
} {
  const out: {
    status?: string;
    thisTimeMs?: number;
    totalTimeMs?: number;
    waitTimeMs?: number;
  } = {};
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Status: ')) {
      out.status = trimmed.slice('Status: '.length);
    } else if (trimmed.startsWith('ThisTime: ')) {
      const n = Number.parseInt(trimmed.slice('ThisTime: '.length), 10);
      if (Number.isFinite(n)) {
        out.thisTimeMs = n;
      }
    } else if (trimmed.startsWith('TotalTime: ')) {
      const n = Number.parseInt(trimmed.slice('TotalTime: '.length), 10);
      if (Number.isFinite(n)) {
        out.totalTimeMs = n;
      }
    } else if (trimmed.startsWith('WaitTime: ')) {
      const n = Number.parseInt(trimmed.slice('WaitTime: '.length), 10);
      if (Number.isFinite(n)) {
        out.waitTimeMs = n;
      }
    }
  }
  return out;
}
