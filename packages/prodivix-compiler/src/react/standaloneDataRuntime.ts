import type { DataOperationKind } from '@prodivix/data';
import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { ExportModule } from '#src/export/types';

export const WORKSPACE_DATA_RUNTIME_MODULE_ID = 'workspace-data-runtime';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const operationKinds = (
  workspace: WorkspaceSnapshot
): Readonly<Record<string, Readonly<Record<string, DataOperationKind>>>> =>
  Object.freeze(
    Object.fromEntries(
      Object.values(workspace.docsById)
        .filter((document) => document.type === 'data-source')
        .sort((left, right) => compareText(left.id, right.id))
        .flatMap((document) => {
          const read = decodeWorkspaceDataSourceDocument(document);
          if (read.status !== 'valid') return [];
          return [
            [
              document.id,
              Object.freeze(
                Object.fromEntries(
                  Object.values(read.decodedContent.operationsById)
                    .sort((left, right) => compareText(left.id, right.id))
                    .map((operation) => [operation.id, operation.kind])
                )
              ),
            ],
          ];
        })
    )
  );

const source = (
  workspace: WorkspaceSnapshot
): string => `type DataOperationReference = Readonly<{
  documentId: string;
  operationId: string;
}>;

type DataLifecycleSnapshot = Readonly<Record<string, unknown>> & Readonly<{
  operation: DataOperationReference;
  sequence: number;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
}>;

type DataLifecycleRequest = Readonly<{
  documentId: string;
  instancePath: string;
  dataId: string;
  binding: Readonly<{ operation: DataOperationReference }>;
}>;

type DataMockBehavior = Readonly<Record<string, unknown>> & Readonly<{
  kind: 'result' | 'error' | 'crud';
  delayMs?: number;
}>;

type DataMockFixture = Readonly<{
  documentId: string;
  operationId: string;
  operationKind: 'query' | 'mutation';
  input?: unknown;
  behavior: DataMockBehavior;
}>;

type DataMockProvision = Readonly<{
  fixtures: readonly DataMockFixture[];
  collections?: readonly Readonly<{
    id: string;
    entityIdKey: string;
    initialEntities: readonly Readonly<Record<string, unknown>>[];
  }>[];
}>;

const operationKinds = ${JSON.stringify(operationKinds(workspace))} as const;
const provisionUrl = '/.prodivix/data-mock-provision.json';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => JSON.stringify(key) + ':' + canonicalJson(entry))
      .join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
};

const lifecycleKey = (request: DataLifecycleRequest): string =>
  JSON.stringify([request.documentId, request.instancePath, request.dataId]);

const fixtureMatch = (
  fixture: DataMockFixture,
  operation: DataOperationReference,
  operationKind: 'query' | 'mutation',
  input: unknown
): boolean =>
  fixture.documentId === operation.documentId &&
  fixture.operationId === operation.operationId &&
  fixture.operationKind === operationKind &&
  (fixture.input === undefined || canonicalJson(fixture.input) === canonicalJson(input));

const loadProvision = async (): Promise<DataMockProvision> => {
  const response = await fetch(provisionUrl, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('DATA_MOCK_PROVISION_UNAVAILABLE');
  return await response.json() as DataMockProvision;
};

export const createWorkspaceDataRuntime = () => {
  const snapshots = new Map<string, DataLifecycleSnapshot>();
  const listeners = new Set<() => void>();
  let sequence = 0;
  let provision: Promise<DataMockProvision> | undefined;
  let disposed = false;

  const publish = () => listeners.forEach((listener) => listener());
  const failure = (
    operation: DataOperationReference,
    currentSequence: number,
    invocationId: string,
    startedAt: number,
    code: string
  ): DataLifecycleSnapshot => Object.freeze({
    operation,
    sequence: currentSequence,
    status: 'error',
    invocationId,
    attempt: 1,
    startedAt,
    completedAt: Date.now(),
    error: Object.freeze({ code, message: 'Data operation failed.', retryable: false }),
  });

  const execute = async (
    key: string,
    request: DataLifecycleRequest,
    operationKind: 'query' | 'mutation',
    currentSequence: number,
    invocationId: string,
    startedAt: number
  ) => {
    try {
      const value = await (provision ??= loadProvision());
      const input = {};
      const matches = value.fixtures.filter((fixture) =>
        fixtureMatch(fixture, request.binding.operation, operationKind, input)
      );
      const exact = matches.filter((fixture) => fixture.input !== undefined);
      const fixture = exact.length === 1 ? exact[0] : exact.length === 0 && matches.length === 1 ? matches[0] : undefined;
      if (!fixture) throw new Error(matches.length ? 'DATA_MOCK_FIXTURE_AMBIGUOUS' : 'DATA_MOCK_FIXTURE_MISSING');
      const delayMs = fixture.behavior.delayMs;
      if (typeof delayMs === 'number' && delayMs > 0)
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
      if (disposed || snapshots.get(key)?.sequence !== currentSequence) return;
      if (fixture.behavior.kind === 'error')
        throw new Error(typeof fixture.behavior.code === 'string' ? fixture.behavior.code : 'DATA_MOCK_FIXTURE_ERROR');
      let result: unknown;
      let empty = false;
      let page: unknown;
      if (fixture.behavior.kind === 'result') {
        result = fixture.behavior.value;
        empty = fixture.behavior.empty === true;
        page = fixture.behavior.page;
      } else {
        const action = fixture.behavior.action;
        if (action !== 'list') throw new Error('DATA_STANDALONE_MUTATION_DISPATCH_UNAVAILABLE');
        const collection = value.collections?.find(({ id }) => id === fixture.behavior.collectionId);
        if (!collection) throw new Error('DATA_MOCK_COLLECTION_MISSING');
        result = collection.initialEntities;
        empty = collection.initialEntities.length === 0;
      }
      snapshots.set(key, Object.freeze({
        operation: request.binding.operation,
        sequence: currentSequence,
        status: empty ? 'empty' : 'success',
        invocationId,
        attempt: 1,
        startedAt,
        completedAt: Date.now(),
        ...(empty ? {} : { value: result }),
        ...(page === undefined ? {} : { page }),
      }));
    } catch (error) {
      if (disposed || snapshots.get(key)?.sequence !== currentSequence) return;
      snapshots.set(key, failure(
        request.binding.operation,
        currentSequence,
        invocationId,
        startedAt,
        error instanceof Error ? error.message : 'DATA_OPERATION_FAILED'
      ));
    }
    publish();
  };

  return Object.freeze({
    subscribeDataLifecycle(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resolveDataLifecycleSnapshot(request: DataLifecycleRequest): DataLifecycleSnapshot {
      const key = lifecycleKey(request);
      const existing = snapshots.get(key);
      if (existing) return existing;
      const operation = request.binding.operation;
      const kind = (operationKinds as Record<string, Record<string, 'query' | 'mutation'>>)[operation.documentId]?.[operation.operationId];
      if (!kind) {
        const snapshot = failure(operation, 0, 'unresolved', Date.now(), 'DATA_OPERATION_UNRESOLVED');
        snapshots.set(key, snapshot);
        return snapshot;
      }
      if (kind === 'mutation') {
        const snapshot = Object.freeze({ operation, sequence: 0, status: 'idle' as const });
        snapshots.set(key, snapshot);
        return snapshot;
      }
      const currentSequence = ++sequence;
      const invocationId = 'standalone:' + currentSequence;
      const startedAt = Date.now();
      const loading = Object.freeze({
        operation,
        sequence: currentSequence,
        status: 'loading' as const,
        invocationId,
        attempt: 1,
        startedAt,
      });
      snapshots.set(key, loading);
      void execute(key, request, kind, currentSequence, invocationId, startedAt);
      return loading;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      snapshots.clear();
    },
  });
};
`;

/** Generates the standalone projection that reads provider-projected runtime assets. */
export const createWorkspaceStandaloneDataRuntimeModule = (
  workspace: WorkspaceSnapshot
): ExportModule => ({
  id: WORKSPACE_DATA_RUNTIME_MODULE_ID,
  kind: 'runtime-helper',
  suggestedName: 'prodivixDataRuntime',
  desiredPath: 'src/prodivix-data-runtime.ts',
  language: 'ts',
  imports: [],
  body: source(workspace),
  sourceTrace: Object.values(workspace.docsById)
    .filter((document) => document.type === 'data-source')
    .sort((left, right) => compareText(left.id, right.id))
    .map((document) => ({
      sourceRef: {
        domain: 'workspace-document' as const,
        id: document.id,
        path: document.path,
      },
    })),
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});
