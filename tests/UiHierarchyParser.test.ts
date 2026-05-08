import { describe, it, expect } from 'vitest';
import { UiHierarchyParser } from '../src/infrastructure/adb/UiHierarchyParser.js';

const SAMPLE = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Sign in" resource-id="com.example.app:id/login_button" class="android.widget.Button" package="com.example.app" content-desc="Login" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,1000][980,1100]"/>
    <node index="1" text="" resource-id="" class="android.widget.EditText" package="com.example.app" content-desc="Email" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="true" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,800][980,900]"/>
  </node>
</hierarchy>`;

describe('UiHierarchyParser', () => {
  it('parses rotation, root and children', () => {
    const h = UiHierarchyParser.parse(SAMPLE, 'emulator-5554');
    expect(h.rotation).toBe(0);
    expect(h.serial).toBe('emulator-5554');
    expect(h.nodeCount).toBe(3);
    expect(h.root.className).toBe('android.widget.FrameLayout');
    expect(h.root.children).toHaveLength(2);
  });

  it('extracts text, resource-id, content-desc, clickable', () => {
    const h = UiHierarchyParser.parse(SAMPLE, undefined);
    const button = h.root.children[0];
    expect(button?.text).toBe('Sign in');
    expect(button?.resourceId).toBe('com.example.app:id/login_button');
    expect(button?.contentDescription).toBe('Login');
    expect(button?.clickable).toBe(true);
  });

  it('parses bounds as four integers', () => {
    const h = UiHierarchyParser.parse(SAMPLE, undefined);
    const button = h.root.children[0];
    expect(button?.bounds).toEqual({ left: 100, top: 1000, right: 980, bottom: 1100 });
  });

  it('falls back to empty hierarchy on malformed input', () => {
    const h = UiHierarchyParser.parse('<hierarchy/>', undefined);
    expect(h.nodeCount).toBe(0);
    expect(h.root.children).toHaveLength(0);
  });

  it('finds focused fields', () => {
    const h = UiHierarchyParser.parse(SAMPLE, undefined);
    const focused = h.root.children.find((n) => n.focused);
    expect(focused).toBeDefined();
    expect(focused?.contentDescription).toBe('Email');
  });

  it('handles deeply nested non-self-closing nodes (real uiautomator output)', () => {
    // Simulates the actual format produced by Android: containers wrap their
    // children with `</node>` instead of self-closing.
    const NESTED = `<?xml version='1.0' encoding='UTF-8'?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="" resource-id="android:id/content" class="android.widget.LinearLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,100][1080,2300]">
      <node index="0" text="Sign in" resource-id="" class="android.widget.Button" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,1000][980,1100]"/>
      <node index="1" text="" resource-id="" class="android.widget.LinearLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,1200][980,1500]">
        <node index="0" text="Sample item" resource-id="" class="android.widget.TextView" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[120,1220][960,1280]"/>
      </node>
    </node>
  </node>
</hierarchy>`;
    const h = UiHierarchyParser.parse(NESTED, 'emulator-5554');
    expect(h.nodeCount).toBeGreaterThanOrEqual(5);
    expect(h.root.className).toBe('android.widget.FrameLayout');
    expect(h.root.children).toHaveLength(1);
    const linear = h.root.children[0];
    expect(linear?.children).toHaveLength(2);
    const button = linear?.children[0];
    expect(button?.text).toBe('Sign in');
    const inner = linear?.children[1];
    expect(inner?.children[0]?.text).toBe('Sample item');
  });
});
