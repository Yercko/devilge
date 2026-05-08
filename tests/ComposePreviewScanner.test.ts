import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { ComposePreviewScanner } from '../src/infrastructure/scanners/ComposePreviewScanner.js';

let projectRoot: string;

const SAMPLE = `
package com.example.feature

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview

@Preview(name = "Light", showBackground = true, widthDp = 320, heightDp = 200)
@Composable
fun MyButtonPreview() {
    MyButton(text = "Hello")
}

@Preview
@Composable
private fun AnotherPreview() {
    SomeOtherComposable()
}

// Not a preview
@Composable
fun NotAPreview() {}
`;

beforeAll(() => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-preview-')),
  );
  const dir = path.join(projectRoot, 'app', 'src', 'main', 'kotlin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Sample.kt'), SAMPLE);
});

afterAll(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('ComposePreviewScanner', () => {
  it('discovers @Preview functions and parses common params', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const previews = await scanner.scan(projectRoot);

    expect(previews).toHaveLength(2);

    const button = previews.find((p) => p.functionName === 'MyButtonPreview');
    expect(button).toBeDefined();
    expect(button?.previewName).toBe('Light');
    expect(button?.showBackground).toBe(true);
    expect(button?.widthDp).toBe(320);
    expect(button?.heightDp).toBe(200);

    const another = previews.find((p) => p.functionName === 'AnotherPreview');
    expect(another).toBeDefined();
    expect(another?.previewName).toBeUndefined();
  });

  it('finds the source by exact absolute path', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const previews = await scanner.scan(projectRoot);
    const target = previews[0];
    if (!target) {
      throw new Error('expected at least one preview');
    }
    const result = await scanner.findPreviewSource(
      projectRoot,
      target.filePath,
      target.functionName,
    );
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.source).toContain('fun MyButtonPreview');
      expect(result.matchedFunctionName).toBe('MyButtonPreview');
    }
  });

  it('finds the source by file-name suffix only', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const result = await scanner.findPreviewSource(
      projectRoot,
      'Sample.kt',
      'MyButtonPreview',
    );
    expect(result.found).toBe(true);
  });

  it('matches function name case-insensitively', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const result = await scanner.findPreviewSource(
      projectRoot,
      'Sample.kt',
      'mybuttonpreview',
    );
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.matchedFunctionName).toBe('MyButtonPreview');
    }
  });

  it('reports available previews when the function is not found', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const result = await scanner.findPreviewSource(
      projectRoot,
      'Sample.kt',
      'DoesNotExist',
    );
    expect(result.found).toBe(false);
    if (!result.found && result.reason === 'function_not_found') {
      expect(result.availableFunctions).toEqual(
        expect.arrayContaining(['MyButtonPreview', 'AnotherPreview']),
      );
    } else {
      throw new Error('expected function_not_found result');
    }
  });

  it('reports file_not_found when nothing matches', async () => {
    const validator = new PathValidator(projectRoot);
    const scanner = new ComposePreviewScanner(validator);
    const result = await scanner.findPreviewSource(
      projectRoot,
      'definitely-not-a-real-file.kt',
      'MyButtonPreview',
    );
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toBe('file_not_found');
    }
  });
});
