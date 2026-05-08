import { describe, it, expect } from 'vitest';
import type { UiNode } from '../src/domain/entities/index.js';
import { UiNodeFinder } from '../src/infrastructure/adb/UiNodeFinder.js';

function node(overrides: Partial<UiNode> & { className?: string }): UiNode {
  return {
    index: 0,
    text: '',
    resourceId: '',
    className: overrides.className ?? 'android.view.View',
    packageName: 'com.example.app',
    contentDescription: '',
    checkable: false,
    checked: false,
    clickable: false,
    enabled: true,
    focusable: false,
    focused: false,
    scrollable: false,
    longClickable: false,
    password: false,
    selected: false,
    bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    children: [],
    ...overrides,
  };
}

describe('UiNodeFinder.findByText', () => {
  it('finds nodes with exact text (case-insensitive)', () => {
    const root = node({
      children: [
        node({ text: 'Café Latte' }),
        node({ text: 'Other thing' }),
        node({ contentDescription: 'CAFÉ LATTE' }),
      ],
    });
    const matches = UiNodeFinder.findByText(root, 'café latte', false);
    expect(matches).toHaveLength(2);
  });

  it('finds nodes with substring when contains=true', () => {
    const root = node({
      children: [
        node({ text: 'Café Latte' }),
        node({ text: 'Café Mocha' }),
        node({ text: 'Tea Earl Grey' }),
      ],
    });
    expect(UiNodeFinder.findByText(root, 'café', true)).toHaveLength(2);
    expect(UiNodeFinder.findByText(root, 'café', false)).toHaveLength(0);
  });

  it('walks deeply nested trees', () => {
    const root = node({
      children: [
        node({
          children: [
            node({
              children: [node({ text: 'View asset' })],
            }),
          ],
        }),
      ],
    });
    const matches = UiNodeFinder.findByText(root, 'View asset', false);
    expect(matches).toHaveLength(1);
  });
});

describe('UiNodeFinder.findByResourceId', () => {
  it('matches resource id exactly (case-sensitive)', () => {
    const root = node({
      children: [
        node({ resourceId: 'app:id/login_button' }),
        node({ resourceId: 'app:id/Login_button' }),
      ],
    });
    expect(UiNodeFinder.findByResourceId(root, 'app:id/login_button')).toHaveLength(1);
  });
});

describe('UiNodeFinder.findInputForLabel', () => {
  it('returns the focused EditText when one is focused', () => {
    const root = node({
      children: [
        node({ className: 'android.widget.EditText', focused: true, contentDescription: 'Email' }),
        node({ className: 'android.widget.EditText', focused: false, contentDescription: 'Password' }),
      ],
    });
    const out = UiNodeFinder.findInputForLabel(root, 'Password');
    // focused EditText wins by spec — even if label says Password.
    expect(out?.contentDescription).toBe('Email');
  });

  it('matches by contentDescription when no input is focused', () => {
    const root = node({
      children: [
        node({ className: 'android.widget.EditText', contentDescription: 'Email' }),
        node({ className: 'android.widget.EditText', contentDescription: 'Password' }),
      ],
    });
    const out = UiNodeFinder.findInputForLabel(root, 'Password');
    expect(out?.contentDescription).toBe('Password');
  });

  it('returns null on ambiguous matches', () => {
    const root = node({
      children: [
        node({ className: 'android.widget.EditText', contentDescription: 'Email' }),
        node({ className: 'android.widget.EditText', contentDescription: 'Email' }),
      ],
    });
    expect(UiNodeFinder.findInputForLabel(root, 'Email')).toBeNull();
  });

  it('finds an EditText sibling after a label TextView', () => {
    const root = node({
      children: [
        node({ className: 'android.widget.TextView', text: 'Email' }),
        node({ className: 'android.widget.EditText', resourceId: 'app:id/email' }),
        node({ className: 'android.widget.TextView', text: 'Password' }),
        node({ className: 'android.widget.EditText', resourceId: 'app:id/password' }),
      ],
    });
    const out = UiNodeFinder.findInputForLabel(root, 'Password');
    expect(out?.resourceId).toBe('app:id/password');
  });
});

describe('UiNodeFinder.centerOf and toSummary', () => {
  it('computes the integer center of a node', () => {
    const n = node({ bounds: { left: 100, top: 200, right: 500, bottom: 800 } });
    expect(UiNodeFinder.centerOf(n)).toEqual({ x: 300, y: 500 });
  });

  it('summary keeps the essentials', () => {
    const n = node({
      text: 'Hello',
      resourceId: 'app:id/x',
      contentDescription: 'desc',
      className: 'android.widget.Button',
      clickable: true,
      bounds: { left: 1, top: 2, right: 3, bottom: 4 },
    });
    const s = UiNodeFinder.toSummary(n);
    expect(s.text).toBe('Hello');
    expect(s.resourceId).toBe('app:id/x');
    expect(s.contentDescription).toBe('desc');
    expect(s.bounds).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(s.clickable).toBe(true);
  });
});
