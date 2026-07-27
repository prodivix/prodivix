import { describe, expect, it } from 'vitest';
import {
  createPirNodeSymbolId,
  createRouteSymbolId,
  createSemanticId,
} from '@prodivix/authoring';
import {
  createBehaviorRecorderDraft,
  type BehaviorScenario,
  type BehaviorSemanticTargetRef,
} from '@prodivix/behavior';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceBehaviorScenario,
  createWorkspaceBehaviorScenarioCreatePlan,
  createWorkspaceBehaviorScenarioAuthoringPlan,
  createWorkspaceHistoryState,
  createWorkspaceSemanticIndexFromSnapshot,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceHistoryScope,
  type WorkspaceSnapshot,
} from './index';

const DIGEST = `sha256-${'a'.repeat(64)}`;
const TARGET: BehaviorSemanticTargetRef = {
  kind: 'semantic-symbol',
  id: createPirNodeSymbolId('workspace', 'catalog-page', 'add-button'),
  workspaceDocumentId: 'catalog-page',
  capability: 'behavior:pir:click',
};
const ROUTE_TARGET: BehaviorSemanticTargetRef = {
  kind: 'semantic-symbol',
  id: createRouteSymbolId('workspace', 'root-route'),
  workspaceDocumentId: 'workspace',
  capability: 'behavior:route:lifecycle',
};
const SCENARIO: BehaviorScenario = {
  id: 'catalog-scenario',
  name: 'Catalog',
  criticality: 'smoke',
  tags: [],
  entry: { id: 'entry', domain: 'scenario', event: 'manual' },
  steps: [
    {
      id: 'click-add',
      kind: 'action',
      failureMode: 'stop',
      action: {
        kind: 'semantic-click',
        target: TARGET,
        capabilityId: 'pir.click',
        runtimeZone: 'client',
        effect: 'none',
        cancellation: 'none',
      },
    },
  ],
  fixtureRefs: [],
  controlProfileRef: {
    kind: 'preset',
    presetId: 'deterministic-default',
    digest: DIGEST,
  },
  baselineRefs: [],
  timeoutPolicy: { totalMs: 10_000, stepMs: 2_000, settleMs: 500 },
};

const SECOND_STEP: BehaviorScenario['steps'][number] = {
  ...SCENARIO.steps[0]!,
  id: 'click-add-again',
};

const createSnapshot = (
  authoredScenario: BehaviorScenario = SCENARIO
): WorkspaceSnapshot => ({
  id: 'workspace',
  workspaceRev: 3,
  routeRev: 1,
  opSeq: 2,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['node:page', 'node:scenario'],
    },
    'node:page': {
      id: 'node:page',
      kind: 'doc',
      name: 'catalog.pir.json',
      parentId: 'root',
      docId: 'catalog-page',
    },
    'node:scenario': {
      id: 'node:scenario',
      kind: 'doc',
      name: 'catalog.behavior.json',
      parentId: 'root',
      docId: 'catalog-scenario',
    },
  },
  docsById: {
    'catalog-page': {
      id: 'catalog-page',
      type: 'pir-page',
      path: '/catalog.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        ui: {
          graph: {
            rootId: 'root',
            nodesById: {
              root: { id: 'root', kind: 'element', type: 'main' },
              'add-button': {
                id: 'add-button',
                kind: 'element',
                type: 'button',
              },
            },
            childIdsById: {
              root: ['add-button'],
              'add-button': [],
            },
            order: { strategy: 'childIdsById' },
          },
        },
      },
    },
    'catalog-scenario': {
      id: 'catalog-scenario',
      type: 'behavior-scenario',
      path: '/catalog.behavior.json',
      contentRev: 1,
      metaRev: 1,
      content: authoredScenario,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root-route', pageDocId: 'catalog-page' },
  },
});

const SCOPE: WorkspaceHistoryScope = {
  kind: 'document',
  workspaceId: 'workspace',
  documentId: 'catalog-scenario',
  domain: 'behavior',
};

describe('Workspace Behavior Scenario authoring', () => {
  it('creates a valid reversible Scenario document with an editable start barrier', () => {
    const workspace = createSnapshot();
    const scenario = createWorkspaceBehaviorScenario(
      'created-scenario',
      'Created scenario',
      DIGEST,
      SCENARIO.steps[0]!
    );
    const operation = createWorkspaceBehaviorScenarioCreatePlan({
      workspace,
      scenario,
      path: '/created.behavior.json',
      commandId: 'create-scenario',
      issuedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(operation?.kind).toBe('command');
    if (operation?.kind !== 'command') return;
    const applied = applyWorkspaceCommand(workspace, operation.command);
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(
      (
        applied.snapshot.docsById['created-scenario']!
          .content as BehaviorScenario
      ).steps
    ).toEqual([
      expect.objectContaining({
        id: 'click-add',
        kind: 'action',
      }),
    ]);
  });

  it('projects Scenario references into the revision-bound Semantic Index', () => {
    const composed = createWorkspaceSemanticIndexFromSnapshot(createSnapshot());
    expect(composed.status).toBe('ready');
    if (composed.status !== 'ready') return;
    const stepSymbolId = createSemanticId(
      'behavior-step-symbol',
      'workspace',
      'catalog-scenario',
      'click-add'
    );
    expect(composed.index.getSymbol(stepSymbolId)).toMatchObject({
      kind: 'behavior-step',
      ownerRef: {
        kind: 'behavior-step',
        documentId: 'catalog-scenario',
        stepId: 'click-add',
      },
    });
    expect(composed.index.getReferences(TARGET.id)).toMatchObject({
      status: 'resolved',
      references: [
        expect.objectContaining({
          kind: 'behavior-target',
          sourceSymbolId: stepSymbolId,
        }),
      ],
    });
  });

  it('plans reversible edits that participate in Workspace undo and redo', () => {
    const workspace = createSnapshot();
    const result = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace,
      expectedWorkspaceRevision: workspace.workspaceRev,
      documentId: SCENARIO.id,
      mutation: { kind: 'rename', name: 'Renamed Catalog' },
      commandId: 'rename-scenario',
      issuedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.operation.kind !== 'command') {
      return;
    }
    const applied = applyWorkspaceCommand(
      workspace,
      result.plan.operation.command
    );
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(
      (applied.snapshot.docsById[SCENARIO.id]!.content as BehaviorScenario).name
    ).toBe('Renamed Catalog');
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      result.plan.operation
    );
    const undone = undoWorkspaceHistory(applied.snapshot, history, SCOPE);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(
      (undone.snapshot.docsById[SCENARIO.id]!.content as BehaviorScenario).name
    ).toBe('Catalog');
    const redone = redoWorkspaceHistory(undone.snapshot, undone.history, SCOPE);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(
      (redone.snapshot.docsById[SCENARIO.id]!.content as BehaviorScenario).name
    ).toBe('Renamed Catalog');
  });

  it('sets a semantic entry trigger and previews its exact resolution', () => {
    const workspace = createSnapshot();
    const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
    expect(semantic.status).toBe('ready');
    if (semantic.status !== 'ready') return;
    const result = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace,
      expectedWorkspaceRevision: workspace.workspaceRev,
      documentId: SCENARIO.id,
      mutation: {
        kind: 'set-entry',
        entry: {
          id: SCENARIO.entry.id,
          domain: 'route',
          event: 'entered',
          target: ROUTE_TARGET,
        },
      },
      commandId: 'set-entry',
      issuedAt: '2026-07-27T00:00:00.000Z',
      semanticIndex: semantic.index,
    });
    expect(result).toMatchObject({
      status: 'ready',
      plan: {
        after: {
          entry: {
            domain: 'route',
            event: 'entered',
            target: ROUTE_TARGET,
          },
        },
        impact: {
          targetResolutions: [
            { stepId: 'click-add', status: 'exact' },
            { stepId: 'entry', status: 'exact' },
          ],
        },
      },
    });
  });

  it('plans insert, update, move, and remove mutations with semantic impact', () => {
    const workspace = createSnapshot();
    const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
    expect(semantic.status).toBe('ready');
    if (semantic.status !== 'ready') return;
    const base = {
      workspace,
      expectedWorkspaceRevision: workspace.workspaceRev,
      documentId: SCENARIO.id,
      issuedAt: '2026-07-27T00:00:00.000Z',
      semanticIndex: semantic.index,
    } as const;
    const inserted = createWorkspaceBehaviorScenarioAuthoringPlan({
      ...base,
      mutation: { kind: 'insert-step', index: 1, step: SECOND_STEP },
      commandId: 'insert-step',
    });
    expect(inserted).toMatchObject({
      status: 'ready',
      plan: {
        impact: {
          addedStepIds: ['click-add-again'],
          targetResolutions: [
            { stepId: 'click-add', status: 'exact' },
            { stepId: 'click-add-again', status: 'exact' },
          ],
        },
      },
    });
    const updated = createWorkspaceBehaviorScenarioAuthoringPlan({
      ...base,
      mutation: {
        kind: 'update-step',
        stepId: 'click-add',
        step: { ...SCENARIO.steps[0]!, label: 'Click add product' },
      },
      commandId: 'update-step',
    });
    expect(updated).toMatchObject({
      status: 'ready',
      plan: { impact: { updatedStepIds: ['click-add'] } },
    });

    const twoStepScenario: BehaviorScenario = {
      ...SCENARIO,
      steps: [SCENARIO.steps[0]!, SECOND_STEP],
    };
    const twoStepWorkspace = createSnapshot(twoStepScenario);
    const moved = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace: twoStepWorkspace,
      expectedWorkspaceRevision: twoStepWorkspace.workspaceRev,
      documentId: SCENARIO.id,
      mutation: { kind: 'move-step', stepId: SECOND_STEP.id, index: 0 },
      commandId: 'move-step',
      issuedAt: base.issuedAt,
    });
    expect(moved).toMatchObject({
      status: 'ready',
      plan: {
        after: {
          steps: [{ id: 'click-add-again' }, { id: 'click-add' }],
        },
      },
    });
    const removed = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace: twoStepWorkspace,
      expectedWorkspaceRevision: twoStepWorkspace.workspaceRev,
      documentId: SCENARIO.id,
      mutation: { kind: 'remove-step', stepId: SECOND_STEP.id },
      commandId: 'remove-step',
      issuedAt: base.issuedAt,
    });
    expect(removed).toMatchObject({
      status: 'ready',
      plan: { impact: { removedStepIds: ['click-add-again'] } },
    });
  });

  it('adopts reviewed recorder events as one atomic transaction', () => {
    const workspace = createSnapshot();
    const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
    expect(semantic.status).toBe('ready');
    if (semantic.status !== 'ready') return;
    const draft = createBehaviorRecorderDraft({
      id: 'draft',
      workspaceRevision: workspace.workspaceRev,
      maximumEvents: 10,
      events: [
        {
          id: 'second-click',
          kind: 'click',
          targetCandidates: [TARGET],
        },
      ],
    });
    const result = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace,
      expectedWorkspaceRevision: workspace.workspaceRev,
      documentId: SCENARIO.id,
      mutation: {
        kind: 'adopt-recorder',
        draft,
        selectedEventIds: ['second-click'],
      },
      commandId: 'adopt-draft',
      transactionId: 'adopt-draft-transaction',
      issuedAt: '2026-07-27T00:00:00.000Z',
      semanticIndex: semantic.index,
    });
    expect(result.status).toBe('ready');
    if (
      result.status !== 'ready' ||
      result.plan.operation.kind !== 'transaction'
    ) {
      return;
    }
    expect(result.plan.impact.addedStepIds).toEqual(['recorded:second-click']);
    const applied = applyWorkspaceTransaction(
      workspace,
      result.plan.operation.transaction
    );
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(
      (applied.snapshot.docsById[SCENARIO.id]!.content as BehaviorScenario)
        .steps
    ).toHaveLength(2);
    const unresolvedDraft = createBehaviorRecorderDraft({
      id: 'unresolved-draft',
      workspaceRevision: workspace.workspaceRev,
      maximumEvents: 10,
      events: [
        {
          id: 'missing-click',
          kind: 'click',
          targetCandidates: [{ ...TARGET, id: 'missing-symbol' }],
        },
      ],
    });
    expect(
      createWorkspaceBehaviorScenarioAuthoringPlan({
        workspace,
        expectedWorkspaceRevision: workspace.workspaceRev,
        documentId: SCENARIO.id,
        mutation: {
          kind: 'adopt-recorder',
          draft: unresolvedDraft,
          selectedEventIds: ['missing-click'],
        },
        commandId: 'reject-unresolved-draft',
        issuedAt: '2026-07-27T00:00:00.000Z',
        semanticIndex: semantic.index,
      })
    ).toEqual({
      status: 'blocked',
      reason: 'recorder-unresolved',
    });
  });

  it('rejects revision drift before producing an operation', () => {
    const workspace = createSnapshot();
    expect(
      createWorkspaceBehaviorScenarioAuthoringPlan({
        workspace,
        expectedWorkspaceRevision: workspace.workspaceRev - 1,
        documentId: SCENARIO.id,
        mutation: { kind: 'rename', name: 'Stale' },
        commandId: 'stale',
        issuedAt: '2026-07-27T00:00:00.000Z',
      })
    ).toEqual({ status: 'blocked', reason: 'revision-conflict' });
  });
});
