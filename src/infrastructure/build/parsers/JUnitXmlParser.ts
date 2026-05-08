import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  TestFailure,
  TestSuiteResult,
} from '../../../domain/entities/index.js';
import type { PathValidator } from '../../security/PathValidator.js';
import { intAttr, floatAttr, iterateElements, unescapeXml } from './XmlAttrs.js';

const MAX_XML_BYTES = 4 * 1024 * 1024; // 4 MiB per JUnit XML

/**
 * Walks `<projectRoot>/**\/build/test-results/**\/TEST-*.xml` (Gradle's
 * standard output dir for test results), parses each, and aggregates.
 */
export class JUnitXmlParser {
  constructor(private readonly pathValidator: PathValidator) {}

  async collect(projectRoot: string): Promise<readonly TestSuiteResult[]> {
    const root = this.pathValidator.resolveInsideProject(projectRoot);
    const files = await this.findReportFiles(root);
    const suites: TestSuiteResult[] = [];
    for (const file of files) {
      try {
        const parsed = await this.parseFile(file, root);
        suites.push(...parsed);
      } catch {
        // skip unreadable / malformed files
      }
    }
    return suites;
  }

  private async parseFile(file: string, projectRoot: string): Promise<TestSuiteResult[]> {
    const stat = await fs.stat(file);
    if (stat.size > MAX_XML_BYTES) {
      return [];
    }
    const xml = await fs.readFile(file, 'utf8');
    const out: TestSuiteResult[] = [];

    const moduleHint = inferGradleModule(file, projectRoot);

    for (const { attrs, inner } of iterateElements(xml, 'testsuite')) {
      const failingTests: TestFailure[] = [];
      for (const tcEl of iterateElements(inner, 'testcase')) {
        const name = tcEl.attrs.name ?? '(unknown)';
        const classname = tcEl.attrs.classname ?? '(unknown)';

        const failure = readFailure(tcEl.inner, 'failure');
        const error = readFailure(tcEl.inner, 'error');
        const failureNode = failure ?? error;
        if (failureNode) {
          failingTests.push({
            testName: name,
            classname,
            type: failure ? 'failure' : 'error',
            message: failureNode.message,
            stackTrace: failureNode.body,
          });
        }
      }

      out.push({
        suite: attrs.name ?? '(unnamed)',
        ...(moduleHint ? { module: moduleHint } : {}),
        total: intAttr(attrs, 'tests') ?? failingTests.length,
        failures: intAttr(attrs, 'failures') ?? failingTests.filter((t) => t.type === 'failure').length,
        errors: intAttr(attrs, 'errors') ?? failingTests.filter((t) => t.type === 'error').length,
        skipped: intAttr(attrs, 'skipped') ?? 0,
        durationSeconds: floatAttr(attrs, 'time') ?? 0,
        failingTests,
      });
    }

    return out;
  }

  private async findReportFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    const stack: string[] = [root];
    let visited = 0;
    while (stack.length > 0 && found.length < 1000 && visited < 50_000) {
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
          entry.name.startsWith('TEST-') &&
          entry.name.endsWith('.xml') &&
          full.includes(`${path.sep}test-results${path.sep}`)
        ) {
          found.push(full);
        }
      }
    }
    return found;
  }
}

interface FailureNode {
  message: string;
  body: string;
}

function readFailure(inner: string, tag: 'failure' | 'error'): FailureNode | null {
  for (const node of iterateElements(inner, tag)) {
    return {
      message: node.attrs.message ?? node.attrs.type ?? '(no message)',
      body: unescapeXml(node.inner.trim()),
    };
  }
  return null;
}

function inferGradleModule(file: string, projectRoot: string): string | undefined {
  const rel = path.relative(projectRoot, file);
  // Strip `<module-path>/build/test-results/...` to recover the module path.
  const idx = rel.indexOf(`${path.sep}build${path.sep}test-results${path.sep}`);
  if (idx <= 0) {
    return undefined;
  }
  const modulePath = rel.slice(0, idx);
  if (modulePath.length === 0) {
    return undefined;
  }
  return ':' + modulePath.split(path.sep).join(':');
}
