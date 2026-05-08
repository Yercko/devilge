import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { InstallApkUseCase } from '../src/application/LifecycleUseCases.js';
import type { AppControlPort } from '../src/domain/ports/index.js';
import { NotFoundError, SecurityError } from '../src/config/errors.js';

let projectRoot: string;
let installCalls: { serial: string | undefined; apkPath: string }[] = [];

const fakeApp: Pick<AppControlPort, 'installApk'> = {
  async installApk(serial, apkPath) {
    installCalls.push({ serial, apkPath });
    return { apkPath };
  },
};

beforeAll(() => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-install-')),
  );
  // :composeApp with a single debug APK
  const composeAppApkDir = path.join(
    projectRoot,
    'composeApp',
    'build',
    'outputs',
    'apk',
    'debug',
  );
  fs.mkdirSync(composeAppApkDir, { recursive: true });
  fs.writeFileSync(path.join(composeAppApkDir, 'composeApp-debug.apk'), 'fake bytes');

  // :app with NO APK yet (assemble not run)
  fs.mkdirSync(path.join(projectRoot, 'app', 'build'), { recursive: true });

  // :duplicates with two APKs (ambiguous)
  const duplicatesDir = path.join(
    projectRoot,
    'duplicates',
    'build',
    'outputs',
    'apk',
    'debug',
  );
  fs.mkdirSync(duplicatesDir, { recursive: true });
  fs.writeFileSync(path.join(duplicatesDir, 'a-debug.apk'), 'a');
  fs.writeFileSync(path.join(duplicatesDir, 'b-debug.apk'), 'b');
});

afterAll(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('InstallApkUseCase', () => {
  it('locates a single APK by module + default debug variant', async () => {
    installCalls = [];
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);

    const result = await useCase.execute({ module: ':composeApp' });
    expect(result.apkPath).toContain('composeApp-debug.apk');
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]?.apkPath).toBe(result.apkPath);
  });

  it('honours an explicit apkPath', async () => {
    installCalls = [];
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);

    const explicit = path.join(
      projectRoot,
      'composeApp',
      'build',
      'outputs',
      'apk',
      'debug',
      'composeApp-debug.apk',
    );
    const result = await useCase.execute({ apkPath: explicit });
    expect(result.apkPath).toBe(fs.realpathSync(explicit));
  });

  it('rejects when both apkPath and module are given', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(
      useCase.execute({ apkPath: 'x.apk', module: ':composeApp' }),
    ).rejects.toThrow();
  });

  it('rejects when neither apkPath nor module is given', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(useCase.execute({})).rejects.toThrow();
  });

  it('throws NotFoundError when assemble was not run', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(useCase.execute({ module: ':app' })).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when multiple APKs match — must disambiguate', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(useCase.execute({ module: ':duplicates' })).rejects.toThrow(NotFoundError);
  });

  it('rejects malformed module strings', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(useCase.execute({ module: '../escape' })).rejects.toThrow(SecurityError);
    await expect(useCase.execute({ module: 'no-leading-colon' })).rejects.toThrow(SecurityError);
  });

  it('rejects malformed variant strings', async () => {
    const validator = new PathValidator(projectRoot);
    const useCase = new InstallApkUseCase(fakeApp as AppControlPort, undefined, validator);
    await expect(
      useCase.execute({ module: ':composeApp', variant: 'with space' }),
    ).rejects.toThrow(SecurityError);
  });
});
