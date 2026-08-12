export const AGENT_EVALUATION_RUNNER_ERROR_CODES = Object.freeze({
  aborted: 'G4_RUNNER_ABORTED',
  captureFailed: 'G4_RUNNER_CAPTURE_FAILED',
  configurationInvalid: 'G4_RUNNER_CONFIGURATION_INVALID',
  disabled: 'G4_RUNNER_DISABLED',
  egressDenied: 'G4_RUNNER_EGRESS_DENIED',
  providerAuthenticationRejected: 'G4_RUNNER_PROVIDER_AUTH_REJECTED',
  providerRateLimited: 'G4_RUNNER_PROVIDER_RATE_LIMITED',
  providerRejected: 'G4_RUNNER_PROVIDER_REJECTED',
  productionCompositionUnavailable:
    'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE',
  productionSmokeEgressUnavailable:
    'G4_RUNNER_PRODUCTION_SMOKE_EGRESS_UNAVAILABLE',
  productionShardRuntimeUnavailable:
    'G4_RUNNER_PRODUCTION_SHARD_RUNTIME_UNAVAILABLE',
  productionHoldoutAuthorityUnavailable:
    'G4_RUNNER_PRODUCTION_HOLDOUT_AUTHORITY_UNAVAILABLE',
  productionEvidenceArchiveUnavailable:
    'G4_RUNNER_PRODUCTION_EVIDENCE_ARCHIVE_UNAVAILABLE',
  productionReadModelUnavailable: 'G4_RUNNER_PRODUCTION_READ_MODEL_UNAVAILABLE',
  responseInvalid: 'G4_RUNNER_RESPONSE_INVALID',
  responseSecretLeak: 'G4_RUNNER_RESPONSE_SECRET_LEAK',
  responseTooLarge: 'G4_RUNNER_RESPONSE_TOO_LARGE',
  serverOnly: 'G4_RUNNER_SERVER_ONLY',
  secretUnavailable: 'G4_RUNNER_SECRET_UNAVAILABLE',
  secretUseDenied: 'G4_RUNNER_SECRET_USE_DENIED',
  transportFailed: 'G4_RUNNER_TRANSPORT_FAILED',
} as const);

export type AgentEvaluationRunnerErrorCode =
  (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES];

export type AgentEvaluationRunnerErrorProvider =
  'anthropic-messages' | 'gemini-interactions' | 'openai-responses';

/** A deliberately context-free error safe for logs, diagnostics, and captures. */
export class AgentEvaluationRunnerError extends Error {
  readonly code: AgentEvaluationRunnerErrorCode;
  readonly httpStatus?: number;
  readonly provider?: AgentEvaluationRunnerErrorProvider;

  constructor(
    code: AgentEvaluationRunnerErrorCode,
    httpStatus?: number,
    provider?: AgentEvaluationRunnerErrorProvider
  ) {
    super(code);
    this.name = 'AgentEvaluationRunnerError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.provider = provider;
  }

  toJSON(): Readonly<{
    code: AgentEvaluationRunnerErrorCode;
    httpStatus?: number;
    provider?: AgentEvaluationRunnerErrorProvider;
  }> {
    return Object.freeze({
      code: this.code,
      ...(this.httpStatus === undefined ? {} : { httpStatus: this.httpStatus }),
      ...(this.provider === undefined ? {} : { provider: this.provider }),
    });
  }
}

export const safeRunnerError = (caught: unknown): AgentEvaluationRunnerError =>
  caught instanceof AgentEvaluationRunnerError
    ? caught
    : new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
      );
