/**
 * Parsed UIAutomator dump. The root is a synthetic node wrapping the
 * `<hierarchy>` document; children mirror the `<node>` tree of the dump.
 *
 * Keep fields close to the raw XML attribute names so an LLM can reason about
 * matches without a decoder ring.
 */
export interface UiHierarchy {
  readonly capturedAtIso: string;
  readonly serial?: string;
  readonly rotation: number;          // 0..3 from <hierarchy rotation="...">
  readonly root: UiNode;
  readonly nodeCount: number;         // post-parse count, useful for sanity
}

export interface UiNode {
  readonly index: number;
  readonly text: string;
  readonly resourceId: string;
  readonly className: string;
  readonly packageName: string;
  readonly contentDescription: string;
  readonly checkable: boolean;
  readonly checked: boolean;
  readonly clickable: boolean;
  readonly enabled: boolean;
  readonly focusable: boolean;
  readonly focused: boolean;
  readonly scrollable: boolean;
  readonly longClickable: boolean;
  readonly password: boolean;
  readonly selected: boolean;
  readonly bounds: UiBounds;
  readonly children: readonly UiNode[];
}

export interface UiBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
