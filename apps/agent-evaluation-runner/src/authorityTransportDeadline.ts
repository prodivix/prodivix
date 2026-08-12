export const AGENT_EVALUATION_AUTHORITY_SHORT_TRANSPORT_TIMEOUT_MS =
  30_000 as const;
export const AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS = 120_000 as const;
export const AGENT_EVALUATION_AUTHORITY_BUILD_OPERATION_TIMEOUT_MS =
  170_000 as const;
export const AGENT_EVALUATION_AUTHORITY_TRANSPORT_MARGIN_MS = 5_000 as const;
export const AGENT_EVALUATION_AUTHORITY_MAXIMUM_TRANSPORT_TIMEOUT_MS =
  175_000 as const;

/**
 * Extends one frozen owner-operation budget only by the bounded HTTP delivery
 * margin. The result stays below the Backend's 180 second write boundary.
 */
export const deriveAgentEvaluationAuthorityTransportTimeoutMs = (
  operationTimeoutMs: number
): number => {
  const maximumOperationTimeoutMs =
    AGENT_EVALUATION_AUTHORITY_MAXIMUM_TRANSPORT_TIMEOUT_MS -
    AGENT_EVALUATION_AUTHORITY_TRANSPORT_MARGIN_MS;
  if (
    !Number.isSafeInteger(operationTimeoutMs) ||
    operationTimeoutMs < 1 ||
    operationTimeoutMs > maximumOperationTimeoutMs
  ) {
    throw new TypeError(
      'Agent evaluation authority operation timeout exceeds its bounded transport deadline.'
    );
  }
  return operationTimeoutMs + AGENT_EVALUATION_AUTHORITY_TRANSPORT_MARGIN_MS;
};

export type AgentEvaluationAuthorityTransportClass =
  'short' | 'operation' | 'build';

export const resolveAgentEvaluationAuthorityTransportTimeoutMs = (
  transportClass: AgentEvaluationAuthorityTransportClass,
  operationTimeoutMs: number
): number => {
  if (transportClass === 'short') {
    return AGENT_EVALUATION_AUTHORITY_SHORT_TRANSPORT_TIMEOUT_MS;
  }
  return deriveAgentEvaluationAuthorityTransportTimeoutMs(
    transportClass === 'build'
      ? AGENT_EVALUATION_AUTHORITY_BUILD_OPERATION_TIMEOUT_MS
      : operationTimeoutMs
  );
};
