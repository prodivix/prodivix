import {
  createWorkspaceCodeSourceUpdateCommand,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  applyPersistentWorkspaceOperation,
  advanceWorkspaceLocalReplica,
  blockWorkspaceOutboxEntry,
  compareWorkspaceOutboxEntries,
  createMemoryWorkspaceOutboxStore,
  createWorkspaceConflictResolutionOperation,
  createWorkspaceConflictSession,
  createWorkspaceLocalReplica,
  createWorkspaceOutboxEntry,
  createWorkspaceSettingsOutboxEntry,
  materializeWorkspaceLocalReplica,
  planWorkspaceOperationCommit,
  resolveWorkspaceConflictSessionBatch,
  type WorkspaceOperationCommitRequest,
  type WorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import {
  GOLDEN_LOCAL_CONFLICT_SOURCE,
  GOLDEN_IDS,
  GOLDEN_REMOTE_CONFLICT_SOURCE,
} from './goldenApp.fixture';
import {
  GOLDEN_CREATED_AT,
  applyGoldenOperation,
  getGoldenCodeSource,
  requireValidGoldenWorkspace,
  type GoldenAuthoringResult,
} from './goldenAuthoring';

const GOLDEN_RESOLVED_AT = '2026-07-13T08:03:00.000Z';

export type GoldenSyncResult = Readonly<{
  workspace: WorkspaceSnapshot;
  save: Readonly<{
    creationOperationId: string;
    editOperationId: string;
    creationRequest: WorkspaceOperationCommitRequest;
    editRequest: WorkspaceOperationCommitRequest;
  }>;
  recovery: Readonly<{
    pendingReplayRecovered: boolean;
    acknowledgedReplaySkipped: boolean;
    replacementKeptCausalHead: boolean;
  }>;
  conflict: Readonly<{
    conflictCount: number;
    resolutionOperationId: string;
    selectedSource: 'local';
  }>;
}>;

const getOperationId = (operation: WorkspaceOperation): string =>
  operation.kind === 'command'
    ? operation.command.id
    : operation.transaction.id;

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
};

const getDurableAuthoringState = (workspace: WorkspaceSnapshot): string =>
  JSON.stringify(
    sortJsonValue({
      treeRootId: workspace.treeRootId,
      treeById: workspace.treeById,
      routeManifest: workspace.routeManifest,
      documents: Object.values(workspace.docsById)
        .sort(
          (left, right) =>
            left.path.localeCompare(right.path) ||
            left.id.localeCompare(right.id)
        )
        .map(
          ({
            contentRev: _contentRev,
            metaRev: _metaRev,
            updatedAt: _updatedAt,
            ...document
          }) => document
        ),
    })
  );

const persistGoldenWorkspace = (authoring: GoldenAuthoringResult) => {
  const creationOperation: WorkspaceOperation = {
    kind: 'transaction',
    transaction: {
      id: 'golden-create-workspace',
      workspaceId: authoring.baseWorkspace.id,
      issuedAt: GOLDEN_CREATED_AT,
      label: 'Create Golden App',
      commands: [...authoring.createCommands],
    },
  };
  const plannedCreation = planWorkspaceOperationCommit(
    authoring.baseWorkspace,
    creationOperation
  );
  if (!plannedCreation.ok) {
    throw new Error(JSON.stringify(plannedCreation.issues));
  }
  const persistedCreation = applyPersistentWorkspaceOperation(
    authoring.baseWorkspace,
    creationOperation
  );
  if (!persistedCreation) {
    throw new Error('Golden creation operation was not persistable.');
  }
  const confirmedCreationWorkspace = requireValidGoldenWorkspace(
    {
      ...persistedCreation,
      workspaceRev: persistedCreation.workspaceRev + 1,
      routeRev: persistedCreation.routeRev + 1,
      opSeq: persistedCreation.opSeq + 1,
      activeDocumentId: GOLDEN_IDS.checkoutPage,
      activeRouteNodeId: GOLDEN_IDS.checkoutRoute,
    },
    'confirmed Golden creation workspace'
  );

  const plannedEdit = planWorkspaceOperationCommit(
    confirmedCreationWorkspace,
    authoring.editOperation
  );
  if (!plannedEdit.ok) throw new Error(JSON.stringify(plannedEdit.issues));
  const outbox = createWorkspaceOutboxEntry({
    baseSnapshot: confirmedCreationWorkspace,
    operation: authoring.editOperation,
    now: 1_000,
  });
  if (!outbox.ok) throw new Error(JSON.stringify(outbox.issues));
  const persistedEdit = applyPersistentWorkspaceOperation(
    confirmedCreationWorkspace,
    authoring.editOperation
  );
  if (!persistedEdit) throw new Error('Golden edit was not persistable.');
  const checkoutDocument = persistedEdit.docsById[GOLDEN_IDS.checkoutPage];
  const handlerDocument = persistedEdit.docsById[GOLDEN_IDS.checkoutHandler];
  if (!checkoutDocument || !handlerDocument) {
    throw new Error('Golden persisted edit targets disappeared.');
  }
  const confirmedWorkspace = requireValidGoldenWorkspace(
    {
      ...persistedEdit,
      opSeq: persistedEdit.opSeq + 1,
      docsById: {
        ...persistedEdit.docsById,
        [checkoutDocument.id]: {
          ...checkoutDocument,
          contentRev: checkoutDocument.contentRev + 1,
        },
        [handlerDocument.id]: {
          ...handlerDocument,
          contentRev: handlerDocument.contentRev + 1,
        },
      },
      activeDocumentId: GOLDEN_IDS.checkoutPage,
      activeRouteNodeId: GOLDEN_IDS.checkoutRoute,
    },
    'confirmed Golden workspace'
  );
  return {
    confirmedWorkspace,
    confirmedCreationWorkspace,
    entry: outbox.entry,
    creationOperation,
    editOperation: authoring.editOperation,
    creationRequest: plannedCreation.request,
    editRequest: plannedEdit.request,
  };
};

const verifyReplicaRecovery = (input: {
  confirmedCreationWorkspace: WorkspaceSnapshot;
  confirmedWorkspace: WorkspaceSnapshot;
  entry: WorkspaceOutboxEntry;
  expectedEditedWorkspace: WorkspaceSnapshot;
}) => {
  const baseReplica = createWorkspaceLocalReplica({
    snapshot: input.confirmedCreationWorkspace,
    settings: {},
    savedAt: 1_000,
  });
  if (!baseReplica.ok) throw new Error(JSON.stringify(baseReplica.issues));
  const pending = materializeWorkspaceLocalReplica({
    replica: baseReplica.replica,
    operationEntries: [input.entry],
    settingsEntries: [],
  });
  if (!pending.ok) throw new Error(JSON.stringify(pending.issues));

  const acknowledgedReplica = advanceWorkspaceLocalReplica(
    baseReplica.replica,
    {
      snapshot: input.confirmedWorkspace,
      savedAt: 2_000,
      acknowledgedEntryIds: [input.entry.id],
    }
  );
  if (!acknowledgedReplica.ok) {
    throw new Error(JSON.stringify(acknowledgedReplica.issues));
  }
  const acknowledged = materializeWorkspaceLocalReplica({
    replica: acknowledgedReplica.replica,
    operationEntries: [input.entry],
    settingsEntries: [],
  });
  if (!acknowledged.ok) throw new Error(JSON.stringify(acknowledged.issues));
  const pendingState = getDurableAuthoringState(pending.snapshot);
  const expectedPendingState = getDurableAuthoringState(
    input.expectedEditedWorkspace
  );
  const acknowledgedState = getDurableAuthoringState(acknowledged.snapshot);
  const expectedAcknowledgedState = getDurableAuthoringState(
    input.confirmedWorkspace
  );
  if (pendingState !== expectedPendingState) {
    throw new Error(
      `Golden pending recovery mismatch.\nActual: ${pendingState}\nExpected: ${expectedPendingState}`
    );
  }
  if (acknowledgedState !== expectedAcknowledgedState) {
    throw new Error(
      `Golden acknowledged recovery mismatch.\nActual: ${acknowledgedState}\nExpected: ${expectedAcknowledgedState}`
    );
  }
  return {
    pendingReplayRecovered:
      pendingState === expectedPendingState &&
      pending.pendingOperationIds.includes(input.entry.id),
    acknowledgedReplaySkipped:
      acknowledgedState === expectedAcknowledgedState &&
      !acknowledged.pendingOperationIds.includes(input.entry.id),
  };
};

const resolveGoldenConflict = (baseWorkspace: WorkspaceSnapshot) => {
  const handlerDocument = baseWorkspace.docsById[GOLDEN_IDS.checkoutHandler];
  if (!handlerDocument) throw new Error('Golden conflict handler is missing.');
  const localCommand = createWorkspaceCodeSourceUpdateCommand({
    workspaceId: baseWorkspace.id,
    document: handlerDocument,
    source: GOLDEN_LOCAL_CONFLICT_SOURCE,
    commandId: 'golden-local-conflict',
    issuedAt: GOLDEN_RESOLVED_AT,
  });
  const remoteCommand = createWorkspaceCodeSourceUpdateCommand({
    workspaceId: baseWorkspace.id,
    document: handlerDocument,
    source: GOLDEN_REMOTE_CONFLICT_SOURCE,
    commandId: 'golden-remote-conflict',
    issuedAt: GOLDEN_RESOLVED_AT,
  });
  if (!localCommand || !remoteCommand) {
    throw new Error('Golden conflict commands were empty.');
  }
  const localOperation: WorkspaceOperation = {
    kind: 'command',
    command: localCommand,
  };
  const localWorkspace = applyGoldenOperation(
    baseWorkspace,
    localOperation,
    'apply local conflict edit'
  );
  const remoteApplied = applyGoldenOperation(
    baseWorkspace,
    { kind: 'command', command: remoteCommand },
    'apply remote conflict edit'
  );
  const remoteDocument = remoteApplied.docsById[GOLDEN_IDS.checkoutHandler];
  if (!remoteDocument) throw new Error('Remote handler disappeared.');
  const remoteWorkspace: WorkspaceSnapshot = {
    ...remoteApplied,
    opSeq: remoteApplied.opSeq + 1,
    docsById: {
      ...remoteApplied.docsById,
      [remoteDocument.id]: {
        ...remoteDocument,
        contentRev: remoteDocument.contentRev + 1,
      },
    },
  };
  const created = createWorkspaceConflictSession({
    id: 'golden-conflict-session',
    createdAt: GOLDEN_RESOLVED_AT,
    baseSnapshot: baseWorkspace,
    localSnapshot: localWorkspace,
    remoteSnapshot: remoteWorkspace,
    sourceOperation: localOperation,
  });
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  const choices = Object.fromEntries(
    created.session.unresolvedConflictIds.map((conflictId) => [
      conflictId,
      'local',
    ])
  ) as Record<string, 'local'>;
  const resolved = resolveWorkspaceConflictSessionBatch(
    created.session,
    choices,
    GOLDEN_RESOLVED_AT
  );
  if (!resolved.ok || !resolved.session.resolvedSnapshot) {
    throw new Error(
      JSON.stringify(resolved.ok ? resolved.session : resolved.issues)
    );
  }
  const resolution = createWorkspaceConflictResolutionOperation({
    session: resolved.session,
    operationId: 'zz-golden-conflict-resolution',
    issuedAt: GOLDEN_RESOLVED_AT,
  });
  if (!resolution.ok) throw new Error(JSON.stringify(resolution.issues));
  if (!resolution.operation) {
    throw new Error('Golden conflict resolution produced no operation.');
  }
  const planned = planWorkspaceOperationCommit(
    remoteWorkspace,
    resolution.operation
  );
  if (!planned.ok) throw new Error(JSON.stringify(planned.issues));
  const optimisticResolvedWorkspace = applyPersistentWorkspaceOperation(
    remoteWorkspace,
    resolution.operation
  );
  if (!optimisticResolvedWorkspace) {
    throw new Error('Golden conflict resolution was not replayable.');
  }
  if (
    getGoldenCodeSource(optimisticResolvedWorkspace) !==
    GOLDEN_LOCAL_CONFLICT_SOURCE
  ) {
    throw new Error('Golden conflict did not preserve the explicit choice.');
  }
  const resolvedDocument =
    optimisticResolvedWorkspace.docsById[GOLDEN_IDS.checkoutHandler];
  if (!resolvedDocument) throw new Error('Resolved handler disappeared.');
  const confirmedResolvedWorkspace: WorkspaceSnapshot = {
    ...optimisticResolvedWorkspace,
    opSeq: optimisticResolvedWorkspace.opSeq + 1,
    docsById: {
      ...optimisticResolvedWorkspace.docsById,
      [resolvedDocument.id]: {
        ...resolvedDocument,
        contentRev: resolvedDocument.contentRev + 1,
      },
    },
  };
  return {
    workspace: requireValidGoldenWorkspace(
      confirmedResolvedWorkspace,
      'resolved Golden workspace'
    ),
    conflictCount: created.session.analysis.conflicts.length,
    resolutionOperationId: getOperationId(resolution.operation),
    causalInput: {
      baseWorkspace,
      localWorkspace,
      remoteWorkspace,
      sourceOperation: localOperation,
      openSession: created.session,
      resolutionOperation: resolution.operation,
    },
  };
};

const verifyCausalReplacement = async (
  input: ReturnType<typeof resolveGoldenConflict>['causalInput']
): Promise<boolean> => {
  const followerDocument =
    input.localWorkspace.docsById[GOLDEN_IDS.checkoutHandler];
  if (!followerDocument) return false;
  const followerCommand = createWorkspaceCodeSourceUpdateCommand({
    workspaceId: input.localWorkspace.id,
    document: followerDocument,
    source: `${GOLDEN_LOCAL_CONFLICT_SOURCE}\n// follower\n`,
    commandId: 'golden-causal-follower',
    issuedAt: GOLDEN_RESOLVED_AT,
  });
  if (!followerCommand) return false;
  const head = createWorkspaceOutboxEntry({
    baseSnapshot: input.baseWorkspace,
    operation: input.sourceOperation,
    now: 1_000,
  });
  const follower = createWorkspaceOutboxEntry({
    baseSnapshot: input.localWorkspace,
    operation: { kind: 'command', command: followerCommand },
    now: 2_000,
  });
  const replacement = createWorkspaceOutboxEntry({
    baseSnapshot: input.remoteWorkspace,
    operation: input.resolutionOperation,
    now: 3_000,
  });
  const settingsFollower = createWorkspaceSettingsOutboxEntry({
    baseSnapshot: input.baseWorkspace,
    baseSettings: {},
    settings: { locale: 'en' },
    commitId: 'middle-golden-settings-follower',
    issuedAt: GOLDEN_RESOLVED_AT,
    now: 1_000,
  });
  if (!head.ok || !follower.ok || !replacement.ok || !settingsFollower.ok) {
    return false;
  }
  const store = createMemoryWorkspaceOutboxStore([head.entry, follower.entry]);
  const claimed = await store.claim({
    entryId: head.entry.id,
    leaseOwnerId: 'golden-tab-a',
    now: 1_000,
    leaseDurationMs: 30_000,
  });
  if (!claimed) return false;
  const blocked = blockWorkspaceOutboxEntry(claimed, {
    leaseOwnerId: 'golden-tab-a',
    now: 1_100,
    session: input.openSession,
  });
  if (!blocked || !(await store.update(blocked, 'golden-tab-a'))) {
    return false;
  }
  const replaced = await store.replace(blocked.id, replacement.entry);
  if (!replaced) return false;
  const reclaimedAfterRestart = await store.claimNext({
    workspaceId: input.baseWorkspace.id,
    leaseOwnerId: 'golden-tab-b',
    now: 3_000,
    leaseDurationMs: 30_000,
  });
  return (
    reclaimedAfterRestart?.id === replacement.entry.id &&
    reclaimedAfterRestart.causalOrderId === head.entry.id &&
    compareWorkspaceOutboxEntries(
      reclaimedAfterRestart,
      settingsFollower.entry
    ) < 0
  );
};

/** Exercises the Golden atomic-save, recovery, and conflict chain. */
export const runGoldenSyncScenario = async (
  authoring: GoldenAuthoringResult
): Promise<GoldenSyncResult> => {
  const persisted = persistGoldenWorkspace(authoring);
  const recovery = verifyReplicaRecovery({
    confirmedCreationWorkspace: persisted.confirmedCreationWorkspace,
    confirmedWorkspace: persisted.confirmedWorkspace,
    entry: persisted.entry,
    expectedEditedWorkspace: authoring.editedWorkspace,
  });
  const conflict = resolveGoldenConflict(persisted.confirmedWorkspace);
  const replacementKeptCausalHead = await verifyCausalReplacement(
    conflict.causalInput
  );
  return {
    workspace: conflict.workspace,
    save: {
      creationOperationId: getOperationId(persisted.creationOperation),
      editOperationId: getOperationId(persisted.editOperation),
      creationRequest: persisted.creationRequest,
      editRequest: persisted.editRequest,
    },
    recovery: {
      ...recovery,
      replacementKeptCausalHead,
    },
    conflict: {
      conflictCount: conflict.conflictCount,
      resolutionOperationId: conflict.resolutionOperationId,
      selectedSource: 'local',
    },
  };
};
