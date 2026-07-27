import { describe, expect, it } from 'vitest';
import type {
  BehaviorControlProfile,
  BehaviorFixtureSet,
  BehaviorScenario,
} from '@prodivix/behavior';
import type {
  VerificationBaselineSet,
  VerificationPolicy,
} from '@prodivix/verification';
import {
  WORKSPACE_COMMAND_DOMAINS,
  WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES,
  WORKSPACE_DOCUMENT_TYPES,
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceBehaviorVerificationDocumentCommand,
  createWorkspaceBehaviorVerificationDocumentUpdateCommand,
  createWorkspaceBehaviorVerificationTransaction,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceCommandScope,
  undoWorkspaceHistory,
  validateWorkspaceSnapshot,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from './index';

const issuedAt = '2026-07-27T00:00:00.000Z';
const digest = `sha256-${'c'.repeat(64)}`;

const scenario: BehaviorScenario = {
  id: 'scenario.catalog',
  name: 'Catalog journey',
  criticality: 'critical',
  tags: ['catalog'],
  entry: {
    id: 'trigger.ready',
    domain: 'route',
    event: 'ready',
  },
  steps: [
    {
      id: 'step.observe',
      kind: 'observation',
      failureMode: 'stop',
      observation: {
        kind: 'visible',
        target: {
          kind: 'public-contract',
          id: 'catalog.list',
          workspaceDocumentId: 'page.catalog',
          capability: 'ui.visible',
        },
      },
      assertions: [
        {
          id: 'assert.visible',
          operator: 'equals',
          expected: true,
        },
      ],
    },
  ],
  fixtureRefs: [{ documentId: 'fixture.catalog', digest }],
  controlProfileRef: {
    kind: 'workspace',
    documentId: 'control.hermetic',
    digest,
  },
  baselineRefs: [{ documentId: 'baseline.catalog', digest }],
  timeoutPolicy: {
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 2_000,
  },
};

const controlProfile: BehaviorControlProfile = {
  id: 'control.hermetic',
  name: 'Hermetic controls',
  clock: {
    mode: 'virtual',
    epoch: '2026-01-01T00:00:00Z',
    tickMs: 1,
  },
  timezone: 'UTC',
  random: {
    algorithm: 'xoshiro256ss',
    seed: 'random-seed',
  },
  identifiers: {
    seed: 'id-seed',
    namespaces: ['action', 'attempt', 'operation', 'step'],
  },
  scheduler: {
    strategy: 'deterministic',
    seed: 'scheduler-seed',
    maximumTurns: 10_000,
  },
  network: {
    mode: 'fixture-only',
    undeclaredRequest: 'reject',
  },
  storage: {
    bootstrapFixtureIds: [],
    cleanup: 'required',
  },
  rendering: {
    devicePixelRatio: 1,
    animationClock: 'virtual',
    fontReadiness: 'required',
  },
  serviceWorker: {
    mode: 'disabled',
    cache: 'empty',
  },
  settle: {
    conditions: ['declared-effects-complete', 'render-stable'],
    maximumFrames: 120,
  },
  budgets: {
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 2_000,
    networkMs: 3_000,
    animationMs: 3_000,
  },
};

const fixtureSet: BehaviorFixtureSet = {
  id: 'fixture.catalog',
  name: 'Catalog fixtures',
  fixtures: [
    {
      id: 'fixture.empty-list',
      target: {
        kind: 'data-operation',
        resourceId: 'catalog.list',
      },
      inputDigest: digest,
      outcome: {
        kind: 'result',
        value: [],
      },
    },
  ],
};

const baselineSet: VerificationBaselineSet = {
  id: 'baseline.catalog',
  name: 'Catalog baselines',
  entries: [
    {
      id: 'baseline.empty-list',
      scenarioId: scenario.id,
      stepId: 'step.observe',
      targetId: 'catalog.list',
      frameworkTarget: 'react-vite',
      surface: 'ci',
      browserEngine: 'chromium',
      viewport: {
        id: 'desktop',
        width: 1280,
        height: 720,
      },
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
      devicePixelRatio: 1,
      asset: {
        assetDocumentId: 'asset.baseline.empty-list',
        digest,
        mediaType: 'image/png',
      },
      normalizerDigest: digest,
      adoptedAt: issuedAt,
      adoptedBy: 'principal.owner',
    },
  ],
};

const policy: VerificationPolicy = {
  id: 'policy.default',
  name: 'Default policy',
  defaultRequirement: 'advisory',
  rules: [
    {
      id: 'rule.critical',
      requirement: 'required',
      checkKinds: ['e2e', 'visual'],
      scenarioIds: [scenario.id],
      scenarioTags: [],
      criticalities: ['critical'],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix.critical',
      retryPolicyId: 'retry.infrastructure',
      evidenceTrust: 'ci-attested',
      controlProfileRef: scenario.controlProfileRef,
      fixtureSetRef: scenario.fixtureRefs[0],
      baselineSetRef: scenario.baselineRefs[0],
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix.critical',
      name: 'Critical matrix',
      matrix: {
        frameworkTargets: ['react-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['light'],
        motions: ['reduced'],
        locales: ['en-US'],
      },
    },
  ],
  budgets: {
    maximumCells: 100,
    maximumCellsPerCheckKind: 50,
    maximumTargetExpansions: 8,
    maximumBrowserExpansions: 3,
    totalMs: 600_000,
    artifactBytes: 100_000_000,
    estimatedComputeUnits: 10_000,
    parallelism: 4,
  },
  retryPolicies: [
    {
      id: 'retry.infrastructure',
      maximumAttempts: 2,
      retryableOutcomes: ['infrastructure-error'],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
  ],
  exemptions: [],
  evidenceRequirements: {
    acceptedTrust: ['ci-attested'],
    maximumAgeMs: 86_400_000,
    requireAttestation: true,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: ['replay-record', 'screenshot'],
  },
  baselinePolicy: {
    visual: 'required-when-observed',
    requireCompatibleIdentity: true,
  },
  retentionRequest: {
    successful: 'change',
    failed: 'release',
    protectReleaseEvidence: false,
  },
};

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-g3',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['existing-node'],
    },
    'existing-node': {
      id: 'existing-node',
      kind: 'doc',
      name: 'existing.ts',
      parentId: 'root',
      docId: 'existing',
    },
  },
  docsById: {
    existing: {
      id: 'existing',
      type: 'code',
      path: '/existing.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const existing = true;',
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
    },
  },
  activeRouteNodeId: 'root',
});

const documents = [
  {
    type: 'behavior-control-profile' as const,
    documentId: controlProfile.id,
    path: '/behavior/control.hermetic.json',
    content: controlProfile,
  },
  {
    type: 'behavior-fixture-set' as const,
    documentId: fixtureSet.id,
    path: '/behavior/fixture.catalog.json',
    content: fixtureSet,
  },
  {
    type: 'verification-baseline-set' as const,
    documentId: baselineSet.id,
    path: '/verification/baseline.catalog.json',
    content: baselineSet,
  },
  {
    type: 'behavior-scenario' as const,
    documentId: scenario.id,
    path: '/behavior/scenario.catalog.json',
    content: scenario,
  },
  {
    type: 'verification-policy' as const,
    documentId: policy.id,
    path: '/verification/policy.default.json',
    content: policy,
  },
];

const planDocumentTransaction = (
  initial: WorkspaceSnapshot
): {
  commands: WorkspaceCommandEnvelope[];
  planned: WorkspaceSnapshot;
} => {
  const commands: WorkspaceCommandEnvelope[] = [];
  let planned = initial;
  documents.forEach((document, index) => {
    const command = createWorkspaceBehaviorVerificationDocumentCommand({
      workspace: planned,
      ...document,
      commandId: `create-g3-${index}`,
      issuedAt,
    });
    expect(command).not.toBeNull();
    if (!command) throw new Error('Expected a G3 document create command.');
    commands.push(command);
    const applied = applyWorkspaceCommand(planned, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('Expected planned command to apply.');
    planned = applied.snapshot;
  });
  return { commands, planned };
};

describe('G3 Workspace document ownership', () => {
  it('registers all five documents and both command namespaces', () => {
    expect(WORKSPACE_DOCUMENT_TYPES).toEqual(
      expect.arrayContaining(documents.map(({ type }) => type))
    );
    expect(WORKSPACE_COMMAND_DOMAINS).toEqual(
      expect.arrayContaining(['behavior', 'verification'])
    );
    expect(WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES).toEqual(
      expect.arrayContaining([
        { prefix: 'core.behavior', domain: 'behavior' },
        { prefix: 'core.verification', domain: 'verification' },
      ])
    );
  });

  it('creates all documents atomically and round-trips their versioned wire forms', () => {
    const initial = createWorkspace();
    const { commands } = planDocumentTransaction(initial);
    const transaction = createWorkspaceBehaviorVerificationTransaction(
      initial.id,
      'create-g3-documents',
      issuedAt,
      commands
    );
    expect(transaction).not.toBeNull();
    if (!transaction) return;

    const applied = applyWorkspaceTransaction(initial, transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(validateWorkspaceSnapshot(applied.snapshot).valid).toBe(true);

    const wire = encodeWorkspaceSnapshot(applied.snapshot, {});
    const g3WireDocuments = wire.documents.filter(
      ({ type }) =>
        type.startsWith('behavior-') || type.startsWith('verification-')
    );
    expect(g3WireDocuments).toHaveLength(5);
    g3WireDocuments.forEach((document) => {
      expect(document.content).toMatchObject({ wireVersion: 1 });
    });

    const decoded = decodeWorkspaceSnapshot(wire);
    documents.forEach(({ documentId }) => {
      expect(decoded.workspace.docsById[documentId].content).not.toHaveProperty(
        'wireVersion'
      );
    });
    expect(
      encodeWorkspaceSnapshot(decoded.workspace, decoded.settings)
    ).toEqual(wire);
  });

  it('updates, undoes, and redoes a Behavior document through owner commands', () => {
    const { planned } = planDocumentTransaction(createWorkspace());
    const update = createWorkspaceBehaviorVerificationDocumentUpdateCommand({
      workspace: planned,
      documentId: scenario.id,
      type: 'behavior-scenario',
      after: {
        ...scenario,
        name: 'Updated catalog journey',
      },
      commandId: 'update-scenario',
      issuedAt,
    });
    expect(update).toMatchObject({
      namespace: 'core.behavior',
      domainHint: 'behavior',
      target: { documentId: scenario.id },
    });
    if (!update) return;

    const applied = applyWorkspaceCommand(planned, update);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById[scenario.id].content).toMatchObject({
      name: 'Updated catalog journey',
    });

    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(update)
    );
    const scope = resolveWorkspaceCommandScope(update);
    const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById[scenario.id].content).toMatchObject({
      name: scenario.name,
    });

    const redone = redoWorkspaceHistory(undone.snapshot, undone.history, scope);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById[scenario.id].content).toMatchObject({
      name: 'Updated catalog journey',
    });
  });

  it('fails closed without exposing a partial transaction result', () => {
    const { planned } = planDocumentTransaction(createWorkspace());
    const valid = createWorkspaceBehaviorVerificationDocumentUpdateCommand({
      workspace: planned,
      documentId: scenario.id,
      type: 'behavior-scenario',
      after: { ...scenario, name: 'Would be partial' },
      commandId: 'valid-first',
      issuedAt,
    });
    expect(valid).not.toBeNull();
    if (!valid) return;
    const invalid: WorkspaceCommandEnvelope = {
      ...valid,
      id: 'invalid-second',
      namespace: 'core.verification',
      domainHint: 'verification',
      target: {
        workspaceId: planned.id,
        documentId: policy.id,
      },
      forwardOps: [
        {
          op: 'add',
          path: '/wireVersion',
          value: 1,
        },
      ],
      reverseOps: [{ op: 'remove', path: '/wireVersion' }],
    };
    const transaction = createWorkspaceBehaviorVerificationTransaction(
      planned.id,
      'atomic-failure',
      issuedAt,
      [valid, invalid]
    );
    expect(transaction).not.toBeNull();
    if (!transaction) return;
    const result = applyWorkspaceTransaction(planned, transaction);
    expect(result.ok).toBe(false);
    expect(planned.docsById[scenario.id].content).toMatchObject({
      name: scenario.name,
    });
  });

  it('rejects a second project-level VerificationPolicy', () => {
    const { planned } = planDocumentTransaction(createWorkspace());
    const duplicateId = 'policy.secondary';
    const duplicateNodeId = 'node.policy.secondary';
    const duplicatePath = '/verification/policy.secondary.json';
    const duplicate = {
      ...planned,
      treeById: {
        ...planned.treeById,
        root: {
          ...planned.treeById.root,
          children: [
            ...(planned.treeById.root.children ?? []),
            duplicateNodeId,
          ],
        },
        [duplicateNodeId]: {
          id: duplicateNodeId,
          kind: 'doc' as const,
          name: 'policy.secondary.json',
          parentId: 'root',
          docId: duplicateId,
        },
      },
      docsById: {
        ...planned.docsById,
        [duplicateId]: {
          id: duplicateId,
          type: 'verification-policy' as const,
          path: duplicatePath,
          contentRev: 1,
          metaRev: 1,
          content: {
            ...policy,
            id: duplicateId,
          },
        },
      },
    };

    expect(validateWorkspaceSnapshot(duplicate).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WKS_DOCUMENT_CARDINALITY_INVALID',
          documentId: duplicateId,
        }),
      ])
    );
  });
});
