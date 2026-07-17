import {
  EXECUTION_TERMINAL_LIMITS,
  normalizeIdentifier,
  normalizePositiveLimit,
  normalizeSize,
  terminalCapabilities,
  type CreateExecutionTerminalControllerInput,
  type ExecutionTerminalSize,
} from './executionTerminal';

interface ExecutionTerminalControllerConfiguration {
  readonly terminalSessionId: string;
  readonly executionId: string;
  readonly jobId: string;
  readonly maximumOutputRecords: number;
  readonly maximumRetainedOutputBytes: number;
  readonly maximumInputFingerprints: number;
  readonly maximumOutputChunkBytes: number;
  readonly initialSize: ExecutionTerminalSize;
}

/** Validates the immutable identity, adapter, and budget boundary before state exists. */
export const normalizeExecutionTerminalControllerConfiguration = (
  input: CreateExecutionTerminalControllerInput
): ExecutionTerminalControllerConfiguration => {
  const terminalSessionId = normalizeIdentifier(
    input.terminalSessionId,
    'Execution terminal session id'
  );
  const executionId = normalizeIdentifier(
    input.executionId,
    'Execution terminal execution id'
  );
  const jobId = normalizeIdentifier(input.jobId, 'Execution terminal job id');
  if (!terminalCapabilities.has(input.capability))
    throw new TypeError('Execution terminal capability is invalid.');
  if (!input.provider.capabilities.includes('terminal'))
    throw new TypeError(
      'Execution terminal provider must declare the terminal capability.'
    );

  normalizeIdentifier(input.grant.grantId, 'Execution terminal grant id');
  if (
    normalizeIdentifier(
      input.grant.executionId,
      'Execution terminal grant execution id'
    ) !== executionId ||
    normalizeIdentifier(
      input.grant.jobId,
      'Execution terminal grant job id'
    ) !== jobId ||
    normalizeIdentifier(
      input.grant.providerId,
      'Execution terminal grant provider id'
    ) !== input.provider.id
  )
    throw new TypeError(
      'Execution terminal grant does not match the execution/provider fence.'
    );
  if (
    typeof input.requestInput !== 'function' ||
    typeof input.requestResize !== 'function' ||
    typeof input.requestSignal !== 'function' ||
    typeof input.requestClose !== 'function'
  )
    throw new TypeError(
      'Execution terminal adapter handlers must all be functions.'
    );

  const maximumOutputRecords = normalizePositiveLimit(
    input.maximumOutputRecords,
    EXECUTION_TERMINAL_LIMITS.maximumOutputRecords,
    'Execution terminal output record budget',
    EXECUTION_TERMINAL_LIMITS.maximumOutputRecords
  );
  const maximumRetainedOutputBytes = normalizePositiveLimit(
    input.maximumRetainedOutputBytes,
    EXECUTION_TERMINAL_LIMITS.maximumRetainedOutputBytes,
    'Execution terminal output byte budget',
    EXECUTION_TERMINAL_LIMITS.maximumRetainedOutputBytes
  );
  const maximumInputFingerprints = normalizePositiveLimit(
    input.maximumInputFingerprints,
    EXECUTION_TERMINAL_LIMITS.maximumInputFingerprints,
    'Execution terminal input fingerprint budget',
    EXECUTION_TERMINAL_LIMITS.maximumInputFingerprints
  );

  return Object.freeze({
    terminalSessionId,
    executionId,
    jobId,
    maximumOutputRecords,
    maximumRetainedOutputBytes,
    maximumInputFingerprints,
    maximumOutputChunkBytes: Math.min(
      EXECUTION_TERMINAL_LIMITS.maximumOutputChunkBytes,
      maximumRetainedOutputBytes
    ),
    initialSize: normalizeSize(input.size),
  });
};
