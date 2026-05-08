import type { AppControlPort } from '../domain/ports/index.js';
import type { UiHierarchy } from '../domain/entities/index.js';

export class DumpUiUseCase {
  constructor(
    private readonly app: AppControlPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(serial?: string): Promise<UiHierarchy> {
    return await this.app.dumpUi(serial ?? this.defaultSerial);
  }
}
