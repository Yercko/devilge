import { spawn } from 'node:child_process';
import { AdbError } from '../../config/errors.js';

export interface AdbProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Thin wrapper around child_process.spawn that:
 *   - NEVER uses a shell (shell: false is the default but we set it explicitly).
 *   - Always passes args as an array, never concatenates strings.
 *   - Enforces a hard timeout to prevent hung adb invocations from leaking.
 *   - Caps stdout buffer to avoid memory exhaustion from chatty processes.
 */
export class AdbProcessRunner {
  constructor(
    private readonly adbPath: string,
    private readonly defaultTimeoutMs = 15_000,
    private readonly maxStdoutBytes = 8 * 1024 * 1024, // 8 MiB
  ) {}

  /**
   * Spawns adb and streams output for `durationMs`, then kills the process and
   * resolves with whatever was collected.
   *
   * Differs from `run` in that the timeout is the *intended duration*, not a
   * failure: we always resolve, never reject, on timeout. Useful for live
   * `adb logcat` (no -d) tailing.
   */
  async runForDuration(
    args: readonly string[],
    durationMs: number,
  ): Promise<AdbProcessResult> {
    if (durationMs <= 0 || durationMs > 10 * 60 * 1000) {
      throw new AdbError('streaming durationMs must be between 1 and 600000.');
    }
    return await new Promise<AdbProcessResult>((resolve, reject) => {
      const child = spawn(this.adbPath, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdoutSize = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let killedForOverflow = false;
      let resolved = false;

      const finish = (): void => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: 0, // we killed it on purpose; treat as clean
        });
      };

      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        // Give the OS a brief moment to flush, then resolve.
        setTimeout(finish, 100);
      }, durationMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutSize += chunk.length;
        if (stdoutSize > this.maxStdoutBytes) {
          killedForOverflow = true;
          child.kill('SIGKILL');
          return;
        }
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new AdbError(`Failed to spawn adb: ${err.message}`));
      });

      child.on('close', () => {
        clearTimeout(timer);
        if (killedForOverflow) {
          reject(new AdbError('adb stdout exceeded the configured byte cap.'));
          return;
        }
        finish();
      });
    });
  }

  /**
   * Like `run` but returns stdout as a raw Buffer — required for binary output
   * (e.g. PNG bytes from `adb exec-out screencap -p`). Decoding to UTF-8 would
   * corrupt the bytes.
   */
  async runRaw(
    args: readonly string[],
    timeoutMs?: number,
  ): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(this.adbPath, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdoutSize = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let killedForOverflow = false;

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new AdbError(`adb command timed out after ${timeoutMs ?? this.defaultTimeoutMs}ms`));
      }, timeoutMs ?? this.defaultTimeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutSize += chunk.length;
        if (stdoutSize > this.maxStdoutBytes) {
          killedForOverflow = true;
          child.kill('SIGKILL');
          return;
        }
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new AdbError(`Failed to spawn adb: ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (killedForOverflow) {
          reject(new AdbError('adb stdout exceeded the configured byte cap.'));
          return;
        }
        resolve({
          stdout: Buffer.concat(stdoutChunks),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: code ?? -1,
        });
      });
    });
  }

  async run(args: readonly string[], timeoutMs?: number): Promise<AdbProcessResult> {
    return await new Promise<AdbProcessResult>((resolve, reject) => {
      const child = spawn(this.adbPath, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdoutSize = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let killedForOverflow = false;

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new AdbError(`adb command timed out after ${timeoutMs ?? this.defaultTimeoutMs}ms`));
      }, timeoutMs ?? this.defaultTimeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutSize += chunk.length;
        if (stdoutSize > this.maxStdoutBytes) {
          killedForOverflow = true;
          child.kill('SIGKILL');
          return;
        }
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new AdbError(`Failed to spawn adb: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (killedForOverflow) {
          reject(new AdbError('adb stdout exceeded the configured byte cap.'));
          return;
        }
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: code ?? -1,
        });
      });
    });
  }
}
