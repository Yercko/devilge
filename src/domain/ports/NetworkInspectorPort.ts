import type { NetworkCall } from '../entities/index.js';

/**
 * Outbound port for collecting recent HTTP exchanges from a running app.
 * Adapters may pull from logcat, an in-app sidecar, or a proxy.
 */
export interface NetworkInspectorPort {
  recentCalls(options: GetNetworkCallsOptions): Promise<readonly NetworkCall[]>;
}

export interface GetNetworkCallsOptions {
  readonly serial?: string;
  readonly maxCalls: number;
  readonly logcatLines: number;
  /**
   * Logcat tags to sweep. Multiple tags = one logcat call per tag, results
   * merged. The caller (use case) fills this from config defaults
   * (typically `['HttpClient', 'OkHttp']`) or from a single user-supplied tag.
   * Sanitized upstream.
   */
  readonly tags: readonly string[];
  readonly statusFilter?: number;   // exact status code to keep, e.g. 500
  readonly methodFilter?: string;   // exact HTTP method to keep, e.g. "POST"
  readonly urlContains?: string;    // case-insensitive substring on URL
}
