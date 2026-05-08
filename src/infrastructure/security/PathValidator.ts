import path from 'node:path';
import fs from 'node:fs';
import { SecurityError } from '../../config/errors.js';

/**
 * Guards every filesystem read against path-traversal and symlink-escape attacks.
 * `projectRoot` is assumed to already be a real, absolute path (Config enforces this).
 */
export class PathValidator {
  constructor(private readonly projectRoot: string) {
    if (!path.isAbsolute(projectRoot)) {
      throw new SecurityError('PathValidator requires an absolute project root.');
    }
  }

  /**
   * Resolves `candidate` (absolute or relative to project root) and ensures it
   * stays inside `projectRoot` AFTER following symlinks.
   * Throws SecurityError if the path escapes; throws if the path does not exist.
   */
  resolveInsideProject(candidate: string): string {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      throw new SecurityError('Path must be a non-empty string.');
    }
    if (candidate.includes('\0')) {
      throw new SecurityError('Path contains a NUL byte.');
    }

    const joined = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(this.projectRoot, candidate);

    let real: string;
    try {
      real = fs.realpathSync(joined);
    } catch {
      throw new SecurityError(`Path is not accessible: ${candidate}`);
    }

    if (!this.isInside(real)) {
      throw new SecurityError(
        `Path escapes the configured project root: ${candidate}`,
      );
    }
    return real;
  }

  /**
   * Like `resolveInsideProject` but only checks the parent — useful for
   * paths that are about to be created.
   */
  resolveParentInsideProject(candidate: string): string {
    const parent = path.dirname(
      path.isAbsolute(candidate)
        ? candidate
        : path.resolve(this.projectRoot, candidate),
    );
    return this.resolveInsideProject(parent);
  }

  isInside(absolutePath: string): boolean {
    const root = this.projectRoot.endsWith(path.sep)
      ? this.projectRoot
      : this.projectRoot + path.sep;
    return absolutePath === this.projectRoot || absolutePath.startsWith(root);
  }

  toRelative(absolutePath: string): string {
    return path.relative(this.projectRoot, absolutePath);
  }

  get root(): string {
    return this.projectRoot;
  }
}
