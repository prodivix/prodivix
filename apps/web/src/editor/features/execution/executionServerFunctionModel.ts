import type {
  ExecutionSessionSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  readServerFunctionInvocationTraceValue,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  type ServerFunctionInvocationTrace,
} from '@prodivix/server-runtime';

export type ExecutionServerFunctionEntry = Readonly<{
  id: string;
  jobId: string;
  providerId: string;
  snapshotId: string;
  trace: ServerFunctionInvocationTrace;
  sourceTrace?: readonly ExecutionSourceTrace[];
  primarySourceTrace?: ExecutionSourceTrace;
}>;

export type ExecutionServerFunctionSourceNavigationInput = Readonly<{
  jobId: string;
  providerId: string;
  snapshotId: string;
  sourceTrace: ExecutionSourceTrace;
}>;

export type ExecutionServerFunctionSourceNavigationResult =
  | Readonly<{ status: 'opened' }>
  | Readonly<{
      status: 'unavailable';
      reason: 'snapshot-stale' | 'source-unavailable';
    }>;

/** Selects one unambiguous root CodeArtifact trace for the invoked function. */
export const resolveExecutionServerFunctionPrimarySourceTrace = (
  trace: ServerFunctionInvocationTrace,
  sourceTrace: readonly ExecutionSourceTrace[] | undefined
): ExecutionSourceTrace | undefined => {
  const matches = (sourceTrace ?? []).filter(
    (candidate) =>
      candidate.sourceRef.kind === 'code-artifact' &&
      candidate.sourceRef.artifactId === trace.functionRef.artifactId &&
      (!candidate.sourceSpan ||
        candidate.sourceSpan.artifactId === trace.functionRef.artifactId)
  );
  return matches.length === 1 ? matches[0] : undefined;
};

/** Projects only the strict metadata-only Server Function trace contract. */
export const createExecutionServerFunctionEntries = (
  session: ExecutionSessionSnapshot | undefined
): readonly ExecutionServerFunctionEntry[] => {
  const jobEntries = (session?.events ?? []).flatMap((record) => {
    const event = record.event;
    if (
      event.kind !== 'trace' ||
      event.trace.name !== SERVER_FUNCTION_INVOCATION_TRACE_NAME ||
      event.trace.phase !== 'event'
    ) {
      return [];
    }
    const trace = readServerFunctionInvocationTraceValue(event.trace.detail);
    if (!trace) return [];
    const primarySourceTrace = resolveExecutionServerFunctionPrimarySourceTrace(
      trace,
      event.trace.sourceTrace
    );
    return [
      Object.freeze({
        id: `${record.jobId}:${event.sequence}:${trace.requestId}`,
        jobId: record.jobId,
        providerId: record.providerId,
        snapshotId: record.snapshotId,
        trace,
        ...(event.trace.sourceTrace
          ? { sourceTrace: event.trace.sourceTrace }
          : {}),
        ...(primarySourceTrace ? { primarySourceTrace } : {}),
      }),
    ];
  });
  const observations = (session?.observations ?? []).flatMap((record) => {
    if (
      record.trace.name !== SERVER_FUNCTION_INVOCATION_TRACE_NAME ||
      record.trace.phase !== 'event'
    ) {
      return [];
    }
    const trace = readServerFunctionInvocationTraceValue(record.trace.detail);
    if (!trace) return [];
    const primarySourceTrace = resolveExecutionServerFunctionPrimarySourceTrace(
      trace,
      record.trace.sourceTrace
    );
    return [
      Object.freeze({
        id: `${record.jobId}:observation:${record.sequence}:${trace.requestId}`,
        jobId: record.jobId,
        providerId: record.providerId,
        snapshotId: record.snapshotId,
        trace,
        ...(record.trace.sourceTrace
          ? { sourceTrace: record.trace.sourceTrace }
          : {}),
        ...(primarySourceTrace ? { primarySourceTrace } : {}),
      }),
    ];
  });
  return Object.freeze(
    [...jobEntries, ...observations].sort(
      (left, right) =>
        left.trace.completedAt - right.trace.completedAt ||
        left.id.localeCompare(right.id)
    )
  );
};
