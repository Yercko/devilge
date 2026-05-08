import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { JUnitXmlParser } from '../src/infrastructure/build/parsers/JUnitXmlParser.js';

let projectRoot: string;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.LoginUseCaseTest" tests="3" failures="1" errors="0" skipped="0" time="0.234">
  <testcase name="happyPath" classname="com.example.LoginUseCaseTest" time="0.012"/>
  <testcase name="failsOnEmptyPassword" classname="com.example.LoginUseCaseTest" time="0.005">
    <failure message="expected:&lt;true&gt; but was:&lt;false&gt;" type="org.opentest4j.AssertionFailedError">
java.lang.AssertionError
    at org.junit.Assert.fail(Assert.java:88)
    at com.example.LoginUseCaseTest.failsOnEmptyPassword(LoginUseCaseTest.kt:42)
    </failure>
  </testcase>
  <testcase name="skipped" classname="com.example.LoginUseCaseTest" time="0.001"/>
</testsuite>
`;

beforeAll(() => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-junit-')),
  );
  const reportDir = path.join(
    projectRoot,
    'modules',
    'feature',
    'login',
    'build',
    'test-results',
    'testDebugUnitTest',
  );
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'TEST-com.example.LoginUseCaseTest.xml'),
    SAMPLE_XML,
  );
});

afterAll(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('JUnitXmlParser', () => {
  it('finds and parses TEST-*.xml under build/test-results', async () => {
    const parser = new JUnitXmlParser(new PathValidator(projectRoot));
    const suites = await parser.collect(projectRoot);
    expect(suites).toHaveLength(1);
    const suite = suites[0]!;
    expect(suite.suite).toBe('com.example.LoginUseCaseTest');
    expect(suite.total).toBe(3);
    expect(suite.failures).toBe(1);
    expect(suite.module).toBe(':modules:feature:login');
    expect(suite.failingTests).toHaveLength(1);
    expect(suite.failingTests[0]?.testName).toBe('failsOnEmptyPassword');
    expect(suite.failingTests[0]?.message).toContain('expected:<true>');
    expect(suite.failingTests[0]?.stackTrace).toContain('LoginUseCaseTest.kt:42');
  });
});
