import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  createExecutionSecretLeakDiagnostic,
  EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE,
  EXECUTION_SECRET_LEAK_FAILURE_CODE,
  EXECUTION_SECRET_LEAK_REASON,
  isExecutionJobTerminalStatus,
  type ExecutionArtifact,
  type ExecutionJobController,
  type ExecutionJobEvent,
  type ExecutionJobStatus,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { RemoteExecutionRecoveryRequiredError } from './remoteExecutionClient';
import type { RemoteExecutionRecord } from './remoteExecutionProtocol.types';

export const REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT =
  'prodivix.remote-execution-projection-checkpoint.v1';
export const REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION = 1;

export type RemoteExecutionProjectionCheckpoint = Readonly<{
  format: typeof REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT;
  version: typeof REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION;
  executionId: string;
  requestId: string;
  snapshotDigest: string;
  providerId: string;
  confirmedAfterCursor: number;
  confirmedEventDigest?: string;
  generation: number;
}>;

export type RemoteExecutionProjectionState = {
  readonly controller: ExecutionJobController;
  record: RemoteExecutionRecord;
  cursor: number;
  confirmedEventDigest?: string;
  generation: number;
  lastResumeCheckpoint?: RemoteExecutionProjectionCheckpoint;
  remoteStatus: ExecutionJobStatus;
  terminalReason?: string;
  buildBundlePublished: boolean;
  previewBundlePublished: boolean;
  serverFunctionResultStatus?: 'succeeded' | 'failed';
  serverFunctionResultErrorCode?: string;
  serverFunctionResultSourceTrace?: readonly ExecutionSourceTrace[];
  serverFunctionTracePublished: boolean;
  testReportStatus?: 'passed' | 'failed';
  testReportSourceTrace?: readonly ExecutionSourceTrace[];
  testReportTraceStatus?: 'passed' | 'failed';
  testServerFunctionTraceCount: number;
  trustedServerFunctionSourceTrace?: readonly ExecutionSourceTrace[];
};

export type RemoteExecutionArtifactMaterializer = (
  input: Readonly<{
    executionId: string;
    snapshotDigest: string;
    artifact: ExecutionArtifact;
  }>
) => ExecutionArtifact | Promise<ExecutionArtifact>;

export const digestRemoteExecutionEvent = (event: ExecutionJobEvent): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(event))))}`;

export const createRemoteExecutionProjectionCheckpoint = (
  state: RemoteExecutionProjectionState
): RemoteExecutionProjectionCheckpoint =>
  Object.freeze({
    format: REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT,
    version: REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION,
    executionId: state.record.executionId,
    requestId: state.record.requestId,
    snapshotDigest: state.record.snapshotDigest,
    providerId: state.record.provider.id,
    confirmedAfterCursor: state.cursor,
    ...(state.confirmedEventDigest
      ? { confirmedEventDigest: state.confirmedEventDigest }
      : {}),
    generation: state.generation,
  });

export const assertRemoteExecutionProjectionCheckpoint = (
  state: RemoteExecutionProjectionState,
  checkpoint: RemoteExecutionProjectionCheckpoint
): void => {
  if (!isPlainObject(checkpoint)) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote projection checkpoint is invalid or belongs to another execution.',
      'events.read'
    );
  }
  const keys = Object.keys(checkpoint).sort();
  const expectedKeys = [
    'confirmedAfterCursor',
    ...(checkpoint.confirmedEventDigest === undefined
      ? []
      : ['confirmedEventDigest']),
    'executionId',
    'format',
    'generation',
    'providerId',
    'requestId',
    'snapshotDigest',
    'version',
  ].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    checkpoint.format !== REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT ||
    checkpoint.version !== REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION ||
    checkpoint.executionId !== state.record.executionId ||
    checkpoint.requestId !== state.record.requestId ||
    checkpoint.snapshotDigest !== state.record.snapshotDigest ||
    checkpoint.providerId !== state.record.provider.id ||
    !Number.isSafeInteger(checkpoint.confirmedAfterCursor) ||
    checkpoint.confirmedAfterCursor < 0 ||
    !Number.isSafeInteger(checkpoint.generation) ||
    checkpoint.generation < 1 ||
    (checkpoint.confirmedAfterCursor === 0) !==
      (checkpoint.confirmedEventDigest === undefined) ||
    (checkpoint.confirmedEventDigest !== undefined &&
      !/^sha256-[a-f0-9]{64}$/u.test(checkpoint.confirmedEventDigest))
  ) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote projection checkpoint is invalid or belongs to another execution.',
      'events.read'
    );
  }
};

export const isRemoteExecutionProjectionActive = (
  controller: ExecutionJobController
): boolean =>
  !isExecutionJobTerminalStatus(controller.job.getSnapshot().status);

export const finishRemoteExecutionProjection = (
  controller: ExecutionJobController,
  status: ExecutionJobStatus,
  reason?: string
): void => {
  if (!isRemoteExecutionProjectionActive(controller)) return;
  switch (status) {
    case 'succeeded':
      controller.succeed();
      return;
    case 'failed':
      if (reason === EXECUTION_SECRET_LEAK_REASON) {
        if (!secretLeakDiagnosticControllers.has(controller))
          controller.emitDiagnostic(createExecutionSecretLeakDiagnostic());
        controller.fail({
          code: EXECUTION_SECRET_LEAK_FAILURE_CODE,
          message:
            'Execution output was blocked because it contained protected material.',
          retryable: false,
        });
        return;
      }
      if (reason === 'worker-recovery-exhausted') {
        controller.fail({
          code: 'REMOTE_WORKER_RECOVERY_EXHAUSTED',
          message:
            'The remote execution exhausted its bounded worker recovery attempts.',
          retryable: true,
        });
        return;
      }
      if (
        reason === 'network-policy-denied' ||
        reason === 'runtime-network-isolation-failed'
      ) {
        controller.fail({
          code: 'REMOTE_NETWORK_POLICY_DENIED',
          message:
            'Remote execution was blocked by the configured network policy.',
          retryable: false,
        });
        return;
      }
      if (reason === 'secret-resolution-denied') {
        controller.fail({
          code: 'REMOTE_PERMISSION_DENIED',
          message:
            'Remote execution could not resolve an authorized runtime binding.',
          retryable: false,
        });
        return;
      }
      controller.fail({
        code: 'REMOTE_EXECUTION_FAILED',
        message: reason ?? 'Remote execution failed.',
        retryable: false,
      });
      return;
    case 'cancelled':
      controller.finishCancelled(reason);
      return;
    case 'timed-out':
      controller.finishTimedOut(controller.job.request.timeoutMs);
      return;
    default:
      return;
  }
};

const secretLeakDiagnosticControllers = new WeakSet<ExecutionJobController>();

const applyRemoteExecutionState = (
  controller: ExecutionJobController,
  status: ExecutionJobStatus,
  reason?: string
): void => {
  const current = controller.job.getSnapshot().status;
  if (current === status || isExecutionJobTerminalStatus(current)) return;
  if (
    (current === 'starting' && status === 'queued') ||
    (current === 'running' && (status === 'queued' || status === 'starting')) ||
    (current === 'cancelling' && !isExecutionJobTerminalStatus(status))
  )
    return;
  switch (status) {
    case 'queued':
      return;
    case 'starting':
      controller.markStarting();
      return;
    case 'running':
      controller.markRunning();
      return;
    case 'cancelling':
      controller.markCancelling(reason);
      return;
    default:
      finishRemoteExecutionProjection(controller, status, reason);
  }
};

export const applyRemoteExecutionEvent = (
  controller: ExecutionJobController,
  event: ExecutionJobEvent
): void => {
  if (!isRemoteExecutionProjectionActive(controller)) return;
  switch (event.kind) {
    case 'state':
      applyRemoteExecutionState(
        controller,
        event.snapshot.status,
        event.reason
      );
      return;
    case 'log':
      controller.emitLog(event.log);
      return;
    case 'diagnostic':
      if (event.diagnostic.code === EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE)
        secretLeakDiagnosticControllers.add(controller);
      controller.emitDiagnostic(event.diagnostic);
      return;
    case 'artifact':
      controller.emitArtifact(event.artifact);
      return;
    case 'trace':
      controller.emitTrace(event.trace);
  }
};
