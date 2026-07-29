import {
  createExecutionRequest,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  type ExecutableProjectSnapshot,
  type ExecutionArtifact,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  createActiveExecutionQuotaPolicy,
  createMemoryRemoteExecutionRepository,
  createMemoryRemoteExecutionSnapshotStore,
  createRemoteExecutionArtifactResolver,
  createRemoteExecutionClient,
  createRemoteExecutionControlPlane,
  createRemotePreviewExecutionProvider,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
  remotePreviewExecutionProviderDescriptor,
  type RemoteExecutionArtifactDescriptor,
  type RemoteExecutionControlPlane,
  type RemoteExecutionPrincipal,
  type RemoteExecutionTransport,
} from '@prodivix/runtime-remote';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestGoldenG3V6RemotePreviewBytes,
  encodeGoldenG3V6RemotePreviewBundle,
  goldenG3V6RemotePreviewSourceTrace,
} from './goldenG3V6RemotePreviewBundle';
import {
  startGoldenG3V6RemotePreviewHost,
  type GoldenG3V6RemotePreviewHost,
} from './goldenG3V6RemotePreviewHost';

const REMOTE_PREVIEW_START_TIME = 1_000_000;
const REMOTE_PREVIEW_ARTIFACT_RETENTION_MS = 60_000;
const REMOTE_PREVIEW_LEASE_DURATION_MS = 30_000;
const REMOTE_PREVIEW_TERMINAL_CURSOR = 5;

const exactAttemptId = (value: string): string => {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 256 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new TypeError(
      'Golden V6 Remote Preview attemptId must be a normalized bounded string.'
    );
  }
  return value;
};

const createControlPlaneTransport = (
  controlPlane: RemoteExecutionControlPlane,
  principal: RemoteExecutionPrincipal
): RemoteExecutionTransport =>
  Object.freeze({
    send: (envelope) => controlPlane.handle(envelope, { principal }),
  });

const waitForProjectedCursor = async (
  provider: ReturnType<typeof createRemotePreviewExecutionProvider>,
  job: Awaited<ReturnType<typeof provider.start>>,
  minimumCursor: number
): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (provider.checkpoint(job).confirmedAfterCursor < minimumCursor) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Golden V6 Remote Preview did not project cursor ${minimumCursor}.`
      );
    }
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, 1);
    });
  }
};

export type GoldenG3V6RemotePreviewEvidence = Readonly<{
  attemptId: string;
  requestId: string;
  executionId: string;
  providerId: string;
  workerId: string;
  workerAttempt: number;
  snapshotId: string;
  snapshotDigest: string;
  snapshotUploadVerified: true;
  resumeCheckpoint: Readonly<{
    confirmedAfterCursor: number;
    generation: number;
  }>;
  terminalCheckpoint: Readonly<{
    confirmedAfterCursor: number;
    generation: number;
  }>;
  terminalStatus: 'succeeded';
  readiness: 'ready';
  health: 'healthy';
  artifactId: string;
  artifactDigest: string;
  artifactSize: number;
  materializedBundleDigest: string;
  materializedOrigin: string;
  materializedEntryUrl: string;
  materializedEntryFilePath: string;
  materializedEntryDigest: string;
  materializedFileCount: number;
}>;

export type GoldenG3V6RemotePreviewCleanupEvidence = Readonly<{
  status: 'clean';
  materializedOriginClosed: true;
  retiredArtifactCount: number;
  artifactUnavailableAfterRetirement: true;
}>;

export type GoldenG3V6RemotePreviewSession = Readonly<{
  origin: string;
  evidence: GoldenG3V6RemotePreviewEvidence;
  isActive(): boolean;
  cleanup(): Promise<GoldenG3V6RemotePreviewCleanupEvidence>;
}>;

/**
 * Runs one Preview Remote attempt through the public Remote control plane and
 * materializes only the resolver-verified PreviewBundle bytes on a new origin.
 */
export const startGoldenG3V6RemotePreviewSession = async (
  input: Readonly<{
    attemptId: string;
    snapshot: ExecutableProjectSnapshot;
    buildBundle: ExecutionBuildBundle;
    excludedOrigins?: readonly string[];
  }>
): Promise<GoldenG3V6RemotePreviewSession> => {
  const attemptId = exactAttemptId(input.attemptId);
  const identityDigest = digestGoldenG3V6RemotePreviewBytes(attemptId);
  const identitySuffix = identityDigest.slice('sha256-'.length, 30);
  const requestId = `golden-v6-remote-preview-request:${identitySuffix}`;
  const executionId = `golden-v6-remote-preview:${identitySuffix}`;
  const workerId = `golden-v6-remote-preview-worker:${identitySuffix}`;
  const artifactId = `preview-bundle:${identitySuffix}`;
  const principal: RemoteExecutionPrincipal = Object.freeze({
    subjectId: `golden-v6-remote-preview-owner:${identitySuffix}`,
    scopes: Object.freeze(['remote-execution:*']),
  });
  let currentTime = REMOTE_PREVIEW_START_TIME;
  let executionIdIssued = false;
  let leaseSequence = 0;
  const repository = createMemoryRemoteExecutionRepository();
  const snapshots = createMemoryRemoteExecutionSnapshotStore();
  const controlPlane = createRemoteExecutionControlPlane({
    repository,
    snapshots,
    authorization: createScopeRemoteExecutionAuthorizationPolicy(),
    quota: createActiveExecutionQuotaPolicy(1),
    router: createStaticRemoteExecutionProviderRouter(
      Object.freeze([remotePreviewExecutionProviderDescriptor])
    ),
    now: () => currentTime,
    createExecutionId: () => {
      if (executionIdIssued) {
        throw new Error(
          'Golden V6 Remote Preview allocated more than one execution.'
        );
      }
      executionIdIssued = true;
      return executionId;
    },
    createLeaseToken: () =>
      `golden-v6-remote-preview-lease:${identitySuffix}:${++leaseSequence}`,
  });
  const client = createRemoteExecutionClient({
    transport: createControlPlaneTransport(controlPlane, principal),
    retryPolicy: { maxAttempts: 1 },
  });
  const previewBytes = encodeGoldenG3V6RemotePreviewBundle(
    input.snapshot,
    input.buildBundle
  );
  const previewDigest = digestGoldenG3V6RemotePreviewBytes(previewBytes);
  const artifactExpiresAt =
    REMOTE_PREVIEW_START_TIME + REMOTE_PREVIEW_ARTIFACT_RETENTION_MS;
  let hostToClean: GoldenG3V6RemotePreviewHost | undefined;
  let materialized:
    | Readonly<{
        artifact: ExecutionArtifact;
        bundle: Awaited<
          ReturnType<
            ReturnType<
              typeof createRemoteExecutionArtifactResolver
            >['resolvePreviewBundle']
          >
        >['bundle'];
        host: GoldenG3V6RemotePreviewHost;
      }>
    | undefined;
  const artifactResolver = createRemoteExecutionArtifactResolver({
    client,
    now: () => currentTime,
    contentTransport: Object.freeze({
      async download({
        executionId: requestedExecutionId,
        artifactId: requestedArtifactId,
        maximumBytes,
      }) {
        const blob = await controlPlane.getArtifact({
          principal,
          executionId: requestedExecutionId,
          artifactId: requestedArtifactId,
        });
        if (!blob || blob.contents.byteLength > maximumBytes) {
          throw new Error(
            'Golden V6 Remote Preview artifact contents are unavailable.'
          );
        }
        return blob.contents;
      },
    }),
  });
  const provider = createRemotePreviewExecutionProvider({
    client,
    resolveSnapshot: (request) => {
      if (
        request.requestId !== requestId ||
        request.workspace.snapshotId !== input.snapshot.workspace.snapshotId
      ) {
        throw new Error(
          'Golden V6 Remote Preview provider requested an unexpected snapshot.'
        );
      }
      return Object.freeze({
        kind: 'upload' as const,
        snapshot: input.snapshot,
      });
    },
    pollIntervalMs: 1,
    eventPageSize: 16,
    maximumReconnectAttempts: 1,
    delay: async () =>
      new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, 1);
      }),
    materializeArtifact: async ({
      executionId: requestedExecutionId,
      snapshotDigest,
      artifact,
    }) => {
      if (materialized) {
        throw new Error(
          'Golden V6 Remote Preview materialized more than one bundle.'
        );
      }
      const resolved = await artifactResolver.resolvePreviewBundle({
        executionId: requestedExecutionId,
        artifactId: artifact.artifactId,
        snapshotDigest,
      });
      const host = await startGoldenG3V6RemotePreviewHost(
        resolved.bundle,
        input.excludedOrigins ?? Object.freeze([])
      );
      hostToClean = host;
      materialized = Object.freeze({
        artifact: resolved.artifact,
        bundle: resolved.bundle,
        host,
      });
      return Object.freeze({ ...artifact, uri: `${host.origin}/` });
    },
  });
  try {
    const request = createExecutionRequest({
      requestId,
      profile: 'preview',
      runtimeZone: 'client',
      workspace: input.snapshot.workspace,
      invocation: Object.freeze({
        kind: 'workspace' as const,
        targetRef: Object.freeze({
          kind: 'workspace' as const,
          workspaceId: input.snapshot.workspace.workspaceId,
        }),
      }),
      requiredCapabilities: input.snapshot.capabilityRequirements.preview,
      timeoutMs: 30_000,
    });
    const job = await provider.start(request);
    if (job.id !== executionId) {
      throw new Error(
        'Golden V6 Remote Preview provider returned an unexpected execution.'
      );
    }
    const storedSnapshot = await snapshots.get(
      principal.subjectId,
      input.snapshot.workspace.snapshotId,
      input.snapshot.contentDigest
    );
    if (
      !storedSnapshot ||
      !sameCanonicalJson(storedSnapshot.snapshot, input.snapshot) ||
      storedSnapshot.contentDigest !== input.snapshot.contentDigest
    ) {
      throw new Error(
        'Golden V6 Remote Preview did not persist the exact uploaded snapshot.'
      );
    }

    const claimed = await controlPlane.claimNext({
      workerId,
      providerId: remotePreviewExecutionProviderDescriptor.id,
      leaseDurationMs: REMOTE_PREVIEW_LEASE_DURATION_MS,
    });
    if (
      !claimed ||
      claimed.execution.record.executionId !== executionId ||
      claimed.execution.record.snapshotDigest !== input.snapshot.contentDigest
    ) {
      throw new Error(
        'Golden V6 Remote Preview worker did not claim the exact execution.'
      );
    }
    await waitForProjectedCursor(provider, job, 2);
    const resumeCheckpoint = provider.checkpoint(job);
    if (
      resumeCheckpoint.confirmedAfterCursor !== 2 ||
      resumeCheckpoint.generation !== 1
    ) {
      throw new Error(
        'Golden V6 Remote Preview running checkpoint is not exact.'
      );
    }
    await provider.resume({ job, checkpoint: resumeCheckpoint });
    await controlPlane.transition({
      executionId,
      workerId,
      leaseToken: claimed.lease.token,
      status: 'running',
    });

    const artifactDescriptor: RemoteExecutionArtifactDescriptor = Object.freeze(
      {
        artifactId,
        kind: 'bundle',
        label: 'Golden G3 V6 Remote Preview bundle',
        mediaType: EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
        size: previewBytes.byteLength,
        digest: previewDigest,
        expiresAt: artifactExpiresAt,
        authorizationScope: `execution:${executionId}`,
        sourceTrace: goldenG3V6RemotePreviewSourceTrace(input.snapshot),
        metadata: Object.freeze({
          snapshotDigest: input.snapshot.contentDigest,
          readiness: 'ready',
          health: 'healthy',
          entryFilePath: input.snapshot.previewPlan.entryFilePath,
        }),
      }
    );
    const storedArtifact = await controlPlane.putArtifact({
      executionId,
      workerId,
      leaseToken: claimed.lease.token,
      workerEventId: `preview-bundle:${identitySuffix}`,
      descriptor: artifactDescriptor,
      contents: previewBytes,
    });
    if (storedArtifact.kind !== 'stored') {
      throw new Error(
        `Golden V6 Remote Preview artifact was not stored: ${storedArtifact.kind}.`
      );
    }
    await controlPlane.transition({
      executionId,
      workerId,
      leaseToken: claimed.lease.token,
      status: 'succeeded',
    });

    const completion = await job.completion;
    if (completion.status !== 'succeeded') {
      throw new Error(
        `Golden V6 Remote Preview failed: ${canonicalJsonText(completion)}`
      );
    }
    const resolvedMaterialization = materialized;
    if (!resolvedMaterialization) {
      throw new Error(
        'Golden V6 Remote Preview did not materialize its artifact.'
      );
    }
    const terminalCheckpoint = provider.checkpoint(job);
    const terminalRecord = await client.get(executionId);
    const terminalEvents = await client.readEvents({
      executionId,
      afterCursor: 0,
      limit: 16,
    });
    const terminalEvent = terminalEvents.events.at(-1)?.event;
    if (
      terminalCheckpoint.confirmedAfterCursor !==
        REMOTE_PREVIEW_TERMINAL_CURSOR ||
      terminalCheckpoint.generation !== 2 ||
      terminalRecord.status !== 'succeeded' ||
      terminalRecord.latestCursor !== REMOTE_PREVIEW_TERMINAL_CURSOR ||
      terminalEvents.latestCursor !== REMOTE_PREVIEW_TERMINAL_CURSOR ||
      terminalEvents.hasMore ||
      terminalEvents.events.length !== REMOTE_PREVIEW_TERMINAL_CURSOR ||
      terminalEvents.events.some(
        ({ cursor, event }, index) =>
          cursor !== index + 1 ||
          event.sequence !== cursor ||
          event.jobId !== executionId
      ) ||
      terminalEvent?.kind !== 'state' ||
      terminalEvent.snapshot.status !== 'succeeded'
    ) {
      throw new Error(
        'Golden V6 Remote Preview cursor or terminal projection is incomplete.'
      );
    }
    const projectedArtifact = completion.artifacts.find(
      (artifact) => artifact.artifactId === artifactId
    );
    if (
      !projectedArtifact ||
      projectedArtifact.digest !== previewDigest ||
      projectedArtifact.uri !== `${resolvedMaterialization.host.origin}/` ||
      resolvedMaterialization.artifact.digest !== previewDigest ||
      resolvedMaterialization.bundle.snapshotDigest !==
        input.snapshot.contentDigest
    ) {
      throw new Error(
        'Golden V6 Remote Preview materialization drifted from the durable bundle.'
      );
    }

    const evidence: GoldenG3V6RemotePreviewEvidence = Object.freeze({
      attemptId,
      requestId,
      executionId,
      providerId: remotePreviewExecutionProviderDescriptor.id,
      workerId,
      workerAttempt: claimed.lease.attempt,
      snapshotId: input.snapshot.workspace.snapshotId,
      snapshotDigest: input.snapshot.contentDigest,
      snapshotUploadVerified: true,
      resumeCheckpoint: Object.freeze({
        confirmedAfterCursor: resumeCheckpoint.confirmedAfterCursor,
        generation: resumeCheckpoint.generation,
      }),
      terminalCheckpoint: Object.freeze({
        confirmedAfterCursor: terminalCheckpoint.confirmedAfterCursor,
        generation: terminalCheckpoint.generation,
      }),
      terminalStatus: 'succeeded',
      readiness: 'ready',
      health: 'healthy',
      artifactId,
      artifactDigest: previewDigest,
      artifactSize: previewBytes.byteLength,
      materializedBundleDigest: previewDigest,
      materializedOrigin: resolvedMaterialization.host.origin,
      materializedEntryUrl: resolvedMaterialization.host.entryUrl,
      materializedEntryFilePath: resolvedMaterialization.bundle.entryFilePath,
      materializedEntryDigest: resolvedMaterialization.host.entryDigest,
      materializedFileCount: resolvedMaterialization.bundle.files.length,
    });
    let cleanupEvidence: GoldenG3V6RemotePreviewCleanupEvidence | undefined;
    return Object.freeze({
      origin: resolvedMaterialization.host.origin,
      evidence,
      isActive: () => resolvedMaterialization.host.isActive(),
      cleanup: async (): Promise<GoldenG3V6RemotePreviewCleanupEvidence> => {
        if (cleanupEvidence) return cleanupEvidence;
        await resolvedMaterialization.host.close();
        currentTime = artifactExpiresAt + 1;
        const retiredArtifactCount =
          await controlPlane.sweepExpiredArtifacts(16);
        const activeExecutionCount = await repository.countActive(
          principal.subjectId
        );
        const residualArtifact = await controlPlane.getArtifact({
          principal,
          executionId,
          artifactId,
        });
        if (
          resolvedMaterialization.host.isActive() ||
          retiredArtifactCount !== 1 ||
          activeExecutionCount !== 0 ||
          residualArtifact
        ) {
          throw new Error(
            'Golden V6 Remote Preview cleanup left materialized or artifact state.'
          );
        }
        cleanupEvidence = Object.freeze({
          status: 'clean' as const,
          materializedOriginClosed: true as const,
          retiredArtifactCount,
          artifactUnavailableAfterRetirement: true as const,
        });
        return cleanupEvidence;
      },
    });
  } catch (error) {
    await hostToClean?.close();
    throw error;
  }
};
