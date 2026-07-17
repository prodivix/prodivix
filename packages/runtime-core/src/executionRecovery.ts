import type { ExecutionSessionSnapshot } from './executionSession';

export type ExecutionSessionRecoveryPlan =
  | Readonly<{
      status: 'unavailable';
      reason: 'session-missing' | 'idle' | 'active' | 'succeeded';
    }>
  | Readonly<{
      status: 'waiting';
      reason: 'cancellation-pending';
      jobId: string;
      requestId: string;
    }>
  | Readonly<{
      status: 'blocked';
      reason: 'terminal-identity-conflict';
    }>
  | Readonly<{
      status: 'restart';
      reason: 'failed' | 'cancelled' | 'timed-out';
      previousJobId: string;
      previousRequestId: string;
      providerId: string;
      workspaceId: string;
      snapshotId: string;
      requestStrategy: 'new-request';
      automatic: false;
      preserveEvents: true;
      replayMutations: false;
      requiresChange: boolean;
      failureCode?: string;
    }>;

/**
 * Converts terminal Session state into a manual recovery contract. Recovery
 * always creates a new request and never replays effects from the old Job.
 */
export const createExecutionSessionRecoveryPlan = (
  session: ExecutionSessionSnapshot | undefined
): ExecutionSessionRecoveryPlan => {
  if (!session)
    return Object.freeze({ status: 'unavailable', reason: 'session-missing' });
  const activeJob = session.activeJob;
  if (!activeJob)
    return Object.freeze({ status: 'unavailable', reason: 'idle' });
  if (session.status === 'cancelling')
    return Object.freeze({
      status: 'waiting',
      reason: 'cancellation-pending',
      jobId: activeJob.jobId,
      requestId: activeJob.requestId,
    });
  if (
    session.status === 'queued' ||
    session.status === 'starting' ||
    session.status === 'running'
  )
    return Object.freeze({ status: 'unavailable', reason: 'active' });
  if (session.status === 'idle')
    return Object.freeze({ status: 'unavailable', reason: 'idle' });
  if (session.status === 'succeeded')
    return Object.freeze({ status: 'unavailable', reason: 'succeeded' });
  const terminal = session.terminal;
  if (
    terminal &&
    (terminal.jobId !== activeJob.jobId || terminal.status !== session.status)
  )
    return Object.freeze({
      status: 'blocked',
      reason: 'terminal-identity-conflict',
    });
  const failureCode =
    session.status === 'failed' ? terminal?.failure?.code : undefined;
  return Object.freeze({
    status: 'restart',
    reason: session.status,
    previousJobId: activeJob.jobId,
    previousRequestId: activeJob.requestId,
    providerId: activeJob.providerId,
    workspaceId: activeJob.workspace.workspaceId,
    snapshotId: activeJob.workspace.snapshotId,
    requestStrategy: 'new-request',
    automatic: false,
    preserveEvents: true,
    replayMutations: false,
    requiresChange:
      session.status === 'failed' && terminal?.failure?.retryable === false,
    ...(failureCode ? { failureCode } : {}),
  });
};
