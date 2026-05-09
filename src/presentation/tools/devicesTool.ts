import type { ListDevicesUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const devicesToolName = 'devilge_list_devices';

export const devicesToolDefinition = {
  title: 'List Android devices',
  description:
    'Lists every Android device or emulator currently visible to ADB on this machine.',
  inputSchema: {},
  annotations: {
    title: 'List Android devices',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export function buildDevicesToolHandler(useCase: ListDevicesUseCase) {
  return async () => {
    try {
      const devices = await useCase.execute();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ devices }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
