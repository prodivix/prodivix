import type {
  ExecutableProjectSnapshot,
  ExecutionSourceTrace,
  ExecutionRequest,
} from '@prodivix/runtime-core';
import {
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readIsolatedServerFunctionExecutionRequest,
  readIsolatedServerFunctionExecutionResponse,
  type ExecutionServerFunctionBridgeResponse,
} from '@prodivix/server-runtime';
import type { RemoteWorkerSandboxArtifact } from './worker.types';

const maximumServerFunctionResultBytes = 1024 * 1024 + 64 * 1024;
const maximumServerFunctionSourceTraces = 128;

export type RemoteWorkerServerFunctionArtifactProjection = Readonly<{
  response: ExecutionServerFunctionBridgeResponse;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const collectServerFunctionSourceTrace = (
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionSourceTrace[] => {
  const plan = snapshot.serverFunctionPlan!;
  const slash = plan.sourceFilePath.lastIndexOf('/');
  const sourceDirectory = slash < 0 ? '' : plan.sourceFilePath.slice(0, slash);
  const modulePrefix = `${sourceDirectory ? `${sourceDirectory}/` : ''}modules/module-`;
  const sourceFiles = snapshot.files
    .filter(
      ({ path }) =>
        path === plan.sourceFilePath ||
        (path.startsWith(modulePrefix) &&
          /^[0-9]{3}\.mjs$/u.test(path.slice(modulePrefix.length)))
    )
    .sort((left, right) => {
      if (left.path === plan.sourceFilePath) return -1;
      if (right.path === plan.sourceFilePath) return 1;
      return compareText(left.path, right.path);
    });
  if (!sourceFiles.length || sourceFiles[0]?.path !== plan.sourceFilePath)
    throw new TypeError(
      'Sandbox Server Function result is missing its root source.'
    );
  const traces: ExecutionSourceTrace[] = [];
  const seen = new Set<string>();
  for (const file of sourceFiles) {
    if (!file.sourceTrace?.length)
      throw new TypeError(
        'Sandbox Server Function module is missing source trace.'
      );
    for (const trace of file.sourceTrace) {
      const key = JSON.stringify(trace);
      if (seen.has(key)) continue;
      seen.add(key);
      traces.push(trace);
      if (traces.length > maximumServerFunctionSourceTraces)
        throw new TypeError(
          'Sandbox Server Function source trace budget was exceeded.'
        );
    }
  }
  return Object.freeze(traces);
};

const exactMetadata = (
  actual: Readonly<Record<string, string>> | undefined,
  expected: Readonly<Record<string, string>>
): boolean =>
  Boolean(
    actual &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );

/** Revalidates the internal sandbox artifact before it can become durable telemetry or output. */
export const readRemoteWorkerServerFunctionArtifact = (input: {
  snapshot: ExecutableProjectSnapshot;
  request: ExecutionRequest;
  artifact: RemoteWorkerSandboxArtifact;
}): RemoteWorkerServerFunctionArtifactProjection | undefined => {
  const invocation = readIsolatedServerFunctionExecutionRequest(
    input.request,
    input.snapshot.serverFunctionPlan
  );
  if (
    !invocation ||
    input.artifact.kind !== 'report' ||
    input.artifact.mediaType !== ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
    input.artifact.artifactId !==
      `server-function-result:${input.snapshot.contentDigest}:${invocation.requestId}` ||
    !input.artifact.contents.byteLength ||
    input.artifact.contents.byteLength > maximumServerFunctionResultBytes
  )
    return undefined;
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.artifact.contents)
    ) as unknown;
  } catch {
    return undefined;
  }
  const response = readIsolatedServerFunctionExecutionResponse(
    value,
    input.request,
    input.snapshot.serverFunctionPlan
  );
  if (!response) return undefined;
  let sourceTrace: readonly ExecutionSourceTrace[];
  try {
    sourceTrace = collectServerFunctionSourceTrace(input.snapshot);
  } catch {
    return undefined;
  }
  const rootSources = sourceTrace.filter(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === invocation.functionRef.artifactId &&
      (!trace.sourceSpan ||
        trace.sourceSpan.artifactId === invocation.functionRef.artifactId)
  );
  if (
    rootSources.length !== 1 ||
    !input.artifact.sourceTrace ||
    JSON.stringify(input.artifact.sourceTrace) !==
      JSON.stringify(sourceTrace) ||
    !exactMetadata(input.artifact.metadata, {
      snapshotDigest: input.snapshot.contentDigest,
      requestId: invocation.requestId,
      artifactId: invocation.functionRef.artifactId,
      exportName: invocation.functionRef.exportName,
      status: response.ok ? 'succeeded' : 'failed',
      ...(response.ok ? {} : { errorCode: response.error.code }),
    })
  )
    return undefined;
  return Object.freeze({ response, sourceTrace });
};

/** Canonicalizes an untrusted sandbox result against the original request and snapshot profile. */
export const createRemoteWorkerServerFunctionArtifact = (input: {
  snapshot: ExecutableProjectSnapshot;
  request: ExecutionRequest;
  contents: Uint8Array;
}): RemoteWorkerSandboxArtifact => {
  const invocation = readIsolatedServerFunctionExecutionRequest(
    input.request,
    input.snapshot.serverFunctionPlan
  );
  if (
    !invocation ||
    !input.contents.byteLength ||
    input.contents.byteLength > maximumServerFunctionResultBytes
  )
    throw new TypeError('Sandbox Server Function result is invalid.');
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.contents)
    ) as unknown;
  } catch {
    throw new TypeError('Sandbox Server Function result is not valid JSON.');
  }
  const response = readIsolatedServerFunctionExecutionResponse(
    value,
    input.request,
    input.snapshot.serverFunctionPlan
  );
  if (!response)
    throw new TypeError(
      'Sandbox Server Function result violates its canonical contract.'
    );
  const sourceTrace = collectServerFunctionSourceTrace(input.snapshot);
  const contents = new TextEncoder().encode(`${JSON.stringify(response)}\n`);
  return Object.freeze({
    artifactId: `server-function-result:${input.snapshot.contentDigest}:${invocation.requestId}`,
    kind: 'report',
    label: 'Isolated Server Function result',
    mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
    sourceTrace,
    metadata: Object.freeze({
      snapshotDigest: input.snapshot.contentDigest,
      requestId: invocation.requestId,
      artifactId: invocation.functionRef.artifactId,
      exportName: invocation.functionRef.exportName,
      status: response.ok ? 'succeeded' : 'failed',
      ...(response.ok ? {} : { errorCode: response.error.code }),
    }),
    contents,
  });
};
