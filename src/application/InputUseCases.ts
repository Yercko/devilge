import type { AppControlPort } from '../domain/ports/index.js';
import type { AllowedKeyCode } from '../domain/entities/index.js';

abstract class InputUseCase {
  constructor(
    protected readonly app: AppControlPort,
    protected readonly defaultSerial: string | undefined,
  ) {}

  protected resolveSerial(serial: string | undefined): string | undefined {
    return serial ?? this.defaultSerial;
  }
}

export interface InputTapInput {
  readonly serial?: string;
  readonly x: number;
  readonly y: number;
}

export class InputTapUseCase extends InputUseCase {
  async execute(input: InputTapInput): Promise<void> {
    await this.app.inputTap(this.resolveSerial(input.serial), input.x, input.y);
  }
}

export interface InputTextInput {
  readonly serial?: string;
  readonly text: string;
}

export class InputTextUseCase extends InputUseCase {
  async execute(input: InputTextInput): Promise<void> {
    await this.app.inputText(this.resolveSerial(input.serial), input.text);
  }
}

export interface InputKeyInput {
  readonly serial?: string;
  readonly code: AllowedKeyCode;
}

export class InputKeyUseCase extends InputUseCase {
  async execute(input: InputKeyInput): Promise<void> {
    await this.app.inputKey(this.resolveSerial(input.serial), input.code);
  }
}

export interface InputSwipeInput {
  readonly serial?: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly durationMs?: number;
}

export class InputSwipeUseCase extends InputUseCase {
  async execute(input: InputSwipeInput): Promise<void> {
    await this.app.inputSwipe(
      this.resolveSerial(input.serial),
      input.x1,
      input.y1,
      input.x2,
      input.y2,
      input.durationMs ?? 300,
    );
  }
}
