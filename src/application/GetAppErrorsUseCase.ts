import type { AdbPort } from '../domain/ports/index.js';
import type { LogLevel } from '../domain/entities/index.js';
import {
  StackTraceGrouper,
  type GroupedLogEntry,
} from '../infrastructure/log/StackTraceGrouper.js';

export interface GetAppErrorsInput {
  readonly serial?: string;
  readonly packageName: string;
  readonly minLevel?: LogLevel;        // defaults to 'E'
  readonly excludeTags?: readonly string[];
  readonly maxEntries?: number;
  readonly followMs?: number;          // 0 / undefined = snapshot
}

const DEFAULT_MAX_ENTRIES = 50;
const ABSOLUTE_LOGCAT_LINES = 5000;
const MIN_FOLLOW_MS = 1_000;
const MAX_FOLLOW_MS = 5 * 60 * 1000; // 5 min

const DEFAULT_NOISE_TAGS = [
  'Choreographer',
  'EGL_emulation',
  'OpenGLRenderer',
  'BLASTBufferQueue',
  'SurfaceFlinger',
];

export class GetAppErrorsUseCase {
  constructor(
    private readonly adb: AdbPort,
    private readonly defaultSerial: string | undefined,
  ) {}

  async execute(input: GetAppErrorsInput): Promise<readonly GroupedLogEntry[]> {
    const serial = input.serial ?? this.defaultSerial;
    const minLevel = input.minLevel ?? 'E';
    const excludeTags = [
      ...DEFAULT_NOISE_TAGS,
      ...(input.excludeTags ?? []),
    ];

    const baseOptions = {
      ...(serial ? { serial } : {}),
      packageName: input.packageName,
      minLevel,
      excludeTags,
      maxLines: ABSOLUTE_LOGCAT_LINES,
    };

    const entries =
      input.followMs && input.followMs > 0
        ? await this.adb.streamLogcat(
            baseOptions,
            Math.min(MAX_FOLLOW_MS, Math.max(MIN_FOLLOW_MS, input.followMs)),
          )
        : await this.adb.getLogcat(baseOptions);

    const grouped = StackTraceGrouper.group(entries);
    const max = input.maxEntries ?? DEFAULT_MAX_ENTRIES;
    return grouped.slice(-max);
  }
}
