export type LlmOutputChannel =
  | 'pir-command'
  | 'node-graph-operation'
  | 'code-artifact';

export type LlmRiskLevel = 'low' | 'medium' | 'high';

export type LlmTaskStatus = 'planned' | 'dry-run' | 'applied' | 'failed';

export type LlmContextAuthority = 'authoritative' | 'summary';

export type LlmCodeArtifactKind =
  | 'node-code'
  | 'external-runtime-code'
  | 'adapter-code'
  | 'test-code'
  | 'shader-code'
  | 'worker-code'
  | 'utility-code';

export type LlmDiagnosticSeverity = 'info' | 'warning' | 'error';

export type LlmToolSideEffect = 'read' | 'dry-run' | 'write' | 'verify';

export type LlmResponseMode = 'json' | 'tool-calls' | 'text-with-json';

export type LlmToolSchemaFormat =
  | 'json-schema'
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'gemini-compatible';

export interface LlmModelPreferences {
  jsonMode?: boolean;
  toolCalling?: boolean;
  vision?: boolean;
  longContext?: boolean;
}

export interface LlmExecutionBudget {
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface LlmProviderCapabilities {
  responseModes: readonly LlmResponseMode[];
  toolSchemaFormats: readonly LlmToolSchemaFormat[];
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsLongContext: boolean;
}

export interface LlmDiagnostic {
  code: string;
  message: string;
  severity: LlmDiagnosticSeverity;
  path?: string;
  allowedValues?: readonly string[];
  repairHint?: string;
}

export interface LlmContextEntry<TValue = unknown> {
  id: string;
  title: string;
  authority: LlmContextAuthority;
  value: TValue;
  description?: string;
}

export interface LlmContextBundle {
  entries: readonly LlmContextEntry[];
  tokenBudget?: number;
  omittedContext?: readonly string[];
}

export interface LlmPlanMilestone {
  id: string;
  title: string;
  description?: string;
}

export interface LlmPlanArtifact {
  goal: string;
  assumptions: readonly string[];
  milestones: readonly LlmPlanMilestone[];
}

export interface LlmPirCommandBatch {
  channel: 'pir-command';
  commands: readonly unknown[];
  riskLevel: LlmRiskLevel;
}

export interface LlmNodeGraphOperationBatch {
  channel: 'node-graph-operation';
  operations: readonly unknown[];
  riskLevel: LlmRiskLevel;
}

export interface LlmCodeArtifact {
  channel: 'code-artifact';
  id: string;
  kind: LlmCodeArtifactKind;
  language: string;
  content: string;
  ownerId?: string;
  bindTargetId?: string;
  riskLevel: LlmRiskLevel;
}

export type LlmStructuredOutput =
  | LlmPlanArtifact
  | LlmPirCommandBatch
  | LlmNodeGraphOperationBatch
  | LlmCodeArtifact;

export type LlmProviderGenerateResult<
  TOutput extends LlmStructuredOutput = LlmStructuredOutput,
> =
  | TOutput
  | {
      output: TOutput;
      rawResponse?: string;
    };

export interface LlmProviderErrorOptions {
  rawResponse?: string;
  code?: string;
  severity?: LlmDiagnosticSeverity;
}

export class LlmProviderError extends Error {
  readonly rawResponse?: string;
  readonly code?: string;
  readonly severity?: LlmDiagnosticSeverity;

  constructor(message: string, options?: LlmProviderErrorOptions) {
    super(message);
    this.name = 'LlmProviderError';
    this.rawResponse = options?.rawResponse;
    this.code = options?.code;
    this.severity = options?.severity;
  }
}

export interface LlmTaskRequest {
  id: string;
  intent: string;
  context: LlmContextBundle;
  allowedTools: readonly string[];
  outputChannels: readonly LlmOutputChannel[];
  modelPreferences?: LlmModelPreferences;
  responseMode?: LlmResponseMode;
  streaming?: boolean;
  toolSchemaFormat?: LlmToolSchemaFormat;
  providerMetadata?: Record<string, unknown>;
  budget?: LlmExecutionBudget;
  requiresPlan?: boolean;
}

export interface LlmTaskResult<
  TOutput extends LlmStructuredOutput = LlmStructuredOutput,
> {
  taskId: string;
  status: LlmTaskStatus;
  output?: TOutput;
  rawResponse?: string;
  diagnostics: readonly LlmDiagnostic[];
  traceId?: string;
}

export type LlmStreamEvent =
  | {
      type: 'started';
      taskId: string;
      traceId: string;
      providerId: string;
    }
  | {
      type: 'raw-delta';
      delta: string;
    }
  | {
      type: 'raw-snapshot';
      rawResponse: string;
    }
  | {
      type: 'diagnostic';
      diagnostic: LlmDiagnostic;
    }
  | {
      type: 'validated-output';
      output: LlmStructuredOutput;
      rawResponse: string;
    }
  | {
      type: 'completed';
      result: LlmTaskResult;
    };

export interface LlmToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  sideEffect: LlmToolSideEffect;
  requiresDryRun?: boolean;
  riskLevel?: LlmRiskLevel;
  execute(input: TInput): Promise<TOutput> | TOutput;
}

export interface LlmToolCallRecord {
  name: string;
  sideEffect: LlmToolSideEffect;
  startedAt: string;
  completedAt?: string;
  diagnostics?: readonly LlmDiagnostic[];
}

export interface LlmProviderRequest {
  task: LlmTaskRequest;
  tools: readonly LlmToolDefinition[];
}

export interface LlmProvider {
  id: string;
  capabilities?: LlmProviderCapabilities;
  generate(request: LlmProviderRequest): Promise<LlmProviderGenerateResult>;
  stream?(request: LlmProviderRequest): AsyncIterable<LlmStreamEvent>;
}

export interface LlmGatewayTrace {
  id: string;
  taskId: string;
  userIntent: string;
  modelProviderId: string;
  context: LlmContextBundle;
  toolNames: readonly string[];
  toolCalls: readonly LlmToolCallRecord[];
  diagnostics: readonly LlmDiagnostic[];
  startedAt: string;
  completedAt?: string;
}
