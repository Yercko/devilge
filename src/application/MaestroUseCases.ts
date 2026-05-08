import type { FlowRunnerPort } from '../domain/ports/index.js';
import type {
  MaestroFlowResult,
  MaestroFlowSummary,
  MaestroFlowValidation,
} from '../domain/entities/index.js';

export interface RunMaestroFlowInput {
  readonly name: string;
  readonly params?: Readonly<Record<string, string>>;
}

export class RunMaestroFlowUseCase {
  constructor(private readonly runner: FlowRunnerPort) {}
  async execute(input: RunMaestroFlowInput): Promise<MaestroFlowResult> {
    return await this.runner.runFlow(input.name, input.params ?? {});
  }
}

export class ListMaestroFlowsUseCase {
  constructor(private readonly runner: FlowRunnerPort) {}
  async execute(): Promise<readonly MaestroFlowSummary[]> {
    return await this.runner.listFlows();
  }
}

export interface ValidateMaestroFlowInput {
  readonly name: string;
}

export class ValidateMaestroFlowUseCase {
  constructor(private readonly runner: FlowRunnerPort) {}
  async execute(input: ValidateMaestroFlowInput): Promise<MaestroFlowValidation> {
    return await this.runner.validateFlow(input.name);
  }
}
