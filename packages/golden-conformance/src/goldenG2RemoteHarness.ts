import { createHash } from 'node:crypto';
import {
  EXECUTION_BUILD_BUNDLE_FORMAT,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_PREVIEW_BUNDLE_FORMAT,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  readExecutionTestReportValue,
  toExecutionTestReportValue,
  type ExecutableProjectSnapshot,
  type ExecutionArtifact,
  type ExecutionJobEvent,
  type ExecutionJobResult,
  type ExecutionProvider,
  type ExecutionProviderDescriptor,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import {
  createRemoteBuildExecutionProvider,
  createRemotePreviewExecutionProvider,
  createRemoteTestExecutionProvider,
  remoteBuildExecutionProviderDescriptor,
  remotePreviewExecutionProviderDescriptor,
  remoteTestExecutionProviderDescriptor,
  type RemoteExecutionClient,
  type RemoteExecutionRecord,
} from '@prodivix/runtime-remote';
import {
  GOLDEN_G2_REMOTE_PREVIEW_URL,
  GOLDEN_G2_VITEST_REPORT,
  createGoldenG2ExecutionRequest,
  createGoldenG2TestReport,
  goldenG2TestSourceTrace,
  goldenG2WorkspaceSourceTrace,
} from './goldenG2ExecutionFixture';

type GoldenExecutionProfile = 'preview' | 'test' | 'build';

const sha256 = (contents: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const descriptorFor = (
  profile: GoldenExecutionProfile
): ExecutionProviderDescriptor =>
  profile === 'preview'
    ? remotePreviewExecutionProviderDescriptor
    : profile === 'test'
      ? remoteTestExecutionProviderDescriptor
      : remoteBuildExecutionProviderDescriptor;

const stateEvent = (
  execution: RemoteExecutionRecord,
  sequence: number,
  status: RemoteExecutionRecord['status'],
  previousStatus?: RemoteExecutionRecord['status']
): ExecutionJobEvent => ({
  kind: 'state',
  jobId: execution.executionId,
  sequence,
  emittedAt: execution.createdAt + sequence,
  ...(previousStatus ? { previousStatus } : {}),
  snapshot: {
    jobId: execution.executionId,
    requestId: execution.requestId,
    providerId: execution.provider.id,
    status,
    latestEventSequence: sequence,
    createdAt: execution.createdAt,
    ...(status === 'queued' ? {} : { startedAt: execution.createdAt + 1 }),
    ...(status === 'succeeded'
      ? { completedAt: execution.createdAt + sequence }
      : {}),
  },
});

const artifactFor = (
  snapshot: ExecutableProjectSnapshot,
  profile: GoldenExecutionProfile,
  report: ExecutionTestReport
): ExecutionArtifact => {
  if (profile === 'preview')
    return Object.freeze({
      artifactId: 'golden-preview-bundle',
      kind: 'bundle',
      label: 'Golden Remote Preview',
      mediaType: EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
      size: 1_024,
      digest: sha256('golden-preview-bundle'),
      sourceTrace: goldenG2WorkspaceSourceTrace(snapshot),
      metadata: Object.freeze({
        format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
        snapshotDigest: snapshot.contentDigest,
        entryFilePath: snapshot.previewPlan.entryFilePath,
        readiness: 'ready',
        health: 'healthy',
      }),
    });
  if (profile === 'build')
    return Object.freeze({
      artifactId: 'golden-build-bundle',
      kind: 'bundle',
      label: 'Golden Remote Build',
      mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
      size: 2_048,
      digest: sha256('golden-build-bundle'),
      sourceTrace: goldenG2WorkspaceSourceTrace(snapshot),
      metadata: Object.freeze({
        format: EXECUTION_BUILD_BUNDLE_FORMAT,
        snapshotDigest: snapshot.contentDigest,
        presetId: snapshot.target.presetId,
      }),
    });
  return Object.freeze({
    artifactId: 'golden-test-report',
    kind: 'report',
    label: 'Golden Remote Test',
    mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
    size: GOLDEN_G2_VITEST_REPORT.length,
    digest: sha256(GOLDEN_G2_VITEST_REPORT),
    sourceTrace: goldenG2TestSourceTrace(snapshot),
    metadata: Object.freeze({
      snapshotDigest: snapshot.contentDigest,
      status: report.status,
    }),
  });
};

const eventsFor = (
  execution: RemoteExecutionRecord,
  artifact: ExecutionArtifact,
  profile: GoldenExecutionProfile,
  report: ExecutionTestReport,
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionJobEvent[] => {
  const base: ExecutionJobEvent[] = [
    stateEvent(execution, 1, 'queued'),
    stateEvent(execution, 2, 'running', 'queued'),
    {
      kind: 'artifact',
      jobId: execution.executionId,
      sequence: 3,
      emittedAt: 3_003,
      artifact,
    },
  ];
  if (profile === 'test') {
    base.push({
      kind: 'trace',
      jobId: execution.executionId,
      sequence: 4,
      emittedAt: 3_004,
      trace: {
        traceId: 'golden-test-report-trace',
        spanId: 'golden-test-report-span',
        name: EXECUTION_TEST_REPORT_TRACE_NAME,
        phase: 'end',
        detail: toExecutionTestReportValue(report),
        sourceTrace: goldenG2TestSourceTrace(snapshot),
      },
    });
    base.push(stateEvent(execution, 5, 'succeeded', 'running'));
  } else {
    base.push(stateEvent(execution, 4, 'succeeded', 'running'));
  }
  return Object.freeze(base);
};

const createGoldenRemoteClient = (
  snapshot: ExecutableProjectSnapshot,
  profile: GoldenExecutionProfile,
  report: ExecutionTestReport
) => {
  const provider = descriptorFor(profile);
  const execution: RemoteExecutionRecord = Object.freeze({
    executionId: `golden-remote-${profile}`,
    requestId: `golden-${profile}`,
    snapshotDigest: snapshot.contentDigest,
    provider,
    status: 'succeeded',
    latestCursor: profile === 'test' ? 5 : 4,
    createdAt: 3_000,
    startedAt: 3_001,
    completedAt: profile === 'test' ? 3_005 : 3_004,
  });
  const artifact = artifactFor(snapshot, profile, report);
  const events = eventsFor(execution, artifact, profile, report, snapshot);
  const uploadedDigests: string[] = [];
  const client = {
    negotiate: async () => 1 as const,
    create: async (input) => {
      if (
        input.snapshot.kind !== 'upload' ||
        input.snapshot.snapshot !== snapshot
      )
        throw new Error('Golden Remote provider did not receive the snapshot.');
      uploadedDigests.push(input.snapshot.snapshot.contentDigest);
      return { execution };
    },
    get: async () => execution,
    cancel: async ({ executionId, cancellationId }) => ({
      executionId,
      cancellationId,
      result: { status: 'already-terminal' },
    }),
    readEvents: async ({ afterCursor, limit = 200 }) => {
      const page = events.slice(afterCursor, afterCursor + limit);
      return {
        executionId: execution.executionId,
        providerId: provider.id,
        afterCursor,
        latestCursor: events.length,
        hasMore: afterCursor + page.length < events.length,
        events: page.map((event) => ({ cursor: event.sequence, event })),
      };
    },
    resolveArtifact: async ({ executionId, artifactId }) => ({
      executionId,
      providerId: provider.id,
      artifact: {
        artifactId,
        kind: artifact.kind,
        mediaType: artifact.mediaType ?? 'application/octet-stream',
        size: artifact.size ?? 0,
        digest: artifact.digest ?? sha256('empty'),
        expiresAt: 60_000,
        authorizationScope: `execution:${executionId}`,
      },
    }),
  } satisfies RemoteExecutionClient;
  return Object.freeze({ client: Object.freeze(client), uploadedDigests });
};

const providerFor = (
  profile: GoldenExecutionProfile,
  client: RemoteExecutionClient,
  snapshot: ExecutableProjectSnapshot
): ExecutionProvider => {
  const options = {
    client,
    resolveSnapshot: () => ({ kind: 'upload' as const, snapshot }),
    delay: async () => undefined,
  };
  if (profile === 'preview')
    return createRemotePreviewExecutionProvider({
      ...options,
      materializeArtifact: async ({ artifact }) =>
        Object.freeze({ ...artifact, uri: GOLDEN_G2_REMOTE_PREVIEW_URL }),
    });
  return profile === 'test'
    ? createRemoteTestExecutionProvider(options)
    : createRemoteBuildExecutionProvider(options);
};

const testReportFromEvents = (
  events: readonly ExecutionJobEvent[]
): ExecutionTestReport => {
  const event = events.find(
    (candidate) =>
      candidate.kind === 'trace' &&
      candidate.trace.name === EXECUTION_TEST_REPORT_TRACE_NAME
  );
  if (event?.kind !== 'trace')
    throw new Error('Golden Remote Test did not publish a report trace.');
  const report = readExecutionTestReportValue(event.trace.detail);
  if (!report) throw new Error('Golden Remote Test report trace is invalid.');
  return report;
};

type GoldenRemoteProfileResult = Readonly<{
  provider: ExecutionProviderDescriptor;
  artifact: ExecutionArtifact;
  result: ExecutionJobResult;
  report?: ExecutionTestReport;
  uploadedDigests: readonly string[];
}>;

export type GoldenG2RemoteMatrixResult = Readonly<{
  uploadedDigests: readonly string[];
  preview: GoldenRemoteProfileResult;
  test: GoldenRemoteProfileResult & Readonly<{ report: ExecutionTestReport }>;
  build: GoldenRemoteProfileResult;
}>;

const runProfile = async (
  snapshot: ExecutableProjectSnapshot,
  profile: GoldenExecutionProfile
): Promise<GoldenRemoteProfileResult> => {
  const report = createGoldenG2TestReport(snapshot, `golden-remote-${profile}`);
  const harness = createGoldenRemoteClient(snapshot, profile, report);
  const provider = providerFor(profile, harness.client, snapshot);
  const job = await provider.start(
    createGoldenG2ExecutionRequest(snapshot, profile)
  );
  const events: ExecutionJobEvent[] = [];
  job.subscribe((event) => events.push(event));
  const result = await job.completion;
  const artifact = result.artifacts[0];
  if (!artifact)
    throw new Error(`Golden Remote ${profile} published no artifact.`);
  return Object.freeze({
    provider: provider.descriptor,
    artifact,
    result,
    ...(profile === 'test' ? { report: testReportFromEvents(events) } : {}),
    uploadedDigests: Object.freeze(harness.uploadedDigests),
  });
};

/** Replays one Golden snapshot through independent Remote Preview/Test/Build providers. */
export const runGoldenG2RemoteMatrix = async (
  snapshot: ExecutableProjectSnapshot
): Promise<GoldenG2RemoteMatrixResult> => {
  const [preview, test, build] = await Promise.all([
    runProfile(snapshot, 'preview'),
    runProfile(snapshot, 'test'),
    runProfile(snapshot, 'build'),
  ]);
  if (!test.report)
    throw new Error('Golden Remote Test report projection is missing.');
  return Object.freeze({
    uploadedDigests: Object.freeze([
      ...preview.uploadedDigests,
      ...test.uploadedDigests,
      ...build.uploadedDigests,
    ]),
    preview,
    test: Object.freeze({ ...test, report: test.report }),
    build,
  });
};
