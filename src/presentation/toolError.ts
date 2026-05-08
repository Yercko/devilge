import { DevilgeError } from '../config/errors.js';

/**
 * The MCP SDK's tool-handler return type carries an index signature
 * (`[x: string]: unknown`). We model that with an intersection so our error
 * payload is structurally assignable.
 */
export type ToolErrorPayload = {
  content: { type: 'text'; text: string }[];
  isError: true;
} & Record<string, unknown>;

/**
 * Translates any thrown value into the MCP "isError" tool response shape.
 * Critically, we never leak stack traces or unexpected errors verbatim — those
 * may include filesystem paths or environment details. Only DevilgeError
 * subclasses surface their messages as-is.
 */
export function toToolError(err: unknown): ToolErrorPayload {
  if (err instanceof DevilgeError) {
    return {
      content: [{ type: 'text', text: `[${err.code}] ${err.message}` }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: '[INTERNAL_ERROR] Devilge encountered an unexpected error. Check server logs for details.',
      },
    ],
    isError: true,
  };
}
