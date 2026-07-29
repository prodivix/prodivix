import {
  compareVerificationText,
  createVerificationImpactSet,
  createVerificationPlan,
  digestVerificationValue,
  normalizeVerificationPolicy,
  type CreateVerificationPlanInput,
  type VerificationAdapterRegistration,
  type VerificationBrowserEngine,
  type VerificationCheckDefinition,
  type VerificationCheckKind,
  type VerificationEvidenceTrust,
  type VerificationImpactSet,
  type VerificationMotion,
  type VerificationPlanResult,
  type VerificationPolicy,
  type VerificationScenarioDescriptor,
  type VerificationSurface,
} from '@prodivix/verification';
import {
  digestGoldenG3V6AdapterRegistry,
  goldenG3V6AdapterFactorySlotForCheckKind,
  goldenG3V6CheckContractForKind,
  GOLDEN_G3_V6_ADAPTER_IDS,
  GOLDEN_G3_V6_FRAMEWORK_TARGETS,
  GOLDEN_G3_V6_ADAPTERS,
} from './goldenG3V6AdapterRegistryFixture';
import {
  GOLDEN_G3_V4_IDS,
  GOLDEN_G3_V4_IMPACT,
  GOLDEN_G3_V4_SCENARIOS,
} from './goldenG3VerificationPlanFixture';
import {
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
  GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
  GOLDEN_G3_SCENARIO_IDS,
} from './goldenG3ScenarioFixture';
import { GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST } from './goldenG3V6VisualBaseline';

export const GOLDEN_G3_V6_REQUIRED_CELL_COUNT = 66;
export const GOLDEN_G3_V6_AGGREGATE_ROW_COUNT = 8;

export type GoldenG3V6MatrixGroupId =
  | 'preview-primary'
  | 'export-primary'
  | 'ci-primary'
  | 'ci-firefox-critical'
  | 'ci-webkit-critical';

export const GOLDEN_G3_V6_IDS = Object.freeze({
  policy: 'policy:g3-v6-controlled-adapter-matrix',
  retry: 'retry:g3-v6-controlled-adapter-matrix',
  baselineSet: 'baseline:g3-v6:authenticated-catalog',
  fixtureSet: GOLDEN_G3_SCENARIO_IDS.fixture,
  productionSecurityScenario: GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario,
  impactContributor: 'golden:g3-v6:controlled-matrix',
  target: 'authenticated-catalog',
  adapters: GOLDEN_G3_V6_ADAPTER_IDS,
  profiles: Object.freeze({
    previewPrimary: 'matrix:g3-v6:preview-primary',
    exportPrimary: 'matrix:g3-v6:export-primary',
    ciPrimary: 'matrix:g3-v6:ci-primary',
    ciFirefoxCritical: 'matrix:g3-v6:ci-firefox-critical',
    ciWebkitCritical: 'matrix:g3-v6:ci-webkit-critical',
  }),
});

const DESKTOP_VIEWPORT = Object.freeze({
  id: 'desktop',
  width: 1280,
  height: 720,
});
const checkKinds = (
  ...values: VerificationCheckKind[]
): readonly VerificationCheckKind[] => Object.freeze(values);
const motions = (
  ...values: VerificationMotion[]
): readonly VerificationMotion[] => Object.freeze(values);

const MOTION_CHECK_KINDS: readonly VerificationCheckKind[] = Object.freeze([
  'e2e',
  'visual',
  'accessibility',
  'performance',
]);
const BROWSER_CHECK_KINDS: readonly VerificationCheckKind[] = Object.freeze([
  ...MOTION_CHECK_KINDS,
  'security',
]);
const SCENARIO_CHECK_KINDS: readonly VerificationCheckKind[] =
  BROWSER_CHECK_KINDS;

type GoldenG3V6MatrixGroup = Readonly<{
  id: GoldenG3V6MatrixGroupId;
  profileId: string;
  riskFlag: string;
  surface: VerificationSurface;
  browserEngine: VerificationBrowserEngine;
  motions: readonly VerificationMotion[];
  evidenceTrust: VerificationEvidenceTrust;
  checkKinds: readonly VerificationCheckKind[];
}>;

export const GOLDEN_G3_V6_MATRIX_GROUPS: readonly GoldenG3V6MatrixGroup[] =
  Object.freeze([
    Object.freeze({
      id: 'preview-primary',
      profileId: GOLDEN_G3_V6_IDS.profiles.previewPrimary,
      riskFlag: 'g3-v6:preview-primary',
      surface: 'preview',
      browserEngine: 'chromium',
      motions: motions('full', 'reduced'),
      evidenceTrust: 'local-unattested',
      checkKinds: checkKinds('e2e', 'visual', 'accessibility', 'security'),
    }),
    Object.freeze({
      id: 'export-primary',
      profileId: GOLDEN_G3_V6_IDS.profiles.exportPrimary,
      riskFlag: 'g3-v6:export-primary',
      surface: 'export',
      browserEngine: 'chromium',
      motions: motions('full', 'reduced'),
      evidenceTrust: 'local-unattested',
      checkKinds: checkKinds(
        'build',
        'e2e',
        'visual',
        'accessibility',
        'performance',
        'security'
      ),
    }),
    Object.freeze({
      id: 'ci-primary',
      profileId: GOLDEN_G3_V6_IDS.profiles.ciPrimary,
      riskFlag: 'g3-v6:ci-primary',
      surface: 'ci',
      browserEngine: 'chromium',
      motions: motions('full', 'reduced'),
      evidenceTrust: 'ci-attested',
      checkKinds: checkKinds(
        'diagnostics',
        'unit',
        'integration',
        'e2e',
        'visual',
        'accessibility',
        'performance',
        'security'
      ),
    }),
    Object.freeze({
      id: 'ci-firefox-critical',
      profileId: GOLDEN_G3_V6_IDS.profiles.ciFirefoxCritical,
      riskFlag: 'g3-v6:ci-firefox-critical',
      surface: 'ci',
      browserEngine: 'firefox',
      motions: motions('full'),
      evidenceTrust: 'ci-attested',
      checkKinds: checkKinds('e2e', 'accessibility'),
    }),
    Object.freeze({
      id: 'ci-webkit-critical',
      profileId: GOLDEN_G3_V6_IDS.profiles.ciWebkitCritical,
      riskFlag: 'g3-v6:ci-webkit-critical',
      surface: 'ci',
      browserEngine: 'webkit',
      motions: motions('full'),
      evidenceTrust: 'ci-attested',
      checkKinds: checkKinds('e2e', 'accessibility'),
    }),
  ] satisfies GoldenG3V6MatrixGroup[]);

const baseCatalogScenario = GOLDEN_G3_V4_SCENARIOS.find(
  (scenario) => scenario.id === GOLDEN_G3_V4_IDS.catalogScenario
);
if (!baseCatalogScenario) {
  throw new Error('Golden V6 requires the V4 authenticated catalog Scenario.');
}
const fixtureSetRef = Object.freeze({
  documentId: GOLDEN_G3_V6_IDS.fixtureSet,
  digest: GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
});
const catalogScenario: VerificationScenarioDescriptor = Object.freeze({
  ...baseCatalogScenario,
  controlProfileRef: GOLDEN_G3_CATALOG_SCENARIO.controlProfileRef,
  fixtureSetRef,
});
const productionSecurityScenario: VerificationScenarioDescriptor =
  Object.freeze({
    ...baseCatalogScenario,
    id: GOLDEN_G3_V6_IDS.productionSecurityScenario,
    documentId: GOLDEN_G3_V6_IDS.productionSecurityScenario,
    tags: Object.freeze(['catalog', 'production-security']),
    controlProfileRef: GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.controlProfileRef,
  });

export const GOLDEN_G3_V6_SCENARIOS: readonly VerificationScenarioDescriptor[] =
  Object.freeze([catalogScenario, productionSecurityScenario]);

const baselineSetRef = Object.freeze({
  documentId: GOLDEN_G3_V6_IDS.baselineSet,
  digest: GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST,
});

const v6ImpactResult = createVerificationImpactSet({
  workspaceId: GOLDEN_G3_V4_IMPACT.workspaceId,
  ...(GOLDEN_G3_V4_IMPACT.baseRevision === undefined
    ? {}
    : {
        baseRevision: GOLDEN_G3_V4_IMPACT.baseRevision,
        basePartitionRevisions: GOLDEN_G3_V4_IMPACT.basePartitionRevisions!,
      }),
  targetRevision: GOLDEN_G3_V4_IMPACT.targetRevision,
  targetPartitionRevisions: GOLDEN_G3_V4_IMPACT.targetPartitionRevisions,
  semanticSchemaDigest: GOLDEN_G3_V4_IMPACT.semanticSchemaDigest,
  providerSetDigest: GOLDEN_G3_V4_IMPACT.providerSetDigest,
  operationIds: Object.freeze([
    ...GOLDEN_G3_V4_IMPACT.operationIds,
    'operation:g3-v6:controlled-adapter-matrix',
  ]),
  contributions: Object.freeze([
    Object.freeze({
      contributorId: GOLDEN_G3_V6_IDS.impactContributor,
      completeness: GOLDEN_G3_V4_IMPACT.completeness,
      changedDocumentIds: GOLDEN_G3_V4_IMPACT.changedDocumentIds,
      changedSymbolIds: GOLDEN_G3_V4_IMPACT.changedSymbolIds,
      changedSourceSpans: GOLDEN_G3_V4_IMPACT.changedSourceSpans,
      impactedSymbolIds: GOLDEN_G3_V4_IMPACT.impactedSymbolIds,
      impactedScenarioIds: Object.freeze([
        ...GOLDEN_G3_V4_IMPACT.impactedScenarioIds,
        catalogScenario.id,
        productionSecurityScenario.id,
      ]),
      impactedDomains: GOLDEN_G3_V4_IMPACT.impactedDomains,
      frameworkTargets: GOLDEN_G3_V6_FRAMEWORK_TARGETS,
      runtimeZones: GOLDEN_G3_V4_IMPACT.runtimeZones,
      capabilityIds: GOLDEN_G3_V4_IMPACT.capabilityIds,
      riskFlags: Object.freeze([
        ...GOLDEN_G3_V4_IMPACT.riskFlags,
        ...GOLDEN_G3_V6_MATRIX_GROUPS.map((group) => group.riskFlag),
      ]),
    }),
  ]),
  conservativeScope: Object.freeze({
    scenarioIds: Object.freeze([
      catalogScenario.id,
      productionSecurityScenario.id,
    ]),
    domains: GOLDEN_G3_V4_IMPACT.impactedDomains,
    frameworkTargets: GOLDEN_G3_V6_FRAMEWORK_TARGETS,
    runtimeZones: GOLDEN_G3_V4_IMPACT.runtimeZones,
    capabilityIds: GOLDEN_G3_V4_IMPACT.capabilityIds,
    riskFlags: Object.freeze(
      GOLDEN_G3_V6_MATRIX_GROUPS.map((group) => group.riskFlag)
    ),
  }),
});
if (v6ImpactResult.status !== 'ready') {
  throw new Error(`Golden V6 ImpactSet is blocked: ${v6ImpactResult.message}`);
}
export const GOLDEN_G3_V6_IMPACT: VerificationImpactSet =
  v6ImpactResult.impactSet;

const sharedCost = Object.freeze({
  durationMs: 1_000,
  artifactBytes: 250_000,
  computeUnits: 1,
});

const createCheck = (
  group: GoldenG3V6MatrixGroup,
  kind: VerificationCheckKind
): VerificationCheckDefinition => {
  const browserCheck = BROWSER_CHECK_KINDS.includes(kind);
  const scenarioCheck = SCENARIO_CHECK_KINDS.includes(kind);
  const contract = goldenG3V6CheckContractForKind(kind);
  const adapterSlot = goldenG3V6AdapterFactorySlotForCheckKind(kind);
  const matrixAxes: VerificationCheckDefinition['matrixAxes'][number][] = [
    'frameworkTarget',
  ];
  if (browserCheck) matrixAxes.push('browserEngine');
  if (MOTION_CHECK_KINDS.includes(kind)) matrixAxes.push('motion');
  return Object.freeze({
    id: `check:g3-v6:${group.id}:${kind}`,
    ownerId: adapterSlot.ownerPackage,
    kind,
    scenarioIds: scenarioCheck
      ? Object.freeze([
          kind === 'security'
            ? productionSecurityScenario.id
            : catalogScenario.id,
        ])
      : Object.freeze([]),
    scenarioTags: Object.freeze([]),
    impactedDomains: Object.freeze([]),
    capabilityIds: Object.freeze([]),
    riskFlags: Object.freeze([group.riskFlag]),
    targetIds: Object.freeze([GOLDEN_G3_V6_IDS.target]),
    frameworkTargets: GOLDEN_G3_V6_FRAMEWORK_TARGETS,
    surfaces: Object.freeze([group.surface]),
    browserEngines: browserCheck
      ? Object.freeze([group.browserEngine])
      : Object.freeze([]),
    matrixAxes: Object.freeze(matrixAxes),
    adapterId: adapterSlot.adapterId,
    dependencyCheckIds: Object.freeze([]),
    resources: Object.freeze([
      Object.freeze({
        key: `g3-v6:${group.id}:${browserCheck ? 'browser' : kind}`,
        mode: browserCheck ? ('exclusive' as const) : ('shared' as const),
      }),
    ]),
    inputKinds: contract.inputKinds,
    artifactKinds: contract.artifactKinds,
    estimatedCost: sharedCost,
  });
};

export const GOLDEN_G3_V6_CHECKS: readonly VerificationCheckDefinition[] =
  Object.freeze(
    GOLDEN_G3_V6_MATRIX_GROUPS.flatMap((group) =>
      group.checkKinds.map((kind) => createCheck(group, kind))
    ).sort((left, right) => compareVerificationText(left.id, right.id))
  );

const matrixProfiles = GOLDEN_G3_V6_MATRIX_GROUPS.map((group) =>
  Object.freeze({
    id: group.profileId,
    name: `G3 V6 ${group.id}`,
    matrix: Object.freeze({
      frameworkTargets: GOLDEN_G3_V6_FRAMEWORK_TARGETS,
      surfaces: Object.freeze([group.surface]),
      browserEngines: Object.freeze([group.browserEngine]),
      viewports: Object.freeze([DESKTOP_VIEWPORT]),
      colorSchemes: Object.freeze(['light'] as const),
      motions: group.motions,
      locales: Object.freeze(['en-US']),
    }),
  })
);

const policyRules = GOLDEN_G3_V6_MATRIX_GROUPS.flatMap((group) =>
  group.checkKinds.map((kind) =>
    Object.freeze({
      id: `rule:g3-v6:${group.id}:${kind}`,
      requirement: 'required' as const,
      checkKinds: Object.freeze([kind]),
      scenarioIds: Object.freeze([]),
      scenarioTags: Object.freeze([]),
      criticalities: Object.freeze([]),
      impactedDomains: Object.freeze([]),
      riskFlags: Object.freeze([group.riskFlag]),
      matrixProfileId: group.profileId,
      retryPolicyId: GOLDEN_G3_V6_IDS.retry,
      evidenceTrust: group.evidenceTrust,
      controlProfileRef: catalogScenario.controlProfileRef,
      ...(kind === 'integration' ||
      (kind !== 'security' && SCENARIO_CHECK_KINDS.includes(kind))
        ? { fixtureSetRef }
        : {}),
      ...(kind === 'visual' ? { baselineSetRef } : {}),
    })
  )
);

const policy: VerificationPolicy = {
  id: GOLDEN_G3_V6_IDS.policy,
  name: 'G3 V6 controlled adapter matrix',
  defaultRequirement: 'forbidden',
  rules: policyRules,
  matrixProfiles,
  budgets: {
    maximumCells: 96,
    maximumCellsPerCheckKind: 32,
    maximumTargetExpansions: 128,
    maximumBrowserExpansions: 3,
    maximumClosureEvidenceRecords: 1_000,
    totalMs: 300_000,
    artifactBytes: 100_000_000,
    estimatedComputeUnits: 256,
    parallelism: 8,
  },
  retryPolicies: [
    {
      id: GOLDEN_G3_V6_IDS.retry,
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
    acceptedTrust: ['local-unattested', 'remote-attested', 'ci-attested'],
    maximumAgeMs: 86_400_000,
    requireAttestation: false,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: [],
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

export const GOLDEN_G3_V6_POLICY: VerificationPolicy = Object.freeze(
  normalizeVerificationPolicy(policy)
);

export const createGoldenG3V6PlanInput = (
  overrides: Readonly<{
    impactSet?: VerificationImpactSet;
    scenarios?: readonly VerificationScenarioDescriptor[];
    checks?: readonly VerificationCheckDefinition[];
    adapters?: readonly VerificationAdapterRegistration[];
  }> = {}
): CreateVerificationPlanInput => {
  const scenarios = overrides.scenarios ?? GOLDEN_G3_V6_SCENARIOS;
  const checks = overrides.checks ?? GOLDEN_G3_V6_CHECKS;
  const adapters = Object.freeze(
    [...(overrides.adapters ?? GOLDEN_G3_V6_ADAPTERS)].sort((left, right) =>
      compareVerificationText(left.identity.adapterId, right.identity.adapterId)
    )
  );
  return Object.freeze({
    impactSet: overrides.impactSet ?? GOLDEN_G3_V6_IMPACT,
    policy: GOLDEN_G3_V6_POLICY,
    policyRevision: 1,
    policyDigest: digestVerificationValue(GOLDEN_G3_V6_POLICY),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    scenarioRegistryDigest: digestVerificationValue(scenarios),
    scenarios,
    checks,
    adapters,
    adapterRegistryDigest: digestGoldenG3V6AdapterRegistry(adapters),
    compilerDigest: digestVerificationValue({
      compiler: '@prodivix/prodivix-compiler',
      contract: 'g3-v6-controlled-matrix',
    }),
    plannerDigest: digestVerificationValue({
      planner: '@prodivix/verification',
      contract: 'g3-v6-controlled-matrix',
    }),
  });
};

export const createGoldenG3V6Plan = (
  overrides: Parameters<typeof createGoldenG3V6PlanInput>[0] = {}
): VerificationPlanResult =>
  createVerificationPlan(createGoldenG3V6PlanInput(overrides));
