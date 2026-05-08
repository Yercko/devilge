import type { AppControlPort } from '../domain/ports/index.js';
import type { WaitResult } from '../domain/entities/index.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 500;

abstract class WaitBase {
  constructor(
    protected readonly app: AppControlPort,
    protected readonly defaultSerial: string | undefined,
  ) {}

  protected resolveSerial(serial: string | undefined): string | undefined {
    return serial ?? this.defaultSerial;
  }

  protected clampTimeout(ms: number | undefined): number {
    return Math.max(
      MIN_TIMEOUT_MS,
      Math.min(MAX_TIMEOUT_MS, ms ?? DEFAULT_TIMEOUT_MS),
    );
  }
}

export interface WaitForTextInput {
  readonly serial?: string;
  readonly text: string;
  readonly contains?: boolean;
  readonly timeoutMs?: number;
}

export class WaitForTextUseCase extends WaitBase {
  async execute(input: WaitForTextInput): Promise<WaitResult> {
    return await this.app.waitForText(
      this.resolveSerial(input.serial),
      input.text,
      input.contains ?? true,
      this.clampTimeout(input.timeoutMs),
    );
  }
}

export interface WaitForResourceIdInput {
  readonly serial?: string;
  readonly id: string;
  readonly timeoutMs?: number;
}

export class WaitForResourceIdUseCase extends WaitBase {
  async execute(input: WaitForResourceIdInput): Promise<WaitResult> {
    return await this.app.waitForResourceId(
      this.resolveSerial(input.serial),
      input.id,
      this.clampTimeout(input.timeoutMs),
    );
  }
}

export interface WaitForIdleInput {
  readonly serial?: string;
  readonly timeoutMs?: number;
  readonly stableSamples?: number;
}

export class WaitForIdleUseCase extends WaitBase {
  async execute(input: WaitForIdleInput = {}): Promise<WaitResult> {
    return await this.app.waitForIdle(
      this.resolveSerial(input.serial),
      this.clampTimeout(input.timeoutMs),
      input.stableSamples ?? 3,
    );
  }
}
