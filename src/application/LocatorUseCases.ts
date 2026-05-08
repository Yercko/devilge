import type { AppControlPort } from '../domain/ports/index.js';
import type { UiNodeSummary } from '../domain/entities/index.js';

abstract class LocatorBase {
  constructor(
    protected readonly app: AppControlPort,
    protected readonly defaultSerial: string | undefined,
  ) {}

  protected resolveSerial(serial: string | undefined): string | undefined {
    return serial ?? this.defaultSerial;
  }
}

export interface TapByTextInput {
  readonly serial?: string;
  readonly text: string;
  readonly contains?: boolean;
}

export class TapByTextUseCase extends LocatorBase {
  async execute(input: TapByTextInput): Promise<UiNodeSummary> {
    return await this.app.tapByText(
      this.resolveSerial(input.serial),
      input.text,
      input.contains ?? false,
    );
  }
}

export interface TapByResourceIdInput {
  readonly serial?: string;
  readonly id: string;
}

export class TapByResourceIdUseCase extends LocatorBase {
  async execute(input: TapByResourceIdInput): Promise<UiNodeSummary> {
    return await this.app.tapByResourceId(
      this.resolveSerial(input.serial),
      input.id,
    );
  }
}

export interface SetTextInput {
  readonly serial?: string;
  readonly label: string;
  readonly value: string;
}

export class SetTextUseCase extends LocatorBase {
  async execute(input: SetTextInput): Promise<UiNodeSummary> {
    return await this.app.setText(
      this.resolveSerial(input.serial),
      input.label,
      input.value,
    );
  }
}
