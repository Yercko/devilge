import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectScannerPort } from '../../domain/ports/index.js';
import type {
  GradleModule,
  ModuleType,
  ProjectStructure,
} from '../../domain/entities/index.js';
import type { PathValidator } from '../security/PathValidator.js';

const MAX_BUILD_FILE_BYTES = 500_000;
const MAX_DISCOVERED_MODULES = 500;

const IGNORED_MODULE_DIRS = new Set([
  'build',
  '.gradle',
  '.idea',
  '.git',
  'node_modules',
  'out',
  '.kotlin',
  '.cxx',
  'generated',
  'buildSrc',     // special Gradle convention, not a regular module
  '.validation',
]);

/**
 * Inspects a Gradle / Android / KMM project layout.
 *
 * Strategy:
 *   1. Parse `settings.gradle{.kts}` `include(...)` calls (cheap, accurate when present).
 *   2. Fallback: walk the filesystem for `build.gradle{.kts}` files (catches programmatic
 *      includes used by many KMM/multi-module setups).
 *   3. Resolve module *type* from a layered set of signals:
 *        a) Source-set heuristic: a module containing `commonMain` is KMM.
 *        b) Direct plugin IDs in the build file (`com.android.application`, etc.).
 *        c) `alias(libs.plugins.X)` references resolved against `gradle/libs.versions.toml`.
 */
export class ProjectScanner implements ProjectScannerPort {
  constructor(private readonly pathValidator: PathValidator) {}

  async describe(projectRoot: string): Promise<ProjectStructure> {
    const root = this.pathValidator.resolveInsideProject(projectRoot);

    const settingsContent =
      (await this.readMaybe(path.join(root, 'settings.gradle.kts'))) ??
      (await this.readMaybe(path.join(root, 'settings.gradle')));

    const explicitModules = settingsContent ? extractIncludedModules(settingsContent) : [];

    const discovered = await this.discoverModulesByFilesystem(root);

    // Merge: settings entries first (preserves explicit gradle module names),
    // filesystem discoveries fill the gaps.
    const moduleNameToPath = new Map<string, string>();
    for (const name of explicitModules) {
      const relativePath = name.replace(/^:/, '').replace(/:/g, path.sep);
      moduleNameToPath.set(name, relativePath);
    }
    for (const [name, relativePath] of discovered) {
      if (!moduleNameToPath.has(name)) {
        moduleNameToPath.set(name, relativePath);
      }
    }

    const versionsCatalog = await this.readMaybe(
      path.join(root, 'gradle', 'libs.versions.toml'),
    );
    const pluginAliases = versionsCatalog
      ? extractPluginAliases(versionsCatalog)
      : new Map<string, string>();

    const modules: GradleModule[] = [];
    for (const [name, relativePath] of moduleNameToPath) {
      const moduleDir = path.join(root, relativePath);
      try {
        const realDir = this.pathValidator.resolveInsideProject(moduleDir);
        const buildContent =
          (await this.readMaybe(path.join(realDir, 'build.gradle.kts'))) ??
          (await this.readMaybe(path.join(realDir, 'build.gradle'))) ??
          '';
        const sourceSets = await listSourceSets(realDir);
        const type = inferModuleType(buildContent, pluginAliases, sourceSets);
        modules.push({ name, relativePath, type, sourceSets });
      } catch {
        modules.push({ name, relativePath, type: 'unknown', sourceSets: [] });
      }
    }

    const hasKmm = modules.some(
      (m) => m.type === 'kmm-shared' || m.sourceSets.includes('commonMain'),
    );
    const hasComposeMultiplatform = detectComposeMultiplatform(
      modules,
      versionsCatalog,
      pluginAliases,
    );

    return {
      rootPath: root,
      modules,
      hasKmm,
      hasComposeMultiplatform,
      ...(versionsCatalog ? extractVersions(versionsCatalog) : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async readMaybe(absolutePath: string): Promise<string | null> {
    try {
      const safe = this.pathValidator.resolveInsideProject(absolutePath);
      const stat = await fs.stat(safe);
      if (!stat.isFile() || stat.size > MAX_BUILD_FILE_BYTES) {
        return null;
      }
      return await fs.readFile(safe, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Walks the project tree looking for `build.gradle.kts` / `build.gradle` files.
   * Returns a map of `:gradle:module:name` -> relative path. Skips the root
   * project's build file and obvious non-module conventions.
   */
  private async discoverModulesByFilesystem(root: string): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const stack: string[] = [root];
    let visited = 0;

    while (stack.length > 0 && found.size < MAX_DISCOVERED_MODULES) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      visited += 1;
      if (visited > 5_000) {
        break; // hard cap to keep the scan bounded on monorepos
      }

      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      const buildFile = entries.find(
        (e) =>
          e.isFile() &&
          (e.name === 'build.gradle.kts' || e.name === 'build.gradle'),
      );

      // Don't treat the root itself as a module — its build file is for the root project.
      if (buildFile && current !== root) {
        const relativePath = path.relative(root, current);
        const moduleName =
          ':' + relativePath.split(path.sep).filter(Boolean).join(':');
        // Skip suspicious names: '::' or empty.
        if (moduleName.length > 1 && !moduleName.includes('::')) {
          found.set(moduleName, relativePath);
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          continue;
        }
        if (entry.name.startsWith('.') || IGNORED_MODULE_DIRS.has(entry.name)) {
          continue;
        }
        const child = path.join(current, entry.name);
        if (!this.pathValidator.isInside(child)) {
          continue;
        }
        stack.push(child);
      }
    }

    return found;
  }
}

// ---------------------------------------------------------------------------
// settings.gradle parser
// ---------------------------------------------------------------------------

function extractIncludedModules(settings: string): string[] {
  const modules = new Set<string>();
  // Matches: include(":foo"), include ":foo", include(":foo", ":bar")
  const includeRe = /include\s*\(?\s*((?:["'][^"']+["']\s*,?\s*)+)\s*\)?/g;
  let match: RegExpExecArray | null;
  while ((match = includeRe.exec(settings)) !== null) {
    const block = match[1];
    if (!block) {
      continue;
    }
    const items = block.match(/["']([^"']+)["']/g) ?? [];
    for (const item of items) {
      modules.add(item.slice(1, -1));
    }
  }
  return [...modules];
}

// ---------------------------------------------------------------------------
// Module-type inference
// ---------------------------------------------------------------------------

const PLUGIN_ID_TO_TYPE: ReadonlyMap<string, ModuleType> = new Map<string, ModuleType>([
  ['com.android.application', 'android-app'],
  ['com.android.library', 'android-library'],
  ['org.jetbrains.kotlin.multiplatform', 'kmm-shared'],
  ['org.jetbrains.kotlin.android', 'android-library'],
  ['org.jetbrains.kotlin.jvm', 'jvm-library'],
]);

function inferModuleType(
  buildFile: string,
  pluginAliases: Map<string, string>,
  sourceSets: readonly string[],
): ModuleType {
  // 1. Source-set heuristic — most reliable signal for KMM modules.
  if (sourceSets.includes('commonMain')) {
    return 'kmm-shared';
  }

  // 2. Direct plugin ID strings — covers `id("com.android.application")` and friends.
  for (const [id, type] of PLUGIN_ID_TO_TYPE) {
    const idEscaped = id.replace(/\./g, '\\.');
    if (new RegExp(`["'\`]${idEscaped}["'\`]`).test(buildFile)) {
      return type;
    }
  }
  if (/kotlin\(\s*["']multiplatform["']\s*\)/.test(buildFile)) {
    return 'kmm-shared';
  }
  if (/kotlin\(\s*["']android["']\s*\)/.test(buildFile)) {
    return 'android-library';
  }
  if (/kotlin\(\s*["']jvm["']\s*\)/.test(buildFile)) {
    return 'jvm-library';
  }

  // 3. alias(libs.plugins.X) — resolve via libs.versions.toml.
  const aliasRe = /alias\s*\(\s*libs\.plugins\.([\w.]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = aliasRe.exec(buildFile)) !== null) {
    const accessor = m[1];
    if (!accessor) {
      continue;
    }
    const candidates = aliasAccessorCandidates(accessor);
    for (const key of candidates) {
      const id = pluginAliases.get(key);
      if (!id) {
        continue;
      }
      const mapped = PLUGIN_ID_TO_TYPE.get(id);
      if (mapped) {
        return mapped;
      }
    }
  }

  return 'unknown';
}

/**
 * Gradle's typesafe accessor `libs.plugins.kotlin.multiplatform` may correspond
 * to TOML keys: `kotlin-multiplatform`, `kotlin.multiplatform`, `kotlinMultiplatform`,
 * `kotlin_multiplatform`. Generate every plausible key.
 */
function aliasAccessorCandidates(accessor: string): string[] {
  const segments = accessor.split('.');
  if (segments.length === 0) {
    return [];
  }
  const dashed = segments.join('-');
  const dotted = segments.join('.');
  const underscored = segments.join('_');
  const camel = segments
    .map((seg, i) => (i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)))
    .join('');
  return [...new Set([accessor, dashed, dotted, underscored, camel])];
}

// ---------------------------------------------------------------------------
// libs.versions.toml parsing
// ---------------------------------------------------------------------------

/**
 * Returns a map of plugin alias -> plugin id, parsed from the [plugins] section
 * of a Gradle version catalog.
 *
 *   [plugins]
 *   kotlinMultiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
 *   composeCompiler = "org.jetbrains.kotlin.plugin.compose:2.0.0"
 */
function extractPluginAliases(toml: string): Map<string, string> {
  const out = new Map<string, string>();
  const section = extractTomlSection(toml, 'plugins');
  if (!section) {
    return out;
  }
  // Object form: alias = { id = "..." ... }
  const objRe = /^\s*([A-Za-z][\w-]*)\s*=\s*\{[^}]*\bid\s*=\s*"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(section)) !== null) {
    const alias = m[1];
    const id = m[2];
    if (alias && id) {
      out.set(alias, id);
    }
  }
  // Inline string form: alias = "id:version"
  const inlineRe = /^\s*([A-Za-z][\w-]*)\s*=\s*"([^":]+):/gm;
  while ((m = inlineRe.exec(section)) !== null) {
    const alias = m[1];
    const id = m[2];
    if (alias && id && !out.has(alias)) {
      out.set(alias, id);
    }
  }
  return out;
}

function extractTomlSection(toml: string, name: string): string | null {
  const re = new RegExp(`(^|\\n)\\[${name}\\][^\\[]*`);
  const match = re.exec(toml);
  return match ? match[0] : null;
}

interface VersionInfo {
  androidGradlePluginVersion?: string;
  kotlinVersion?: string;
}

function extractVersions(toml: string): VersionInfo {
  const out: VersionInfo = {};
  const versions = extractTomlSection(toml, 'versions') ?? toml;
  const agp = /(?:^|\n)\s*(?:agp|androidGradlePlugin|android-gradle-plugin)\s*=\s*"([^"]+)"/i.exec(versions);
  if (agp?.[1]) {
    out.androidGradlePluginVersion = agp[1];
  }
  const kotlin = /(?:^|\n)\s*kotlin\s*=\s*"([^"]+)"/i.exec(versions);
  if (kotlin?.[1]) {
    out.kotlinVersion = kotlin[1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

async function listSourceSets(moduleDir: string): Promise<readonly string[]> {
  const srcDir = path.join(moduleDir, 'src');
  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function detectComposeMultiplatform(
  modules: readonly GradleModule[],
  versionsCatalog: string | null,
  pluginAliases: Map<string, string>,
): boolean {
  // Direct catalog signal — plugin alias points at org.jetbrains.compose.
  for (const id of pluginAliases.values()) {
    if (id === 'org.jetbrains.compose' || id.startsWith('org.jetbrains.compose.')) {
      return true;
    }
  }
  // Library entries in the catalog — `compose-multiplatform` group reference.
  if (versionsCatalog && /org\.jetbrains\.compose(\.|")/i.test(versionsCatalog)) {
    return true;
  }
  // Fallback: if any module is KMM and exposes a commonMain, the project is
  // *capable* of using compose-multiplatform — but we only assert true when we
  // find a positive plugin signal above. Otherwise we report false rather than
  // guess.
  return modules.some((m) => m.type === 'kmm-shared' && m.sourceSets.includes('commonMain') && m.name.toLowerCase().includes('compose'));
}
