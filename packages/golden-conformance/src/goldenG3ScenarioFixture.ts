import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID,
  compileBehaviorScenario,
  createBehaviorRegistry,
  digestBehaviorControlProfile,
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
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
  type WorkspaceDiagnosticCompilerTarget,
  type WorkspaceVerificationCompileProfile,
} from '@prodivix/prodivix-compiler';
import { ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/router';
import {
  createExecutableProjectSnapshot,
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
  productionSecurityScenario: 'scenario-catalog-production-security',
  fixture: 'fixture-catalog-login',
});

export const GOLDEN_G3_CONTROL_PROFILE_DIGEST = digestBehaviorControlProfile(
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
);
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

const routeLocationTarget = Object.freeze({
  ...routeTarget,
  capability: 'behavior:route:location',
});

export const GOLDEN_G3_CREATE_PRODUCT_SYMBOL_ID = createPirNodeSymbolId(
  GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  GOLDEN_G2_VUE_CATALOG_IDS.page,
  'create-product'
);

const createProductTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: GOLDEN_G3_CREATE_PRODUCT_SYMBOL_ID,
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:click',
});

export const GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID = createPirNodeSymbolId(
  GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  GOLDEN_G2_VUE_CATALOG_IDS.page,
  'update-product'
);

const updateProductTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID,
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:visible',
});

export const GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID = createPirNodeSymbolId(
  GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  GOLDEN_G2_VUE_CATALOG_IDS.page,
  'catalog-root'
);

const catalogRootTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID,
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:visible',
});

export const GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID = createPirNodeSymbolId(
  GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  GOLDEN_G2_VUE_CATALOG_IDS.page,
  'catalog-live-status'
);

const catalogLiveStatusTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID,
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:visible',
});

export const GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID = createPirNodeSymbolId(
  GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  GOLDEN_G2_VUE_CATALOG_IDS.page,
  'catalog-image'
);

const catalogImageTarget = Object.freeze({
  kind: 'semantic-symbol' as const,
  id: GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID,
  workspaceDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
  capability: 'behavior:pir:visible',
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
      id: 'catalog-auth-principal',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'route',
        target: routeLocationTarget,
        expected: Object.freeze({
          providerId: 'prodivix-product-session',
          principalId: 'golden-catalog-owner',
        }),
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'catalog-auth-principal-equals',
          operator: 'equals',
          expected: Object.freeze({
            providerId: 'prodivix-product-session',
            principalId: 'golden-catalog-owner',
          }),
        }),
      ]),
    }),
    Object.freeze({
      id: 'catalog-root-visible',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'visible',
        target: catalogRootTarget,
        expected: true,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'catalog-root-visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
    }),
    Object.freeze({
      id: 'catalog-live-status-visible',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'visible',
        target: catalogLiveStatusTarget,
        expected: true,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'catalog-live-status-visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
    }),
    Object.freeze({
      id: 'update-product-visible',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'visible',
        target: updateProductTarget,
        expected: true,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'update-product-visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
    }),
    Object.freeze({
      id: 'catalog-image-visible',
      kind: 'observation',
      failureMode: 'stop',
      observation: Object.freeze({
        kind: 'visible',
        target: catalogImageTarget,
        expected: true,
      }),
      assertions: Object.freeze([
        Object.freeze({
          id: 'catalog-image-visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
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
    presetId: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID,
    digest: GOLDEN_G3_CONTROL_PROFILE_DIGEST,
  }),
  baselineRefs: Object.freeze([]),
  timeoutPolicy: Object.freeze({
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 1_000,
  }),
});

const PRODUCTION_SECURITY_STEP_IDS = new Set([
  'open-catalog',
  'catalog-root-visible',
  'catalog-image-visible',
]);

export const GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO: BehaviorScenario =
  Object.freeze({
    ...GOLDEN_G3_CATALOG_SCENARIO,
    id: GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario,
    name: 'Production Catalog security black-box',
    tags: Object.freeze(['catalog', 'golden', 'production-security']),
    steps: Object.freeze(
      GOLDEN_G3_CATALOG_SCENARIO.steps.filter(({ id }) =>
        PRODUCTION_SECURITY_STEP_IDS.has(id)
      )
    ),
    fixtureRefs: Object.freeze([]),
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
        'behavior-production-security-scenario-node',
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
    'behavior-production-security-scenario-node': {
      id: 'behavior-production-security-scenario-node',
      kind: 'doc' as const,
      name: 'catalog-production-security.behavior.json',
      parentId: 'root',
      docId: GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario,
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
    [GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario]: {
      id: GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario,
      type: 'behavior-scenario' as const,
      name: GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.name,
      path: '/catalog-production-security.behavior.json',
      contentRev: 1,
      metaRev: 1,
      content: GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
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

const compileGoldenG3CatalogProgram = (
  scenario: BehaviorScenario,
  fixtureSetDigests: readonly string[],
  executableSnapshotDigest: string
): BehaviorScenarioProgram => {
  const semantic = createWorkspaceSemanticIndexFromSnapshot(
    GOLDEN_G3_CATALOG_WORKSPACE
  );
  if (semantic.status !== 'ready') {
    throw new Error(
      `Golden Behavior Semantic Index is blocked: ${JSON.stringify(semantic.issues)}`
    );
  }
  const compiled = compileBehaviorScenario({
    scenario,
    scenarioDocumentId: scenario.id,
    workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
    semanticIndex: semantic.index,
    executableSnapshotDigest,
    compilerDigest: COMPILER_DIGEST,
    registry: behaviorRegistry(),
    fixtureSetDigests,
  });
  if (compiled.status !== 'ready') {
    throw new Error(
      `Golden Behavior Program is blocked: ${JSON.stringify(compiled.issues)}`
    );
  }
  return compiled.program;
};

const defaultGoldenG3ExecutableSnapshotDigest = (): string =>
  digestBehaviorValue({
    workspaceId: GOLDEN_G3_CATALOG_WORKSPACE.id,
    workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
  });

export const createGoldenG3CatalogProgram = (
  executableSnapshotDigest = defaultGoldenG3ExecutableSnapshotDigest()
): BehaviorScenarioProgram =>
  compileGoldenG3CatalogProgram(
    GOLDEN_G3_CATALOG_SCENARIO,
    Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_DIGEST]),
    executableSnapshotDigest
  );

export const createGoldenG3ProductionSecurityProgram = (
  executableSnapshotDigest = defaultGoldenG3ExecutableSnapshotDigest()
): BehaviorScenarioProgram =>
  compileGoldenG3CatalogProgram(
    GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
    Object.freeze([]),
    executableSnapshotDigest
  );

export const createGoldenG3VerificationCompileProfile = (
  program: BehaviorScenarioProgram = createGoldenG3CatalogProgram()
): WorkspaceVerificationCompileProfile => {
  const targets = Object.freeze(
    program.targetManifest
      .filter((target) => {
        const document =
          GOLDEN_G3_CATALOG_WORKSPACE.docsById[
            target.source.workspaceDocumentId
          ];
        return (
          document?.type === 'pir-page' || document?.type === 'pir-component'
        );
      })
      .map((target) => {
        if (
          target.instanceScope &&
          target.instanceScope.kind !== 'collection-item'
        ) {
          throw new Error(
            `Golden verification target "${target.targetId}" has unsupported instance scope "${target.instanceScope.kind}".`
          );
        }
        return Object.freeze({
          targetId: target.targetId,
          readiness: Object.freeze(
            target.capability.includes(':visible')
              ? (['document-ready', 'mounted', 'visible'] as const)
              : (['document-ready', 'enabled', 'mounted', 'visible'] as const)
          ),
          sourceRef: Object.freeze({
            workspaceDocumentId: target.source.workspaceDocumentId,
            path: target.source.path,
          }),
          ...(target.instanceScope
            ? {
                instanceScope: Object.freeze({
                  kind: 'collection-item' as const,
                  id: target.instanceScope.id,
                }),
              }
            : {}),
        });
      })
  );
  return Object.freeze({
    kind: 'verification',
    workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
    profileDigest: digestBehaviorValue({
      format: 'prodivix.golden-g3-v6-verification-profile.v1',
      workspaceRevision: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev,
      scenarioProgramDigest: program.programDigest,
      semanticSnapshotDigest: program.semanticSnapshotDigest,
      targets,
    }),
    scenarioProgramDigest: program.programDigest,
    semanticSnapshotDigest: program.semanticSnapshotDigest,
    targets,
  });
};

const projectOptions = Object.freeze({
  dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  dataMockProvision: GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  serverRuntimeMockProvision: GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
  assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
});

export const createGoldenG3V6ReactCompilerTarget = (): Extract<
  WorkspaceDiagnosticCompilerTarget,
  Readonly<{ presetId: 'react-vite' }>
> =>
  Object.freeze({
    presetId: 'react-vite',
    options: Object.freeze({
      ...projectOptions,
      projectName: 'G3 V6 React Catalog Verification',
      verificationProfile: createGoldenG3VerificationCompileProfile(),
    }),
  });

export const createGoldenG3V6VueCompilerTarget = (): Extract<
  WorkspaceDiagnosticCompilerTarget,
  Readonly<{ presetId: 'vue-vite' }>
> =>
  Object.freeze({
    presetId: 'vue-vite',
    options: Object.freeze({
      ...projectOptions,
      projectName: 'G3 V6 Vue Catalog Verification',
      verificationProfile: createGoldenG3VerificationCompileProfile(),
    }),
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

export const createGoldenG3V6ReactCatalogSnapshot =
  (): ExecutableProjectSnapshot => {
    const target = createGoldenG3V6ReactCompilerTarget();
    const result = generateWorkspaceReactViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      target.options ?? {}
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 V6 React target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return result.snapshot;
  };

export const createGoldenG3V6VueCatalogSnapshot =
  (): ExecutableProjectSnapshot => {
    const target = createGoldenG3V6VueCompilerTarget();
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      target.options ?? {}
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 V6 Vue target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return result.snapshot;
  };

const productionProjectOptions = Object.freeze({
  dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
});

const projectGoldenG3V6ProductionSnapshot = (
  snapshot: ExecutableProjectSnapshot
): ExecutableProjectSnapshot => {
  const testEntrypointPaths = new Set(
    snapshot.entrypoints
      .filter(({ kind }) => kind === 'test')
      .map(({ path }) => path)
  );
  const productionToolchainTestSource =
    snapshot.target.presetId === 'react-vite'
      ? [
          "import { describe, expect, it } from 'vitest';",
          "import App from './App';",
          '',
          "describe('production toolchain smoke', () => {",
          "  it('loads the production React entry', () => {",
          "    expect(typeof App).toBe('function');",
          '  });',
          '});',
          '',
        ].join('\n')
      : [
          "import { describe, expect, it } from 'vitest';",
          "import { prodivixDataOperations } from './prodivix-data-operations';",
          '',
          "describe('production toolchain smoke', () => {",
          "  it('loads the production Vue operation manifest', () => {",
          '    expect(Array.isArray(prodivixDataOperations)).toBe(true);',
          '  });',
          '});',
          '',
        ].join('\n');
  return createExecutableProjectSnapshot({
    workspace: snapshot.workspace,
    target: snapshot.target,
    files: snapshot.files.map((file) =>
      testEntrypointPaths.has(file.path)
        ? Object.freeze({
            ...file,
            contents: productionToolchainTestSource,
          })
        : file
    ),
    dependencyPlan: {
      manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
      ...(snapshot.dependencyPlan.lockFilePath
        ? { lockFilePath: snapshot.dependencyPlan.lockFilePath }
        : {}),
    },
    entrypoints: snapshot.entrypoints.filter(({ kind }) => kind !== 'test'),
    capabilityRequirements: snapshot.capabilityRequirements,
    publicBuildConfiguration: snapshot.publicBuildConfiguration,
    resourceHints: snapshot.resourceHints,
    cacheHints: snapshot.cacheHints,
    ...(snapshot.dataMockProvision
      ? { dataMockProvision: snapshot.dataMockProvision }
      : {}),
    ...(snapshot.serverRuntimeMockProvision
      ? { serverRuntimeMockProvision: snapshot.serverRuntimeMockProvision }
      : {}),
    ...(snapshot.serverFunctionPlan
      ? { serverFunctionPlan: snapshot.serverFunctionPlan }
      : {}),
    installCommand: snapshot.installCommand,
    previewCommand: snapshot.previewCommand,
    buildCommand: snapshot.buildCommand,
    previewPlan: snapshot.previewPlan,
    buildPlan: snapshot.buildPlan,
    testPlan: snapshot.testPlan,
  });
};

export const createGoldenG3V6ReactProductionSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceReactViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      {
        ...productionProjectOptions,
        projectName: 'G3 V6 React Catalog Production',
      }
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 V6 React production target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return projectGoldenG3V6ProductionSnapshot(result.snapshot);
  };

export const createGoldenG3V6VueProductionSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G3_CATALOG_WORKSPACE,
      {
        ...productionProjectOptions,
        projectName: 'G3 V6 Vue Catalog Production',
      }
    );
    if (result.status === 'blocked') {
      throw new Error(
        `Golden G3 V6 Vue production target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    }
    return projectGoldenG3V6ProductionSnapshot(result.snapshot);
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

export const createGoldenG3V6ReactCatalogBundle =
  (): GoldenGeneratedProjectBundle =>
    bundleFromSnapshot(createGoldenG3V6ReactCatalogSnapshot());

export const createGoldenG3V6VueCatalogBundle =
  (): GoldenGeneratedProjectBundle =>
    bundleFromSnapshot(createGoldenG3V6VueCatalogSnapshot());
