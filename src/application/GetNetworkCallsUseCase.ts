import type { NetworkInspectorPort } from '../domain/ports/index.js';
import type { NetworkCall } from '../domain/entities/index.js';

export interface GetNetworkCallsInput {
  readonly serial?: string;
  readonly maxCalls?: number;
  readonly logcatLines?: number;
  readonly tag?: string;
  readonly statusFilter?: number;
  readonly methodFilter?: string;
  readonly urlContains?: string;
}

const DEFAULT_MAX_CALLS = 50;
const DEFAULT_LOGCAT_LINES = 2000;

export class GetNetworkCallsUseCase {
  constructor(
    private readonly inspector: NetworkInspectorPort,
    private readonly defaultSerial: string | undefined,
    /** Tags swept when the caller doesn't pass one. Typically `['HttpClient', 'OkHttp']`. */
    private readonly defaultHttpLogTags: readonly string[],
  ) {}

  async execute(input: GetNetworkCallsInput = {}): Promise<readonly NetworkCall[]> {
    const serial = input.serial ?? this.defaultSerial;
    const tags: readonly string[] = input.tag ? [input.tag] : this.defaultHttpLogTags;
    return await this.inspector.recentCalls({
      ...(serial ? { serial } : {}),
      maxCalls: input.maxCalls ?? DEFAULT_MAX_CALLS,
      logcatLines: input.logcatLines ?? DEFAULT_LOGCAT_LINES,
      tags,
      ...(input.statusFilter !== undefined ? { statusFilter: input.statusFilter } : {}),
      ...(input.methodFilter ? { methodFilter: input.methodFilter } : {}),
      ...(input.urlContains ? { urlContains: input.urlContains } : {}),
    });
  }
}
