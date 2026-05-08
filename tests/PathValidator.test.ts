import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { SecurityError } from '../src/config/errors.js';

let tmpRoot: string;
let outsideDir: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-pathvalidator-'));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-outside-'));
  fs.mkdirSync(path.join(tmpRoot, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'sub', 'file.txt'), 'hello');
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

describe('PathValidator', () => {
  it('resolves a path inside the project', () => {
    const v = new PathValidator(fs.realpathSync(tmpRoot));
    const resolved = v.resolveInsideProject('sub/file.txt');
    expect(resolved.endsWith(path.join('sub', 'file.txt'))).toBe(true);
  });

  it('rejects escapes via ..', () => {
    const v = new PathValidator(fs.realpathSync(tmpRoot));
    expect(() => v.resolveInsideProject('../outside.txt')).toThrow(SecurityError);
  });

  it('rejects absolute paths outside the project', () => {
    const v = new PathValidator(fs.realpathSync(tmpRoot));
    expect(() => v.resolveInsideProject(path.join(outsideDir, 'secret.txt'))).toThrow(
      SecurityError,
    );
  });

  it('rejects NUL bytes', () => {
    const v = new PathValidator(fs.realpathSync(tmpRoot));
    expect(() => v.resolveInsideProject('sub/file.txt\0.bak')).toThrow(SecurityError);
  });

  it('rejects empty paths', () => {
    const v = new PathValidator(fs.realpathSync(tmpRoot));
    expect(() => v.resolveInsideProject('')).toThrow(SecurityError);
  });
});
