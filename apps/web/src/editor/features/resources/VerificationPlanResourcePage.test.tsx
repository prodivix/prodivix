import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVerificationAdapterRegistration,
  createVerificationAdapterRegistrySnapshot,
  createVerificationImpactSet,
  createVerificationPlan,
  digestVerificationValue,
  evaluateVerificationClosure,
  normalizeVerificationPolicy,
  projectVerificationPlanExplanation,
  serializeVerificationValue,
  uniqueVerificationText,
} from '@prodivix/verification';
import type { VerificationPolicy } from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { buildVerificationResourceModel } from './verificationResourceModel';

const dispatchWorkspaceAuthoringOperation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    status: 'applied',
    operationId: 'verification-operation',
  })
);

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation,
}));

vi.mock('@/editor/features/execution', () => ({
  useWorkspaceExecutionSourceNavigation: () => ({
    openSourceTrace: () => ({
      status: 'unavailable',
      reason: 'source-unavailable',
    }),
  }),
}));

import { VerificationPlanResourcePage } from './VerificationPlanResourcePage';

const controlProfileRef = {
  kind: 'workspace' as const,
  documentId: 'control:g3',
  digest: `sha256-${'a'.repeat(64)}`,
};

const policy: VerificationPolicy = {
  id: 'policy:g3',
  name: 'Release verification',
  defaultRequirement: 'forbidden',
  rules: [
    {
      id: 'rule:e2e',
      requirement: 'required',
      checkKinds: ['e2e'],
      scenarioIds: ['scenario:catalog'],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix:one',
      retryPolicyId: 'retry:one',
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix:one',
      name: 'One cell',
      matrix: {
        frameworkTargets: ['react-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['light'],
        motions: ['reduced'],
        locales: ['en'],
      },
    },
  ],
  budgets: {
    maximumCells: 10,
    maximumCellsPerCheckKind: 10,
    maximumTargetExpansions: 2,
    maximumBrowserExpansions: 2,
    maximumClosureEvidenceRecords: 1_000,
    totalMs: 10_000,
    artifactBytes: 1_000_000,
    estimatedComputeUnits: 10,
    parallelism: 2,
  },
  retryPolicies: [
    {
      id: 'retry:one',
      maximumAttempts: 1,
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
};

const workspace = (): WorkspaceSnapshot => ({
  id: 'workspace:g3',
  workspaceRev: 8,
  routeRev: 1,
  opSeq: 8,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['node:policy'],
    },
    'node:policy': {
      id: 'node:policy',
      kind: 'doc',
      name: 'policy.json',
      parentId: 'root',
      docId: policy.id,
    },
  },
  docsById: {
    [policy.id]: {
      id: policy.id,
      type: 'verification-policy',
      path: '/verification/policy.json',
      contentRev: 1,
      metaRev: 1,
      content: policy,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route:root' },
  },
});

const projection = () => {
  const impactResult = createVerificationImpactSet({
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
      documentRevisions: {
        [policy.id]: { contentRev: 1, metaRev: 1 },
      },
    },
    semanticSchemaDigest: 'semantic:v1',
    providerSetDigest: 'sha256-providers',
    operationIds: ['operation:catalog'],
    contributions: [
      {
        contributorId: 'workspace',
        completeness: 'complete',
        changedDocumentIds: ['catalog:pir'],
        changedSymbolIds: ['symbol:catalog'],
        impactedScenarioIds: ['scenario:catalog'],
        impactedDomains: ['pir'],
        frameworkTargets: ['react-vite'],
        runtimeZones: ['browser'],
        impactPaths: [
          {
            id: 'path:catalog',
            relationship: 'reference',
            fromId: 'symbol:catalog',
            toId: 'scenario:catalog',
            nodes: ['symbol:catalog', 'scenario:catalog'],
            contributorId: 'workspace',
          },
        ],
        reasons: [
          {
            id: 'reason:catalog',
            kind: 'symbol-change',
            message: 'Catalog PIR changed.',
            contributorId: 'workspace',
          },
        ],
      },
    ],
  });
  if (impactResult.status !== 'ready') {
    throw new Error(impactResult.message);
  }
  const adapter = createVerificationAdapterRegistration({
    id: 'adapter:ci',
    implementation: {
      packageName: '@prodivix/runtime-browser',
      packageVersion: '0.0.1',
      buildDigest: digestVerificationValue('adapter:ci:build'),
      toolchainDigest: digestVerificationValue('adapter:ci:toolchain'),
      schemaDigest: digestVerificationValue('adapter:ci:schema'),
    },
    checkKinds: ['e2e'],
    surfaces: ['ci'],
    targets: ['react-vite'],
    browserEngines: ['chromium'],
    controlCapabilities: [],
    inputKinds: ['scenario-program'],
    artifactKinds: ['replay-record'],
    budgets: {
      maximumDurationMs: 10_000,
      maximumArtifactBytes: 1_000_000,
      maximumEvents: 4_096,
    },
    trustInputs: ['ci-attested'],
  });
  const adapterRegistry = createVerificationAdapterRegistrySnapshot([adapter]);
  const planResult = createVerificationPlan({
    impactSet: impactResult.impactSet,
    policy,
    policyRevision: 1,
    policyDigest: digestVerificationValue(normalizeVerificationPolicy(policy)),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    scenarioRegistryDigest: 'sha256-scenarios',
    scenarios: [
      {
        id: 'scenario:catalog',
        documentId: 'scenario:catalog',
        criticality: 'critical',
        tags: ['catalog'],
        impactedDomains: ['pir'],
        capabilityIds: ['behavior:scenario'],
        targetIds: ['catalog'],
        frameworkTargets: ['react-vite'],
        controlProfileRef,
      },
    ],
    checks: [
      {
        id: 'check:e2e',
        ownerId: 'behavior',
        kind: 'e2e',
        scenarioIds: ['scenario:catalog'],
        scenarioTags: [],
        impactedDomains: ['pir'],
        capabilityIds: [],
        riskFlags: [],
        targetIds: ['catalog'],
        frameworkTargets: ['react-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium'],
        matrixAxes: [
          'frameworkTarget',
          'surface',
          'browserEngine',
          'viewport',
          'colorScheme',
          'motion',
          'locale',
        ],
        adapterId: 'adapter:ci',
        dependencyCheckIds: [],
        resources: [{ key: 'browser', mode: 'exclusive' }],
        inputKinds: ['scenario-program'],
        artifactKinds: ['replay-record'],
        estimatedCost: {
          durationMs: 1000,
          artifactBytes: 1000,
          computeUnits: 1,
        },
      },
    ],
    adapters: [adapter],
    adapterRegistryDigest: adapterRegistry.snapshotDigest,
    compilerDigest: 'sha256-compiler',
    plannerDigest: 'sha256-planner',
  });
  return {
    impactSet: impactResult.impactSet,
    plan: planResult.plan,
  };
};

const closureFor = (plan: ReturnType<typeof projection>['plan']) => {
  const result = evaluateVerificationClosure({
    plan,
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
    baselineSetDigests: uniqueVerificationText(
      plan.cells.flatMap((cell) =>
        cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        plan.cells.map((cell) => cell.adapter.toolchainDigest)
      )
    ),
    closureEvaluationInstant: '2026-07-28T00:00:01.000Z',
    evidence: [],
    revokedEvidenceIds: [],
    revocationRecordDigest: 'sha256-revocations',
  });
  if (result.status !== 'ready') throw new Error(result.message);
  return result.closure;
};

beforeEach(() => {
  dispatchWorkspaceAuthoringOperation.mockClear();
  const currentWorkspace = workspace();
  const currentProjection = projection();
  act(() =>
    useEditorStore.setState({
      workspace: currentWorkspace,
      workspaceReadonly: false,
      verificationProjectionByWorkspaceId: {
        [currentWorkspace.id]: currentProjection,
      },
    })
  );
});

afterEach(() => {
  cleanup();
  act(() =>
    useEditorStore.setState({
      workspace: null,
      workspaceReadonly: false,
      verificationProjectionByWorkspaceId: {},
    })
  );
});

describe('Verification resource', () => {
  it('uses the exact shared explanation JSON without client-side reselection', () => {
    const currentProjection = projection();
    const model = buildVerificationResourceModel(
      workspace(),
      currentProjection
    );
    expect(model.projectionStatus).toBe('ready');
    expect(model.explanation).toBeDefined();
    expect(serializeVerificationValue(model.explanation)).toBe(
      serializeVerificationValue(
        projectVerificationPlanExplanation(currentProjection.plan)
      )
    );
    expect(model.explanation?.cells).toHaveLength(
      currentProjection.plan.cells.length
    );
  });

  it('renders Impact path, named matrix, Policy, and plan digest', () => {
    const currentProjection = projection();
    render(<VerificationPlanResourcePage />);
    expect(
      screen.getByText(currentProjection.impactSet.impactDigest)
    ).toBeTruthy();
    expect(screen.getByText(currentProjection.plan.planDigest)).toBeTruthy();
    expect(screen.getByText('check:e2e')).toBeTruthy();
    expect(
      screen.getByText(
        'ci / react-vite / chromium / desktop / light / reduced / en'
      )
    ).toBeTruthy();
    expect(screen.getByText('scenario-program')).toBeTruthy();
    expect(screen.getByText('replay-record')).toBeTruthy();
    expect(screen.getByText(/symbol:catalog → scenario:catalog/)).toBeTruthy();
  });

  it('previews Policy authoring and dispatches one reversible owner Command', async () => {
    render(<VerificationPlanResourcePage />);
    fireEvent.change(
      screen.getByLabelText('resourceManager.verification.policy.name'),
      { target: { value: 'Renamed release policy' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.policy.stageRename',
      })
    );
    expect(
      screen.getByText('Release verification → Renamed release policy')
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.policy.apply',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    expect(
      dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0].operation
    ).toMatchObject({
      kind: 'command',
      command: {
        namespace: 'core.verification',
        type: 'document.update',
        domainHint: 'verification',
      },
    });
  });

  it('hides stale planner output and uses conservative impact only', () => {
    const currentProjection = projection();
    const model = buildVerificationResourceModel(workspace(), {
      ...currentProjection,
      impactSet: {
        ...currentProjection.impactSet,
        targetRevision: 7,
      },
    });
    expect(model.projectionStatus).toBe('stale');
    expect(model.explanation).toBeUndefined();
    expect(model.impact).toMatchObject({
      status: 'ready',
      source: 'conservative-current',
      completeness: 'conservative',
    });
  });

  it('keeps exact Impact visible while hiding a mismatched Plan', () => {
    const currentProjection = projection();
    const model = buildVerificationResourceModel(workspace(), {
      ...currentProjection,
      plan: {
        ...currentProjection.plan,
        targetRevision: 7,
      },
    });
    expect(model.projectionStatus).toBe('stale');
    expect(model.explanation).toBeUndefined();
    expect(model.impact).toMatchObject({
      status: 'ready',
      source: 'planner',
    });
  });

  it('hides a digest-valid Closure with mismatched Plan identity', () => {
    const currentProjection = projection();
    const closure = closureFor(currentProjection.plan);
    expect(
      buildVerificationResourceModel(workspace(), {
        ...currentProjection,
        closure,
      }).explanation?.closure
    ).toMatchObject({ verdict: 'unsatisfied' });

    const { closureDigest: _closureDigest, ...withoutDigest } = closure;
    const driftedWithoutDigest = {
      ...withoutDigest,
      workspaceId: 'workspace:other',
    };
    const model = buildVerificationResourceModel(workspace(), {
      ...currentProjection,
      closure: {
        ...driftedWithoutDigest,
        closureDigest: digestVerificationValue(driftedWithoutDigest),
      },
    });
    expect(model.projectionStatus).toBe('stale');
    expect(model.explanation).toBeDefined();
    expect(model.explanation?.closure).toBeUndefined();
  });

  it('rejects unsafe or mismatched Workspace projection keys', () => {
    const currentProjection = projection();
    act(() => {
      useEditorStore
        .getState()
        .setVerificationProjection('__proto__', currentProjection);
      useEditorStore
        .getState()
        .setVerificationProjection('workspace:other', currentProjection);
    });
    const projections =
      useEditorStore.getState().verificationProjectionByWorkspaceId;
    expect(Object.hasOwn(projections, '__proto__')).toBe(false);
    expect(projections['workspace:other']).toBeUndefined();
  });
});
