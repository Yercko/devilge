import type { AdbPort } from '../domain/ports/index.js';
import { ConfigurationError } from '../config/errors.js';

export interface ResizeLogcatBufferInput {
  readonly serial?: string;
  readonly sizeMb: number;
}

export class ResizeLogcatBufferUseCase {
  constructor(
    private readonly adb: AdbPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(input: ResizeLogcatBufferInput): Promise<{ serial: string; sizeMb: number }> {
    const serial = input.serial ?? this.defaultSerial;
    if (!serial) {
      throw new ConfigurationError(
        'No device serial available. Pass `serial`, set DEVILGE_DEFAULT_DEVICE_SERIAL, ' +
          'or ensure exactly one device is attached.',
      );
    }
    await this.adb.resizeLogcatBuffer(serial, input.sizeMb);
    return { serial, sizeMb: input.sizeMb };
  }
}
