import {
  createAnimationTimelineCodeSlotId,
  decodeAnimationDefinition,
  encodeAnimationDefinition,
} from '@prodivix/animation';
import {
  decodeNodeGraphDocument,
  encodeNodeGraphDocument,
  createNodeGraphExecutorCodeSlotId,
} from '@prodivix/nodegraph';
import type { PIRDocument } from '@prodivix/pir';
import type { DataSourceDocument } from '@prodivix/data';
import {
  compareVerificationText,
  createVerificationAdapterRegistration,
  createVerificationAdapterRegistrySnapshot,
  createVerificationPlan,
  digestVerificationValue,
  normalizeVerificationPolicy,
  projectVerificationPlanExplanation,
  type VerificationAdapterRegistration,
  type VerificationCheckDefinition,
  type VerificationImpactContribution,
  type VerificationImpactSet,
  type VerificationPolicy,
  type VerificationScenarioDescriptor,
  type CreateVerificationPlanInput,
} from '@prodivix/verification';
import {
  createWorkspaceVerificationImpactSet,
  type WorkspaceCodeDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { GOLDEN_G2_VUE_CATALOG_IDS } from './goldenG2VueCatalogFixture';
import {
  GOLDEN_G3_COMPOSITION_IDS,
  GOLDEN_G3_COMPOSITION_WORKSPACE,
} from './goldenG3BehaviorCompositionFixture';
import { GOLDEN_G3_SCENARIO_IDS } from './goldenG3ScenarioFixture';

export const GOLDEN_G3_V4_IDS = Object.freeze({
  sharedCode: GOLDEN_G2_VUE_CATALOG_IDS.server,
  catalogScenario: GOLDEN_G3_SCENARIO_IDS.scenario,
  productionSecurityScenario: GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario,
  compositionScenario: GOLDEN_G3_COMPOSITION_IDS.scenario,
  policy: 'policy:g3-v4',
  matrix: 'matrix:g3-v4',
  retry: 'retry:g3-v4',
  buildCheck: 'check:g3-v4:build',
  catalogCheck: 'check:g3-v4:catalog-e2e',
  compositionCheck: 'check:g3-v4:composition-e2e',
  securityCheck: 'check:g3-v4:route-security',
  visualCheck: 'check:g3-v4:catalog-visual',
  adapter: 'adapter:g3-v4-ci',
});

const before = GOLDEN_G3_COMPOSITION_WORKSPACE;
const sharedCodeReference = Object.freeze({
  artifactId: GOLDEN_G3_V4_IDS.sharedCode,
});

const changedPage = (): PIRDocument => {
  const document = structuredClone(
    before.docsById[GOLDEN_G2_VUE_CATALOG_IDS.page]!.content
  ) as PIRDocument;
  const productCard = document.ui.graph.nodesById['product-card']!;
  if (productCard.kind !== 'element') {
    throw new Error('Golden V4 product-card must be a PIR element.');
  }
  return {
    ...document,
    ui: {
      ...document.ui,
      graph: {
        ...document.ui.graph,
        nodesById: {
          ...document.ui.graph.nodesById,
          'product-card': {
            ...productCard,
            props: {
              ...productCard.props,
              mountedCss: {
                kind: 'code',
                reference: sharedCodeReference,
              },
              'data-verification-revision': {
                kind: 'literal',
                value: 'g3-v4',
              },
            },
          },
        },
      },
    },
  };
};

const changedData = (): DataSourceDocument => {
  const document = structuredClone(
    before.docsById[GOLDEN_G2_VUE_CATALOG_IDS.data]!.content
  ) as DataSourceDocument;
  const operation = document.operationsById['list-products']!;
  return {
    ...document,
    operationsById: {
      ...document.operationsById,
      'list-products': {
        ...operation,
        name: 'List products with V4 verification contract',
      },
    },
  };
};

const changedNodeGraph = () => {
  const decoded = decodeNodeGraphDocument(
    before.docsById[GOLDEN_G3_COMPOSITION_IDS.graph]!.content
  );
  if (!decoded.ok) {
    throw new Error(
      `Golden V4 NodeGraph is invalid: ${JSON.stringify(decoded.issues)}`
    );
  }
  const graph = structuredClone(decoded.value);
  graph.nodes = graph.nodes.map((node) =>
    node.id === 'derived-state'
      ? {
          ...node,
          codeSlot: {
            slotId: createNodeGraphExecutorCodeSlotId(
              GOLDEN_G3_COMPOSITION_IDS.graph,
              node.id
            ),
            reference: sharedCodeReference,
          },
        }
      : node
  );
  return encodeNodeGraphDocument(graph);
};

const changedAnimation = () => {
  const decoded = decodeAnimationDefinition(
    before.docsById[GOLDEN_G3_COMPOSITION_IDS.animation]!.content
  );
  if (!decoded.ok) {
    throw new Error(
      `Golden V4 Animation is invalid: ${JSON.stringify(decoded.issues)}`
    );
  }
  const definition = structuredClone(decoded.value);
  definition.timelines = definition.timelines.map((timeline) =>
    timeline.id === GOLDEN_G3_COMPOSITION_IDS.timeline
      ? {
          ...timeline,
          codeSlots: {
            ...timeline.codeSlots,
            script: {
              slotId: createAnimationTimelineCodeSlotId(
                GOLDEN_G3_COMPOSITION_IDS.animation,
                timeline.id,
                'script'
              ),
              reference: sharedCodeReference,
            },
          },
        }
      : timeline
  );
  return encodeAnimationDefinition(definition);
};

const changedCode = (): WorkspaceCodeDocumentContent => {
  const content = structuredClone(
    before.docsById[GOLDEN_G3_V4_IDS.sharedCode]!.content
  ) as WorkspaceCodeDocumentContent;
  return {
    ...content,
    source: `${content.source}
export const requireCatalogOwnerV4 = () => ({ kind: 'allow' as const });
export const sharedCatalogVerification = 'g3-v4';
`,
  };
};

const changedRouteManifest = (): WorkspaceSnapshot['routeManifest'] => {
  const manifest = structuredClone(before.routeManifest);
  const shell = manifest.root.children?.find(
    (route) => route.id === GOLDEN_G2_VUE_CATALOG_IDS.shellRoute
  );
  const catalog = shell?.children?.find(
    (route) => route.id === GOLDEN_G2_VUE_CATALOG_IDS.route
  );
  if (!catalog?.runtime) {
    throw new Error('Golden V4 catalog route runtime is missing.');
  }
  catalog.runtime = {
    ...catalog.runtime,
    guardRef: {
      artifactId: GOLDEN_G3_V4_IDS.sharedCode,
      exportName: 'requireCatalogOwnerV4',
    },
  };
  return manifest;
};

export const GOLDEN_G3_V4_BEFORE_WORKSPACE: WorkspaceSnapshot = before;

export type GoldenG3V4ChangeKind =
  'pir' | 'data' | 'route' | 'nodegraph' | 'animation' | 'shared-code';

const GOLDEN_G3_V4_CHANGE_KINDS: readonly GoldenG3V4ChangeKind[] =
  Object.freeze([
    'pir',
    'data',
    'route',
    'nodegraph',
    'animation',
    'shared-code',
  ]);

export const createGoldenG3V4AfterWorkspace = (
  requested: GoldenG3V4ChangeKind | readonly GoldenG3V4ChangeKind[]
): WorkspaceSnapshot => {
  const changes = new Set(Array.isArray(requested) ? requested : [requested]);
  const docsById = { ...before.docsById };
  const replaceContent = (documentId: string, content: unknown) => {
    const document = before.docsById[documentId]!;
    docsById[documentId] = {
      ...document,
      contentRev: document.contentRev + 1,
      content,
    };
  };
  if (changes.has('pir')) {
    replaceContent(GOLDEN_G2_VUE_CATALOG_IDS.page, changedPage());
  }
  if (changes.has('data')) {
    replaceContent(GOLDEN_G2_VUE_CATALOG_IDS.data, changedData());
  }
  if (changes.has('nodegraph')) {
    replaceContent(GOLDEN_G3_COMPOSITION_IDS.graph, changedNodeGraph());
  }
  if (changes.has('animation')) {
    replaceContent(GOLDEN_G3_COMPOSITION_IDS.animation, changedAnimation());
  }
  if (changes.has('shared-code')) {
    replaceContent(GOLDEN_G3_V4_IDS.sharedCode, changedCode());
  }
  return Object.freeze({
    ...before,
    workspaceRev: before.workspaceRev + 1,
    routeRev: before.routeRev + (changes.has('route') ? 1 : 0),
    opSeq: before.opSeq + changes.size,
    docsById: Object.freeze(docsById),
    routeManifest: changes.has('route')
      ? changedRouteManifest()
      : before.routeManifest,
  });
};

export const GOLDEN_G3_V4_AFTER_WORKSPACE: WorkspaceSnapshot =
  createGoldenG3V4AfterWorkspace(GOLDEN_G3_V4_CHANGE_KINDS);

export const createGoldenG3V4IsolatedImpact = (change: GoldenG3V4ChangeKind) =>
  createWorkspaceVerificationImpactSet({
    before: GOLDEN_G3_V4_BEFORE_WORKSPACE,
    after: createGoldenG3V4AfterWorkspace(change),
    operationIds: [`operation:v4:${change}`],
    frameworkTargets: ['react-vite', 'vue-vite'],
    runtimeZones: ['browser', 'client', 'server'],
  });

const impactResult = createWorkspaceVerificationImpactSet({
  before: GOLDEN_G3_V4_BEFORE_WORKSPACE,
  after: GOLDEN_G3_V4_AFTER_WORKSPACE,
  operationIds: [
    'operation:v4:pir',
    'operation:v4:data',
    'operation:v4:route',
    'operation:v4:nodegraph',
    'operation:v4:animation',
    'operation:v4:shared-code',
  ],
  frameworkTargets: ['react-vite', 'vue-vite'],
  runtimeZones: ['browser', 'client', 'server'],
});
if (impactResult.status !== 'ready') {
  throw new Error(
    `Golden V4 ImpactSet is blocked: ${impactResult.message} ${
      'semanticIssues' in impactResult
        ? JSON.stringify(impactResult.semanticIssues)
        : ''
    }`
  );
}
export const GOLDEN_G3_V4_IMPACT = impactResult.impactSet;

const controlProfileRef = Object.freeze({
  kind: 'preset' as const,
  presetId: 'deterministic-composition',
  digest:
    'sha256-15f619fb0c3b8fbbce7844f1f29fcfae4bea2fef76a60185730e5cb533dcdefe',
});
const baselineSetRef = Object.freeze({
  documentId: 'baseline:g3-v4:catalog',
  digest:
    'sha256-c0825eb89ebbc4bf75afc7d4b87105978a4db18cbd6c819bc5c91a4fb8ca0e34',
});

const goldenG3V4Policy: VerificationPolicy = {
  id: GOLDEN_G3_V4_IDS.policy,
  name: 'G3 V4 Golden verification',
  defaultRequirement: 'forbidden',
  rules: [
    {
      id: 'rule:v4:build',
      requirement: 'required',
      checkKinds: ['build'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: GOLDEN_G3_V4_IDS.matrix,
      retryPolicyId: GOLDEN_G3_V4_IDS.retry,
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
    {
      id: 'rule:v4:e2e',
      requirement: 'required',
      checkKinds: ['e2e'],
      scenarioIds: [
        GOLDEN_G3_V4_IDS.catalogScenario,
        GOLDEN_G3_V4_IDS.compositionScenario,
      ],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: GOLDEN_G3_V4_IDS.matrix,
      retryPolicyId: GOLDEN_G3_V4_IDS.retry,
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
    {
      id: 'rule:v4:security',
      requirement: 'required',
      checkKinds: ['security'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: ['route-guard'],
      matrixProfileId: GOLDEN_G3_V4_IDS.matrix,
      retryPolicyId: GOLDEN_G3_V4_IDS.retry,
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
    {
      id: 'rule:v4:visual-advisory',
      requirement: 'advisory',
      checkKinds: ['visual'],
      scenarioIds: [GOLDEN_G3_V4_IDS.catalogScenario],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: GOLDEN_G3_V4_IDS.matrix,
      retryPolicyId: GOLDEN_G3_V4_IDS.retry,
      evidenceTrust: 'ci-attested',
      controlProfileRef,
      baselineSetRef,
    },
  ],
  matrixProfiles: [
    {
      id: GOLDEN_G3_V4_IDS.matrix,
      name: 'React/Vue critical browser matrix',
      matrix: {
        frameworkTargets: ['react-vite', 'vue-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium', 'firefox'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['light'],
        motions: ['full', 'reduced'],
        locales: ['en-US'],
      },
    },
  ],
  budgets: {
    maximumCells: 64,
    maximumCellsPerCheckKind: 32,
    maximumTargetExpansions: 8,
    maximumBrowserExpansions: 3,
    maximumClosureEvidenceRecords: 1000,
    totalMs: 300_000,
    artifactBytes: 100_000_000,
    estimatedComputeUnits: 100,
    parallelism: 4,
  },
  retryPolicies: [
    {
      id: GOLDEN_G3_V4_IDS.retry,
      maximumAttempts: 2,
      retryableOutcomes: ['infrastructure-error'],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
  ],
  exemptions: [],
  artifactCapture: {
    defaultCapture: 'allowed',
    targets: [],
  },
  comparison: {
    allowedMismatchFields: [],
  },
  evidenceRequirements: {
    acceptedTrust: ['ci-attested'],
    maximumAgeMs: 86_400_000,
    requireAttestation: true,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: ['replay-record'],
  },
  baselinePolicy: {
    visual: 'required-when-observed',
    requireCompatibleIdentity: true,
  },
  retentionRequest: {
    successful: 'change',
    failed: 'release',
    protectReleaseEvidence: true,
  },
};

export const GOLDEN_G3_V4_POLICY: VerificationPolicy =
  Object.freeze(goldenG3V4Policy);

export const GOLDEN_G3_V4_SCENARIOS: readonly VerificationScenarioDescriptor[] =
  Object.freeze([
    {
      id: GOLDEN_G3_V4_IDS.catalogScenario,
      documentId: GOLDEN_G3_V4_IDS.catalogScenario,
      criticality: 'critical',
      tags: ['catalog', 'auth', 'crud'],
      impactedDomains: ['pir', 'data', 'route', 'code'],
      capabilityIds: ['behavior:scenario'],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      controlProfileRef,
    },
    {
      id: GOLDEN_G3_V4_IDS.compositionScenario,
      documentId: GOLDEN_G3_V4_IDS.compositionScenario,
      criticality: 'critical',
      tags: ['catalog', 'composition'],
      impactedDomains: ['route', 'data', 'nodegraph', 'animation', 'code'],
      capabilityIds: ['behavior:scenario'],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      controlProfileRef,
    },
  ]);

const sharedCost = Object.freeze({
  durationMs: 1_000,
  artifactBytes: 100_000,
  computeUnits: 1,
});

export const GOLDEN_G3_V4_CHECKS: readonly VerificationCheckDefinition[] =
  Object.freeze([
    {
      id: GOLDEN_G3_V4_IDS.buildCheck,
      ownerId: '@prodivix/prodivix-compiler',
      kind: 'build',
      scenarioIds: [],
      scenarioTags: [],
      impactedDomains: [],
      capabilityIds: [],
      riskFlags: [],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci'],
      browserEngines: [],
      matrixAxes: ['frameworkTarget'],
      adapterId: GOLDEN_G3_V4_IDS.adapter,
      dependencyCheckIds: [],
      resources: [{ key: 'build:authenticated-catalog', mode: 'shared' }],
      inputKinds: ['executable-snapshot'],
      artifactKinds: ['build-log'],
      estimatedCost: sharedCost,
    },
    {
      id: GOLDEN_G3_V4_IDS.catalogCheck,
      ownerId: '@prodivix/behavior',
      kind: 'e2e',
      scenarioIds: [GOLDEN_G3_V4_IDS.catalogScenario],
      scenarioTags: [],
      impactedDomains: ['pir', 'data', 'route'],
      capabilityIds: [],
      riskFlags: [],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci'],
      browserEngines: ['chromium', 'firefox'],
      matrixAxes: ['frameworkTarget', 'browserEngine', 'motion'],
      adapterId: GOLDEN_G3_V4_IDS.adapter,
      dependencyCheckIds: [GOLDEN_G3_V4_IDS.buildCheck],
      resources: [{ key: 'browser:catalog', mode: 'exclusive' }],
      inputKinds: ['executable-snapshot', 'scenario-program'],
      artifactKinds: ['replay-record'],
      estimatedCost: sharedCost,
    },
    {
      id: GOLDEN_G3_V4_IDS.compositionCheck,
      ownerId: '@prodivix/behavior',
      kind: 'e2e',
      scenarioIds: [GOLDEN_G3_V4_IDS.compositionScenario],
      scenarioTags: [],
      impactedDomains: ['nodegraph', 'animation', 'route'],
      capabilityIds: [],
      riskFlags: [],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci'],
      browserEngines: ['chromium', 'firefox'],
      matrixAxes: ['frameworkTarget', 'browserEngine', 'motion'],
      adapterId: GOLDEN_G3_V4_IDS.adapter,
      dependencyCheckIds: [GOLDEN_G3_V4_IDS.buildCheck],
      resources: [{ key: 'browser:catalog', mode: 'exclusive' }],
      inputKinds: ['executable-snapshot', 'scenario-program'],
      artifactKinds: ['replay-record'],
      estimatedCost: sharedCost,
    },
    {
      id: GOLDEN_G3_V4_IDS.securityCheck,
      ownerId: '@prodivix/server-runtime',
      kind: 'security',
      scenarioIds: [GOLDEN_G3_V4_IDS.catalogScenario],
      scenarioTags: [],
      impactedDomains: ['route', 'code'],
      capabilityIds: [],
      riskFlags: ['route-guard'],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci'],
      browserEngines: ['chromium'],
      matrixAxes: ['frameworkTarget'],
      adapterId: GOLDEN_G3_V4_IDS.adapter,
      dependencyCheckIds: [GOLDEN_G3_V4_IDS.buildCheck],
      resources: [{ key: 'security:catalog', mode: 'exclusive' }],
      inputKinds: ['executable-snapshot', 'scenario-program'],
      artifactKinds: ['security-report', 'replay-record'],
      estimatedCost: sharedCost,
    },
    {
      id: GOLDEN_G3_V4_IDS.visualCheck,
      ownerId: '@prodivix/runtime-browser',
      kind: 'visual',
      scenarioIds: [GOLDEN_G3_V4_IDS.catalogScenario],
      scenarioTags: [],
      impactedDomains: ['pir', 'animation'],
      capabilityIds: [],
      riskFlags: [],
      targetIds: ['authenticated-catalog'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci'],
      browserEngines: ['chromium'],
      matrixAxes: ['frameworkTarget', 'motion'],
      adapterId: GOLDEN_G3_V4_IDS.adapter,
      dependencyCheckIds: [GOLDEN_G3_V4_IDS.buildCheck],
      resources: [{ key: 'browser:catalog', mode: 'exclusive' }],
      inputKinds: ['executable-snapshot', 'scenario-program', 'baseline-set'],
      artifactKinds: ['screenshot', 'visual-diff', 'replay-record'],
      estimatedCost: sharedCost,
    },
  ]);

export const GOLDEN_G3_V4_ADAPTER: VerificationAdapterRegistration =
  createVerificationAdapterRegistration({
    id: GOLDEN_G3_V4_IDS.adapter,
    implementation: {
      packageName: '@prodivix/golden-conformance',
      packageVersion: '0.0.1',
      buildDigest: digestVerificationValue('g3-v4-build'),
      toolchainDigest: digestVerificationValue('g3-v4-toolchain'),
      schemaDigest: digestVerificationValue('g3-v4-adapter-schema'),
    },
    checkKinds: ['build', 'e2e', 'security', 'visual'],
    surfaces: ['ci'],
    targets: ['react-vite', 'vue-vite'],
    browserEngines: ['chromium', 'firefox'],
    controlCapabilities: [],
    inputKinds: ['executable-snapshot', 'scenario-program', 'baseline-set'],
    artifactKinds: [
      'build-log',
      'replay-record',
      'security-report',
      'screenshot',
      'visual-diff',
    ],
    budgets: {
      maximumDurationMs: 60_000,
      maximumArtifactBytes: 10_000_000,
      maximumEvents: 4_096,
    },
    trustInputs: ['ci-attested'],
  });

export const createGoldenG3V4PlanInput = (
  overrides: Readonly<{
    impactSet?: VerificationImpactSet;
    scenarios?: readonly VerificationScenarioDescriptor[];
    checks?: readonly VerificationCheckDefinition[];
    adapters?: readonly VerificationAdapterRegistration[];
  }> = {}
): CreateVerificationPlanInput => {
  const scenarios = Object.freeze(
    [...(overrides.scenarios ?? GOLDEN_G3_V4_SCENARIOS)].sort((left, right) =>
      compareVerificationText(left.id, right.id)
    )
  );
  const adapters = overrides.adapters ?? [GOLDEN_G3_V4_ADAPTER];
  return {
    impactSet: overrides.impactSet ?? GOLDEN_G3_V4_IMPACT,
    policy: GOLDEN_G3_V4_POLICY,
    policyRevision: 1,
    policyDigest: digestVerificationValue(
      normalizeVerificationPolicy(GOLDEN_G3_V4_POLICY)
    ),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    scenarioRegistryDigest: digestVerificationValue(scenarios),
    scenarios,
    checks: overrides.checks ?? GOLDEN_G3_V4_CHECKS,
    adapters,
    adapterRegistryDigest:
      createVerificationAdapterRegistrySnapshot(adapters).snapshotDigest,
    compilerDigest: 'sha256-g3-v4-compiler',
    plannerDigest: 'sha256-g3-v4-planner',
  };
};

export const GOLDEN_G3_V4_PLAN_INPUT = createGoldenG3V4PlanInput();

export const createGoldenG3V4Plan = (
  overrides: Parameters<typeof createGoldenG3V4PlanInput>[0] = {}
) => createVerificationPlan(createGoldenG3V4PlanInput(overrides));

export const GOLDEN_G3_V4_PLAN_RESULT = createGoldenG3V4Plan();
export const GOLDEN_G3_V4_PLAN = GOLDEN_G3_V4_PLAN_RESULT.plan;
export const GOLDEN_G3_V4_EXPLANATION =
  projectVerificationPlanExplanation(GOLDEN_G3_V4_PLAN);

export const createGoldenG3V4ConservativeImpact = () => {
  const missingProvider: VerificationImpactContribution = {
    contributorId: 'plugin:missing-semantic-provider',
    completeness: 'unknown',
    reasons: [
      {
        id: 'plugin:missing-semantic-provider',
        kind: 'contributor-incomplete',
        message: 'A required plugin semantic provider is unavailable.',
        contributorId: 'plugin:missing-semantic-provider',
      },
    ],
  };
  return createWorkspaceVerificationImpactSet({
    before: GOLDEN_G3_V4_BEFORE_WORKSPACE,
    after: GOLDEN_G3_V4_AFTER_WORKSPACE,
    operationIds: ['operation:v4:missing-provider'],
    frameworkTargets: ['react-vite', 'vue-vite'],
    runtimeZones: ['browser', 'client', 'server'],
    additionalContributions: [missingProvider],
  });
};
