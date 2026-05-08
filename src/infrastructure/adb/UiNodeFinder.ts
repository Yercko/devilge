import type { UiNode, UiNodeSummary } from '../../domain/entities/index.js';

/**
 * Pure utilities to search a UiNode tree. Used by tap_text / tap_resource_id /
 * set_text / wait_for_*. No IO, easy to unit-test against synthetic trees.
 */
export class UiNodeFinder {
  /**
   * Returns every node whose visible text matches. Walks the whole tree.
   * `contains=true` does case-insensitive substring matching.
   * `contains=false` requires an exact match (still case-insensitive — Android
   * UI is rarely case-sensitive in label semantics).
   */
  static findByText(root: UiNode, text: string, contains: boolean): UiNode[] {
    const needle = text.trim().toLowerCase();
    return UiNodeFinder.collect(root, (n) => {
      const haystacks = [n.text, n.contentDescription];
      for (const h of haystacks) {
        if (!h) {
          continue;
        }
        const v = h.toLowerCase();
        if (contains ? v.includes(needle) : v === needle) {
          return true;
        }
      }
      return false;
    });
  }

  /** Returns every node whose resource-id matches exactly (case-sensitive). */
  static findByResourceId(root: UiNode, id: string): UiNode[] {
    return UiNodeFinder.collect(root, (n) => n.resourceId === id);
  }

  /**
   * Best-effort association of a "label" with the input field it labels.
   * Tries, in order:
   *   1. Already-focused EditText (user just tapped it).
   *   2. EditText whose contentDescription matches the label.
   *   3. EditText whose text equals the label (Compose sometimes uses text=hint).
   *   4. EditText immediately following a TextView that matches the label
   *      (sibling-after relationship).
   * Returns null when no input is uniquely identifiable.
   */
  static findInputForLabel(root: UiNode, label: string): UiNode | null {
    const labelLower = label.trim().toLowerCase();

    const focused = UiNodeFinder.collect(
      root,
      (n) => isInputClass(n.className) && n.focused,
    );
    if (focused.length === 1) {
      return focused[0] ?? null;
    }

    const byContentDesc = UiNodeFinder.collect(
      root,
      (n) =>
        isInputClass(n.className) &&
        n.contentDescription.toLowerCase() === labelLower,
    );
    if (byContentDesc.length === 1) {
      return byContentDesc[0] ?? null;
    }

    const byText = UiNodeFinder.collect(
      root,
      (n) => isInputClass(n.className) && n.text.toLowerCase() === labelLower,
    );
    if (byText.length === 1) {
      return byText[0] ?? null;
    }

    const sibling = UiNodeFinder.findEditTextAfterLabel(root, labelLower);
    return sibling;
  }

  /**
   * Walks the tree depth-first, collecting nodes that satisfy `predicate`.
   */
  private static collect(node: UiNode, predicate: (n: UiNode) => boolean): UiNode[] {
    const out: UiNode[] = [];
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      if (predicate(current)) {
        out.push(current);
      }
      for (let i = current.children.length - 1; i >= 0; i -= 1) {
        const child = current.children[i];
        if (child) {
          stack.push(child);
        }
      }
    }
    return out;
  }

  /**
   * Find an EditText that appears right after a TextView whose text matches
   * `labelLower`, anywhere in the tree (sibling or cousin search).
   */
  private static findEditTextAfterLabel(
    root: UiNode,
    labelLower: string,
  ): UiNode | null {
    const matches: UiNode[] = [];
    const visit = (n: UiNode): void => {
      const children = n.children;
      for (let i = 0; i < children.length; i += 1) {
        const cur = children[i];
        if (!cur) {
          continue;
        }
        if (
          isLabelClass(cur.className) &&
          cur.text.toLowerCase() === labelLower
        ) {
          // search forward siblings for the next EditText
          for (let j = i + 1; j < children.length; j += 1) {
            const candidate = children[j];
            if (candidate && isInputClass(candidate.className)) {
              matches.push(candidate);
              break;
            }
          }
        }
        visit(cur);
      }
    };
    visit(root);
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  static toSummary(n: UiNode): UiNodeSummary {
    return {
      text: n.text,
      resourceId: n.resourceId,
      contentDescription: n.contentDescription,
      className: n.className,
      bounds: n.bounds,
      clickable: n.clickable,
    };
  }

  static centerOf(n: UiNode): { x: number; y: number } {
    return {
      x: Math.floor((n.bounds.left + n.bounds.right) / 2),
      y: Math.floor((n.bounds.top + n.bounds.bottom) / 2),
    };
  }
}

function isInputClass(className: string): boolean {
  return (
    className.includes('EditText') ||
    className.includes('androidx.compose.ui.platform.AndroidComposeView') ||
    className === 'android.widget.AutoCompleteTextView'
  );
}

function isLabelClass(className: string): boolean {
  return (
    className.includes('TextView') ||
    className === 'android.widget.TextView'
  );
}
