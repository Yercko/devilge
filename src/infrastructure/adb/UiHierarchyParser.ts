import type { UiBounds, UiHierarchy, UiNode } from '../../domain/entities/index.js';
import { iterateElements, parseAttributes } from '../build/parsers/XmlAttrs.js';

/**
 * Parses the XML produced by `uiautomator dump`. Format example:
 *
 *   <hierarchy rotation="0">
 *     <node index="0" text="" resource-id="" class="android.widget.FrameLayout"
 *           bounds="[0,0][1080,2400]" ...>
 *       <node index="0" ...>...</node>
 *     </node>
 *   </hierarchy>
 *
 * The parser is forgiving: missing attributes default to safe values; bounds
 * that don't match the standard form fall back to a zero rect.
 */
export class UiHierarchyParser {
  static parse(xml: string, serial: string | undefined): UiHierarchy {
    const capturedAtIso = new Date().toISOString();
    const hierarchyMatch = /<hierarchy[^>]*>/.exec(xml);
    const rotation = hierarchyMatch
      ? Number.parseInt(
          parseAttributes(hierarchyMatch[0]).rotation ?? '0',
          10,
        )
      : 0;

    const count = { value: 0 };
    const root = parseNode(xml, count);

    return {
      capturedAtIso,
      ...(serial ? { serial } : {}),
      rotation: Number.isFinite(rotation) ? rotation : 0,
      root,
      nodeCount: count.value,
    };
  }
}

function parseNode(xml: string, counter: { value: number }): UiNode {
  // Take the first <node ...> element at this level.
  const iter = iterateElements(xml, 'node')[Symbol.iterator]();
  const first = iter.next();
  if (first.done) {
    return emptyNode();
  }
  return readNode(first.value.attrs, first.value.inner, counter);
}

function readNode(
  attrs: Record<string, string>,
  inner: string,
  counter: { value: number },
): UiNode {
  counter.value += 1;
  const children: UiNode[] = [];
  for (const child of iterateElements(inner, 'node')) {
    children.push(readNode(child.attrs, child.inner, counter));
  }
  return {
    index: int(attrs.index, 0),
    text: attrs.text ?? '',
    resourceId: attrs['resource-id'] ?? '',
    className: attrs['class'] ?? '',
    packageName: attrs['package'] ?? '',
    contentDescription: attrs['content-desc'] ?? '',
    checkable: bool(attrs.checkable),
    checked: bool(attrs.checked),
    clickable: bool(attrs.clickable),
    enabled: bool(attrs.enabled),
    focusable: bool(attrs.focusable),
    focused: bool(attrs.focused),
    scrollable: bool(attrs.scrollable),
    longClickable: bool(attrs['long-clickable']),
    password: bool(attrs.password),
    selected: bool(attrs.selected),
    bounds: parseBounds(attrs.bounds),
    children,
  };
}

const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function parseBounds(raw: string | undefined): UiBounds {
  if (!raw) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  const m = BOUNDS_RE.exec(raw);
  if (!m) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  return {
    left: int(m[1], 0),
    top: int(m[2], 0),
    right: int(m[3], 0),
    bottom: int(m[4], 0),
  };
}

function int(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(raw: string | undefined): boolean {
  return raw === 'true';
}

function emptyNode(): UiNode {
  return {
    index: 0,
    text: '',
    resourceId: '',
    className: '',
    packageName: '',
    contentDescription: '',
    checkable: false,
    checked: false,
    clickable: false,
    enabled: false,
    focusable: false,
    focused: false,
    scrollable: false,
    longClickable: false,
    password: false,
    selected: false,
    bounds: { left: 0, top: 0, right: 0, bottom: 0 },
    children: [],
  };
}
