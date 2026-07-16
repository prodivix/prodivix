import {
  createDataOperationAdapterRegistry,
  executeDataOperation,
  type DataOperation,
  type DataOperationInvocation,
  type DataSourceDefinition,
  type ExecuteDataOperationResult,
} from '@prodivix/data';
import {
  createDataHttpAdapter,
  type DataHttpTransport,
} from '@prodivix/data-http';
import {
  createDataMockRuntimeSession,
  createDataMockRuntimeSessionFromSnapshot,
  createMemoryDataMockFixtureStore,
  type DataMockFixture,
  type DataMockCollection,
  type DataMockScheduler,
  type DataMockRuntimeSession,
} from '@prodivix/data-mock';
import {
  createBrowserNetworkAdapter,
  type CreateBrowserNetworkAdapterOptions,
} from '@prodivix/runtime-browser';
import type {
  ExecutableProjectSnapshot,
  ExecutionNetworkTrace,
} from '@prodivix/runtime-core';

export type BrowserDataExecutionEnvironment = Readonly<{
  execute(input: {
    invocation: DataOperationInvocation;
    source: DataSourceDefinition;
    operation: DataOperation;
    signal: AbortSignal;
    publishNetworkTrace?(trace: ExecutionNetworkTrace): void;
  }): Promise<ExecuteDataOperationResult>;
  dispose(): void;
}>;

export type BrowserDataMockProvision = Readonly<{
  fixtureSetId: string;
  fixtures: readonly DataMockFixture[];
  emulatedAdapterIds?: readonly string[];
  scheduler?: DataMockScheduler;
  namespaceId?: string;
  collections?: readonly DataMockCollection[];
}>;

export type CreateBrowserDataExecutionEnvironmentOptions =
  CreateBrowserNetworkAdapterOptions &
    Readonly<{
      publishNetworkTrace?(trace: ExecutionNetworkTrace): void;
      mock?: BrowserDataMockProvision;
      snapshot?: ExecutableProjectSnapshot;
      mockNamespaceId?: string;
    }>;

export type CreateBrowserTestDataExecutionEnvironmentOptions =
  CreateBrowserDataExecutionEnvironmentOptions &
    Readonly<{
      allowLive?: boolean;
    }>;

/** Composes protocol-neutral Data execution with the browser fetch boundary without moving ownership into Web. */
export const createBrowserDataExecutionEnvironment = (
  options: CreateBrowserDataExecutionEnvironmentOptions = {}
): BrowserDataExecutionEnvironment => {
  const registry = createDataOperationAdapterRegistry();
  const network = createBrowserNetworkAdapter(options);
  registry.register(
    createDataHttpAdapter({ transport: network as DataHttpTransport })
  );
  if (options.mock && options.snapshot?.dataMockProvision)
    throw new TypeError(
      'Browser Data execution cannot combine direct and snapshot mock provisioning.'
    );
  let mockSession: DataMockRuntimeSession | undefined;
  if (options.mock) {
    mockSession = createDataMockRuntimeSession({
      fixtureStore: createMemoryDataMockFixtureStore(options.mock),
      emulatedAdapterIds: options.mock.emulatedAdapterIds ?? ['core.http'],
      ...(options.mock.scheduler ? { scheduler: options.mock.scheduler } : {}),
      ...(options.mock.namespaceId
        ? { namespaceId: options.mock.namespaceId }
        : {}),
      ...(options.mock.collections
        ? { collections: options.mock.collections }
        : {}),
    });
    registry.register(mockSession.adapter);
  } else if (options.snapshot?.dataMockProvision) {
    mockSession = createDataMockRuntimeSessionFromSnapshot({
      snapshot: options.snapshot,
      ...(options.mockNamespaceId
        ? { namespaceId: options.mockNamespaceId }
        : {}),
    });
    registry.register(mockSession.adapter);
  }
  return Object.freeze({
    execute: (input) =>
      executeDataOperation({
        registry,
        invocation: input.invocation,
        source: input.source,
        operation: input.operation,
        signal: input.signal,
        publishNetworkTrace(trace) {
          options.publishNetworkTrace?.(trace);
          input.publishNetworkTrace?.(trace);
        },
      }),
    dispose() {
      mockSession?.dispose();
    },
  });
};

/** Browser Test uses fixture mode by default; live access requires an explicit environment opt-in. */
export const createBrowserTestDataExecutionEnvironment = (
  options: CreateBrowserTestDataExecutionEnvironmentOptions
): BrowserDataExecutionEnvironment => {
  if (!options.mock && !options.snapshot?.dataMockProvision)
    throw new Error(
      'Browser Test Data execution requires deterministic fixture provisioning.'
    );
  const environment = createBrowserDataExecutionEnvironment(options);
  return Object.freeze({
    execute(input) {
      if (input.invocation.mode === 'live' && options.allowLive !== true)
        throw new Error(
          'Browser Test Data execution denies live mode without explicit opt-in.'
        );
      return environment.execute(input);
    },
    dispose: environment.dispose,
  });
};
