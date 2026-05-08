import type {
  MaestroFlowResult,
  MaestroFlowSummary,
  MaestroFlowValidation,
} from '../entities/index.js';

/**
 * Outbound port for the Maestro flow runner. Designed for **optional**
 * availability: each tool call begins by checking `isAvailable()` (or relying
 * on the adapter to throw `MAESTRO_NOT_INSTALLED`).
 */
export interface FlowRunnerPort {
  /** Synchronous check used by tools to decide between executing or returning a friendly error. */
  isAvailable(): boolean;

  runFlow(
    name: string,
    params: Readonly<Record<string, string>>,
  ): Promise<MaestroFlowResult>;

  listFlows(): Promise<readonly MaestroFlowSummary[]>;

  validateFlow(name: string): Promise<MaestroFlowValidation>;
}
