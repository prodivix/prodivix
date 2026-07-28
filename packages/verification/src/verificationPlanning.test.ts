import { describe, expect, it } from 'vitest';
import {
  createVerificationImpactSet,
  createVerificationPlan,
  digestVerificationValue,
  evaluateVerificationClosure,
  evaluateVerificationPolicy,
  isVerificationClosureForPlan,
  normalizeVerificationPolicy,
  projectVerificationPlanExplanation,
  uniqueVerificationText,
  type CreateVerificationPlanInput,
  type VerificationAdapterRegistration,
  type VerificationCheckDefinition,
  type VerificationEvidence,
  type VerificationPolicy,
  type VerificationScenarioDescriptor,
} from './index';

const TEST_DIGEST = `sha256-${'a'.repeat(64)}`;

const controlProfileRef = Object.freeze({
  kind: 'workspace' as const,
  documentId: 'control:g3',
  digest: TEST_DIGEST,
});

const policy = (maximumCells = 64): VerificationPolicy => ({
  id: 'policy:g3',
  name: 'G3 verification',
  defaultRequirement: 'forbidden',
  rules: [
    {
      id: 'rule:e2e',
      requirement: 'required',
      checkKinds: ['e2e'],
      scenarioIds: [],
      scenarioTags: ['catalog'],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix:browser',
      retryPolicyId: 'retry:strict',
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
    {
      id: 'rule:security-forbidden',
      requirement: 'forbidden',
      checkKinds: ['security'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: ['secret'],
      matrixProfileId: 'matrix:browser',
      retryPolicyId: 'retry:strict',
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix:browser',
      name: 'Browser',
      matrix: {
        frameworkTargets: ['react-vite', 'vue-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium', 'firefox'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['light'],
        motions: ['full', 'reduced'],
        locales: ['en'],
      },
    },
  ],
  budgets: {
    maximumCells,
    maximumCellsPerCheckKind: maximumCells,
    maximumTargetExpansions: 8,
    maximumBrowserExpansions: 3,
    totalMs: 100_000,
    artifactBytes: 10_000_000,
    estimatedComputeUnits: 100,
    parallelism: 4,
  },
  retryPolicies: [
    {
      id: 'retry:strict',
      maximumAttempts: 2,
      retryableOutcomes: ['infrastructure-error'],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
  ],
  exemptions: [],
  evidenceRequirements: {
    acceptedTrust: ['ci-attested'],
    maximumAgeMs: 60_000,
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
});

const scenario: VerificationScenarioDescriptor = {
  id: 'scenario:catalog',
  documentId: 'scenario:catalog',
  criticality: 'critical',
  tags: ['catalog'],
  impactedDomains: ['pir', 'data', 'route'],
  capabilityIds: ['behavior:scenario'],
  targetIds: ['catalog'],
  frameworkTargets: ['react-vite', 'vue-vite'],
  controlProfileRef,
};

const buildCheck: VerificationCheckDefinition = {
  id: 'check:build',
  ownerId: 'compiler',
  kind: 'build',
  scenarioIds: [],
  scenarioTags: [],
  impactedDomains: [],
  capabilityIds: [],
  riskFlags: [],
  targetIds: ['catalog'],
  frameworkTargets: ['react-vite', 'vue-vite'],
  surfaces: ['ci'],
  browserEngines: [],
  matrixAxes: ['frameworkTarget'],
  adapterId: 'adapter:ci',
  dependencyCheckIds: [],
  resources: [{ key: 'build:catalog', mode: 'shared' }],
  inputKinds: ['executable-snapshot'],
  artifactKinds: ['build-log'],
  estimatedCost: {
    durationMs: 100,
    artifactBytes: 1000,
    computeUnits: 1,
  },
};

const e2eCheck: VerificationCheckDefinition = {
  id: 'check:e2e',
  ownerId: 'behavior',
  kind: 'e2e',
  scenarioIds: ['scenario:catalog'],
  scenarioTags: ['catalog'],
  impactedDomains: ['pir'],
  capabilityIds: [],
  riskFlags: [],
  targetIds: ['catalog'],
  frameworkTargets: ['react-vite', 'vue-vite'],
  surfaces: ['ci'],
  browserEngines: ['chromium', 'firefox'],
  matrixAxes: ['frameworkTarget', 'browserEngine', 'motion'],
  adapterId: 'adapter:ci',
  dependencyCheckIds: [],
  resources: [{ key: 'browser', mode: 'exclusive' }],
  inputKinds: ['executable-snapshot', 'scenario-program'],
  artifactKinds: ['replay-record'],
  estimatedCost: {
    durationMs: 1000,
    artifactBytes: 100_000,
    computeUnits: 1,
  },
};

const adapter: VerificationAdapterRegistration = {
  identity: {
    adapterId: 'adapter:ci',
    toolchainDigest: 'sha256-toolchain',
    capabilityDigest: 'sha256-capabilities',
  },
  descriptor: {
    id: 'adapter:ci',
    implementation: {
      packageName: '@prodivix/runtime-browser',
      packageVersion: '0.0.1',
      buildDigest: 'sha256-build',
      toolchainDigest: 'sha256-toolchain',
      schemaDigest: 'sha256-schema',
    },
    checkKinds: ['build', 'e2e'],
    surfaces: ['ci'],
    targets: ['react-vite', 'vue-vite'],
    browserEngines: ['chromium', 'firefox'],
    controlCapabilities: [],
    inputKinds: ['executable-snapshot', 'scenario-program'],
    artifactKinds: ['build-log', 'replay-record'],
    budgets: {
      maximumDurationMs: 10_000,
      maximumArtifactBytes: 1_000_000,
      maximumEvents: 10_000,
    },
    trustInputs: ['ci-attested'],
  },
};

const impact = () => {
  const result = createVerificationImpactSet({
    workspaceId: 'workspace:g3',
    baseRevision: 7,
    basePartitionRevisions: {
      workspaceRev: 7,
      routeRev: 1,
      opSeq: 7,
      documentRevisions: {},
    },
    targetRevision: 8,
    targetPartitionRevisions: {
      workspaceRev: 8,
      routeRev: 1,
      opSeq: 8,
      documentRevisions: {},
    },
    semanticSchemaDigest: 'semantic:v1',
    providerSetDigest: 'sha256-providers',
    operationIds: ['op:2', 'op:1'],
    contributions: [
      {
        contributorId: 'workspace',
        completeness: 'complete',
        changedDocumentIds: ['catalog:pir'],
        changedSymbolIds: ['symbol:product-card'],
        impactedScenarioIds: ['scenario:catalog'],
        impactedDomains: ['pir'],
        frameworkTargets: ['vue-vite', 'react-vite'],
        runtimeZones: ['browser'],
        capabilityIds: ['behavior:scenario'],
        impactPaths: [
          {
            id: 'path:catalog-scenario',
            relationship: 'reference',
            fromId: 'symbol:product-card',
            toId: 'scenario:catalog',
            nodes: ['symbol:product-card', 'scenario:catalog'],
            contributorId: 'workspace',
          },
        ],
        reasons: [
          {
            id: 'reason:pir',
            kind: 'symbol-change',
            message: 'Product card changed.',
            contributorId: 'workspace',
            sourceId: 'symbol:product-card',
          },
        ],
      },
    ],
  });
  if (result.status !== 'ready') throw new Error(result.message);
  return result.impactSet;
};

const planInput = (
  overridePolicy: VerificationPolicy = policy()
): CreateVerificationPlanInput => ({
  impactSet: impact(),
  policy: overridePolicy,
  policyRevision: 4,
  policyDigest: digestVerificationValue(
    normalizeVerificationPolicy(overridePolicy)
  ),
  policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
  scenarioRegistryDigest: 'sha256-scenarios',
  scenarios: [scenario],
  checks: [e2eCheck],
  adapters: [adapter],
  adapterRegistryDigest: 'sha256-adapters',
  compilerDigest: 'sha256-compiler',
  plannerDigest: 'sha256-planner-v4',
});

const evidenceFor = (
  plan: ReturnType<typeof createVerificationPlan>['plan'],
  outcome: VerificationEvidence['result']['outcome'],
  overrides: Partial<VerificationEvidence> = {}
): VerificationEvidence => {
  const cell = plan.cells[0]!;
  return {
    id: `evidence:${outcome}`,
    projectId: 'project:g3',
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    partitionRevisions: plan.targetPartitionRevisions,
    executableSnapshotDigest: 'sha256-executable',
    ...(cell.scenarioId
      ? {
          scenario: {
            id: cell.scenarioId,
            revision: 1,
            digest: 'sha256-scenario',
            programDigest: 'sha256-program',
          },
        }
      : {}),
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    impactDigest: plan.impactDigest,
    planDigest: plan.planDigest,
    policyEvaluationInstant: plan.policyEvaluationInstant,
    cellId: cell.id,
    checkId: cell.checkId,
    attemptId: `attempt:${outcome}`,
    run: {
      runId: 'run:1',
      providerId: 'ci',
      surface: cell.surface,
      frameworkTarget: cell.frameworkTarget,
      runtimeZone: 'browser',
      ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
    },
    timing: {
      startedAt: '2026-07-28T00:00:01.000Z',
      completedAt: '2026-07-28T00:00:02.000Z',
      durationMs: 1000,
    },
    result: {
      outcome,
      normalizedResultDigest: `sha256-${outcome}`,
      summary: { outcome },
      diagnosticCodes: [],
      appliedExemptionIds: [],
    },
    provenance: {
      trust: 'ci-attested',
      producerId: 'ci',
      attestationDigest: 'sha256-attestation',
      issuedAt: '2026-07-28T00:00:02.000Z',
    },
    toolchain: {
      packageName: '@prodivix/runtime-browser',
      packageVersion: '0.0.1',
      buildDigest: 'sha256-build',
      toolchainDigest: cell.adapter.toolchainDigest,
      schemaDigest: 'sha256-schema',
    },
    controls: {
      profileDigest: TEST_DIGEST,
      appliedDigest: 'sha256-control-applied',
    },
    inputs: {
      executableSnapshotDigest: 'sha256-executable',
      ...(cell.scenarioId ? { scenarioProgramDigest: 'sha256-program' } : {}),
      fixtureSetDigests: [],
      inputDigest: cell.inputDigest,
    },
    artifacts: [
      {
        id: 'artifact:replay',
        kind: 'replay-record',
        digest: 'sha256-replay',
        size: 10,
        mediaType: 'application/json',
      },
    ],
    sourceTraceDigest: 'sha256-trace',
    dependencyLockDigest: 'sha256-lock',
    redactionPolicyId: 'redaction:v1',
    createdAt: '2026-07-28T00:00:02.000Z',
    retention: 'change',
    manifestDigest: `sha256-manifest-${outcome}`,
    ...overrides,
  };
};

const closureInput = (
  plan: ReturnType<typeof createVerificationPlan>['plan'],
  evidence: readonly VerificationEvidence[],
  closureEvaluationInstant: string
) => ({
  plan,
  evidence,
  closureEvaluationInstant,
  targetRevision: plan.targetRevision,
  targetPartitionRevisions: plan.targetPartitionRevisions,
  scenarioRegistryDigest: plan.scenarioRegistryDigest,
  semanticSchemaDigest: plan.semanticSchemaDigest,
  providerSetDigest: plan.providerSetDigest,
  adapterRegistryDigest: plan.adapterRegistryDigest,
  impactDigest: plan.impactDigest,
  policyRevision: plan.policyRevision,
  policyDigest: plan.policyDigest,
  compilerDigest: plan.compilerDigest,
  plannerDigest: plan.plannerDigest,
  baselineSetDigests: [],
  toolchainSetDigest: digestVerificationValue(
    uniqueVerificationText(
      plan.cells.map((cell) => cell.adapter.toolchainDigest)
    )
  ),
  revocationRecordDigest: 'sha256-revocations',
  revokedEvidenceIds: [],
});

describe('Verification V4 planning', () => {
  it('merges Impact contributions in canonical order and broadens incomplete scope', () => {
    const first = impact();
    const secondResult = createVerificationImpactSet({
      workspaceId: first.workspaceId,
      baseRevision: first.baseRevision,
      basePartitionRevisions: first.basePartitionRevisions,
      targetRevision: first.targetRevision,
      targetPartitionRevisions: first.targetPartitionRevisions,
      semanticSchemaDigest: first.semanticSchemaDigest,
      providerSetDigest: first.providerSetDigest,
      operationIds: [...first.operationIds].reverse(),
      contributions: [
        {
          contributorId: 'incomplete',
          completeness: 'conservative',
          changedDocumentIds: [...first.changedDocumentIds],
          changedSymbolIds: [...first.changedSymbolIds],
          impactedScenarioIds: [...first.impactedScenarioIds],
          impactedDomains: [...first.impactedDomains],
          frameworkTargets: [...first.frameworkTargets],
          runtimeZones: [...first.runtimeZones],
          capabilityIds: [...first.capabilityIds],
        },
      ],
      conservativeScope: {
        scenarioIds: ['scenario:all'],
        domains: ['project'],
        frameworkTargets: ['react-vite', 'vue-vite'],
        runtimeZones: ['browser'],
        capabilityIds: ['verification:global'],
        riskFlags: ['unknown-impact'],
      },
    });
    expect(secondResult.status).toBe('ready');
    if (secondResult.status !== 'ready') return;
    expect(secondResult.impactSet.completeness).toBe('conservative');
    expect(secondResult.impactSet.impactedScenarioIds).toEqual([
      'scenario:all',
      'scenario:catalog',
    ]);
    expect(secondResult.impactSet.riskFlags).toEqual(['unknown-impact']);
  });

  it('blocks conflicting contributor identities instead of depending on insertion order', () => {
    const current = impact();
    const result = createVerificationImpactSet({
      workspaceId: current.workspaceId,
      baseRevision: current.baseRevision,
      basePartitionRevisions: current.basePartitionRevisions,
      targetRevision: current.targetRevision,
      targetPartitionRevisions: current.targetPartitionRevisions,
      semanticSchemaDigest: current.semanticSchemaDigest,
      providerSetDigest: current.providerSetDigest,
      operationIds: current.operationIds,
      contributions: [
        {
          contributorId: 'first',
          completeness: 'complete',
          reasons: [
            {
              id: 'reason:conflict',
              kind: 'symbol-change',
              message: 'First meaning.',
              contributorId: 'first',
            },
          ],
        },
        {
          contributorId: 'second',
          completeness: 'complete',
          reasons: [
            {
              id: 'reason:conflict',
              kind: 'symbol-change',
              message: 'Second meaning.',
              contributorId: 'second',
            },
          ],
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'VER-1001',
    });

    expect(
      createVerificationImpactSet({
        workspaceId: current.workspaceId,
        baseRevision: current.baseRevision,
        basePartitionRevisions: current.basePartitionRevisions,
        targetRevision: current.targetRevision,
        targetPartitionRevisions: current.targetPartitionRevisions,
        semanticSchemaDigest: current.semanticSchemaDigest,
        providerSetDigest: current.providerSetDigest,
        operationIds: current.operationIds,
        contributions: [],
      })
    ).toMatchObject({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message: 'At least one semantic impact contribution is required.',
    });
  });

  it('applies forbidden hard-cut and rejects equal-specificity conflicts', () => {
    const forbidden = evaluateVerificationPolicy(
      policy(),
      {
        checkId: 'check:security',
        checkKind: 'security',
        scenarioTags: [],
        impactedDomains: [],
        riskFlags: ['secret'],
        targetId: 'workspace',
      },
      '2026-07-28T00:00:00.000Z'
    );
    expect(forbidden).toMatchObject({
      status: 'resolved',
      evaluation: { requirement: 'forbidden' },
    });

    const conflictingPolicy: VerificationPolicy = {
      ...policy(),
      rules: [
        policy().rules[0]!,
        {
          ...policy().rules[0]!,
          id: 'rule:e2e-advisory',
          requirement: 'advisory',
        },
      ],
    };
    const conflict = evaluateVerificationPolicy(
      conflictingPolicy,
      {
        checkId: 'check:e2e',
        checkKind: 'e2e',
        scenarioId: scenario.id,
        scenarioTags: scenario.tags,
        criticality: scenario.criticality,
        impactedDomains: scenario.impactedDomains,
        riskFlags: [],
        targetId: 'catalog',
      },
      '2026-07-28T00:00:00.000Z'
    );
    expect(conflict).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-2001',
    });
  });

  it('applies only active visual/a11y exemptions and rejects invalid instants', () => {
    const exemptedPolicy: VerificationPolicy = {
      ...policy(),
      rules: [
        {
          ...policy().rules[0]!,
          id: 'rule:visual',
          checkKinds: ['visual'],
          scenarioIds: [scenario.id],
          scenarioTags: [],
        },
      ],
      exemptions: [
        {
          id: 'exemption:visual',
          ruleId: 'rule:visual',
          targetId: scenario.id,
          reason: 'Known rendering delta.',
          actorRef: 'actor:reviewer',
          createdAt: '2026-07-27T00:00:00.000Z',
          expiresAt: '2026-07-29T00:00:00.000Z',
          reducesTo: 'advisory',
          issueRef: 'issue:visual',
        },
      ],
    };
    const facts = {
      checkId: 'check:visual',
      checkKind: 'visual' as const,
      scenarioId: scenario.id,
      scenarioTags: scenario.tags,
      criticality: scenario.criticality,
      impactedDomains: scenario.impactedDomains,
      riskFlags: [],
      targetId: 'catalog',
    };
    expect(
      evaluateVerificationPolicy(
        exemptedPolicy,
        facts,
        '2026-07-28T00:00:00.000Z'
      )
    ).toMatchObject({
      status: 'resolved',
      evaluation: {
        requirement: 'advisory',
        trace: { appliedExemptionIds: ['exemption:visual'] },
      },
    });
    expect(
      evaluateVerificationPolicy(
        exemptedPolicy,
        facts,
        '2026-07-29T00:00:00.000Z'
      )
    ).toMatchObject({
      status: 'resolved',
      evaluation: {
        requirement: 'required',
        trace: { appliedExemptionIds: [] },
      },
    });
    expect(
      evaluateVerificationPolicy(
        exemptedPolicy,
        facts,
        '2026-02-30T00:00:00.000Z'
      )
    ).toMatchObject({ status: 'invalid', reasonCode: 'VER-2001' });
  });

  it('produces a byte-stable named matrix and blocks required unsupported cells', () => {
    const first = createVerificationPlan(planInput());
    const second = createVerificationPlan({
      ...planInput(),
      scenarios: [...planInput().scenarios].reverse(),
      checks: [...planInput().checks].reverse(),
      adapters: [...planInput().adapters].reverse(),
    });
    expect(first.status).toBe('ready');
    expect(second.plan).toEqual(first.plan);
    expect(first.plan.cells).toHaveLength(8);
    expect(
      new Set(first.plan.cells.map((cell) => cell.frameworkTarget))
    ).toEqual(new Set(['react-vite', 'vue-vite']));
    expect(new Set(first.plan.cells.map((cell) => cell.browserEngine))).toEqual(
      new Set(['chromium', 'firefox'])
    );
    expect(new Set(first.plan.cells.map((cell) => cell.motion))).toEqual(
      new Set(['full', 'reduced'])
    );

    const unsupported = createVerificationPlan({
      ...planInput(),
      adapters: [],
    });
    expect(unsupported.status).toBe('blocked');
    expect(
      unsupported.plan.issues.some((issue) => issue.code === 'VER-3002')
    ).toBe(true);
  });

  it('replans all applicable checks for project Policy or target changes', () => {
    const current = impact();
    const globalImpact = createVerificationImpactSet({
      workspaceId: current.workspaceId,
      baseRevision: current.baseRevision,
      basePartitionRevisions: current.basePartitionRevisions,
      targetRevision: current.targetRevision,
      targetPartitionRevisions: current.targetPartitionRevisions,
      semanticSchemaDigest: current.semanticSchemaDigest,
      providerSetDigest: current.providerSetDigest,
      operationIds: ['operation:policy'],
      contributions: [
        {
          contributorId: 'verification-policy',
          completeness: 'complete',
          impactedDomains: ['verification'],
          frameworkTargets: ['react-vite', 'vue-vite'],
          runtimeZones: ['browser'],
          reasons: [
            {
              id: 'reason:policy',
              kind: 'document-change',
              message: 'The project VerificationPolicy changed.',
              contributorId: 'verification-policy',
            },
          ],
        },
      ],
    });
    expect(globalImpact.status).toBe('ready');
    if (globalImpact.status !== 'ready') return;
    const result = createVerificationPlan({
      ...planInput(),
      impactSet: globalImpact.impactSet,
    });
    expect(result.status).toBe('ready');
    expect(result.plan.cells).toHaveLength(8);
  });

  it('never trims required cells but deterministically trims advisory budget', () => {
    const required = createVerificationPlan(planInput(policy(4)));
    expect(required.status).toBe('blocked');
    expect(required.plan.cells).toHaveLength(8);
    expect(required.plan.issues).toContainEqual(
      expect.objectContaining({ code: 'VER-3004' })
    );

    const advisoryPolicy: VerificationPolicy = {
      ...policy(4),
      rules: [
        {
          ...policy(4).rules[0]!,
          requirement: 'advisory',
        },
      ],
    };
    const advisory = createVerificationPlan(planInput(advisoryPolicy));
    expect(advisory.status).toBe('ready');
    expect(advisory.plan.cells).toHaveLength(4);
    expect(
      advisory.plan.explanations.some(
        (explanation) => explanation.status === 'trimmed-advisory'
      )
    ).toBe(true);
  });

  it('builds exact dependency edges without allowing missing required checks', () => {
    const dependent: VerificationCheckDefinition = {
      ...e2eCheck,
      dependencyCheckIds: ['check:build'],
    };
    const dependencyPolicy: VerificationPolicy = {
      ...policy(),
      rules: [
        policy().rules[0]!,
        {
          ...policy().rules[0]!,
          id: 'rule:build',
          checkKinds: ['build'],
          scenarioTags: [],
        },
      ],
    };
    const withDependency = createVerificationPlan({
      ...planInput(),
      policy: dependencyPolicy,
      policyDigest: digestVerificationValue(
        normalizeVerificationPolicy(dependencyPolicy)
      ),
      checks: [dependent, buildCheck],
    });
    expect(withDependency.status).toBe('ready');
    expect(
      withDependency.plan.cells
        .filter((cell) => cell.checkId === 'check:e2e')
        .every((cell) => cell.dependencyCellIds.length === 1)
    ).toBe(true);
  });

  it('blocks digest drift, dependency cycles, and advisory dependencies of required cells', () => {
    const digestDrift = createVerificationPlan({
      ...planInput(),
      policyDigest: 'sha256-not-the-policy',
    });
    expect(digestDrift.status).toBe('blocked');
    expect(digestDrift.plan.issues).toContainEqual(
      expect.objectContaining({ code: 'VER-2001' })
    );

    const duplicateResource = createVerificationPlan({
      ...planInput(),
      checks: [
        {
          ...e2eCheck,
          resources: [...e2eCheck.resources, { ...e2eCheck.resources[0]! }],
        },
      ],
    });
    expect(duplicateResource).toMatchObject({
      status: 'blocked',
      plan: {
        issues: [
          expect.objectContaining({
            code: 'VER-2001',
            message: expect.stringContaining('duplicate or conflicting'),
          }),
        ],
      },
    });

    const first = {
      ...e2eCheck,
      id: 'check:cycle:a',
      dependencyCheckIds: ['check:cycle:b'],
    };
    const second = {
      ...e2eCheck,
      id: 'check:cycle:b',
      dependencyCheckIds: ['check:cycle:a'],
    };
    const cycle = createVerificationPlan({
      ...planInput(),
      checks: [first, second],
    });
    expect(cycle.status).toBe('blocked');
    expect(cycle.plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'VER-3003',
        message: 'Verification check dependencies contain a cycle.',
      })
    );

    const dependencyPolicy: VerificationPolicy = {
      ...policy(),
      rules: [
        policy().rules[0]!,
        {
          ...policy().rules[0]!,
          id: 'rule:build-advisory',
          requirement: 'advisory',
          checkKinds: ['build'],
          scenarioTags: [],
        },
      ],
    };
    const advisoryDependency = createVerificationPlan({
      ...planInput(),
      policy: dependencyPolicy,
      policyDigest: digestVerificationValue(
        normalizeVerificationPolicy(dependencyPolicy)
      ),
      checks: [
        { ...e2eCheck, dependencyCheckIds: [buildCheck.id] },
        buildCheck,
      ],
    });
    expect(advisoryDependency.status).toBe('blocked');
    expect(advisoryDependency.plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'VER-3003',
        message: expect.stringContaining('must also be required'),
      })
    );
  });

  it('records a non-applicable decision when Scenario/check targets do not intersect', () => {
    const result = createVerificationPlan({
      ...planInput(),
      checks: [{ ...e2eCheck, targetIds: ['other-target'] }],
    });
    expect(result.status).toBe('ready');
    expect(result.plan.cells).toEqual([]);
    expect(result.plan.explanations).toContainEqual(
      expect.objectContaining({
        checkId: e2eCheck.id,
        status: 'not-applicable',
      })
    );
  });

  it('does not reinterpret an empty framework intersection as unconstrained', () => {
    const result = createVerificationPlan({
      ...planInput(),
      scenarios: [{ ...scenario, frameworkTargets: ['vue-vite'] }],
      checks: [{ ...e2eCheck, frameworkTargets: ['react-vite'] }],
    });
    expect(result.status).toBe('ready');
    expect(result.plan.cells).toEqual([]);
    expect(result.plan.explanations).toContainEqual(
      expect.objectContaining({
        checkId: e2eCheck.id,
        status: 'not-applicable',
        messages: [
          'The selected matrix has no coordinate supported by the check definition.',
        ],
      })
    );
  });

  it('binds declared inputs and expected artifacts into each Plan cell', () => {
    const visualRule = {
      ...policy().rules[0]!,
      id: 'rule:visual',
      checkKinds: ['visual'] as const,
    };
    const visualPolicy: VerificationPolicy = {
      ...policy(),
      rules: [visualRule],
    };
    const visualCheck: VerificationCheckDefinition = {
      ...e2eCheck,
      id: 'check:visual',
      kind: 'visual',
      inputKinds: ['executable-snapshot', 'scenario-program', 'baseline-set'],
      artifactKinds: ['screenshot', 'visual-diff'],
    };
    const visualAdapter: VerificationAdapterRegistration = {
      ...adapter,
      descriptor: {
        ...adapter.descriptor,
        checkKinds: [...adapter.descriptor.checkKinds, 'visual'],
        inputKinds: [...adapter.descriptor.inputKinds, 'baseline-set'],
        artifactKinds: [
          ...adapter.descriptor.artifactKinds,
          'screenshot',
          'visual-diff',
        ],
      },
    };
    const missingBaseline = createVerificationPlan({
      ...planInput(visualPolicy),
      checks: [visualCheck],
      adapters: [visualAdapter],
    });
    expect(missingBaseline.status).toBe('blocked');
    expect(missingBaseline.plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'VER-3003',
        message: expect.stringContaining('baseline-set input'),
      })
    );

    const boundPolicy: VerificationPolicy = {
      ...visualPolicy,
      rules: [
        {
          ...visualRule,
          baselineSetRef: {
            documentId: 'baseline:catalog',
            digest: TEST_DIGEST,
          },
        },
      ],
    };
    const bound = createVerificationPlan({
      ...planInput(boundPolicy),
      checks: [visualCheck],
      adapters: [visualAdapter],
    });
    expect(bound.status).toBe('ready');
    expect(bound.plan.cells[0]).toMatchObject({
      inputKinds: ['baseline-set', 'executable-snapshot', 'scenario-program'],
      artifactKinds: ['screenshot', 'visual-diff'],
      baselineSetRef: { digest: TEST_DIGEST },
    });

    const forbiddenBaselinePolicy: VerificationPolicy = {
      ...boundPolicy,
      baselinePolicy: {
        visual: 'forbidden',
        requireCompatibleIdentity: true,
      },
    };
    const forbiddenBaseline = createVerificationPlan({
      ...planInput(forbiddenBaselinePolicy),
      checks: [visualCheck],
      adapters: [visualAdapter],
    });
    expect(forbiddenBaseline.status).toBe('blocked');
    expect(forbiddenBaseline.plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'VER-3003',
        message: 'VerificationPolicy forbids visual baseline comparison.',
      })
    );
  });
});

describe('Verification V4 closure projection', () => {
  it('accepts only current, trusted, compatible passing Evidence', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const evidence = plan.cells.map((cell, index) =>
      evidenceFor(plan, 'passed', {
        id: `evidence:${index}`,
        cellId: cell.id,
        checkId: cell.checkId,
        attemptId: `attempt:${index}`,
        inputs: {
          executableSnapshotDigest: 'sha256-executable',
          ...(cell.scenarioId
            ? { scenarioProgramDigest: 'sha256-program' }
            : {}),
          fixtureSetDigests: [],
          inputDigest: cell.inputDigest,
        },
        run: {
          runId: `run:${index}`,
          providerId: 'ci',
          surface: cell.surface,
          frameworkTarget: cell.frameworkTarget,
          runtimeZone: 'browser',
          ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
        },
        manifestDigest: `sha256-manifest-${index}`,
      })
    );
    const result = evaluateVerificationClosure(
      closureInput(plan, evidence, '2026-07-28T00:00:03.000Z')
    );
    expect(result).toMatchObject({
      status: 'ready',
      closure: { verdict: 'satisfied' },
    });
  });

  it.each([
    ['stale', { workspaceRevision: 999 }],
    [
      'incompatible',
      {
        provenance: {
          trust: 'local-unattested' as const,
          producerId: 'local',
          issuedAt: '2026-07-28T00:00:02.000Z',
        },
      },
    ],
  ])('derives %s instead of a skipped escape hatch', (expected, override) => {
    const plan = createVerificationPlan(planInput()).plan;
    const cell = plan.cells[0]!;
    const result = evaluateVerificationClosure(
      closureInput(
        plan,
        [evidenceFor(plan, 'passed', override)],
        '2026-07-28T00:00:03.000Z'
      )
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.closure.cellStatuses[cell.id]).toBe(expected);
    expect(
      Object.values(result.closure.cellStatuses).includes('skipped' as never)
    ).toBe(false);
  });

  it('marks inconsistent retries unstable and missing required Evidence missing', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const cell = plan.cells[0]!;
    const passed = evidenceFor(plan, 'passed', {
      id: 'evidence:passed',
      cellId: cell.id,
    });
    const failed = evidenceFor(plan, 'failed', {
      id: 'evidence:failed',
      cellId: cell.id,
      attemptId: 'attempt:failed',
      timing: {
        startedAt: '2026-07-28T00:00:02.000Z',
        completedAt: '2026-07-28T00:00:03.000Z',
        durationMs: 1000,
      },
    });
    const unstable = evaluateVerificationClosure(
      closureInput(plan, [passed, failed], '2026-07-28T00:00:04.000Z')
    );
    expect(unstable).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'unsatisfied',
        cellStatuses: { [cell.id]: 'unstable' },
      },
    });

    const missing = evaluateVerificationClosure(
      closureInput(plan, [], '2026-07-28T00:00:04.000Z')
    );
    expect(missing).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'unsatisfied',
        cellStatuses: { [cell.id]: 'missing' },
      },
    });
  });

  it('treats revocation, expiry, and current identity drift as stale', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const cell = plan.cells[0]!;
    const passed = evidenceFor(plan, 'passed');
    const revoked = evaluateVerificationClosure({
      ...closureInput(plan, [passed], '2026-07-28T00:00:03.000Z'),
      revokedEvidenceIds: [passed.id],
      revocationRecordDigest: 'sha256-revoked',
    });
    expect(revoked).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'stale',
        cellStatuses: { [cell.id]: 'stale' },
      },
    });

    const expired = evaluateVerificationClosure(
      closureInput(plan, [passed], '2026-07-29T00:00:03.000Z')
    );
    expect(expired).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'stale' } },
    });

    const identityDrift = evaluateVerificationClosure({
      ...closureInput(plan, [passed], '2026-07-28T00:00:03.000Z'),
      toolchainSetDigest: 'sha256-stale-toolchains',
    });
    expect(identityDrift).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'stale',
        issues: expect.arrayContaining([
          expect.objectContaining({ status: 'closure-stale' }),
        ]),
      },
    });
  });

  it('keeps infrastructure retries distinct from instability and rejects attempt abuse', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const cell = plan.cells[0]!;
    const infrastructure = evidenceFor(plan, 'infrastructure-error', {
      id: 'evidence:infra',
      attemptId: 'attempt:infra',
      manifestDigest: 'sha256-manifest-infra',
    });
    const passed = evidenceFor(plan, 'passed', {
      id: 'evidence:passed-after-infra',
      attemptId: 'attempt:passed-after-infra',
      timing: {
        startedAt: '2026-07-28T00:00:02.000Z',
        completedAt: '2026-07-28T00:00:03.000Z',
        durationMs: 1_000,
      },
      provenance: {
        trust: 'ci-attested',
        producerId: 'ci',
        attestationDigest: 'sha256-attestation',
        issuedAt: '2026-07-28T00:00:03.000Z',
      },
      manifestDigest: 'sha256-manifest-passed-after-infra',
    });
    const retried = evaluateVerificationClosure(
      closureInput(plan, [infrastructure, passed], '2026-07-28T00:00:04.000Z')
    );
    expect(retried).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'passed' } },
    });

    const failed = evidenceFor(plan, 'failed', {
      id: 'evidence:failed-before-infra',
      attemptId: 'attempt:failed-before-infra',
      manifestDigest: 'sha256-manifest-failed-before-infra',
    });
    const laterInfrastructure = evidenceFor(plan, 'infrastructure-error', {
      id: 'evidence:infra-after-failure',
      attemptId: 'attempt:infra-after-failure',
      timing: {
        startedAt: '2026-07-28T00:00:02.000Z',
        completedAt: '2026-07-28T00:00:03.000Z',
        durationMs: 1_000,
      },
      provenance: {
        trust: 'ci-attested',
        producerId: 'ci',
        attestationDigest: 'sha256-attestation',
        issuedAt: '2026-07-28T00:00:03.000Z',
      },
      manifestDigest: 'sha256-manifest-infra-after-failure',
    });
    expect(
      evaluateVerificationClosure(
        closureInput(
          plan,
          [failed, laterInfrastructure],
          '2026-07-28T00:00:04.000Z'
        )
      )
    ).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'failed' } },
    });

    const duplicateAttempt = evaluateVerificationClosure(
      closureInput(
        plan,
        [
          evidenceFor(plan, 'passed', { id: 'evidence:duplicate:a' }),
          evidenceFor(plan, 'passed', { id: 'evidence:duplicate:b' }),
        ],
        '2026-07-28T00:00:04.000Z'
      )
    );
    expect(duplicateAttempt).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'incompatible' } },
    });

    const tooManyAttempts = evaluateVerificationClosure(
      closureInput(
        plan,
        ['a', 'b', 'c'].map((suffix, index) =>
          evidenceFor(plan, 'passed', {
            id: `evidence:${suffix}`,
            attemptId: `attempt:${suffix}`,
            timing: {
              startedAt: `2026-07-28T00:00:0${index + 1}.000Z`,
              completedAt: `2026-07-28T00:00:0${index + 2}.000Z`,
              durationMs: 1_000,
            },
            provenance: {
              trust: 'ci-attested',
              producerId: 'ci',
              attestationDigest: 'sha256-attestation',
              issuedAt: `2026-07-28T00:00:0${index + 2}.000Z`,
            },
            manifestDigest: `sha256-manifest-${suffix}`,
          })
        ),
        '2026-07-28T00:00:06.000Z'
      )
    );
    expect(tooManyAttempts).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'incompatible' } },
    });

    const tamperedPlan = { ...plan, targetRevision: plan.targetRevision + 1 };
    expect(
      evaluateVerificationClosure(
        closureInput(tamperedPlan, [], '2026-07-28T00:00:04.000Z')
      )
    ).toMatchObject({ status: 'invalid', reasonCode: 'VER-6002' });
  });

  it('rejects missing check artifacts and mismatched Scenario Program input', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const cell = plan.cells[0]!;
    const missingArtifact = evidenceFor(plan, 'passed', {
      artifacts: [],
    });
    expect(
      evaluateVerificationClosure(
        closureInput(plan, [missingArtifact], '2026-07-28T00:00:04.000Z')
      )
    ).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'incompatible' } },
    });

    const valid = evidenceFor(plan, 'passed');
    const wrongProgram = {
      ...valid,
      inputs: {
        ...valid.inputs,
        scenarioProgramDigest: 'sha256-wrong-program',
      },
    };
    expect(
      evaluateVerificationClosure(
        closureInput(plan, [wrongProgram], '2026-07-28T00:00:04.000Z')
      )
    ).toMatchObject({
      status: 'ready',
      closure: { cellStatuses: { [cell.id]: 'incompatible' } },
    });
  });

  it('requires the complete Closure identity before shared projection', () => {
    const plan = createVerificationPlan(planInput()).plan;
    const evaluated = evaluateVerificationClosure(
      closureInput(plan, [], '2026-07-28T00:00:04.000Z')
    );
    expect(evaluated.status).toBe('ready');
    if (evaluated.status !== 'ready') return;
    expect(isVerificationClosureForPlan(evaluated.closure, plan)).toBe(true);
    const { closureDigest: _closureDigest, ...withoutDigest } =
      evaluated.closure;
    const driftedWithoutDigest = {
      ...withoutDigest,
      workspaceId: 'workspace:other',
    };
    const drifted = {
      ...driftedWithoutDigest,
      closureDigest: digestVerificationValue(driftedWithoutDigest),
    };
    expect(isVerificationClosureForPlan(drifted, plan)).toBe(false);
    expect(() => projectVerificationPlanExplanation(plan, drifted)).toThrow(
      'VerificationClosure identity does not match'
    );
  });
});
