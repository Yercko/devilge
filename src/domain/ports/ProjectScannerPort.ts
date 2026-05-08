import type { ProjectStructure } from '../entities/index.js';

/**
 * Outbound port for inspecting the Gradle project layout.
 */
export interface ProjectScannerPort {
  describe(projectRoot: string): Promise<ProjectStructure>;
}
