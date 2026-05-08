import type { UiBounds } from './UiHierarchy.js';

/**
 * Outcome of a `wait_for_*` operation. Always returned (never thrown), so
 * the caller can branch on `matched` vs timeout.
 */
export interface WaitResult {
  readonly matched: boolean;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly matchedNode?: UiNodeSummary;
}

/**
 * Lightweight projection of a UiNode for tool responses. Avoids dumping the
 * full subtree when only the matched node's coordinates and identifying
 * fields are useful.
 */
export interface UiNodeSummary {
  readonly text: string;
  readonly resourceId: string;
  readonly contentDescription: string;
  readonly className: string;
  readonly bounds: UiBounds;
  readonly clickable: boolean;
}
