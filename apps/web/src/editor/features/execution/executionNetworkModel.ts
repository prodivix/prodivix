import {
  EXECUTION_NETWORK_TRACE_NAME,
  readExecutionNetworkTraceValue,
  type ExecutionNetworkTrace,
  type ExecutionSessionSnapshot,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';

export type ExecutionNetworkEntry = Readonly<{
  id: string;
  jobId: string;
  providerId: string;
  snapshotId: string;
  trace: ExecutionNetworkTrace;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

/** Projects only strict metadata-only Network traces; malformed or provider-private payloads stay invisible. */
export const createExecutionNetworkEntries = (
  session: ExecutionSessionSnapshot | undefined
): readonly ExecutionNetworkEntry[] =>
  Object.freeze(
    (session?.events ?? []).flatMap((record) => {
      const event = record.event;
      if (
        event.kind !== 'trace' ||
        event.trace.name !== EXECUTION_NETWORK_TRACE_NAME
      )
        return [];
      const trace = readExecutionNetworkTraceValue(event.trace.detail);
      if (!trace) return [];
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
        }),
      ];
    })
  );
