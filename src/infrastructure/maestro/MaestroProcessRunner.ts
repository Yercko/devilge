import { spawn } from 'node:child_process';
import { DevilgeError } from '../../config/errors.js';

export interface MaestroSpawnResult {
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly stdoutBytesTotal: number;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_TAIL_BYTES = 256 * 1024;
const MAX_TAIL_BYTES = 4 * 1024 * 1024;

/**
 * Long-running spawner for the `maestro` CLI. Mirrors GradleProcessRunner:
 *   - shell:false, argv array.
 *   - bounded ring buffer for stdout/stderr.
 *   - configurable timeout.
 *   - injects MAESTRO_DISABLE_ANALYTICS=true unconditionally so the binary
 *     never phones home from a devilge-driven session.
 */
export class MaestroProcessRunner {
  async run(
    binary: string,
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    tailBytes: number = DEFAULT_TAIL_BYTES,
  ): Promise<MaestroSpawnResult> {
    if (timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new DevilgeError('CONFIGURATION_ERROR', 'maestro timeoutMs out of bounds.');
    }
    if (tailBytes <= 0 || tailBytes > MAX_TAIL_BYTES) {
      throw new DevilgeError('CONFIGURATION_ERROR', 'maestro tailBytes out of bounds.');
    }
    return await new Promise<MaestroSpawnResult>((resolve, reject) => {
      const child = spawn(binary, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
        env: {
          ...process.env,
          MAESTRO_DISABLE_ANALYTICS: 'true',
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
        reject(new DevilgeError('MAESTRO_ERROR', `Failed to spawn maestro: ${err.message}`));
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

class RingBuffer {
  private buf = Buffer.alloc(0);
  constructor(private readonly cap: number) {}
  write(chunk: Buffer): void {
    const combined = Buffer.concat([this.buf, chunk]);
    this.buf =
      combined.length > this.cap ? combined.subarray(combined.length - this.cap) : combined;
  }
  toString(): string {
    return this.buf.toString('utf8');
  }
}
