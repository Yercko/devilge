import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { MaestroAdapter } from '../src/infrastructure/maestro/MaestroAdapter.js';
import { DevilgeError } from '../src/config/errors.js';
import type { MaestroProcessRunner } from '../src/infrastructure/maestro/MaestroProcessRunner.js';

let flowsRoot: string;

class FakeRunner implements Pick<MaestroProcessRunner, 'run'> {
  public lastArgs: string[] = [];
  public exitCode = 0;
  public stdout = 'OK';
  public stderr = '';

  async run(
    _binary: string,
    args: readonly string[],
    _cwd: string,
    _timeoutMs: number,
  ) {
    this.lastArgs = [...args];
    return {
      stdoutTail: this.stdout,
      stderrTail: this.stderr,
      stdoutBytesTotal: this.stdout.length,
      exitCode: this.exitCode,
      timedOut: false,
    };
  }
}

const VALID_FLOW = `appId: com.example.app
---
- launchApp
- tapOn: "Login"
`;

const FLOW_WITH_SCRIPT = `appId: com.example.app
---
- launchApp
- runScript: ./script.js
`;

beforeAll(() => {
  flowsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-maestro-')));
  fs.writeFileSync(path.join(flowsRoot, 'login.yaml'), VALID_FLOW);
  fs.writeFileSync(path.join(flowsRoot, 'with_script.yaml'), FLOW_WITH_SCRIPT);
  fs.writeFileSync(path.join(flowsRoot, 'invalid.yaml'), 'no appId here\nor steps');
});

afterAll(() => {
  fs.rmSync(flowsRoot, { recursive: true, force: true });
});

describe('MaestroAdapter — Maestro not available', () => {
  it('throws MAESTRO_NOT_INSTALLED on runFlow', async () => {
    const validator = new PathValidator(flowsRoot);
    const adapter = new MaestroAdapter(null, validator, false, new FakeRunner() as unknown as MaestroProcessRunner);
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.runFlow('login', {})).rejects.toThrow(/MAESTRO_NOT_INSTALLED|Maestro is not installed/);
  });

  it('still allows listFlows', async () => {
    const validator = new PathValidator(flowsRoot);
    const adapter = new MaestroAdapter(null, validator, false, new FakeRunner() as unknown as MaestroProcessRunner);
    const flows = await adapter.listFlows();
    const names = flows.map((f) => f.name);
    expect(names).toContain('login');
    expect(names).toContain('with_script');
  });

  it('still allows validateFlow', async () => {
    const validator = new PathValidator(flowsRoot);
    const adapter = new MaestroAdapter(null, validator, false, new FakeRunner() as unknown as MaestroProcessRunner);
    const v = await adapter.validateFlow('login');
    expect(v.valid).toBe(true);
    const v2 = await adapter.validateFlow('with_script');
    expect(v2.hasRunScript).toBe(true);
    expect(v2.valid).toBe(false); // hasRunScript && !allowScripts
  });
});

describe('MaestroAdapter — Maestro available', () => {
  it('passes the flow path and env vars to the runner', async () => {
    const validator = new PathValidator(flowsRoot);
    const runner = new FakeRunner();
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      false,
      runner as unknown as MaestroProcessRunner,
    );

    runner.exitCode = 0;
    runner.stdout = 'Flow completed';
    const result = await adapter.runFlow('login', { EMAIL: 'a@b.com', USER_ID: '42' });

    expect(runner.lastArgs[0]).toBe('test');
    expect(runner.lastArgs[1]).toContain('login.yaml');
    expect(runner.lastArgs).toContain('-e');
    expect(runner.lastArgs).toContain('EMAIL=a@b.com');
    expect(runner.lastArgs).toContain('USER_ID=42');
    expect(result.success).toBe(true);
    expect(result.flowName).toBe('login');
    expect(result.paramsApplied).toEqual(['EMAIL', 'USER_ID']);
  });

  it('rejects flows with runScript when allowScripts=false', async () => {
    const validator = new PathValidator(flowsRoot);
    const runner = new FakeRunner();
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      false,
      runner as unknown as MaestroProcessRunner,
    );
    await expect(adapter.runFlow('with_script', {})).rejects.toThrow(DevilgeError);
  });

  it('accepts flows with runScript when allowScripts=true', async () => {
    const validator = new PathValidator(flowsRoot);
    const runner = new FakeRunner();
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      true,
      runner as unknown as MaestroProcessRunner,
    );
    runner.exitCode = 0;
    runner.stdout = 'Flow completed';
    const result = await adapter.runFlow('with_script', {});
    expect(result.success).toBe(true);
  });

  it('reports failure when maestro exits non-zero', async () => {
    const validator = new PathValidator(flowsRoot);
    const runner = new FakeRunner();
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      false,
      runner as unknown as MaestroProcessRunner,
    );
    runner.exitCode = 1;
    runner.stderr = 'Element not found';
    const result = await adapter.runFlow('login', {});
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.rawOutputTail).toContain('Element not found');
  });

  it('errors clearly on flow not found', async () => {
    const validator = new PathValidator(flowsRoot);
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      false,
      new FakeRunner() as unknown as MaestroProcessRunner,
    );
    await expect(adapter.runFlow('does_not_exist', {})).rejects.toThrow();
  });

  it('errors on invalid YAML structure', async () => {
    const validator = new PathValidator(flowsRoot);
    const adapter = new MaestroAdapter(
      '/fake/maestro',
      validator,
      false,
      new FakeRunner() as unknown as MaestroProcessRunner,
    );
    await expect(adapter.runFlow('invalid', {})).rejects.toThrow(DevilgeError);
  });
});
