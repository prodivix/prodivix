import type { LlmGatewayTrace } from './types.js';

export interface LlmTraceStore {
  append(trace: LlmGatewayTrace): void | Promise<void>;
}

export class InMemoryLlmTraceStore implements LlmTraceStore {
  private readonly traces: LlmGatewayTrace[] = [];

  append(trace: LlmGatewayTrace): void {
    this.traces.push(trace);
  }

  list(): readonly LlmGatewayTrace[] {
    return [...this.traces];
  }
}
