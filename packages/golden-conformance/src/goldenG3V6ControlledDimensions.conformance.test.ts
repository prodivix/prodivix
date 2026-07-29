import {
  createDataLifecycleChannel,
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  executeDataOperation,
  type DataSourceDocument,
} from '@prodivix/data';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G3_V6_CONTROLLED_DIMENSION_IDS,
  GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST,
} from './goldenG3V6ControlledDimensionManifest';

describe('Golden G3 V6 scenario-internal controlled dimensions', () => {
  it('publishes a real loading to empty owner lifecycle', async () => {
    const lifecycle: string[] = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'golden.empty',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['test'],
        modes: ['mock'],
        capabilities: [],
      },
      invoke: async () => ({ value: [], empty: true }),
    });
    const document: DataSourceDocument = {
      source: {
        id: 'golden-empty',
        adapterId: 'golden.empty',
        runtimeZone: 'test',
        bindingsById: {},
        configurationByKey: {},
      },
      schemasById: {
        output: {
          id: 'output',
          schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'array',
          },
        },
      },
      operationsById: {
        list: {
          id: 'list',
          kind: 'query',
          outputSchemaId: 'output',
          configurationByKey: {},
          policies: {},
        },
      },
    };
    const result = await executeDataOperation({
      registry,
      document,
      invocation: createDataOperationInvocation({
        invocationId: 'golden-g3-v6-empty',
        sequence: 1,
        attempt: 1,
        startedAt: 100,
        operation: {
          documentId: 'golden-empty',
          operationId: 'list',
        },
        documentRevision: '1',
        runtimeZone: 'test',
        mode: 'mock',
        activation: 'test',
        input: {},
      }),
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      now: () => 101,
      publishLifecycle: (snapshot) => lifecycle.push(snapshot.status),
    });
    expect(lifecycle).toEqual(['loading', 'empty']);
    expect(result.lifecycle).toMatchObject({ status: 'empty' });
    expect(result.result).toEqual({ value: [], empty: true });
  });

  it('binds all required branches to a non-axis exact owner Gate manifest', () => {
    expect(GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST).toMatchObject({
      format: 'prodivix.golden-g3-v6-controlled-dimensions.v1',
      role: 'scenario-internal-controlled-profiles',
      planAxis: false,
      expectedPassedCaseCount: 28,
      expectedOwnerPassedCaseCount: 127,
      manifestDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
    });
    expect(
      GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.controlledDimensionIds
    ).toHaveLength(17);
    expect(GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.suites).toHaveLength(8);
    const covered = new Set(
      GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.suites.flatMap((suite) =>
        suite.cases.flatMap((testCase) => testCase.covers)
      )
    );
    expect([...covered].sort()).toEqual(
      [...GOLDEN_G3_V6_CONTROLLED_DIMENSION_IDS].sort()
    );
    const suiteIds = GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.suites.map(
      ({ id }) => id
    );
    expect(new Set(suiteIds).size).toBe(suiteIds.length);
  });
});
