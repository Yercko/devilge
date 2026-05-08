import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FindPreviewSourceResult,
  PreviewScannerPort,
  ScanOptions,
} from '../../domain/ports/index.js';
import type { ComposePreview } from '../../domain/entities/index.js';
import type { PathValidator } from '../security/PathValidator.js';

const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_SNIPPET_CONTEXT = 4;
const MAX_FILE_BYTES = 1_000_000; // 1 MB cap per .kt file

/**
 * Lightweight, dependency-free static scanner for `@Preview`-annotated
 * Composable functions.
 *
 * Implementation note: a full Kotlin AST would give better fidelity, but the
 * regex-driven approach is enough for an MVP and avoids pulling in a heavy
 * native parser. The scanner is deliberately conservative — it only matches
 * @Preview directly above a `fun` declaration on the same logical block.
 */
export class ComposePreviewScanner implements PreviewScannerPort {
  constructor(private readonly pathValidator: PathValidator) {}

  async scan(
    projectRoot: string,
    options: ScanOptions = {},
  ): Promise<readonly ComposePreview[]> {
    const root = this.pathValidator.resolveInsideProject(projectRoot);
    const startDir = options.moduleFilter
      ? this.pathValidator.resolveInsideProject(
          path.join(root, options.moduleFilter),
        )
      : root;

    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const snippetCtx = options.snippetContextLines ?? DEFAULT_SNIPPET_CONTEXT;

    const { walkFiles } = await import('./FileWalker.js');
    const previews: ComposePreview[] = [];

    for await (const filePath of walkFiles(this.pathValidator, startDir, {
      extensions: ['.kt'],
      maxFiles,
    })) {
      const stat = await fs.stat(filePath);
      if (stat.size === 0 || stat.size > MAX_FILE_BYTES) {
        continue;
      }
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.includes('@Preview')) {
        continue;
      }
      previews.push(
        ...extractPreviews({
          content,
          absolutePath: filePath,
          relativePath: this.pathValidator.toRelative(filePath),
          snippetContextLines: snippetCtx,
        }),
      );
    }
    return previews;
  }

  async findPreviewSource(
    projectRoot: string,
    filePath: string,
    functionName: string,
  ): Promise<FindPreviewSourceResult> {
    const root = this.pathValidator.resolveInsideProject(projectRoot);

    // Step 1 — resolve the file. Try exact path first, then suffix match.
    const resolution = await this.resolveFile(root, filePath);
    if (resolution.kind === 'none') {
      return { found: false, reason: 'file_not_found', candidates: [] };
    }
    if (resolution.kind === 'ambiguous') {
      return {
        found: false,
        reason: 'file_ambiguous',
        candidates: resolution.candidates,
      };
    }

    const absolute = resolution.absolute;
    const stat = await fs.stat(absolute);
    if (stat.size > MAX_FILE_BYTES) {
      return {
        found: false,
        reason: 'function_not_found',
        resolvedRelativePath: this.pathValidator.toRelative(absolute),
        availableFunctions: [],
      };
    }
    const content = await fs.readFile(absolute, 'utf8');
    const previews = extractPreviews({
      content,
      absolutePath: absolute,
      relativePath: this.pathValidator.toRelative(absolute),
      snippetContextLines: 0,
      includeFullBody: true,
    });

    // Step 2 — match the function name. Exact, then case-insensitive.
    let match = previews.find((p) => p.functionName === functionName);
    if (!match) {
      const lower = functionName.toLowerCase();
      match = previews.find((p) => p.functionName.toLowerCase() === lower);
    }

    if (!match) {
      const seen = new Set<string>();
      const availableFunctions: string[] = [];
      for (const p of previews) {
        if (!seen.has(p.functionName)) {
          seen.add(p.functionName);
          availableFunctions.push(p.functionName);
        }
      }
      return {
        found: false,
        reason: 'function_not_found',
        resolvedRelativePath: this.pathValidator.toRelative(absolute),
        availableFunctions,
      };
    }

    return {
      found: true,
      source: match.snippet,
      resolvedRelativePath: match.relativePath,
      matchedFunctionName: match.functionName,
    };
  }

  /**
   * Resolve `userPath` to a single absolute file path inside the project.
   *
   * Strategy:
   *   1. Try direct PathValidator resolution (absolute or relative-to-root).
   *   2. If that fails, treat the input as a path SUFFIX and search the project
   *      tree for `.kt` files whose normalized absolute path ends with it.
   *      Strip a single leading slash from the input first ("/foo/bar.kt" → "foo/bar.kt").
   */
  private async resolveFile(
    root: string,
    userPath: string,
  ): Promise<
    | { kind: 'exact'; absolute: string }
    | { kind: 'suffix'; absolute: string }
    | { kind: 'ambiguous'; candidates: string[] }
    | { kind: 'none' }
  > {
    try {
      const direct = this.pathValidator.resolveInsideProject(userPath);
      const stat = await fs.stat(direct);
      if (stat.isFile()) {
        return { kind: 'exact', absolute: direct };
      }
    } catch {
      // fall through to suffix matching
    }

    const normalized = userPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.length === 0) {
      return { kind: 'none' };
    }

    const { walkFiles } = await import('./FileWalker.js');
    const matches: string[] = [];
    for await (const candidate of walkFiles(this.pathValidator, root, {
      extensions: ['.kt'],
      maxFiles: 10_000,
    })) {
      const candidateNorm = candidate.replace(/\\/g, '/');
      if (
        candidateNorm === normalized ||
        candidateNorm.endsWith('/' + normalized)
      ) {
        matches.push(candidate);
        if (matches.length > 16) {
          break; // hard cap; user input is too vague
        }
      }
    }

    if (matches.length === 0) {
      return { kind: 'none' };
    }
    if (matches.length === 1) {
      const onlyMatch = matches[0];
      if (!onlyMatch) {
        return { kind: 'none' };
      }
      return { kind: 'suffix', absolute: onlyMatch };
    }
    return {
      kind: 'ambiguous',
      candidates: matches.map((m) => this.pathValidator.toRelative(m)),
    };
  }
}

interface ExtractInput {
  content: string;
  absolutePath: string;
  relativePath: string;
  snippetContextLines: number;
  includeFullBody?: boolean;
}

const PREVIEW_ANNOTATION = /@Preview(\b|\s|\()/;
const FUN_DECLARATION =
  /^\s*(?:public\s+|private\s+|internal\s+|protected\s+)?(?:inline\s+|suspend\s+)?fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

function extractPreviews(input: ExtractInput): ComposePreview[] {
  const lines = input.content.split(/\r?\n/);
  const out: ComposePreview[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !PREVIEW_ANNOTATION.test(line)) {
      continue;
    }

    // Walk down through additional annotations & whitespace until we reach a `fun` declaration.
    let cursor = i + 1;
    let funMatch: RegExpExecArray | null = null;
    while (cursor < lines.length && cursor < i + 25) {
      const candidate = lines[cursor];
      if (!candidate) {
        cursor += 1;
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed === '' || trimmed.startsWith('@') || trimmed.startsWith('//')) {
        cursor += 1;
        continue;
      }
      funMatch = FUN_DECLARATION.exec(candidate);
      break;
    }
    if (!funMatch) {
      continue;
    }
    const functionName = funMatch[1];
    if (!functionName) {
      continue;
    }

    const annotationArgs = collectAnnotationArgs(lines, i);
    const params = parsePreviewParams(annotationArgs);

    const startLine = i + 1;
    const endLine = input.includeFullBody
      ? findFunctionEndLine(lines, cursor)
      : Math.min(lines.length, cursor + 1 + input.snippetContextLines);

    const snippetStart = Math.max(0, i - 1);
    const snippetEnd = Math.min(lines.length, endLine);
    const snippet = lines.slice(snippetStart, snippetEnd).join('\n');

    out.push({
      functionName,
      filePath: input.absolutePath,
      relativePath: input.relativePath,
      startLine,
      endLine,
      ...(params.name ? { previewName: params.name } : {}),
      ...(params.group ? { group: params.group } : {}),
      ...(params.device ? { device: params.device } : {}),
      ...(params.showBackground !== undefined ? { showBackground: params.showBackground } : {}),
      ...(params.fontScale !== undefined ? { fontScale: params.fontScale } : {}),
      ...(params.widthDp !== undefined ? { widthDp: params.widthDp } : {}),
      ...(params.heightDp !== undefined ? { heightDp: params.heightDp } : {}),
      ...(params.uiMode ? { uiMode: params.uiMode } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      snippet,
    });
  }

  return out;
}

/**
 * Greedily collects the text inside the @Preview(...) call, possibly across multiple lines.
 * Returns an empty string if the annotation has no parentheses.
 */
function collectAnnotationArgs(lines: readonly string[], startIdx: number): string {
  const startLine = lines[startIdx];
  if (!startLine) {
    return '';
  }
  const openIdx = startLine.indexOf('(', startLine.indexOf('@Preview'));
  if (openIdx === -1) {
    return '';
  }
  let depth = 0;
  let collected = '';
  for (let row = startIdx; row < lines.length && row < startIdx + 25; row += 1) {
    const line = lines[row];
    if (!line) {
      continue;
    }
    const startCol = row === startIdx ? openIdx : 0;
    for (let col = startCol; col < line.length; col += 1) {
      const ch = line[col];
      if (ch === '(') {
        depth += 1;
        if (depth === 1) {
          continue;
        }
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          return collected;
        }
      }
      if (depth >= 1) {
        collected += ch;
      }
    }
    collected += ' ';
  }
  return collected;
}

interface PreviewParams {
  name?: string;
  group?: string;
  device?: string;
  showBackground?: boolean;
  fontScale?: number;
  widthDp?: number;
  heightDp?: number;
  uiMode?: string;
  locale?: string;
}

function parsePreviewParams(args: string): PreviewParams {
  if (args.trim().length === 0) {
    return {};
  }
  const result: PreviewParams = {};
  const named = /(\w+)\s*=\s*("(?:\\.|[^"\\])*"|true|false|-?\d+(?:\.\d+)?[fF]?|[A-Z][A-Z0-9_.]*)/g;
  let match: RegExpExecArray | null;
  while ((match = named.exec(args)) !== null) {
    const key = match[1];
    const rawValue = match[2];
    if (!key || !rawValue) {
      continue;
    }
    switch (key) {
      case 'name':
        result.name = unquote(rawValue);
        break;
      case 'group':
        result.group = unquote(rawValue);
        break;
      case 'device':
        result.device = unquote(rawValue);
        break;
      case 'showBackground':
        result.showBackground = rawValue === 'true';
        break;
      case 'fontScale':
        result.fontScale = parseNumeric(rawValue);
        break;
      case 'widthDp':
        result.widthDp = parseNumeric(rawValue);
        break;
      case 'heightDp':
        result.heightDp = parseNumeric(rawValue);
        break;
      case 'uiMode':
        result.uiMode = rawValue;
        break;
      case 'locale':
        result.locale = unquote(rawValue);
        break;
      default:
        break;
    }
  }
  return result;
}

function unquote(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  return raw;
}

function parseNumeric(raw: string): number | undefined {
  const cleaned = raw.replace(/[fF]$/, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findFunctionEndLine(lines: readonly string[], funLineIdx: number): number {
  // Naive brace matcher: from the first `{` after the fun line, count braces.
  let depth = 0;
  let opened = false;
  for (let row = funLineIdx; row < lines.length; row += 1) {
    const line = lines[row];
    if (!line) {
      continue;
    }
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col];
      if (ch === '{') {
        depth += 1;
        opened = true;
      } else if (ch === '}') {
        depth -= 1;
        if (opened && depth === 0) {
          return row + 1;
        }
      }
    }
  }
  return Math.min(lines.length, funLineIdx + 50);
}
