import type { GetProjectStructureUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const projectStructureToolName = 'devilge_get_project_structure';

export const projectStructureToolDefinition = {
  title: 'Describe project structure',
  description:
    'Returns a high-level snapshot of the configured Android/KMM Gradle project: ' +
    'modules, types (android-app / kmm-shared / library), source sets, and key versions.',
  inputSchema: {},
};

export function buildProjectStructureHandler(useCase: GetProjectStructureUseCase) {
  return async () => {
    try {
      const structure = await useCase.execute();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(structure, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
