import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathValidator } from '../src/infrastructure/security/PathValidator.js';
import { ProjectScanner } from '../src/infrastructure/scanners/ProjectScanner.js';

let projectRoot: string;

const SETTINGS = `
rootProject.name = "fake"
include(":androidApp")
include(":composeApp")
// modules/* are added programmatically via a walk in this fake project
`;

const LIBS_VERSIONS_TOML = `
[versions]
kotlin = "2.3.20"
agp = "9.1.1"
composeMultiplatform = "1.7.0"

[plugins]
androidApplication = { id = "com.android.application", version.ref = "agp" }
androidLibrary = { id = "com.android.library", version.ref = "agp" }
kotlinMultiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlinAndroid = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
composeMultiplatform = { id = "org.jetbrains.compose", version.ref = "composeMultiplatform" }
`;

const ANDROID_APP_BUILD = `
plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
}
android {
    namespace = "com.example.app"
}
`;

const COMPOSE_APP_BUILD = `
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.androidApplication)
}
kotlin {
    androidTarget()
    iosX64()
    iosArm64()
    sourceSets {
        commonMain.dependencies { /* ... */ }
    }
}
`;

const FEATURE_BUILD = `
plugins {
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.kotlinAndroid)
}
`;

beforeAll(() => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'devilge-project-')),
  );
  fs.writeFileSync(path.join(projectRoot, 'settings.gradle.kts'), SETTINGS);

  fs.mkdirSync(path.join(projectRoot, 'gradle'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'gradle', 'libs.versions.toml'),
    LIBS_VERSIONS_TOML,
  );

  // androidApp module (declared in settings)
  const androidAppDir = path.join(projectRoot, 'androidApp');
  fs.mkdirSync(path.join(androidAppDir, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(androidAppDir, 'build.gradle.kts'), ANDROID_APP_BUILD);

  // composeApp module — KMM (declared in settings)
  const composeAppDir = path.join(projectRoot, 'composeApp');
  fs.mkdirSync(path.join(composeAppDir, 'src', 'commonMain'), { recursive: true });
  fs.mkdirSync(path.join(composeAppDir, 'src', 'androidMain'), { recursive: true });
  fs.mkdirSync(path.join(composeAppDir, 'src', 'iosMain'), { recursive: true });
  fs.writeFileSync(path.join(composeAppDir, 'build.gradle.kts'), COMPOSE_APP_BUILD);

  // modules/feature/appointment — NOT declared in settings, must be discovered.
  const appointmentDir = path.join(projectRoot, 'modules', 'feature', 'appointment');
  fs.mkdirSync(path.join(appointmentDir, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(appointmentDir, 'build.gradle.kts'), FEATURE_BUILD);

  // modules/feature/forgot — also NOT declared in settings.
  const forgotDir = path.join(projectRoot, 'modules', 'feature', 'forgot');
  fs.mkdirSync(path.join(forgotDir, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(forgotDir, 'build.gradle.kts'), FEATURE_BUILD);

  // modules/core — basic Android library nested directly.
  const coreDir = path.join(projectRoot, 'modules', 'core');
  fs.mkdirSync(path.join(coreDir, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(coreDir, 'build.gradle.kts'), FEATURE_BUILD);

  // build dir at project root must NOT be picked up as a module.
  const buildSpoof = path.join(projectRoot, 'build');
  fs.mkdirSync(buildSpoof, { recursive: true });
  fs.writeFileSync(path.join(buildSpoof, 'build.gradle.kts'), 'should be ignored');
});

afterAll(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('ProjectScanner', () => {
  it('discovers modules declared in settings.gradle.kts', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    const names = result.modules.map((m) => m.name);
    expect(names).toContain(':androidApp');
    expect(names).toContain(':composeApp');
  });

  it('discovers nested modules NOT declared in settings via filesystem fallback', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    const names = result.modules.map((m) => m.name);
    expect(names).toContain(':modules:feature:appointment');
    expect(names).toContain(':modules:feature:forgot');
    expect(names).toContain(':modules:core');
  });

  it('does not pick up the root build directory as a module', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    const names = result.modules.map((m) => m.name);
    expect(names).not.toContain(':build');
  });

  it('classifies module types via libs.versions.toml plugin aliases', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);

    const androidApp = result.modules.find((m) => m.name === ':androidApp');
    expect(androidApp?.type).toBe('android-app');

    const composeApp = result.modules.find((m) => m.name === ':composeApp');
    expect(composeApp?.type).toBe('kmm-shared');

    const appointment = result.modules.find(
      (m) => m.name === ':modules:feature:appointment',
    );
    expect(appointment?.type).toBe('android-library');
  });

  it('detects KMM via commonMain source set', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    expect(result.hasKmm).toBe(true);
  });

  it('detects Compose Multiplatform from version catalog', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    expect(result.hasComposeMultiplatform).toBe(true);
  });

  it('extracts AGP and Kotlin versions', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    expect(result.kotlinVersion).toBe('2.3.20');
    expect(result.androidGradlePluginVersion).toBe('9.1.1');
  });

  it('lists composeApp source sets', async () => {
    const scanner = new ProjectScanner(new PathValidator(projectRoot));
    const result = await scanner.describe(projectRoot);
    const composeApp = result.modules.find((m) => m.name === ':composeApp');
    expect(composeApp?.sourceSets).toEqual(
      expect.arrayContaining(['commonMain', 'androidMain', 'iosMain']),
    );
  });
});
