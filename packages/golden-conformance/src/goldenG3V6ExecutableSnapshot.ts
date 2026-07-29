import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
  createCompilerDiagnosticTestExtension,
  createCompilerFixtureProjectionSnapshot,
  type CompilerDiagnosticTestExtensionReceipt,
} from '@prodivix/prodivix-compiler';
import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import { GOLDEN_G3_LOGIN_FIXTURE_SET } from './goldenG3ScenarioFixture';

export const GOLDEN_G3_V6_INTEGRATION_TEST_PATH =
  'src/prodivix-g3-v6.integration.test.ts';
export const GOLDEN_G3_V6_INTEGRATION_CASE_NAME =
  'runs authenticated catalog fixture lifecycle with fixture-only transport and denied live egress';

const integrationTestSource = (snapshot: ExecutableProjectSnapshot): string => {
  if (!snapshot.dataMockProvision || !snapshot.serverRuntimeMockProvision) {
    throw new Error(
      'Golden V6 integration snapshot requires Data and Server fixture provisions.'
    );
  }
  return `import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceDataRuntime } from './prodivix-data-runtime';
import { invokeWorkspaceServerFunction } from './prodivix-server-runtime';

const dataProvision = ${JSON.stringify(snapshot.dataMockProvision)} as const;
const serverProvision = ${JSON.stringify(snapshot.serverRuntimeMockProvision)} as const;
const allowedProvisionPath = '/.prodivix/data-mock-provision.json';
const allowedRuntimeManifestPath = '/.prodivix/data-runtime.json';

type Operation = Readonly<{
  key: string;
  documentId: string;
  operationId: string;
  kind: 'query' | 'mutation';
}>;

const operation = (
  operationId: string,
  kind: Operation['kind']
): Operation => ({
  key: 'data-catalog:' + operationId,
  documentId: 'data-catalog',
  operationId,
  kind,
});

const request = (entry: Operation, input: unknown, stage: string) => ({
  documentId: 'golden-g3-v6-integration-' + stage,
  instancePath: '/golden-g3-v6-integration/' + stage,
  dataId: entry.key + ':' + stage,
  binding: {
    operation: {
      documentId: entry.documentId,
      operationId: entry.operationId,
    },
    input: { kind: 'literal' as const, value: input },
    activations: [{ kind: 'document' as const }],
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('Golden G3 V6 generated-project integration boundary', () => {
  it(${JSON.stringify(GOLDEN_G3_V6_INTEGRATION_CASE_NAME)}, async () => {
    const fixtureTransport = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        const requested = String(input);
        if (
          requested !== allowedProvisionPath &&
          requested !== allowedRuntimeManifestPath
        ) {
          throw new Error('GOLDEN_LIVE_EGRESS_DENIED');
        }
        return Response.json(
          requested === allowedRuntimeManifestPath
            ? { format: 'prodivix.executable-data-runtime.v1', mode: 'mock' }
            : dataProvision
        );
      }
    );
    vi.stubGlobal('fetch', fixtureTransport);

    await expect(fetch('https://unapproved.example.test/catalog'))
      .rejects.toThrow('GOLDEN_LIVE_EGRESS_DENIED');

    expect(serverProvision.principal).toMatchObject({
      providerId: 'prodivix-product-session',
      principalId: 'golden-catalog-owner',
    });
    expect(serverProvision.permissions).toContainEqual({
      permissionId: 'workspace.owner',
      allowed: true,
    });
    for (const fixture of serverProvision.fixtures) {
      const options = {
        invocationId: 'golden-g3-v6:' + fixture.id,
        attempt: 1,
      } as const;
      if (fixture.behavior.kind !== 'outcome') {
        throw new Error('GOLDEN_SERVER_FIXTURE_NOT_OUTCOME');
      }
      await expect(
        invokeWorkspaceServerFunction(
          fixture.functionRef,
          'input' in fixture ? fixture.input : {},
          options
        )
      ).resolves.toEqual(fixture.behavior.outcome);
    }

    const runtime = createWorkspaceDataRuntime();
    const list = operation('list-products', 'query');
    const create = operation('create-product', 'mutation');
    const get = operation('get-product', 'query');
    const remove = operation('delete-product', 'mutation');
    const created = { id: 'golden-g3-v6-created', name: 'Golden V6 Created' };
    try {
      const beforeRequest = request(list, {}, 'before');
      await runtime.activateDataBindings({
        documentId: beforeRequest.documentId,
        instancePath: beforeRequest.instancePath,
        bindingsByDataId: { [beforeRequest.dataId]: beforeRequest.binding },
        runtimeValuesById: {},
      });
      expect(runtime.resolveDataLifecycleSnapshot(beforeRequest))
        .toMatchObject({ status: 'success' });

      await runtime.dispatchDataMutation({
        binding: {
          kind: 'dispatch-data-operation',
          operation: {
            documentId: create.documentId,
            operationId: create.operationId,
          },
          input: { kind: 'literal', value: { product: created } },
        },
        payload: null,
        runtimeValuesById: {},
        source: {
          documentId: 'golden-g3-v6-integration',
          nodeId: create.key,
          eventName: 'fixture-mutation',
          instancePath: '/golden-g3-v6-integration/' + create.key,
        },
      });

      const createdRequest = request(get, { id: created.id }, 'created');
      await runtime.activateDataBindings({
        documentId: createdRequest.documentId,
        instancePath: createdRequest.instancePath,
        bindingsByDataId: {
          [createdRequest.dataId]: createdRequest.binding,
        },
        runtimeValuesById: {},
      });
      expect(runtime.resolveDataLifecycleSnapshot(createdRequest))
        .toMatchObject({ status: 'success', value: created });

      await runtime.dispatchDataMutation({
        binding: {
          kind: 'dispatch-data-operation',
          operation: {
            documentId: remove.documentId,
            operationId: remove.operationId,
          },
          input: { kind: 'literal', value: { id: created.id } },
        },
        payload: null,
        runtimeValuesById: {},
        source: {
          documentId: 'golden-g3-v6-integration',
          nodeId: remove.key,
          eventName: 'fixture-delete',
          instancePath: '/golden-g3-v6-integration/' + remove.key,
        },
      });

      const afterDeleteRequest = request(list, {}, 'after-delete');
      await runtime.activateDataBindings({
        documentId: afterDeleteRequest.documentId,
        instancePath: afterDeleteRequest.instancePath,
        bindingsByDataId: {
          [afterDeleteRequest.dataId]: afterDeleteRequest.binding,
        },
        runtimeValuesById: {},
      });
      const afterDeleteSnapshot =
        runtime.resolveDataLifecycleSnapshot(afterDeleteRequest);
      expect(afterDeleteSnapshot).toMatchObject({ status: 'success' });
      expect(
        (afterDeleteSnapshot as { value?: unknown[] }).value
      ).not.toContainEqual(expect.objectContaining({ id: created.id }));
      expect(fixtureTransport.mock.calls.every((call: unknown[]) => {
        const [url] = call;
        return (
          String(url) === allowedProvisionPath ||
          String(url) === allowedRuntimeManifestPath ||
          String(url) === 'https://unapproved.example.test/catalog'
        );
      })).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
`;
};

export type GoldenG3V6ExecutableSnapshotAuthority = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  diagnosticSnapshot: ExecutableProjectSnapshot;
  testExtensionReceipt: CompilerDiagnosticTestExtensionReceipt;
}>;

/**
 * Adds the one allowlisted Golden integration entrypoint through the Compiler
 * extension owner, then applies the Compiler fixture projection outermost.
 */
export const createGoldenG3V6ExecutableSnapshotAuthority = (
  compilerSnapshot: ExecutableProjectSnapshot
): GoldenG3V6ExecutableSnapshotAuthority => {
  const extension = createCompilerDiagnosticTestExtension({
    snapshot: compilerSnapshot,
    extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    extensionKind: 'integration-test',
    files: Object.freeze([
      Object.freeze({
        path: GOLDEN_G3_V6_INTEGRATION_TEST_PATH,
        contents: integrationTestSource(compilerSnapshot),
        sourceTrace: Object.freeze([
          Object.freeze({
            sourceRef: Object.freeze({
              kind: 'workspace' as const,
              workspaceId: compilerSnapshot.workspace.workspaceId,
            }),
            label: 'Golden G3 V6 fixture-only integration boundary',
          }),
        ]),
      }),
    ]),
    entrypoints: Object.freeze([
      Object.freeze({
        kind: 'test' as const,
        path: GOLDEN_G3_V6_INTEGRATION_TEST_PATH,
      }),
    ]),
  });
  return Object.freeze({
    snapshot: createCompilerFixtureProjectionSnapshot({
      snapshot: extension.snapshot,
      fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
      controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    }),
    diagnosticSnapshot: extension.snapshot,
    testExtensionReceipt: extension.receipt,
  });
};

export const createGoldenG3V6ExecutableSnapshot = (
  compilerSnapshot: ExecutableProjectSnapshot
): ExecutableProjectSnapshot =>
  createGoldenG3V6ExecutableSnapshotAuthority(compilerSnapshot).snapshot;
