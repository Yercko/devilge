/**
 * High-level snapshot of an Android/KMM project layout.
 * Intentionally shallow — agents can drill in via additional tools.
 */
export interface ProjectStructure {
  readonly rootPath: string;
  readonly modules: readonly GradleModule[];
  readonly hasKmm: boolean;
  readonly hasComposeMultiplatform: boolean;
  readonly androidGradlePluginVersion?: string;
  readonly kotlinVersion?: string;
}

export interface GradleModule {
  readonly name: string;            // e.g. ":app", ":shared"
  readonly relativePath: string;
  readonly type: ModuleType;
  readonly sourceSets: readonly string[];
}

export type ModuleType =
  | 'android-app'
  | 'android-library'
  | 'kmm-shared'
  | 'jvm-library'
  | 'unknown';
