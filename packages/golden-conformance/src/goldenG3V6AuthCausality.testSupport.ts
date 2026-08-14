import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  compileBehaviorScenario,
  createBehaviorRegistry,
  digestBehaviorValue,
  type BehaviorFixtureSet,
  type BehaviorScenario,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import { DATA_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/data';
import { PIR_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/pir';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  createCompilerFixtureProjectionSnapshot,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
  issueCompilerFixtureProjectionReceipt,
  type WorkspaceVerificationCompileProfile,
} from '@prodivix/prodivix-compiler';
import {
  ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
  type WorkspaceRouteNode,
} from '@prodivix/router';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import {
  createVerificationPlan,
  digestVerificationValue,
  normalizeVerificationPolicy,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  GOLDEN_BROWSER_RESPONSE_POLICIES,
  prepareGoldenBrowserProject,
  type GoldenPreparedBrowserProject,
} from './generatedProjectHarness';
import {
  GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
  GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
  GOLDEN_G2_VUE_CATALOG_IDS,
  GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
} from './goldenG2VueCatalogFixture';
import {
  createGoldenG3V6PlanInput,
  GOLDEN_G3_V6_SCENARIOS,
} from './goldenG3V6AdapterMatrixFixture';
import {
  createGoldenG3V6ControlledMatrixManifest,
  type GoldenG3V6AttemptProvider,
  type GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import type { GoldenG3V6PreparedFramework } from './goldenG3V6BrowserMatrixProjects';
import { GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT } from './goldenG3V6RuntimeControlBindings';
import {
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
  GOLDEN_G3_SCENARIO_IDS,
} from './goldenG3ScenarioFixture';

const COMPILER_DIGEST =
  'sha256-4266589e62f804053220dfe2e24afc862b44d26fa496123abe27639a4103090d';

export type GoldenG3V6AuthCausalityVariant =
  'positive' | 'wrong-principal' | 'missing-permission' | 'unconsumed';

export type GoldenG3V6AuthCausalityPreparedAttempt = Readonly<{
  plan: VerificationPlan;
  cell: VerificationPlanCell;
  row: GoldenG3V6MatrixRowManifest;
  provider: GoldenG3V6AttemptProvider;
  fixtureSet: BehaviorFixtureSet;
  program: BehaviorScenarioProgram;
  framework: GoldenG3V6PreparedFramework;
}>;

export type GoldenG3V6AuthCausalityPreparedTarget = Readonly<{
  frameworkTarget: 'react-vite' | 'vue-vite';
  buildCount: 1;
  immutableExecutableBuildDigest: string;
  toolchainAuthorityRequestDigest: string;
  attempts: Readonly<
    Record<
      GoldenG3V6AuthCausalityVariant,
      GoldenG3V6AuthCausalityPreparedAttempt
    >
  >;
  dispose(): Promise<void>;
}>;

const fixtureSetFor = (
  variant: GoldenG3V6AuthCausalityVariant
): BehaviorFixtureSet => {
  const principalId =
    variant === 'wrong-principal'
      ? 'wrong-catalog-principal'
      : 'golden-catalog-owner';
  const permissionIds =
    variant === 'missing-permission'
      ? Object.freeze([])
      : Object.freeze(['workspace.owner']);
  return Object.freeze({
    ...GOLDEN_G3_LOGIN_FIXTURE_SET,
    name: `Catalog auth causality ${variant}`,
    fixtures: Object.freeze([
      Object.freeze({
        ...GOLDEN_G3_LOGIN_FIXTURE_SET.fixtures[0]!,
        outcome: Object.freeze({
          kind: 'result' as const,
          value: Object.freeze({
            principalId,
            permissionIds,
          }),
        }),
      }),
    ]),
  });
};

const serverProvisionFor = (
  variant: GoldenG3V6AuthCausalityVariant
): ServerRuntimeTestProvision =>
  Object.freeze({
    ...GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
    fixtureSetId: `golden-g3-v6-auth-causality-${variant}`,
    principal: Object.freeze({
      providerId: 'prodivix-product-session',
      principalId:
        variant === 'wrong-principal'
          ? 'wrong-catalog-principal'
          : 'golden-catalog-owner',
    }),
    permissions: Object.freeze([
      variant === 'missing-permission'
        ? Object.freeze({
            permissionId: 'workspace.owner',
            allowed: false,
            code: 'AUTH_PERMISSION_DENIED',
          })
        : Object.freeze({
            permissionId: 'workspace.owner',
            allowed: true,
          }),
    ]),
  });

const scenarioWithPath = (path: '/' | '/catalog'): BehaviorScenario => {
  const open = GOLDEN_G3_CATALOG_SCENARIO.steps.find(
    ({ id }) => id === 'open-catalog'
  );
  if (!open || open.kind !== 'action') {
    throw new Error('Golden auth causality navigation step is unavailable.');
  }
  return Object.freeze({
    ...GOLDEN_G3_CATALOG_SCENARIO,
    steps: Object.freeze(
      GOLDEN_G3_CATALOG_SCENARIO.steps.map((step) =>
        step.id === open.id
          ? Object.freeze({
              ...open,
              action: Object.freeze({
                ...open.action,
                input: path,
              }),
            })
          : step
      )
    ),
  });
};

const deniedScenario = (
  protectedScenario: BehaviorScenario
): BehaviorScenario => {
  const open = protectedScenario.steps.find(({ id }) => id === 'open-catalog');
  const principal = GOLDEN_G3_CATALOG_SCENARIO.steps.find(
    ({ id }) => id === 'catalog-auth-principal'
  );
  if (!open || !principal || principal.kind !== 'observation') {
    throw new Error('Golden auth causality Scenario steps are unavailable.');
  }
  const expected = Object.freeze({ status: 'denied' });
  return Object.freeze({
    ...protectedScenario,
    name: 'Catalog route denies a principal without workspace.owner',
    steps: Object.freeze([
      open,
      Object.freeze({
        ...principal,
        id: 'catalog-route-runtime-denied',
        observation: Object.freeze({
          ...principal.observation,
          expected,
        }),
        assertions: Object.freeze([
          Object.freeze({
            id: 'catalog-route-runtime-denied',
            operator: 'equals' as const,
            expected,
          }),
        ]),
      }),
    ]),
  });
};

const unconsumedScenario = (): BehaviorScenario => {
  const publicScenario = scenarioWithPath('/');
  const steps = publicScenario.steps.filter(
    ({ id }) => id === 'open-catalog' || id === 'catalog-root-visible'
  );
  if (steps.length !== 2) {
    throw new Error(
      'Golden auth causality public-route Scenario steps are unavailable.'
    );
  }
  return Object.freeze({
    ...publicScenario,
    name: 'Catalog public route leaves the Auth fixture unconsumed',
    steps: Object.freeze(steps),
  });
};

const causalityRouteRoot = (): WorkspaceRouteNode => {
  const originalRoot = GOLDEN_G3_CATALOG_WORKSPACE.routeManifest.root;
  const shell = originalRoot.children?.find(
    ({ id }) => id === GOLDEN_G2_VUE_CATALOG_IDS.shellRoute
  );
  const catalog = shell?.children?.find(
    ({ id }) => id === GOLDEN_G2_VUE_CATALOG_IDS.route
  );
  if (!shell || !catalog || !catalog.runtime) {
    throw new Error('Golden auth causality Catalog route is unavailable.');
  }
  const { index: _protectedIndex, ...protectedCatalog } = catalog;
  const { runtime: _publicRuntime, ...publicCatalog } = catalog;
  const publicRoute = Object.freeze({
    ...publicCatalog,
    id: `${GOLDEN_G2_VUE_CATALOG_IDS.route}:public`,
    index: true,
  });
  const protectedRoute = Object.freeze({
    ...protectedCatalog,
    segment: 'catalog',
  });
  return Object.freeze({
    ...originalRoot,
    children: originalRoot.children!.map((child) =>
      child.id === shell.id
        ? Object.freeze({
            ...shell,
            children: [
              ...shell.children!.filter(
                ({ id }) => id !== GOLDEN_G2_VUE_CATALOG_IDS.route
              ),
              publicRoute,
              protectedRoute,
            ],
          })
        : child
    ),
  });
};

const workspaceFor = (
  fixtureSet: BehaviorFixtureSet,
  scenario: BehaviorScenario
): WorkspaceSnapshot => {
  const fixtureDocument =
    GOLDEN_G3_CATALOG_WORKSPACE.docsById[GOLDEN_G3_SCENARIO_IDS.fixture];
  const scenarioDocument =
    GOLDEN_G3_CATALOG_WORKSPACE.docsById[GOLDEN_G3_SCENARIO_IDS.scenario];
  if (
    fixtureDocument?.type !== 'behavior-fixture-set' ||
    scenarioDocument?.type !== 'behavior-scenario'
  ) {
    throw new Error('Golden auth causality Workspace documents are invalid.');
  }
  return Object.freeze({
    ...GOLDEN_G3_CATALOG_WORKSPACE,
    workspaceRev: GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev + 1,
    routeRev: GOLDEN_G3_CATALOG_WORKSPACE.routeRev + 1,
    opSeq: GOLDEN_G3_CATALOG_WORKSPACE.opSeq + 1,
    routeManifest: Object.freeze({
      ...GOLDEN_G3_CATALOG_WORKSPACE.routeManifest,
      root: causalityRouteRoot(),
    }),
    docsById: Object.freeze({
      ...GOLDEN_G3_CATALOG_WORKSPACE.docsById,
      [GOLDEN_G3_SCENARIO_IDS.fixture]: Object.freeze({
        ...fixtureDocument,
        contentRev: fixtureDocument.contentRev + 1,
        content: fixtureSet,
      }),
      [GOLDEN_G3_SCENARIO_IDS.scenario]: Object.freeze({
        ...scenarioDocument,
        contentRev: scenarioDocument.contentRev + 1,
        content: scenario,
      }),
    }),
  });
};

const behaviorRegistry = () => {
  const result = createBehaviorRegistry([
    BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
    PIR_BEHAVIOR_REGISTRY_CONTRIBUTION,
    DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
  ]);
  if (!result.ok) {
    throw new Error(
      `Golden auth causality Behavior registry is invalid: ${JSON.stringify(result.issues)}`
    );
  }
  return result.registry;
};

const compileProgram = (input: {
  workspace: WorkspaceSnapshot;
  scenario: BehaviorScenario;
  fixtureSet: BehaviorFixtureSet;
  executableSnapshotDigest: string;
}): BehaviorScenarioProgram => {
  const semantic = createWorkspaceSemanticIndexFromSnapshot(input.workspace);
  if (semantic.status !== 'ready') {
    throw new Error(
      `Golden auth causality Semantic Index is blocked: ${JSON.stringify(semantic.issues)}`
    );
  }
  const compiled = compileBehaviorScenario({
    scenario: input.scenario,
    scenarioDocumentId: input.scenario.id,
    workspaceRevision: input.workspace.workspaceRev,
    semanticIndex: semantic.index,
    executableSnapshotDigest: input.executableSnapshotDigest,
    compilerDigest: COMPILER_DIGEST,
    registry: behaviorRegistry(),
    fixtureSetDigests: Object.freeze([digestBehaviorValue(input.fixtureSet)]),
  });
  if (compiled.status !== 'ready') {
    throw new Error(
      `Golden auth causality Program is blocked: ${JSON.stringify(compiled.issues)}`
    );
  }
  return compiled.program;
};

const verificationProfile = (
  workspace: WorkspaceSnapshot,
  program: BehaviorScenarioProgram
): WorkspaceVerificationCompileProfile => {
  const targets = Object.freeze(
    program.targetManifest
      .filter((target) => {
        const document = workspace.docsById[target.source.workspaceDocumentId];
        return (
          document?.type === 'pir-page' || document?.type === 'pir-component'
        );
      })
      .map((target) =>
        Object.freeze({
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
          ...(target.instanceScope?.kind === 'collection-item'
            ? {
                instanceScope: Object.freeze({
                  kind: 'collection-item' as const,
                  id: target.instanceScope.id,
                }),
              }
            : {}),
        })
      )
  );
  return Object.freeze({
    kind: 'verification',
    workspaceRevision: workspace.workspaceRev,
    profileDigest: digestBehaviorValue({
      format: 'prodivix.golden-g3-v6-auth-causality-profile.v1',
      workspaceRevision: workspace.workspaceRev,
      scenarioProgramDigest: program.programDigest,
      semanticSnapshotDigest: program.semanticSnapshotDigest,
      targets,
    }),
    scenarioProgramDigest: program.programDigest,
    semanticSnapshotDigest: program.semanticSnapshotDigest,
    targets,
  });
};

const executableSnapshot = (
  frameworkTarget: 'react-vite' | 'vue-vite',
  variant: GoldenG3V6AuthCausalityVariant,
  workspace: WorkspaceSnapshot,
  fixtureSet: BehaviorFixtureSet,
  scenario: BehaviorScenario
): ExecutableProjectSnapshot => {
  const placeholderProgram = compileProgram({
    workspace,
    scenario,
    fixtureSet,
    executableSnapshotDigest: digestBehaviorValue({
      workspaceId: workspace.id,
      workspaceRevision: workspace.workspaceRev,
    }),
  });
  const options = {
    dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
    dataMockProvision: GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
    serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
    serverRuntimeMockProvision: serverProvisionFor(variant),
    assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
    projectName: `G3 V6 ${frameworkTarget} auth causality`,
    verificationProfile: verificationProfile(workspace, placeholderProgram),
  };
  const generated =
    frameworkTarget === 'react-vite'
      ? generateWorkspaceReactViteExecutableProject(workspace, options)
      : generateWorkspaceVueViteExecutableProject(workspace, options);
  if (generated.status === 'blocked') {
    throw new Error(
      `Golden auth causality ${frameworkTarget}/${variant} target is blocked: ${JSON.stringify(generated.diagnostics)}`
    );
  }
  return createCompilerFixtureProjectionSnapshot({
    snapshot: generated.snapshot,
    fixtureSets: Object.freeze([fixtureSet]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  });
};

const planFor = (fixtureSet: BehaviorFixtureSet): VerificationPlan => {
  const fixtureSetRef = Object.freeze({
    documentId: fixtureSet.id,
    digest: digestBehaviorValue(fixtureSet),
  });
  const scenarios = Object.freeze(
    GOLDEN_G3_V6_SCENARIOS.map((scenario) =>
      scenario.id === GOLDEN_G3_SCENARIO_IDS.scenario
        ? Object.freeze({ ...scenario, fixtureSetRef })
        : scenario
    )
  );
  const base = createGoldenG3V6PlanInput({ scenarios });
  const policy = normalizeVerificationPolicy({
    ...base.policy,
    rules: base.policy.rules.map((rule) =>
      rule.fixtureSetRef === undefined
        ? rule
        : Object.freeze({ ...rule, fixtureSetRef })
    ),
  });
  const result = createVerificationPlan({
    ...base,
    policy,
    policyDigest: digestVerificationValue(policy),
    scenarioRegistryDigest: digestVerificationValue(scenarios),
    scenarios,
  });
  if (result.status !== 'ready') {
    throw new Error(
      `Golden auth causality Plan is blocked: ${JSON.stringify(result.plan)}`
    );
  }
  return result.plan;
};

type GoldenG3V6AuthCausalityDraft = Readonly<{
  variant: GoldenG3V6AuthCausalityVariant;
  fixtureSet: BehaviorFixtureSet;
  program: BehaviorScenarioProgram;
  snapshot: ExecutableProjectSnapshot;
}>;

const draftFor = (
  frameworkTarget: 'react-vite' | 'vue-vite',
  variant: GoldenG3V6AuthCausalityVariant
): GoldenG3V6AuthCausalityDraft => {
  const fixtureSet = fixtureSetFor(variant);
  const protectedScenario = scenarioWithPath('/catalog');
  const scenario =
    variant === 'missing-permission'
      ? deniedScenario(protectedScenario)
      : variant === 'unconsumed'
        ? unconsumedScenario()
        : protectedScenario;
  const workspace = workspaceFor(fixtureSet, scenario);
  const snapshot = executableSnapshot(
    frameworkTarget,
    variant,
    workspace,
    fixtureSet,
    scenario
  );
  return Object.freeze({
    variant,
    fixtureSet,
    snapshot,
    program: compileProgram({
      workspace,
      scenario,
      fixtureSet,
      executableSnapshotDigest: snapshot.contentDigest,
    }),
  });
};

const digestBytes = (contents: Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const projectionBuildBundle = (
  snapshot: ExecutableProjectSnapshot,
  immutableBuild: ExecutionBuildBundle
): ExecutionBuildBundle => {
  const source = projectExecutableProjectRuntimeFiles(snapshot, 'test').find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  const original = immutableBuild.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_BUILD_PATH
  );
  if (!source || !original) {
    throw new Error(
      'Golden auth causality build has no Compiler fixture projection.'
    );
  }
  const contents =
    typeof source.contents === 'string'
      ? new TextEncoder().encode(source.contents)
      : new Uint8Array(source.contents);
  return Object.freeze({
    ...immutableBuild,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze(
      immutableBuild.files.map((file) =>
        file.path === COMPILER_FIXTURE_PROJECTION_BUILD_PATH
          ? Object.freeze({
              path: file.path,
              size: contents.byteLength,
              digest: digestBytes(contents),
              contents,
            })
          : file
      )
    ),
  });
};

const contentTypeFor = (path: string): string =>
  path.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : path.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : path.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : path.endsWith('.json') || path.endsWith('.map')
          ? 'application/json; charset=utf-8'
          : path.endsWith('.svg')
            ? 'image/svg+xml'
            : path.endsWith('.woff2')
              ? 'font/woff2'
              : path.endsWith('.woff')
                ? 'font/woff'
                : 'application/octet-stream';

const startProjectedProject = async (
  sharedProject: GoldenPreparedBrowserProject,
  buildBundle: ExecutionBuildBundle
): Promise<GoldenPreparedBrowserProject> => {
  if (!sharedProject.toolchain) {
    throw new Error('Golden auth causality shared toolchain is unavailable.');
  }
  const files = new Map(
    buildBundle.files.map((file) => [file.path, file] as const)
  );
  const entry = files.get('index.html');
  if (!entry) {
    throw new Error('Golden auth causality build has no index.html.');
  }
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__prodivix-golden-host.html') {
        const payload = Buffer.from(
          GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT,
          'utf8'
        );
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': payload.byteLength,
          'content-security-policy':
            GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy,
          'content-type': 'text/html; charset=utf-8',
          'permissions-policy':
            GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy,
        });
        response.end(request.method === 'HEAD' ? undefined : payload);
        return;
      }
      let decodedPath = '';
      try {
        decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/u, '');
      } catch {
        decodedPath = '';
      }
      const file = files.get(decodedPath) ?? entry;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': file.contents.byteLength,
        'content-security-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy,
        'content-type': contentTypeFor(file.path),
        'permissions-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy,
      });
      response.end(
        request.method === 'HEAD' ? undefined : Buffer.from(file.contents)
      );
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Golden auth causality projected server has no address.');
  }
  let disposed = false;
  return Object.freeze({
    bundleFileCount: sharedProject.bundleFileCount,
    packageManager: sharedProject.packageManager,
    origin: `http://127.0.0.1:${address.port}`,
    toolchain: Object.freeze({
      ...sharedProject.toolchain,
      buildBundle,
    }),
    dispose: async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.closeAllConnections();
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise()
        );
      });
    },
  });
};

const preparedAttemptFor = (
  frameworkTarget: 'react-vite' | 'vue-vite',
  draft: GoldenG3V6AuthCausalityDraft,
  project: GoldenPreparedBrowserProject
): GoldenG3V6AuthCausalityPreparedAttempt => {
  if (!project.toolchain) {
    throw new Error(
      `Golden auth causality ${frameworkTarget}/${draft.variant} has no real toolchain evidence.`
    );
  }
  const receipt = issueCompilerFixtureProjectionReceipt({
    snapshot: draft.snapshot,
    fixtureSets: Object.freeze([draft.fixtureSet]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles: projectExecutableProjectRuntimeFiles(
      draft.snapshot,
      'test'
    ),
    buildBundle: project.toolchain.buildBundle,
  });
  const plan = planFor(draft.fixtureSet);
  const cell = plan.cells.find(
    (candidate) =>
      candidate.requirement === 'required' &&
      candidate.checkKind === 'e2e' &&
      candidate.frameworkTarget === frameworkTarget &&
      candidate.surface === 'preview' &&
      candidate.browserEngine === 'chromium' &&
      candidate.motion === 'full'
  );
  if (!cell) {
    throw new Error(
      `Golden auth causality ${frameworkTarget} has no Chromium Preview E2E cell.`
    );
  }
  const manifest = createGoldenG3V6ControlledMatrixManifest(plan);
  const row = manifest.rows.find((candidate) =>
    candidate.cells.some(({ cellId }) => cellId === cell.id)
  );
  const provider = row?.attemptProviderDimension.providers.find(
    ({ mode }) => mode === 'browser'
  );
  if (!row || !provider) {
    throw new Error(
      `Golden auth causality ${frameworkTarget} has no Browser attempt provider.`
    );
  }
  const framework: GoldenG3V6PreparedFramework = Object.freeze({
    testSnapshot: draft.snapshot,
    testProject: project,
    testFixtureProjectionReceipt: receipt,
    productionSnapshot: draft.snapshot,
    productionProject: project,
  });
  return Object.freeze({
    plan,
    cell,
    row,
    provider,
    fixtureSet: draft.fixtureSet,
    program: draft.program,
    framework,
  });
};

const AUTH_CAUSALITY_VARIANTS = Object.freeze([
  'positive',
  'wrong-principal',
  'missing-permission',
  'unconsumed',
] as const);

export const prepareGoldenG3V6AuthCausalityTarget = async (input: {
  frameworkTarget: 'react-vite' | 'vue-vite';
}): Promise<GoldenG3V6AuthCausalityPreparedTarget> => {
  const drafts = new Map(
    AUTH_CAUSALITY_VARIANTS.map((variant) => [
      variant,
      draftFor(input.frameworkTarget, variant),
    ])
  );
  const positive = drafts.get('positive')!;
  const sharedProject = await prepareGoldenBrowserProject(
    {
      files: projectExecutableProjectRuntimeFiles(positive.snapshot, 'test'),
    },
    { executableSnapshot: positive.snapshot }
  );
  if (!sharedProject.toolchain) {
    await sharedProject.dispose();
    throw new Error(
      `Golden auth causality ${input.frameworkTarget} has no real toolchain evidence.`
    );
  }
  const immutableBuild = sharedProject.toolchain.buildBundle;
  const immutableExecutableBuildDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-auth-immutable-build.v1',
    target: immutableBuild.target,
    files: immutableBuild.files
      .filter(({ path }) => path !== COMPILER_FIXTURE_PROJECTION_BUILD_PATH)
      .map(({ path, size, digest }) => ({ path, size, digest })),
  });
  const projectedProjects: GoldenPreparedBrowserProject[] = [];
  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    const cleanup = await Promise.allSettled([
      ...projectedProjects.map((project) => project.dispose()),
      sharedProject.dispose(),
    ]);
    const errors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    );
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Golden auth causality ${input.frameworkTarget} cleanup failed.`
      );
    }
  };
  try {
    const prepared = new Map<
      GoldenG3V6AuthCausalityVariant,
      GoldenG3V6AuthCausalityPreparedAttempt
    >();
    for (const variant of AUTH_CAUSALITY_VARIANTS) {
      const draft = drafts.get(variant)!;
      const buildBundle = projectionBuildBundle(draft.snapshot, immutableBuild);
      const project = await startProjectedProject(sharedProject, buildBundle);
      projectedProjects.push(project);
      prepared.set(
        variant,
        preparedAttemptFor(input.frameworkTarget, draft, project)
      );
    }
    const attempts = Object.freeze({
      positive: prepared.get('positive')!,
      'wrong-principal': prepared.get('wrong-principal')!,
      'missing-permission': prepared.get('missing-permission')!,
      unconsumed: prepared.get('unconsumed')!,
    });
    return Object.freeze({
      frameworkTarget: input.frameworkTarget,
      buildCount: 1 as const,
      immutableExecutableBuildDigest,
      toolchainAuthorityRequestDigest:
        sharedProject.toolchain.authorityReceipt.requestDigest,
      attempts,
      dispose,
    });
  } catch (error) {
    await dispose();
    throw error;
  }
};
