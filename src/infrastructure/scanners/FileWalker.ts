import fs from 'node:fs/promises';
import path from 'node:path';
import type { PathValidator } from '../security/PathValidator.js';

const DEFAULT_IGNORED_DIRS = new Set([
  'build',
  '.gradle',
  '.idea',
  '.git',
  'node_modules',
  'out',
  '.kotlin',
  '.cxx',
  'generated',
]);

export interface WalkOptions {
  readonly extensions: readonly string[];     // e.g. ['.kt']
  readonly maxFiles: number;
  readonly extraIgnoredDirs?: readonly string[];
}

/**
 * Bounded async directory walker.
 * - Respects PathValidator: only yields paths inside the project root.
 * - Skips common build/cache directories so traversal stays cheap.
 * - Stops once `maxFiles` is reached to keep memory and latency predictable.
 */
export async function* walkFiles(
  pathValidator: PathValidator,
  startDir: string,
  options: WalkOptions,
): AsyncGenerator<string> {
  const ignored = new Set(DEFAULT_IGNORED_DIRS);
  for (const extra of options.extraIgnoredDirs ?? []) {
    ignored.add(extra);
  }

  let yielded = 0;
  const stack: string[] = [pathValidator.resolveInsideProject(startDir)];
  const exts = new Set(options.extensions.map((e) => e.toLowerCase()));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (yielded >= options.maxFiles) {
        return;
      }
      const full = path.join(current, entry.name);
      // Skip symlinks entirely — preview / structure analysis does not need them
      // and following them invites symlink-escape edge cases.
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (ignored.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        if (!pathValidator.isInside(full)) {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!exts.has(ext)) {
          continue;
        }
        if (!pathValidator.isInside(full)) {
          continue;
        }
        yielded += 1;
        yield full;
      }
    }
  }
}
