export const AGENT_EVALUATION_SERVICE_TOKEN_MINIMUM_BYTES = 32;
export const AGENT_EVALUATION_SERVICE_TOKEN_MAXIMUM_BYTES = 4_096;

const serviceTokenPattern = /^[A-Za-z0-9._~+/-]+={0,2}$/u;

/**
 * Shared callback-bound service credential shape for the Backend and owner
 * authority loopback services. The accepted alphabet is ASCII, so code-unit
 * length is also the exact UTF-8 byte length.
 */
export const isAgentEvaluationServiceToken = (
  value: unknown
): value is string =>
  typeof value === 'string' &&
  value.length >= AGENT_EVALUATION_SERVICE_TOKEN_MINIMUM_BYTES &&
  value.length <= AGENT_EVALUATION_SERVICE_TOKEN_MAXIMUM_BYTES &&
  serviceTokenPattern.test(value);
