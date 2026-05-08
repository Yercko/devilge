import type { AppControlPort } from '../domain/ports/index.js';

export interface SetInputVisualizationInput {
  readonly serial?: string;
  readonly enabled: boolean;
}

export class SetInputVisualizationUseCase {
  constructor(
    private readonly app: AppControlPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(input: SetInputVisualizationInput): Promise<{ enabled: boolean }> {
    await this.app.setInputVisualization(
      input.serial ?? this.defaultSerial,
      input.enabled,
    );
    return { enabled: input.enabled };
  }
}
