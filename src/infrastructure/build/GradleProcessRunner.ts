import { spawn } from 'node:child_process';
import { DevilgeError } from '../../config/errors.js';

export interface GradleSpawnResult {
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly stdoutBytesTotal: number;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

/**
 * Long-running process runner specialized for Gradle:
 *   - shell: false; argv array; never composes strings.
 *   - configurable timeout (default 5 min, max 30 min upstream).
 *   - bounded tail buffer per stream — discards old bytes on the fly so a 30-min
 *     build with verbose logs cannot exhaust memory.
 */
export class GradleProcessRunner {
  async run(
    binary: string,
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    tailBytes: number,
  ): Promise<GradleSpawnResult> {
    if (timeoutMs <= 0 || timeoutMs > 30 * 60 * 1000) {
      throw new DevilgeError('CONFIGURATION_ERROR', 'timeoutMs out of bounds.');
    }
    if (tailBytes <= 0 || tailBytes > 4 * 1024 * 1024) {
      throw new DevilgeError('CONFIGURATION_ERROR', 'tailBytes out of bounds.');
    }

    return await new Promise<GradleSpawnResult>((resolve, reject) => {
      const child = spawn(binary, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
        env: {
          ...process.env,
          // Disable Gradle daemon noise + colour codes for cleaner parsing.
          GRADLE_OPTS: `${process.env.GRADLE_OPTS ?? ''} -Dorg.gradle.console=plain`,
        },
        windowsHide: true,
      });

      const stdoutTail = new RingBuffer(tailBytes);
      const stderrTail = new RingBuffer(tailBytes);
      let stdoutBytesTotal = 0;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytesTotal += chunk.length;
        stdoutTail.write(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail.write(chunk);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new DevilgeError('GRADLE_ERROR', `Failed to spawn Gradle: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdoutTail: stdoutTail.toString(),
          stderrTail: stderrTail.toString(),
          stdoutBytesTotal,
          exitCode: code ?? -1,
          timedOut,
        });
      });
    });
  }
}

/**
 * Fixed-size byte ring buffer. We accept the cost of storing bytes and decode
 * once at the end so multi-byte UTF-8 boundaries don't get corrupted.
 */
class RingBuffer {
  private readonly cap: number;
  private buf: Buffer;
  private size = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.buf = Buffer.alloc(0);
  }

  write(chunk: Buffer): void {
    const combined = Buffer.concat([this.buf, chunk]);
    if (combined.length > this.cap) {
      this.buf = combined.subarray(combined.length - this.cap);
    } else {
      this.buf = combined;
    }
    this.size = this.buf.length;
  }

  toString(): string {
    return this.buf.toString('utf8');
  }

  get length(): number {
    return this.size;
  }
}
