import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  compileBehaviorScenario,
  createBehaviorRegistry,
  digestBehaviorValue,
  type BehaviorFixtureSet,
  type BehaviorScenario,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import { DATA_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/data';
import {
  createPirNodeSymbolId,
  createRouteSymbolId,
} from '@prodivix/authoring';
import { PIR_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/pir';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import { ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/router';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { GoldenGeneratedProjectBundle } from './generatedProjectHarness';
import {
  GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
  GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  GOLDEN_G2_VUE_CATALOG_IDS,
  GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
  GOLDEN_G2_VUE_CATALOG_WORKSPACE,
} from './goldenG2VueCatalogFixture';

export const GOLDEN_G3_SCENARIO_IDS = Object.freeze({
  scenario: 'scenario-catalog-add-item',
  fixture: 'fixture-catalog-login',
});

const CONTROL_PROFILE_DIGEST =
  'sha256-c93c2b6ae570b032a2dd1d33c1650cd5f3cdf0efddc3d57647b966099a32dbda';
const COMPILER_DIGEST =
  'sha256-4266589e62f804053220dfe2e24afc862b44d26fa496123abe27639a4103090d';

export const GOLDEN_G3_LOGIN_FIXTURE_SET: BehaviorFixtureSet = Object.freeze({
  id: GOLDEN_G3_SCENARIO_IDS.fixture,
  name: 'Catalog owner login',
  fixtures: Object.freeze([
    Object.freeze({
      id: 'catalog-owner-session',
      target: Object.freeze({
        kind: 'auth-session',
        resourceId: 'prodivix-product-session',
      }),
      inputDigest:
        'sha256-745bde61318aef5b462b198c234b2b9111e1892929418b48a1f12e943fa49733',
      outcome: Object.freeze({
        kind: 'result',
        value: Object.freeze({
          principalId: 'golden-catalog-owner',
          permissionIds: Object.freeze(['workspace.owner']),
        }),
      }),
    }),
  ]),
});

export const GOLDEN_G3_LOGIN_FIXTURE_DIGEST = digestBehaviorValue(
  GOLDEN_G3_LOGIN_FIXTURE_SET
);

const routeTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createRouteSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G2_VUE_CATALOG_IDS.route
  ),
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  capability: 'behavior:route:navigate',
});

const createProductTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createPirNodeSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G2_VUE_CATALOG_IDS.page,
    'create-product'
  ),
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:click',
});

const createdProductTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: createPirNodeSymbolId(
    GOLDEN_G2_VUE_CATALOG_IDS.workspace,
    GOLDEN_G2_VUE_CATALOG_IDS.page,
    'product-card'
  ),
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:visible',
  instanceScope: Object.freeze({
    kind: 'collection-item' as const,
    id: 'p2',
  }),
});

export const GOLDEN_G3_CATALOG_SCENARIO: BehaviorScenario = Object.freeze({
  id: GOLDEN_G3_SCENARIO_IDS.scenario,
  name: 'Authenticated Catalog add item',
  criticality: 'critical',
  tags: Object.freeze(['catalog', 'golden']),
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
        target: routeTarget,
        input: '/',
        capabilityId: 'route.navigate',
        runtimeZone: 'client',
        effect: 'write',
        cancellation: 'cooperative',
      }),
    }),
    Object.freeze({
      id: 'create-product',
      kind: 'action',
      failureMode: 'stop',
      action: Object.freeze({
        kind: 'semantic-click',
        target: createProductTarget,
        capabilityId: 'pir.click',
        runtimeZone: 'client',
        effect: 'none',
        cancellation: 'none',
      }),
    }),
    Object.freeze({
      id: 'created-product-visible',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'visible',
        target: createdProductTarget,
        expected: true,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'p2-visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
    }),
  ]),
  fixtureRefs: Object.freeze([
    Object.freeze({
      documentId: GOLDEN_G3_SCENARIO_IDS.fixture,
      digest: GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
    }),
  ]),
  controlProfileRef: Object.freeze({
    kind: 'preset',
    presetId: 'deterministic-default',
    digest: CONTROL_PROFILE_DIGEST,
  }),
  baselineRefs: Object.freeze([]),
  timeoutPolicy: Object.freeze({
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 1_000,
  }),
});

export const GOLDEN_G3_CATALOG_WORKSPACE: WorkspaceSnapshot = Object.freeze({
  ...GOLDEN_G2_VUE_CATALOG_WORKSPACE,
  workspaceRev: GOLDEN_G2_VUE_CATALOG_WORKSPACE.workspaceRev + 1,
  opSeq: GOLDEN_G2_VUE_CATALOG_WORKSPACE.opSeq + 1,
  treeById: {
    ...GOLDEN_G2_VUE_CATALOG_WORKSPACE.treeById,
    root: {
      ...GOLDEN_G2_VUE_CATALOG_WORKSPACE.treeById.root!,
      children: [
        ...(GOLDEN_G2_VUE_CATALOG_WORKSPACE.treeById.root!.children ?? []),
        'behavior-scenario-node',
        'behavior-fixture-node',
      ],
    },
    'behavior-scenario-node': {
      id: 'behavior-scenario-node',
      kind: 'doc' as const,
      name: 'catalog.behavior.json',
      parentId: 'root',
      docId: GOLDEN_G3_SCENARIO_IDS.scenario,
    },
    'behavior-fixture-node': {
      id: 'behavior-fixture-node',
      kind: 'doc' as const,
      name: 'catalog-login.fixture.json',
      parentId: 'root',
      docId: GOLDEN_G3_SCENARIO_IDS.fixture,
    },
  },
  docsById: {
    ...GOLDEN_G2_VUE_CATALOG_WORKSPACE.docsById,
    [GOLDEN_G3_SCENARIO_IDS.scenario]: {
      id: GOLDEN_G3_SCENARIO_IDS.scenario,
      type: 'behavior-scenario' as const,
      name: GOLDEN_G3_CATALOG_SCENARIO.name,
      path: '/catalog.behavior.json',
      contentRev: 1,
      metaRev: 1,
      content: GOLDEN_G3_CATALOG_SCENARIO,
    },
    [GOLDEN_G3_SCENARIO_IDS.fixture]: {
      id: GOLDEN_G3_SCENARIO_IDS.fixture,
      type: 'behavior-fixture-set' as const,
      name: GOLDEN_G3_LOGIN_FIXTURE_SET.name,
      path: '/catalog-login.fixture.json',
      contentRev: 1,
      metaRev: 1,
      content: GOLDEN_G3_LOGIN_FIXTURE_SET,
    },
  },
});

const behaviorRegistry = () => {
  const result = createBehaviorRegistry([
    BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
    PIR_BEHAVIOR_REGISTRY_CONTRIBUTION,
    DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
  ]);
  if (!result.ok) {
    throw new Error(
      `Golden Behavior registry is invalid: ${JSON.stringify(result.issues)}`
    );
  }
  return result.registry;
};

export const createGoldenG3CatalogProgram = (): BehaviorScenarioProgram => {
  const semantic = createWorkspaceSemanticIndexFromSnapshot(
    GOLDEN_G3_CATALOG_WORKSPACE
  );
  if (semantic.status !== 'ready') {
    throw new Error(
      `Golden Behavior Semantic Index is blocked: ${JSON.stringify(semantic.issues)}`
    );
  }
  const compiled = compileBehaviorScenario({
    scenario: GOLDEN_G3_CATALOG_SCENARIO,
    scenarioDocumentId: GOLDEN_G3_SCENARIO_IDS.scenario,
    workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
    semanticIndex: semantic.index,
    executableSnapshotDigest: digestBehaviorValue({
      workspaceId: GOLDEN_G3_CATALOG_WORKSPACE.id,
      workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
    }),
    compilerDigest: COMPILER_DIGEST,
    registry: behaviorRegistry(),
    fixtureSetDigests: [GOLDEN_G3_LOGIN_FIXTURE_DIGEST],
  });
  if (compiled.status !== 'ready') {
    throw new Error(
      `Golden Behavior Program is blocked: ${JSON.stringify(compiled.issues)}`
    );
  }
  return compiled.program;
};

const projectOptions = Object.freeze({
  dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  dataMockProvision: GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  serverRuntimeMockProvision: GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
  assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
});

export const createGoldenG3ReactCatalogSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceReactViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      {
        ...projectOptions,
        projectName: 'G3 React Catalog Scenario',
      }
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 React target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return result.snapshot;
  };

export const createGoldenG3VueCatalogSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      {
        ...projectOptions,
        projectName: 'G3 Vue Catalog Scenario',
      }
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 Vue target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return result.snapshot;
  };

const bundleFromSnapshot = (
  snapshot: ExecutableProjectSnapshot
): GoldenGeneratedProjectBundle =>
  Object.freeze({
    files: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
  });

export const createGoldenG3ReactCatalogBundle =
  (): GoldenGeneratedProjectBundle =>
    bundleFromSnapshot(createGoldenG3ReactCatalogSnapshot());

export const createGoldenG3VueCatalogBundle =
  (): GoldenGeneratedProjectBundle =>
    bundleFromSnapshot(createGoldenG3VueCatalogSnapshot());
