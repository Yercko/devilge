import type { AdbPort } from '../domain/ports/index.js';
import type { LogcatEntry, LogLevel } from '../domain/entities/index.js';

export interface GetLogcatInput {
  readonly serial?: string;
  readonly maxLines?: number;
  readonly minLevel?: LogLevel;
  readonly tagFilter?: string;
}

export class GetLogcatUseCase {
  constructor(
    private readonly adb: AdbPort,
    private readonly defaultSerial: string | undefined,
    private readonly defaultMaxLines: number,
    private readonly absoluteLineCap: number,
  ) {}

  async execute(input: GetLogcatInput): Promise<readonly LogcatEntry[]> {
    const requested = input.maxLines ?? this.defaultMaxLines;
    const maxLines = Math.min(Math.max(1, requested), this.absoluteLineCap);

    return await this.adb.getLogcat({
      ...(input.serial ?? this.defaultSerial
        ? { serial: input.serial ?? this.defaultSerial }
        : {}),
      maxLines,
      ...(input.minLevel ? { minLevel: input.minLevel } : {}),
      ...(input.tagFilter ? { tagFilter: input.tagFilter } : {}),
    });
  }
}
