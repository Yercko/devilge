import type { AppControlPort } from '../domain/ports/index.js';
import type { Screenshot } from '../domain/entities/index.js';

export class TakeScreenshotUseCase {
  constructor(
    private readonly app: AppControlPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(serial?: string): Promise<Screenshot> {
    return await this.app.takeScreenshot(serial ?? this.defaultSerial);
  }
}
