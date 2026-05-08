/**
 * Outcome of a `launch_app` operation. Cold-start metrics (when available)
 * come from `am start -W` parsing. They're missing when launch goes through
 * the `monkey` fallback or when the activity does not report timing.
 */
export interface LaunchResult {
  readonly packageName: string;
  readonly activity?: string;        // fully-qualified or short, as resolved
  readonly deepLink?: string;
  readonly cleaned: boolean;         // true if force-stop + pm clear ran first
  readonly status?: string;          // raw "Status:" line from am
  readonly waitTimeMs?: number;
  readonly totalTimeMs?: number;
  readonly thisTimeMs?: number;
  readonly launchedViaFallback: boolean; // true if monkey was used
}
