import fs from 'node:fs/promises';
import path from 'node:path';
import type { LintFinding } from '../../../domain/entities/index.js';
import type { PathValidator } from '../../security/PathValidator.js';
import { intAttr, iterateElements, unescapeXml } from './XmlAttrs.js';

const MAX_LINT_XML_BYTES = 4 * 1024 * 1024;

/**
 * Walks `<projectRoot>/**\/build/reports/lint-results-*.xml` and parses.
 */
export class LintXmlParser {
  constructor(private readonly pathValidator: PathValidator) {}

  async collect(projectRoot: string): Promise<readonly LintFinding[]> {
    const root = this.pathValidator.resolveInsideProject(projectRoot);
    const files = await this.findReportFiles(root);
    const findings: LintFinding[] = [];
    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        findings.push(...parsed);
      } catch {
        // skip
      }
    }
    return findings;
  }

  private async parseFile(file: string): Promise<LintFinding[]> {
    const stat = await fs.stat(file);
    if (stat.size > MAX_LINT_XML_BYTES) {
      return [];
    }
    const xml = await fs.readFile(file, 'utf8');
    const out: LintFinding[] = [];
    for (const { attrs, inner } of iterateElements(xml, 'issue')) {
      const severity = (attrs.severity ?? 'warning').toLowerCase() as LintFinding['severity'];
      let firstLocation: { file?: string; line?: number; column?: number } = {};
      for (const loc of iterateElements(inner, 'location')) {
        firstLocation = {
          ...(loc.attrs.file ? { file: loc.attrs.file } : {}),
          ...(loc.attrs.line ? { line: intAttr(loc.attrs, 'line') } : {}),
          ...(loc.attrs.column ? { column: intAttr(loc.attrs, 'column') } : {}),
        };
        break;
      }
      out.push({
        id: attrs.id ?? 'Unknown',
        severity,
        category: attrs.category ?? 'Correctness',
        ...(attrs.priority ? { priority: intAttr(attrs, 'priority') } : {}),
        summary: unescapeXml(attrs.summary ?? ''),
        message: unescapeXml(attrs.message ?? ''),
        ...firstLocation,
      });
    }
    return out;
  }

  private async findReportFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    const stack: string[] = [root];
    let visited = 0;
    while (stack.length > 0 && found.length < 200 && visited < 50_000) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      visited += 1;
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue;
        }
        const full = path.join(current, entry.name);
        if (!this.pathValidator.isInside(full)) {
          continue;
        }
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          stack.push(full);
          continue;
        }
        if (
          entry.isFile() &&
          entry.name.startsWith('lint-results') &&
          entry.name.endsWith('.xml') &&
          full.includes(`${path.sep}reports${path.sep}`)
        ) {
          found.push(full);
        }
      }
    }
    return found;
  }
}
