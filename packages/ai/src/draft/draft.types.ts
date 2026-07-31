import type {
  AgentContextAuthority,
  AgentToolEffect,
} from '../domain/agent.types';

export type AiDraftDiagnosticSeverity = 'info' | 'warning' | 'error';
export type AiDraftResponseMode = 'json' | 'tool-calls' | 'text-with-json';
export type AiDraftToolSchemaFormat =
  | 'json-schema'
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'gemini-compatible';

export interface AiDraftModelPreferences {
  jsonMode?: boolean;
  toolCalling?: boolean;
  vision?: boolean;
  longContext?: boolean;
}

export interface AiDraftExecutionBudget {
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AiDraftProviderCapabilities {
  responseModes: readonly AiDraftResponseMode[];
  toolSchemaFormats: readonly AiDraftToolSchemaFormat[];
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsLongContext: boolean;
}

export interface AiDraftDiagnostic {
  code: string;
  message: string;
  severity: AiDraftDiagnosticSeverity;
  path?: string;
}

export interface AiDraftContextEntry<TValue = unknown> {
  id: string;
  title: string;
  authority: AgentContextAuthority;
  value: TValue;
  description?: string;
  instructionBoundary: 'data-only';
}

export interface AiDraftContextBundle {
  entries: readonly AiDraftContextEntry[];
  maxInputTokens?: number;
  omittedContext?: readonly string[];
}

export interface AiDraftPlanMilestone {
  id: string;
  title: string;
  description?: string;
}

/** Admission-only explain/plan output. It has no Workspace mutation authority. */
export interface AiDraftPlan {
  goal: string;
  assumptions: readonly string[];
  milestones: readonly AiDraftPlanMilestone[];
}

export interface AiDraftRequest {
  id: string;
  intent: string;
  context: AiDraftContextBundle;
  allowedTools: readonly string[];
  modelPreferences?: AiDraftModelPreferences;
  responseMode?: AiDraftResponseMode;
  streaming?: boolean;
  toolSchemaFormat?: AiDraftToolSchemaFormat;
  providerMetadata?: Readonly<Record<string, unknown>>;
  budget?: AiDraftExecutionBudget;
}

export interface AiDraftResult {
  requestId: string;
  status: 'planned' | 'failed';
  output?: AiDraftPlan;
  rawResponse?: string;
  diagnostics: readonly AiDraftDiagnostic[];
  traceId?: string;
}

export interface AiDraftToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  effect: Extract<AgentToolEffect, 'read' | 'ephemeral-execute'>;
  execute(input: TInput): Promise<TOutput> | TOutput;
}

export interface AiDraftProviderRequest {
  draft: AiDraftRequest;
  tools: readonly AiDraftToolDefinition[];
}

export type AiDraftProviderGenerateResult =
  | AiDraftPlan
  | {
      output: AiDraftPlan;
      rawResponse?: string;
    };

export type AiDraftStreamEvent =
  | {
      type: 'started';
      requestId: string;
      traceId: string;
      providerId: string;
    }
  | { type: 'raw-delta'; delta: string }
  | { type: 'raw-snapshot'; rawResponse: string }
  | { type: 'diagnostic'; diagnostic: AiDraftDiagnostic }
  | { type: 'validated-output'; output: AiDraftPlan; rawResponse: string }
  | { type: 'completed'; result: AiDraftResult };

export interface AiDraftProvider {
  id: string;
  capabilities?: AiDraftProviderCapabilities;
  generate(
    request: AiDraftProviderRequest
  ): Promise<AiDraftProviderGenerateResult>;
  stream?(request: AiDraftProviderRequest): AsyncIterable<AiDraftStreamEvent>;
}

export interface AiDraftProviderErrorOptions {
  rawResponse?: string;
  code?: string;
  severity?: AiDraftDiagnosticSeverity;
}

export class AiDraftProviderError extends Error {
  readonly rawResponse?: string;
  readonly code?: string;
  readonly severity?: AiDraftDiagnosticSeverity;

  constructor(message: string, options?: AiDraftProviderErrorOptions) {
    super(message);
    this.name = 'AiDraftProviderError';
    this.rawResponse = options?.rawResponse;
    this.code = options?.code;
    this.severity = options?.severity;
  }
}
