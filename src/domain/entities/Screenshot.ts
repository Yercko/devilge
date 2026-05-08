/**
 * A captured device screenshot persisted to disk under the outputs root.
 * Bytes are NOT carried in this entity to keep responses small; the LLM/client
 * reads the file by path if needed.
 */
export interface Screenshot {
  readonly absolutePath: string;
  readonly relativePath: string;     // relative to outputs root, for display
  readonly sizeBytes: number;
  readonly capturedAtIso: string;
  readonly serial?: string;
}
