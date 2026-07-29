import {
  assertExecutableProjectCapabilitySupport,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  getExecutionProviderCompatibility,
  type ExecutionArtifact,
  type ExecutionJob,
  type ExecutionJobController,
  type ExecutionProvider,
  type ExecutionProviderDescriptor,
  type ExecutionRequest,
} from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { RemoteExecutionRecoveryRequiredError } from './remoteExecutionClient';
import {
  assertRemoteExecutionProjectionCheckpoint,
  createRemoteExecutionProjectionCheckpoint,
  isRemoteExecutionProjectionActive,
  REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT,
  REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION,
  type RemoteExecutionProjectionCheckpoint,
  type RemoteExecutionProjectionState,
} from './remoteExecutionProviderProjection';
import { synchronizeRemoteExecutionProjection } from './remoteExecutionProviderSynchronization';
import { acceptedRemoteExecutionProviderMatches } from './remoteExecutionProviderValidation';
import type {
  RemoteExecutionClient,
  RemoteExecutionSnapshotSource,
} from './remoteExecutionProtocol.types';
import { REMOTE_EXECUTION_PROTOCOL_LIMITS } from './remoteExecutionProtocol.types';

export const REMOTE_PREVIEW_EXECUTION_PROVIDER_ID = 'prodivix.remote.preview';
export const REMOTE_TEST_EXECUTION_PROVIDER_ID = 'prodivix.remote.test';
export const REMOTE_BUILD_EXECUTION_PROVIDER_ID = 'prodivix.remote.build';
export const REMOTE_SERVER_FUNCTION_EXECUTION_PROVIDER_ID =
  'prodivix.remote.server-function';

export {
  REMOTE_EXECUTION_PROJECTION_CHECKPOINT_FORMAT,
  REMOTE_EXECUTION_PROJECTION_CHECKPOINT_VERSION,
};
export type { RemoteExecutionProjectionCheckpoint };

export type RemoteExecutionProvider = ExecutionProvider &
  Readonly<{
    checkpoint(job: ExecutionJob): RemoteExecutionProjectionCheckpoint;
    resume(
      input: Readonly<{
        job: ExecutionJob;
        checkpoint: RemoteExecutionProjectionCheckpoint;
      }>
    ): Promise<ExecutionJob>;
  }>;

const commonCapabilities = [
  'artifacts',
  'cancellation',
  'dependency-install',
  'diagnostics',
  'filesystem',
  'network',
  'source-trace',
  'streaming-logs',
  'timeout',
] as const;

export const remotePreviewExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_PREVIEW_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Preview',
    isolation: 'remote-isolated',
    profiles: ['preview'],
    runtimeZones: ['client'],
    invocationKinds: ['workspace', 'route'],
    capabilities: [
      ...commonCapabilities,
      'console',
      'data-stream',
      'environment-binding',
      'server-function',
      'terminal',
    ],
  });

export const remoteTestExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_TEST_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Test',
    isolation: 'remote-isolated',
    profiles: ['test'],
    runtimeZones: ['test'],
    invocationKinds: ['test'],
    capabilities: [...commonCapabilities, 'server-function', 'test'],
  });

export const remoteBuildExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_BUILD_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Build',
    isolation: 'remote-isolated',
    profiles: ['build'],
    runtimeZones: ['build'],
    invocationKinds: ['build'],
    capabilities: [...commonCapabilities, 'build'],
  });

export const remoteServerFunctionExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_SERVER_FUNCTION_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Server Function',
    isolation: 'remote-isolated',
    profiles: ['production'],
    runtimeZones: ['server'],
    invocationKinds: ['code'],
    capabilities: [
      'artifacts',
      'cancellation',
      'dependency-install',
      'diagnostics',
      'filesystem',
      'server-function',
      'source-trace',
      'streaming-logs',
      'timeout',
    ],
  });

export type ResolveRemoteExecutionSnapshot = (
  request: ExecutionRequest
) => RemoteExecutionSnapshotSource | Promise<RemoteExecutionSnapshotSource>;

export type CreateRemoteExecutionProviderOptions = Readonly<{
  descriptor: ExecutionProviderDescriptor;
  client: RemoteExecutionClient;
  resolveSnapshot: ResolveRemoteExecutionSnapshot;
  pollIntervalMs?: number;
  eventPageSize?: number;
  maximumReconnectAttempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
  createCancellationId?: (
    executionId: string,
    request: ExecutionRequest
  ) => string;
  materializeArtifact?: (
    input: Readonly<{
      executionId: string;
      snapshotDigest: string;
      artifact: ExecutionArtifact;
    }>
  ) => ExecutionArtifact | Promise<ExecutionArtifact>;
}>;

const defaultDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = (
      globalThis as unknown as {
        setTimeout(callback: () => void, delay: number): unknown;
      }
    ).setTimeout;
    timer(resolve, milliseconds);
  });

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
};

/** Projects durable Remote execution state into the canonical provider/job contract. */
export const createRemoteExecutionProvider = (
  options: CreateRemoteExecutionProviderOptions
): RemoteExecutionProvider => {
  if (options.descriptor.isolation !== 'remote-isolated')
    throw new TypeError(
      'Remote provider must declare remote-isolated isolation.'
    );
  if (!options.descriptor.capabilities.includes('cancellation'))
    throw new TypeError(
      'Remote provider projection requires cancellation capability.'
    );
  const pollIntervalMs = positiveSafeInteger(
    options.pollIntervalMs ?? 250,
    'Remote provider poll interval'
  );
  const eventPageSize = positiveSafeInteger(
    options.eventPageSize ?? 200,
    'Remote provider event page size'
  );
  if (eventPageSize > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxArrayEntries)
    throw new TypeError(
      'Remote provider event page size exceeds protocol limits.'
    );
  const maximumReconnectAttempts = positiveSafeInteger(
    options.maximumReconnectAttempts ?? 3,
    'Remote provider maximum reconnect attempts'
  );
  const delay = options.delay ?? defaultDelay;
  const projections = new WeakMap<
    ExecutionJob,
    RemoteExecutionProjectionState
  >();

  const startSynchronization = (
    state: RemoteExecutionProjectionState
  ): void => {
    void synchronizeRemoteExecutionProjection({
      client: options.client,
      state,
      generation: state.generation,
      pollIntervalMs,
      eventPageSize,
      maximumReconnectAttempts,
      delay,
      ...(options.materializeArtifact
        ? { materializeArtifact: options.materializeArtifact }
        : {}),
    });
  };

  const provider: RemoteExecutionProvider = Object.freeze({
    descriptor: options.descriptor,
    async start(request) {
      if (
        request.profile === 'test' &&
        (request.environment !== undefined ||
          request.requiredCapabilities.includes('environment-binding'))
      )
        throw new TypeError(
          'Remote Test is mock-only and cannot accept an environment binding.'
        );
      const compatibility = getExecutionProviderCompatibility(
        options.descriptor,
        request
      );
      if (!compatibility.compatible)
        throw new Error(
          'Remote execution provider cannot satisfy this request.'
        );
      const snapshot = await options.resolveSnapshot(request);
      const trustedServerFunctionSourceTrace =
        snapshot.kind === 'upload'
          ? snapshot.snapshot.files.flatMap((file) => file.sourceTrace ?? [])
          : undefined;
      if (snapshot.kind === 'upload') {
        if (
          request.profile === 'production' &&
          !snapshot.snapshot.serverFunctionPlan
        ) {
          throw new TypeError(
            'Remote Server Function execution requires an isolated production plan.'
          );
        }
        assertExecutableProjectCapabilitySupport(
          snapshot.snapshot,
          request.profile,
          options.descriptor.capabilities
        );
        if (request.profile === 'test') {
          const requestRequiresServerFunction =
            request.requiredCapabilities.includes('server-function');
          const snapshotRequiresServerFunction =
            snapshot.snapshot.capabilityRequirements.test.includes(
              'server-function'
            );
          if (
            requestRequiresServerFunction !== snapshotRequiresServerFunction ||
            snapshotRequiresServerFunction !==
              Boolean(snapshot.snapshot.serverRuntimeMockProvision)
          )
            throw new TypeError(
              'Remote Test Server Function capability does not match its deterministic runtime provision.'
            );
        }
      }
      const { execution } = await options.client.create({ request, snapshot });
      if (
        !acceptedRemoteExecutionProviderMatches(
          options.descriptor,
          execution.provider
        )
      ) {
        throw new RemoteExecutionRecoveryRequiredError(
          'Remote router selected an unexpected provider identity.',
          'create'
        );
      }
      const controller: ExecutionJobController = createExecutionJobController({
        jobId: execution.executionId,
        request,
        provider: options.descriptor,
        requestCancellation: async ({ reason }) => {
          const cancellationId = (
            options.createCancellationId ??
            ((executionId, executionRequest) =>
              `${executionRequest.requestId}:${executionId}:cancel`)
          )(execution.executionId, request);
          if (
            cancellationId !== cancellationId.trim() ||
            !cancellationId ||
            cancellationId.length >
              REMOTE_EXECUTION_PROTOCOL_LIMITS.maxIdentifierLength
          )
            throw new TypeError('Remote cancellation identity is invalid.');
          const cancellation = await options.client.cancel({
            executionId: execution.executionId,
            cancellationId,
            ...(reason ? { reason } : {}),
          });
          switch (cancellation.result.status) {
            case 'accepted':
            case 'already-requested':
            case 'already-terminal':
              return 'accepted';
            case 'unsupported':
              return 'unsupported';
            case 'rejected':
              throw new Error(
                cancellation.result.reason ??
                  'Remote execution cancellation was rejected.'
              );
          }
        },
      });
      const state: RemoteExecutionProjectionState = {
        controller,
        record: execution,
        cursor: 0,
        generation: 1,
        remoteStatus: 'queued',
        buildBundlePublished: false,
        previewBundlePublished: false,
        serverFunctionTracePublished: false,
        testServerFunctionTraceCount: 0,
        ...(trustedServerFunctionSourceTrace
          ? { trustedServerFunctionSourceTrace }
          : {}),
      };
      projections.set(controller.job, state);
      startSynchronization(state);
      return controller.job;
    },
    checkpoint(job) {
      const state = projections.get(job);
      if (!state) {
        throw new TypeError(
          'Remote projection checkpoint requires a Job owned by this provider.'
        );
      }
      return createRemoteExecutionProjectionCheckpoint(state);
    },
    async resume({ job, checkpoint }) {
      const state = projections.get(job);
      if (!state) {
        throw new TypeError(
          'Remote projection resume requires a Job owned by this provider.'
        );
      }
      assertRemoteExecutionProjectionCheckpoint(state, checkpoint);
      if (
        state.lastResumeCheckpoint &&
        sameCanonicalJson(state.lastResumeCheckpoint, checkpoint)
      ) {
        return job;
      }
      if (
        !isRemoteExecutionProjectionActive(state.controller) ||
        !sameCanonicalJson(
          createRemoteExecutionProjectionCheckpoint(state),
          checkpoint
        )
      ) {
        throw new RemoteExecutionRecoveryRequiredError(
          'Remote projection resume checkpoint is stale or no longer active.',
          'events.read'
        );
      }
      state.lastResumeCheckpoint = Object.freeze({ ...checkpoint });
      state.generation += 1;
      startSynchronization(state);
      return job;
    },
  });
  return provider;
};

type StandardRemoteExecutionProviderOptions = Omit<
  CreateRemoteExecutionProviderOptions,
  'descriptor'
>;

export const createRemotePreviewExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): RemoteExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remotePreviewExecutionProviderDescriptor,
  });

export const createRemoteTestExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): RemoteExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteTestExecutionProviderDescriptor,
  });

export const createRemoteBuildExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): RemoteExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteBuildExecutionProviderDescriptor,
  });

export const createRemoteServerFunctionExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): RemoteExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteServerFunctionExecutionProviderDescriptor,
  });
