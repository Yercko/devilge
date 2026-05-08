import type {
  AdbPort,
  GetNetworkCallsOptions,
  NetworkInspectorPort,
} from '../../domain/ports/index.js';
import type { NetworkCall } from '../../domain/entities/index.js';
import { CommandSanitizer } from '../security/CommandSanitizer.js';
import { KtorLogParser } from './KtorLogParser.js';
import { OkHttpLogParser } from './OkHttpLogParser.js';

export type HttpLogFormat = 'ktor' | 'okhttp' | 'auto';

const DEFAULT_TAG = 'HttpClient';
const ABSOLUTE_LOGCAT_LINES = 5000;

/**
 * Pulls recent logcat entries filtered by the configured HTTP-logger tag,
 * parses them with one or more format parsers (Ktor, OkHttp/Retrofit), and
 * applies presentation-layer filters (status / method / URL substring).
 *
 * Stateless: every call is a fresh `adb logcat -d` snapshot.
 *
 * Note: the source file is still named `KtorLogcatNetworkInspector.ts` for
 * git-history continuity. The exported class is `LogcatNetworkInspector`
 * because it now handles multiple formats.
 */
export class LogcatNetworkInspector implements NetworkInspectorPort {
  constructor(
    private readonly adb: AdbPort,
    private readonly format: HttpLogFormat = 'auto',
  ) {}

  async recentCalls(options: GetNetworkCallsOptions): Promise<readonly NetworkCall[]> {
    const logcatLines = CommandSanitizer.positiveInt(
      options.logcatLines,
      'logcatLines',
      ABSOLUTE_LOGCAT_LINES,
    );
    const tags: readonly string[] =
      options.tags.length > 0
        ? options.tags.map((t) => CommandSanitizer.logcatTag(t))
        : [DEFAULT_TAG];

    // One logcat call per tag — typically 2 (HttpClient + OkHttp). Results
    // are merged. Cheap (~100-300 ms per logcat call) and means the user
    // never has to know what their HTTP-logger tag is for the common cases.
    const allEntries: import('../../domain/entities/index.js').LogcatEntry[] = [];
    for (const tag of tags) {
      const entries = await this.adb.getLogcat({
        ...(options.serial ? { serial: options.serial } : {}),
        maxLines: logcatLines,
        tagFilter: tag,
      });
      allEntries.push(...entries);
    }

    const allCalls: NetworkCall[] = [];
    if (this.format === 'ktor' || this.format === 'auto') {
      allCalls.push(...KtorLogParser.parse(allEntries));
    }
    if (this.format === 'okhttp' || this.format === 'auto') {
      allCalls.push(...OkHttpLogParser.parse(allEntries));
    }

    let filtered = allCalls;

    if (options.statusFilter !== undefined) {
      filtered = filtered.filter(
        (c) => c.response?.statusCode === options.statusFilter,
      );
    }
    if (options.methodFilter) {
      const upper = options.methodFilter.toUpperCase();
      filtered = filtered.filter((c) => c.request.method === upper);
    }
    if (options.urlContains) {
      const needle = options.urlContains.toLowerCase();
      filtered = filtered.filter((c) =>
        c.request.url.toLowerCase().includes(needle),
      );
    }

    const max = CommandSanitizer.positiveInt(options.maxCalls, 'maxCalls', 500);
    return filtered.slice(-max);
  }
}

/**
 * @deprecated Use `LogcatNetworkInspector` instead. Alias for the rename so
 * older imports keep compiling.
 */
export const KtorLogcatNetworkInspector = LogcatNetworkInspector;
