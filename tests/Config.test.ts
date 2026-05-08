import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config/Config.js';
import { ConfigurationError } from '../src/config/errors.js';

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-cfg-')));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('throws when project root is missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);
  });

  it('throws when project root is relative', () => {
    expect(() =>
      loadConfig({ DEVILGE_ANDROID_PROJECT_ROOT: 'relative/path' }),
    ).toThrow(ConfigurationError);
  });

  it('throws when project root does not exist', () => {
    expect(() =>
      loadConfig({ DEVILGE_ANDROID_PROJECT_ROOT: '/this/does/not/exist/devilge-test' }),
    ).toThrow(ConfigurationError);
  });

  it('loads a valid config and freezes it', () => {
    const cfg = loadConfig({ DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot });
    expect(cfg.androidProjectRoot).toBe(tmpRoot);
    expect(cfg.adbPath).toBe('adb');
    expect(cfg.logLevel).toBe('info');
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('caps logcat lines at the absolute upper bound', () => {
    const cfg = loadConfig({
      DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot,
      DEVILGE_LOGCAT_MAX_LINES: '999999',
    });
    expect(cfg.logcatMaxLines).toBe(5000);
  });

  it('rejects invalid log level', () => {
    expect(() =>
      loadConfig({
        DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot,
        DEVILGE_LOG_LEVEL: 'verbose',
      }),
    ).toThrow(ConfigurationError);
  });

  it('defaults the Ktor log tag to HttpClient', () => {
    const cfg = loadConfig({ DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot });
    expect(cfg.defaultKtorLogTag).toBe('HttpClient');
  });

  it('honours a custom Ktor log tag', () => {
    const cfg = loadConfig({
      DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot,
      DEVILGE_KTOR_LOG_TAG: 'MyHttpLogger',
    });
    expect(cfg.defaultKtorLogTag).toBe('MyHttpLogger');
  });

  it('rejects a Ktor log tag with shell metacharacters', () => {
    expect(() =>
      loadConfig({
        DEVILGE_ANDROID_PROJECT_ROOT: tmpRoot,
        DEVILGE_KTOR_LOG_TAG: 'foo; bar',
      }),
    ).toThrow(ConfigurationError);
  });
});
