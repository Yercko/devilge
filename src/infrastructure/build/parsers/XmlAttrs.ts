/**
 * Tiny helpers for the strictly-formatted XML reports Gradle emits
 * (JUnit, Android Lint). NOT a general-purpose XML parser — just enough to
 * extract opening tags, attribute maps, and inner text from well-formed reports.
 */

const ATTR_RE = /([A-Za-z_][\w:-]*)\s*=\s*"((?:&quot;|[^"])*)"/g;

/** Parses the attribute portion of `<tag a="1" b="2"...>` into a map. */
export function parseAttributes(attrChunk: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrChunk)) !== null) {
    const name = m[1];
    const value = m[2];
    if (name && value !== undefined) {
      out[name] = unescapeXml(value);
    }
  }
  return out;
}

/**
 * Iterates non-overlapping occurrences of a top-level element of `tagName`.
 * Yields the attribute chunk and the inner content (between opening and closing tag).
 * Self-closing tags yield empty inner content.
 *
 * Handles nesting of same-name elements correctly via depth tracking — important
 * for UIAutomator dumps where `<node>` is heavily nested inside other `<node>`s.
 */
export function* iterateElements(
  xml: string,
  tagName: string,
): Iterable<{ attrs: Record<string, string>; inner: string }> {
  const open = `<${tagName}`;
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf(open, cursor);
    if (start === -1) {
      return;
    }
    // Make sure we matched the full tag name, not a prefix (e.g. `<testsuites` vs `<testsuite`).
    if (!isTagBoundaryChar(xml.charCodeAt(start + open.length))) {
      cursor = start + 1;
      continue;
    }

    const tagEnd = findUnescapedChar(xml, start + open.length, '>');
    if (tagEnd === -1) {
      return;
    }
    const isSelfClosing = xml.charAt(tagEnd - 1) === '/';
    const attrsChunk = xml.slice(
      start + open.length,
      isSelfClosing ? tagEnd - 1 : tagEnd,
    );
    if (isSelfClosing) {
      yield { attrs: parseAttributes(attrsChunk), inner: '' };
      cursor = tagEnd + 1;
      continue;
    }
    const closeIdx = findMatchingClose(xml, tagName, tagEnd + 1);
    if (closeIdx === -1) {
      return;
    }
    const inner = xml.slice(tagEnd + 1, closeIdx);
    yield { attrs: parseAttributes(attrsChunk), inner };
    cursor = closeIdx + `</${tagName}>`.length;
  }
}

/**
 * Walks forward from `fromIdx`, tracking nested same-tag openings, and returns
 * the index of the matching closing `</tagName>` for an outer element whose
 * opening was at depth 1 just before `fromIdx`. Returns -1 when not found.
 */
function findMatchingClose(xml: string, tagName: string, fromIdx: number): number {
  const open = `<${tagName}`;
  const close = `</${tagName}>`;
  let depth = 1;
  let cursor = fromIdx;

  while (cursor < xml.length) {
    const nextOpen = xml.indexOf(open, cursor);
    const nextClose = xml.indexOf(close, cursor);
    if (nextClose === -1) {
      return -1;
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // We hit another `<tagName...` before the close. Verify it's actually a
      // same-named element (not a prefix like `<nodes`) and whether it is
      // self-closing.
      const after = xml.charCodeAt(nextOpen + open.length);
      if (!isTagBoundaryChar(after)) {
        cursor = nextOpen + open.length;
        continue;
      }
      const tagEnd = findUnescapedChar(xml, nextOpen + open.length, '>');
      if (tagEnd === -1) {
        return -1;
      }
      const selfClosing = xml.charAt(tagEnd - 1) === '/';
      if (!selfClosing) {
        depth += 1;
      }
      cursor = tagEnd + 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        return nextClose;
      }
      cursor = nextClose + close.length;
    }
  }
  return -1;
}

function isTagBoundaryChar(code: number): boolean {
  return (
    code === 0x20 /* space */ ||
    code === 0x09 /* tab */ ||
    code === 0x2f /* / */ ||
    code === 0x3e /* > */
  );
}

function findUnescapedChar(s: string, from: number, ch: string): number {
  let inDouble = false;
  let inSingle = false;
  for (let i = from; i < s.length; i += 1) {
    const c = s.charAt(i);
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (c === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (c === ch && !inDouble && !inSingle) {
      return i;
    }
  }
  return -1;
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function intAttr(attrs: Record<string, string>, name: string): number | undefined {
  const raw = attrs[name];
  if (raw === undefined) {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function floatAttr(attrs: Record<string, string>, name: string): number | undefined {
  const raw = attrs[name];
  if (raw === undefined) {
    return undefined;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}
