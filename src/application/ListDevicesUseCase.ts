import type { AdbPort } from '../domain/ports/index.js';
import type { AndroidDevice } from '../domain/entities/index.js';

export class ListDevicesUseCase {
  constructor(private readonly adb: AdbPort) {}

  async execute(): Promise<readonly AndroidDevice[]> {
    return await this.adb.listDevices();
  }
}
