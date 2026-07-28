import {
  ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION,
  compileAnimationComposition,
  createAnimationBehaviorRuntimeAdapters,
  createAnimationSurfaceRuntimeAdapter,
  encodeAnimationDefinition,
  executeAnimationCompositionProgram,
  type AnimationCompositionExecutionResult,
  type AnimationDefinition,
  type AnimationSurfaceRuntimeAdapter,
} from '@prodivix/animation';
import {
  createAnimationCompositionSymbolId,
  createDataOperationSymbolId,
  createNodeGraphSymbolId,
  createRouteSymbolId,
} from '@prodivix/authoring';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  compileBehaviorScenario,
  createBehaviorRegistry,
  createBehaviorRuntimeCapabilityRegistry,
  digestBehaviorControlProfile,
  digestBehaviorValue,
  executeBehaviorScenarioProgram,
  type BehaviorControlProfile,
  type BehaviorRuntimeCapabilityRegistry,
  type BehaviorRuntimeInvocation,
  type BehaviorRuntimeResult,
  type BehaviorScenario,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
  DATA_OPTIMISTIC_RUNTIME_ERROR_CODES,
  DataOptimisticRuntimeError,
  createDataOperationInvocation,
  createDataOptimisticCrudPlan,
  createMemoryDataOptimisticProjectionStore,
} from '@prodivix/data';
import {
  NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION,
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphBehaviorRuntimeAdapters,
  createNodeGraphSurfaceRuntimeAdapter,
  encodeNodeGraphDocument,
  type NodeGraphSurfaceRuntimeAdapter,
  type NodeGraphDocument,
  type NodeGraphProgram,
} from '@prodivix/nodegraph';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
  createRouteBehaviorRuntimeAdapters,
  createRouteLifecycleCoordinator,
  createRouteSurfaceRuntimeAdapter,
  type RouteBehaviorRuntimePort,
  type RouteLifecycleNavigationResult,
  type RouteSurfaceRuntimeAdapter,
} from '@prodivix/router';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
  GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  GOLDEN_G2_VUE_CATALOG_IDS,
  GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
} from './goldenG2VueCatalogFixture';
import { GOLDEN_G3_CATALOG_WORKSPACE } from './goldenG3ScenarioFixture';
import type { GoldenGeneratedProjectBundle } from './generatedProjectHarness';

export const GOLDEN_G3_COMPOSITION_IDS = Object.freeze({
  scenario: 'scenario-catalog-behavior-composition',
  graph: 'graph-catalog-derived-state',
  animation: 'animation-catalog-detail',
  timeline: 'detail-enter',
  composition: 'detail-enter-composition',
  marker: 'detail-content-ready',
});

export const GOLDEN_G3_REPLAY_CONTROL_PROFILE: BehaviorControlProfile =
  Object.freeze({
    ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    id: 'deterministic-composition',
    name: 'Golden deterministic composition',
  });
const CONTROL_PROFILE_DIGEST = digestBehaviorControlProfile(
  GOLDEN_G3_REPLAY_CONTROL_PROFILE
);
const COMPILER_DIGEST =
  'sha256-7eb9337be4cc1f42ab7c333138b2248e10ac6b639c52bb693f9a49337a8b17de';

export const GOLDEN_G3_COMPOSITION_GRAPH: NodeGraphDocument = {
  nodes: [
    {
      id: 'input',
      descriptorRef: { id: 'core.start', version: '1' },
      ports: [
        {
          id: 'out.control.next',
          direction: 'output',
          flow: 'control',
          required: false,
          cardinality: 'single',
        },
        {
          id: 'out.data.value',
          direction: 'output',
          flow: 'data',
          typeRef: 'json',
          required: false,
          cardinality: 'single',
        },
      ],
      configuration: {},
      editor: {},
    },
    {
      id: 'derived-state',
      descriptorRef: { id: 'core.process', version: '1' },
      ports: [
        {
          id: 'in.control.prev',
          direction: 'input',
          flow: 'control',
          required: true,
          cardinality: 'single',
        },
        {
          id: 'out.control.next',
          direction: 'output',
          flow: 'control',
          required: false,
          cardinality: 'single',
        },
        {
          id: 'in.data.value',
          direction: 'input',
          flow: 'data',
          typeRef: 'json',
          required: true,
          cardinality: 'single',
        },
        {
          id: 'out.data.value',
          direction: 'output',
          flow: 'data',
          typeRef: 'json',
          required: false,
          cardinality: 'single',
        },
      ],
      configuration: {},
      editor: {},
    },
    {
      id: 'complete',
      descriptorRef: { id: 'core.end', version: '1' },
      ports: [
        {
          id: 'in.control.prev',
          direction: 'input',
          flow: 'control',
          required: true,
          cardinality: 'single',
        },
        {
          id: 'in.data.value',
          direction: 'input',
          flow: 'data',
          typeRef: 'json',
          required: true,
          cardinality: 'single',
        },
      ],
      configuration: {},
      editor: {},
    },
  ],
  edges: [
    {
      id: 'input-derived',
      source: { nodeId: 'input', portId: 'out.control.next' },
      target: {
        nodeId: 'derived-state',
        portId: 'in.control.prev',
      },
    },
    {
      id: 'derived-complete',
      source: {
        nodeId: 'derived-state',
        portId: 'out.control.next',
      },
      target: { nodeId: 'complete', portId: 'in.control.prev' },
    },
    {
      id: 'input-derived-data',
      source: { nodeId: 'input', portId: 'out.data.value' },
      target: { nodeId: 'derived-state', portId: 'in.data.value' },
    },
    {
      id: 'derived-complete-data',
      source: { nodeId: 'derived-state', portId: 'out.data.value' },
      target: { nodeId: 'complete', portId: 'in.data.value' },
    },
  ],
};

export const createGoldenG3NodeGraphProgram = (): NodeGraphProgram => {
  const compiled = compileNodeGraphProgram({
    documentId: GOLDEN_G3_COMPOSITION_IDS.graph,
    documentRevision: 1,
    graph: GOLDEN_G3_COMPOSITION_GRAPH,
    registry: createFirstPartyNodeGraphDescriptorRegistry(),
    runtimeZone: 'test',
    availableCapabilities: [],
  });
  if (!compiled.ok) {
    throw new Error(
      `Golden NodeGraph Program is blocked: ${JSON.stringify(compiled.issues)}`
    );
  }
  return compiled.program;
};

export const GOLDEN_G3_COMPOSITION_ANIMATION: AnimationDefinition = {
  target: {
    kind: 'pir-document' as const,
    documentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  },
  timelines: [
    {
      id: GOLDEN_G3_COMPOSITION_IDS.timeline,
      name: 'Catalog detail enter',
      durationMs: 20,
      motionIntent: 'decorative',
      reducedMotion: { kind: 'final-state' },
      markers: [
        {
          id: GOLDEN_G3_COMPOSITION_IDS.marker,
          atMs: 20,
          kind: 'settle',
          requiredInReducedMotion: true,
        },
      ],
      fillMode: 'forwards' as const,
      bindings: [
        {
          id: 'product-card-binding',
          targetNodeId: 'product-card',
          tracks: [
            {
              id: 'product-card-opacity',
              kind: 'style' as const,
              property: 'opacity' as const,
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 20, value: 1 },
              ],
            },
          ],
        },
      ],
    },
  ],
  compositions: [
    {
      id: GOLDEN_G3_COMPOSITION_IDS.composition,
      name: 'Catalog detail enter composition',
      motionIntent: 'decorative',
      root: {
        id: 'detail-enter-sequence',
        kind: 'sequence',
        children: [
          {
            id: 'detail-enter-timeline-ref',
            kind: 'timeline-ref',
            timelineId: GOLDEN_G3_COMPOSITION_IDS.timeline,
          },
          {
            id: 'detail-enter-settle',
            kind: 'settle',
            markerId: GOLDEN_G3_COMPOSITION_IDS.marker,
          },
        ],
      },
    },
  ],
  entryCompositionId: GOLDEN_G3_COMPOSITION_IDS.composition,
};

export const runGoldenG3AnimationComposition = async (
  motionMode: 'full' | 'reduced'
): Promise<AnimationCompositionExecutionResult> => {
  const compiled = compileAnimationComposition({
    definition: GOLDEN_G3_COMPOSITION_ANIMATION,
  });
  if (!compiled.ok) {
    throw new Error(
      `Golden Animation composition is blocked: ${JSON.stringify(compiled.issues)}`
    );
  }
  return executeAnimationCompositionProgram({
    program: compiled.bundle[motionMode],
    instanceId: `golden-${motionMode}`,
    generation: 'golden-generation',
    animationDocumentId: GOLDEN_G3_COMPOSITION_IDS.animation,
    targetDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
    signal: { aborted: false },
    runtime: {
      clock: { advanceTo: () => undefined },
      effects: { apply: () => undefined },
      observations: { publish: () => undefined },
    },
  });
};

export const runGoldenG3OptimisticConflictJourney = async () => {
  const target = Object.freeze({
    documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
    operationId: 'list-products',
  });
  const store = createMemoryDataOptimisticProjectionStore([
    {
      target,
      partitionId: 'catalog',
      version: 0,
      value: Object.freeze([Object.freeze({ id: 'p1', name: 'Alpha' })]),
    },
  ]);
  const runtime = Object.freeze({
    store,
    targetPartitionId: 'catalog',
  });
  const policy = Object.freeze({
    kind: 'crud' as const,
    action: 'create' as const,
    target,
    valueInputPath: '/item',
    valueOutputPath: '/item',
    placement: 'end' as const,
    rollback: 'on-error' as const,
  });
  const invocation = (sequence: number, id: string, name: string) =>
    createDataOperationInvocation({
      invocationId: `golden-catalog-mutation-${sequence}`,
      sequence,
      attempt: 1,
      startedAt: 1,
      operation: {
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'create-product',
      },
      documentRevision: '1',
      runtimeZone: 'test',
      mode: 'mock',
      activation: 'test',
      input: { item: { id, name } },
    });

  const beta = await createDataOptimisticCrudPlan({
    policy,
    runtime,
    invocation: invocation(1, 'p2', 'Beta'),
  });
  const conflictingGamma = await createDataOptimisticCrudPlan({
    policy,
    runtime,
    invocation: invocation(2, 'p3', 'Gamma optimistic'),
  });
  const staleRollback = await beta.rollback();
  const rollback = await conflictingGamma.rollback();
  const retry = await createDataOptimisticCrudPlan({
    policy,
    runtime,
    invocation: invocation(3, 'p3', 'Gamma retry'),
  });
  let conflictCode: string | undefined;
  try {
    await createDataOptimisticCrudPlan({
      policy,
      runtime,
      invocation: invocation(2, 'p4', 'Stale replay'),
    });
  } catch (error) {
    if (error instanceof DataOptimisticRuntimeError) {
      conflictCode = error.code;
    } else {
      throw error;
    }
  }
  const committed = await retry.commit({
    value: { item: { id: 'p3', name: 'Gamma confirmed' } },
    empty: false,
  });
  const finalSnapshot = await store.read(target, 'catalog');
  if (
    conflictCode !== DATA_OPTIMISTIC_RUNTIME_ERROR_CODES.conflict ||
    !finalSnapshot
  ) {
    throw new Error('Golden optimistic conflict did not fail closed.');
  }
  return Object.freeze({
    staleRollback: staleRollback.metadata.status,
    rollback: rollback.metadata.status,
    retry: committed.metadata.status,
    conflictCode,
    finalSnapshot,
  });
};

const routeNavigateTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createRouteSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G2_VUE_CATALOG_IDS.route
  ),
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  capability: 'behavior:route:navigate',
});
const routeLocationTarget = Object.freeze({
  ...routeNavigateTarget,
  capability: 'behavior:route:location',
});
const conflictRetryTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createDataOperationSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G2_VUE_CATALOG_IDS.data,
    'update-product'
  ),
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
  capability: 'behavior:data:dispatch',
});
const graphInvokeTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createNodeGraphSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G3_COMPOSITION_IDS.graph
  ),
  workspaceDocumentId: GOLDEN_G3_COMPOSITION_IDS.graph,
  capability: 'behavior:nodegraph:invoke',
});
const graphOutputTarget = Object.freeze({
  ...graphInvokeTarget,
  capability: 'behavior:nodegraph:output',
});
const animationPlayTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createAnimationCompositionSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G3_COMPOSITION_IDS.animation,
    GOLDEN_G3_COMPOSITION_IDS.composition
  ),
  workspaceDocumentId: GOLDEN_G3_COMPOSITION_IDS.animation,
  capability: 'behavior:animation:play',
});
const animationCompositionResultTarget = Object.freeze({
  ...animationPlayTarget,
  capability: 'behavior:animation:composition',
});
const animationCompositionMarkerTarget = Object.freeze({
  ...animationPlayTarget,
  capability: 'behavior:animation:marker',
});
const GOLDEN_ANIMATION_INSTANCE_ID = 'catalog-detail-transition';

export const GOLDEN_G3_COMPOSITION_SCENARIO: BehaviorScenario = Object.freeze({
  id: GOLDEN_G3_COMPOSITION_IDS.scenario,
  name: 'Catalog derived state and detail transition',
  criticality: 'critical',
  tags: Object.freeze(['catalog', 'composition']),
  entry: Object.freeze({
    id: 'manual-entry',
    domain: 'scenario',
    event: 'manual',
  }),
  steps: Object.freeze([
    Object.freeze({
      id: 'open-catalog',
      kind: 'action',
      failureMode: 'stop',
      action: Object.freeze({
        kind: 'navigate',
        target: routeNavigateTarget,
        input: '/',
        capabilityId: 'route.navigate',
        runtimeZone: 'test',
        effect: 'write',
        cancellation: 'cooperative',
      }),
    }),
    Object.freeze({
      id: 'catalog-conflict-retry',
      kind: 'action',
      failureMode: 'stop',
      action: Object.freeze({
        kind: 'dispatch-data-operation',
        target: conflictRetryTarget,
        input: Object.freeze({ productId: 'p3' }),
        capabilityId: 'data.dispatch',
        runtimeZone: 'test',
        effect: 'write',
        cancellation: 'cooperative',
      }),
    }),
    Object.freeze({
      id: 'derive-and-transition',
      kind: 'parallel',
      failureMode: 'stop',
      steps: Object.freeze([
        Object.freeze({
          id: 'derive-catalog-state',
          kind: 'action',
          failureMode: 'stop',
          action: Object.freeze({
            kind: 'invoke-nodegraph',
            target: graphInvokeTarget,
            input: Object.freeze({ itemId: 'p2', optimisticCount: 2 }),
            capabilityId: 'nodegraph.invoke',
            runtimeZone: 'test',
            effect: 'write',
            cancellation: 'cooperative',
          }),
        }),
        Object.freeze({
          id: 'play-detail-transition',
          kind: 'action',
          failureMode: 'stop',
          action: Object.freeze({
            kind: 'control-animation',
            target: animationPlayTarget,
            input: Object.freeze({
              instanceId: GOLDEN_ANIMATION_INSTANCE_ID,
              settle: 'completed',
            }),
            capabilityId: 'animation.play',
            runtimeZone: 'test',
            effect: 'write',
            cancellation: 'required',
          }),
        }),
      ]),
    }),
    Object.freeze({
      id: 'composition-joined',
      kind: 'barrier',
      failureMode: 'stop',
      participantStepIds: Object.freeze([
        'derive-catalog-state',
        'play-detail-transition',
      ]),
    }),
    Object.freeze({
      id: 'derived-state-observed',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'nodegraph-output',
        target: graphOutputTarget,
        expected: Object.freeze({ itemId: 'p2', optimisticCount: 2 }),
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'derived-state-equals',
          operator: 'equals',
          expected: Object.freeze({ itemId: 'p2', optimisticCount: 2 }),
        }),
      ]),
    }),
    Object.freeze({
      id: 'animation-composition-result',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'composition-result',
        target: animationCompositionResultTarget,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'animation-result-has-status',
          operator: 'contains',
          expected: 'status',
        }),
      ]),
    }),
    Object.freeze({
      id: 'animation-required-marker',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'composition-marker',
        target: animationCompositionMarkerTarget,
        expected: Object.freeze({
          markerId: GOLDEN_G3_COMPOSITION_IDS.marker,
        }),
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'animation-marker-has-id',
          operator: 'contains',
          expected: 'markerId',
        }),
      ]),
    }),
    Object.freeze({
      id: 'route-location-stable',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'route',
        target: routeLocationTarget,
        expected: '/',
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'route-location-equals',
          operator: 'equals',
          expected: '/',
        }),
      ]),
    }),
  ]),
  fixtureRefs: Object.freeze([]),
  controlProfileRef: Object.freeze({
    kind: 'preset',
    presetId: 'deterministic-composition',
    digest: CONTROL_PROFILE_DIGEST,
  }),
  baselineRefs: Object.freeze([]),
  timeoutPolicy: Object.freeze({
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 1_000,
  }),
});

export const GOLDEN_G3_COMPOSITION_WORKSPACE: WorkspaceSnapshot = Object.freeze(
  {
    ...GOLDEN_G3_CATALOG_WORKSPACE,
    workspaceRev: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev + 1,
    opSeq: GOLDEN_G3_CATALOG_WORKSPACE.opSeq + 1,
    treeById: {
      ...GOLDEN_G3_CATALOG_WORKSPACE.treeById,
      root: {
        ...GOLDEN_G3_CATALOG_WORKSPACE.treeById.root!,
        children: [
          ...(GOLDEN_G3_CATALOG_WORKSPACE.treeById.root!.children ?? []),
          'composition-scenario-node',
          'composition-graph-node',
          'composition-animation-node',
        ],
      },
      'composition-scenario-node': {
        id: 'composition-scenario-node',
        kind: 'doc' as const,
        name: 'catalog-composition.behavior.json',
        parentId: 'root',
        docId: GOLDEN_G3_COMPOSITION_IDS.scenario,
      },
      'composition-graph-node': {
        id: 'composition-graph-node',
        kind: 'doc' as const,
        name: 'catalog-derived.pir-graph.json',
        parentId: 'root',
        docId: GOLDEN_G3_COMPOSITION_IDS.graph,
      },
      'composition-animation-node': {
        id: 'composition-animation-node',
        kind: 'doc' as const,
        name: 'catalog-detail.pir-animation.json',
        parentId: 'root',
        docId: GOLDEN_G3_COMPOSITION_IDS.animation,
      },
    },
    docsById: {
      ...GOLDEN_G3_CATALOG_WORKSPACE.docsById,
      [GOLDEN_G3_COMPOSITION_IDS.scenario]: {
        id: GOLDEN_G3_COMPOSITION_IDS.scenario,
        type: 'behavior-scenario' as const,
        name: GOLDEN_G3_COMPOSITION_SCENARIO.name,
        path: '/catalog-composition.behavior.json',
        contentRev: 1,
        metaRev: 1,
        content: GOLDEN_G3_COMPOSITION_SCENARIO,
      },
      [GOLDEN_G3_COMPOSITION_IDS.graph]: {
        id: GOLDEN_G3_COMPOSITION_IDS.graph,
        type: 'pir-graph' as const,
        name: 'Catalog derived state',
        path: '/catalog-derived.pir-graph.json',
        contentRev: 1,
        metaRev: 1,
        content: encodeNodeGraphDocument(GOLDEN_G3_COMPOSITION_GRAPH),
      },
      [GOLDEN_G3_COMPOSITION_IDS.animation]: {
        id: GOLDEN_G3_COMPOSITION_IDS.animation,
        type: 'pir-animation' as const,
        name: 'Catalog detail transition',
        path: '/catalog-detail.pir-animation.json',
        contentRev: 1,
        metaRev: 1,
        content: encodeAnimationDefinition(GOLDEN_G3_COMPOSITION_ANIMATION),
      },
    },
  }
);

const compositionRegistry = () => {
  const result = createBehaviorRegistry([
    BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
    DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
    NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION,
    ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION,
  ]);
  if (!result.ok) {
    throw new Error(
      `Golden composition registry is invalid: ${JSON.stringify(result.issues)}`
    );
  }
  return result.registry;
};

export const createGoldenG3BehaviorCompositionProgram =
  (): BehaviorScenarioProgram => {
    const semantic = createWorkspaceSemanticIndexFromSnapshot(
      GOLDEN_G3_COMPOSITION_WORKSPACE
    );
    if (semantic.status !== 'ready') {
      throw new Error(
        `Golden composition Semantic Index is blocked: ${JSON.stringify(semantic.issues)}`
      );
    }
    const compiled = compileBehaviorScenario({
      scenario: GOLDEN_G3_COMPOSITION_SCENARIO,
      scenarioDocumentId: GOLDEN_G3_COMPOSITION_IDS.scenario,
      workspaceRevision: GOLDEN_G3_COMPOSITION_WORKSPACE.workspaceRev,
      semanticIndex: semantic.index,
      executableSnapshotDigest: digestBehaviorValue({
        workspaceId: GOLDEN_G3_COMPOSITION_WORKSPACE.id,
        workspaceRevision: GOLDEN_G3_COMPOSITION_WORKSPACE.workspaceRev,
      }),
      compilerDigest: COMPILER_DIGEST,
      registry: compositionRegistry(),
    });
    if (compiled.status !== 'ready') {
      throw new Error(
        `Golden composition Program is blocked: ${JSON.stringify(compiled.issues)}`
      );
    }
    return compiled.program;
  };

export type GoldenG3BehaviorCompositionSurface = 'preview' | 'export' | 'ci';
export type GoldenG3BehaviorCompositionMotionMode = 'full' | 'reduced';
export type GoldenG3BehaviorProgramExecutor = (
  input: Readonly<{
    program: BehaviorScenarioProgram;
    registry: BehaviorRuntimeCapabilityRegistry;
    runtimeZone: 'test';
    maximumConcurrency: number;
  }>
) => Promise<BehaviorRuntimeResult>;

/**
 * Invokes the same Behavior, NodeGraph, Animation, and Route Programs through
 * the concrete Preview, Export, and CI serialization boundaries.
 */
export const runGoldenG3BehaviorCompositionSurface = async (
  surface: GoldenG3BehaviorCompositionSurface,
  motionMode: GoldenG3BehaviorCompositionMotionMode = 'full',
  executeProgram: GoldenG3BehaviorProgramExecutor = ({
    program,
    registry,
    runtimeZone,
    maximumConcurrency,
  }) =>
    executeBehaviorScenarioProgram({
      program,
      attemptId: 'golden-composition-attempt',
      runtimeZone,
      registry,
      maximumConcurrency,
    })
): Promise<
  Readonly<{
    surface: GoldenG3BehaviorCompositionSurface;
    motionMode: GoldenG3BehaviorCompositionMotionMode;
    result: BehaviorRuntimeResult;
    evidence: Readonly<{
      route: Awaited<ReturnType<RouteSurfaceRuntimeAdapter['invoke']>>;
      nodeGraph: Awaited<ReturnType<NodeGraphSurfaceRuntimeAdapter['invoke']>>;
      animation: Awaited<ReturnType<AnimationSurfaceRuntimeAdapter['invoke']>>;
    }>;
  }>
> => {
  const compiledAnimation = compileAnimationComposition({
    definition: GOLDEN_G3_COMPOSITION_ANIMATION,
  });
  if (!compiledAnimation.ok) {
    throw new Error(
      `Golden Animation composition is blocked: ${JSON.stringify(compiledAnimation.issues)}`
    );
  }

  const routeExecutions: Awaited<
    ReturnType<RouteSurfaceRuntimeAdapter['invoke']>
  >[] = [];
  const nodeGraphExecutions: Awaited<
    ReturnType<NodeGraphSurfaceRuntimeAdapter['invoke']>
  >[] = [];
  const animationExecutions: Awaited<
    ReturnType<AnimationSurfaceRuntimeAdapter['invoke']>
  >[] = [];

  const routeDelegate = createRouteSurfaceRuntimeAdapter(surface);
  const nodeGraphDelegate = createNodeGraphSurfaceRuntimeAdapter(surface);
  const animationDelegate = createAnimationSurfaceRuntimeAdapter(surface);
  const routeAdapter: RouteSurfaceRuntimeAdapter = Object.freeze({
    ...routeDelegate,
    async invoke(input) {
      const execution = await routeDelegate.invoke(input);
      routeExecutions.push(execution);
      return execution;
    },
  });
  const nodeGraphAdapter: NodeGraphSurfaceRuntimeAdapter = Object.freeze({
    ...nodeGraphDelegate,
    async invoke(input) {
      const execution = await nodeGraphDelegate.invoke(input);
      nodeGraphExecutions.push(execution);
      return execution;
    },
  });
  const animationAdapter: AnimationSurfaceRuntimeAdapter = Object.freeze({
    ...animationDelegate,
    async invoke(input) {
      const execution = await animationDelegate.invoke(input);
      animationExecutions.push(execution);
      return execution;
    },
  });
  const routeCoordinator = createRouteLifecycleCoordinator({
    resolve: ({ path }) =>
      Object.freeze({
        routeNodeId: GOLDEN_G2_VUE_CATALOG_IDS.route,
        path,
        params: Object.freeze({}),
        search: Object.freeze({}),
        pageDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
        outletId: 'catalog-main',
        transition: Object.freeze({
          enterCompositionId: GOLDEN_G3_COMPOSITION_IDS.composition,
          handoffMarkerId: GOLDEN_G3_COMPOSITION_IDS.marker,
          sharedHandoffId: 'catalog-detail-handoff',
        }),
      }),
    guard: () => Object.freeze({ status: 'allowed' as const }),
    load: () =>
      Object.freeze({
        status: 'ready' as const,
        data: Object.freeze({ authenticated: true }),
      }),
    scopes: Object.freeze({
      prepare: ({ role, generation }) =>
        Object.freeze({
          scopeId: `${role}:${generation}`,
          activate: () => undefined,
          restore: () => undefined,
          dispose: () => undefined,
        }),
    }),
    transitions: Object.freeze({
      start: () =>
        Object.freeze({
          waitForMarker: () => Promise.resolve('reached' as const),
          completion: Promise.resolve('completed' as const),
          cancel: () => undefined,
        }),
    }),
    outlet: Object.freeze({ commit: () => undefined }),
  });
  const routePort: RouteBehaviorRuntimePort = Object.freeze({
    async navigate(input) {
      if (!input.path) {
        return Object.freeze({
          status: 'failed' as const,
          code: 'route-history-path-unavailable',
          safeMessage: 'Golden navigation requires a resolved path.',
        });
      }
      const execution = await routeAdapter.invoke({
        coordinator: routeCoordinator,
        path: input.path,
        kind: input.kind,
        signal: Object.freeze({
          get aborted() {
            return input.signal.aborted;
          },
          get reason() {
            return typeof input.signal.reason === 'string'
              ? input.signal.reason
              : undefined;
          },
        }),
      });
      const result: RouteLifecycleNavigationResult = execution.result;
      if (result.status === 'cancelled') {
        return Object.freeze({
          status: 'cancelled' as const,
          reason: result.reasonCode,
        });
      }
      if (result.status !== 'completed') {
        return Object.freeze({
          status: 'failed' as const,
          code: `route-${result.status}`,
          safeMessage: `Golden Route lifecycle stopped with ${result.reasonCode}.`,
        });
      }
      return Object.freeze({
        status: 'completed' as const,
        location: result.location.path,
      });
    },
    readLocation: () => routeCoordinator.snapshot().current?.path ?? null,
  });

  const runtimeRegistry = createBehaviorRuntimeCapabilityRegistry([
    ...createRouteBehaviorRuntimeAdapters(routePort),
    Object.freeze({
      capabilityId: 'data.dispatch',
      owner: 'data',
      async invoke() {
        const journey = await runGoldenG3OptimisticConflictJourney();
        return Object.freeze({
          status: 'succeeded' as const,
          output: Object.freeze({
            staleRollback: journey.staleRollback,
            rollback: journey.rollback,
            retry: journey.retry,
            conflictCode: journey.conflictCode,
            finalProducts: journey.finalSnapshot.value,
          }),
        });
      },
    }),
    ...createNodeGraphBehaviorRuntimeAdapters({
      resolveTarget: (invocation: BehaviorRuntimeInvocation) =>
        invocation.target?.semanticSymbolId === graphInvokeTarget.id
          ? Object.freeze({
              program: createGoldenG3NodeGraphProgram(),
              workspaceRevision: GOLDEN_G3_COMPOSITION_WORKSPACE.workspaceRev,
              surfaceAdapter: nodeGraphAdapter,
            })
          : null,
    }),
    ...createAnimationBehaviorRuntimeAdapters({
      resolveTarget: (invocation: BehaviorRuntimeInvocation) =>
        invocation.target?.semanticSymbolId === animationPlayTarget.id
          ? Object.freeze({
              animationDocumentId: GOLDEN_G3_COMPOSITION_IDS.animation,
              definition: GOLDEN_G3_COMPOSITION_ANIMATION,
              compositionBundle: compiledAnimation.bundle,
              motionMode,
              generation: `golden-${surface}-${motionMode}`,
              surfaceAdapter: animationAdapter,
              compositionRuntime: Object.freeze({
                clock: Object.freeze({ advanceTo: () => undefined }),
                effects: Object.freeze({ apply: () => undefined }),
                observations: Object.freeze({ publish: () => undefined }),
              }),
            })
          : null,
    }),
  ]);
  if (!runtimeRegistry.ok) {
    throw new Error(
      `Golden composition runtime registry is invalid: ${JSON.stringify(runtimeRegistry.issues)}`
    );
  }
  const result = await executeProgram({
    program: createGoldenG3BehaviorCompositionProgram(),
    registry: runtimeRegistry.registry,
    runtimeZone: 'test',
    maximumConcurrency: 2,
  });
  const route = routeExecutions[0];
  const nodeGraph = nodeGraphExecutions[0];
  const animation = animationExecutions[0];
  if (!route || !nodeGraph || !animation) {
    throw new Error(
      'Golden composition did not invoke every required surface adapter.'
    );
  }
  return Object.freeze({
    surface,
    motionMode,
    result,
    evidence: Object.freeze({ route, nodeGraph, animation }),
  });
};

const projectOptions = Object.freeze({
  dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  dataMockProvision: GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  serverRuntimeMockProvision: GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
  assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
});

export const createGoldenG3CompositionReactSnapshot =
  (): ExecutableProjectSnapshot => {
    const generated = generateWorkspaceReactViteExecutableProject(
      GOLDEN_G3_COMPOSITION_WORKSPACE,
      {
        ...projectOptions,
        projectName: 'G3 React Behavior Composition',
      }
    );
    if (generated.status === 'blocked') {
      throw new Error(
        `Golden React composition target is blocked: ${JSON.stringify(generated.diagnostics)}`
      );
    }
    return generated.snapshot;
  };

export const createGoldenG3CompositionVueSnapshot =
  (): ExecutableProjectSnapshot => {
    const generated = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G3_COMPOSITION_WORKSPACE,
      {
        ...projectOptions,
        projectName: 'G3 Vue Behavior Composition',
      }
    );
    if (generated.status === 'blocked') {
      throw new Error(
        `Golden Vue composition target is blocked: ${JSON.stringify(generated.diagnostics)}`
      );
    }
    return generated.snapshot;
  };

const compositionBundleFromSnapshot = (
  snapshot: ExecutableProjectSnapshot
): GoldenGeneratedProjectBundle =>
  Object.freeze({
    files: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
  });

export const createGoldenG3CompositionReactBundle =
  (): GoldenGeneratedProjectBundle =>
    compositionBundleFromSnapshot(createGoldenG3CompositionReactSnapshot());

export const createGoldenG3CompositionVueBundle =
  (): GoldenGeneratedProjectBundle =>
    compositionBundleFromSnapshot(createGoldenG3CompositionVueSnapshot());
