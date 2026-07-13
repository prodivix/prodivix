import type { StateCreator } from 'zustand';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { validatePirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceMutation as applyCanonicalWorkspaceMutation,
  applyWorkspaceTransaction,
  collectChangedWorkspaceDocumentIds,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  createWorkspacePirDocumentUpdateCommand,
  createWorkspaceTransactionOperation,
  getWorkspaceOperationSourceIds,
  reconcileWorkspaceOperationConfirmation,
  recordWorkspaceOperation,
  redoWorkspaceHistory as redoCanonicalWorkspaceHistory,
  selectActivePirDocument,
  setWorkspaceHistoryLimit as setCanonicalWorkspaceHistoryLimit,
  undoWorkspaceHistory as undoCanonicalWorkspaceHistory,
  type DecodedWorkspaceMutation,
  type WorkspaceCommandApplyResult,
  type WorkspaceCommandDomain,
  type WorkspaceCommandEnvelope,
  type WorkspaceDocument,
  type WorkspaceHistoryResult,
  type WorkspaceHistoryScopeSelector,
  type WorkspaceHistoryState,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
  type WorkspaceTransactionApplyResult,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import {
  analyzeWorkspaceThreeWay,
  createWorkspaceConflictSession,
  createWorkspaceResolutionOperation,
  type WorkspaceConflictSession,
} from '@prodivix/workspace-sync';
import type { EditorStore } from './editorStore.shape';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';

export type UpdateActivePirDocumentOptions = {
  commandId?: string;
  namespace?: string;
  type?: string;
  issuedAt?: string;
  domainHint?: Extract<
    WorkspaceCommandDomain,
    'pir' | 'nodegraph' | 'animation' | 'code'
  >;
  mergeKey?: string;
  label?: string;
};

export type ApplyWorkspaceMutationOptions = {
  expectedDocumentEditSeqById?: Readonly<Record<string, number>>;
};

export type AdoptRebasedWorkspaceOperationInput = {
  requestSnapshot: WorkspaceSnapshot;
  serverBaseSnapshot: WorkspaceSnapshot;
  rebasedSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  mutation?: DecodedWorkspaceMutation;
  expectedDocumentEditSeqById: Readonly<Record<string, number>>;
  expectedConflictSessionId?: string;
};

export type AdoptRebasedWorkspaceOperationResult =
  | {
      status: 'adopted';
      snapshot: WorkspaceSnapshot;
      operation: WorkspaceOperation | null;
      documentEditsObservedDuringRequest: boolean;
    }
  | { status: 'conflict'; session: WorkspaceConflictSession }
  | { status: 'rejected'; message: string };

export interface WorkspaceSlice {
  workspace: WorkspaceSnapshot | null;
  workspaceHistory: WorkspaceHistoryState;
  documentEditSeqById: Record<string, number>;
  workspaceCapabilities: Record<string, boolean>;
  workspaceCapabilitiesLoaded: boolean;
  workspaceReadonly: boolean;
  setWorkspaceSnapshot: (workspace: WorkspaceSnapshot) => void;
  setWorkspaceCapabilities: (
    workspaceId: string,
    capabilities: Record<string, boolean>
  ) => void;
  setWorkspaceReadonly: (readonly: boolean) => void;
  setWorkspaceHistoryLimit: (maxEntries: number) => void;
  clearWorkspaceState: () => void;
  setActiveDocumentId: (documentId: string | undefined) => void;
  applyWorkspaceMutation: (
    mutation: DecodedWorkspaceMutation,
    options?: ApplyWorkspaceMutationOptions
  ) => void;
  dispatchWorkspaceCommand: (
    command: WorkspaceCommandEnvelope
  ) => WorkspaceCommandApplyResult | null;
  dispatchWorkspaceTransaction: (
    transaction: WorkspaceTransactionEnvelope
  ) => WorkspaceTransactionApplyResult | null;
  acknowledgeWorkspaceCommand: (
    command: WorkspaceCommandEnvelope,
    mutation: DecodedWorkspaceMutation
  ) => WorkspaceCommandApplyResult | null;
  acknowledgeWorkspaceTransaction: (
    transaction: WorkspaceTransactionEnvelope,
    mutation: DecodedWorkspaceMutation
  ) => WorkspaceTransactionApplyResult | null;
  adoptRebasedWorkspaceOperation: (
    input: AdoptRebasedWorkspaceOperationInput
  ) => AdoptRebasedWorkspaceOperationResult;
  undoWorkspaceHistory: (
    scopes: WorkspaceHistoryScopeSelector
  ) => WorkspaceHistoryResult | null;
  redoWorkspaceHistory: (
    scopes: WorkspaceHistoryScopeSelector
  ) => WorkspaceHistoryResult | null;
  updateActivePirDocument: (
    updater: (document: PIRDocument) => PIRDocument,
    options?: UpdateActivePirDocumentOptions
  ) => WorkspaceCommandApplyResult | null;
}

const createConflictSessionId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `workspace-conflict-${crypto.randomUUID()}`;
  }
  return `workspace-conflict-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const createRebasedHistoryOperationId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `workspace-history-${crypto.randomUUID()}`;
  }
  return `workspace-history-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const updateDocumentEditSequences = (
  current: Record<string, number>,
  documentIds: Iterable<string>,
  workspace: WorkspaceSnapshot
): Record<string, number> => {
  const uniqueDocumentIds = new Set(
    [...documentIds].map((documentId) => documentId.trim()).filter(Boolean)
  );
  if (!uniqueDocumentIds.size) return current;
  const next = { ...current };
  uniqueDocumentIds.forEach((documentId) => {
    if (!workspace.docsById[documentId]) {
      delete next[documentId];
      return;
    }
    next[documentId] = (next[documentId] ?? 0) + 1;
  });
  return next;
};

const resetWorkspaceHistory = (
  history: WorkspaceHistoryState
): WorkspaceHistoryState =>
  createWorkspaceHistoryState({
    maxEntries: history.maxEntries,
    mergeWindowMs: history.mergeWindowMs,
  });

const selectLatestDocumentUpdatedAt = (
  current: string | undefined,
  confirmed: string | undefined
): string | undefined => {
  if (!current) return confirmed;
  if (!confirmed) return current;
  const currentTime = Date.parse(current);
  const confirmedTime = Date.parse(confirmed);
  if (!Number.isFinite(currentTime) || !Number.isFinite(confirmedTime)) {
    return current;
  }
  return confirmedTime > currentTime ? confirmed : current;
};

const adoptConfirmedDocumentMetadata = (
  current: WorkspaceDocument,
  confirmed: WorkspaceDocument
): WorkspaceDocument => {
  const next = { ...current, path: confirmed.path };
  if (confirmed.name === undefined) delete next.name;
  else next.name = confirmed.name;
  if (confirmed.capabilities === undefined) delete next.capabilities;
  else next.capabilities = confirmed.capabilities;
  return next;
};

/** Reconciles delayed acknowledgements without crossing document partitions. */
const reconcileConfirmedDocument = (
  current: WorkspaceDocument,
  confirmed: WorkspaceDocument,
  editedAfterRequest: boolean
): WorkspaceDocument => {
  const contentRev = Math.max(current.contentRev, confirmed.contentRev);
  const metaRev = Math.max(current.metaRev, confirmed.metaRev);
  const updatedAt = selectLatestDocumentUpdatedAt(
    current.updatedAt,
    confirmed.updatedAt
  );
  let next = { ...current };
  if (!editedAfterRequest && confirmed.contentRev > current.contentRev) {
    next.content = confirmed.content;
  }
  if (!editedAfterRequest && confirmed.metaRev > current.metaRev) {
    next = adoptConfirmedDocumentMetadata(next, confirmed);
  }
  next.contentRev = contentRev;
  next.metaRev = metaRev;
  if (updatedAt === undefined) delete next.updatedAt;
  else next.updatedAt = updatedAt;
  return next;
};

const preserveDocumentsEditedAfterRequest = (
  workspace: WorkspaceSnapshot,
  documentEditSeqById: Readonly<Record<string, number>>,
  mutation: DecodedWorkspaceMutation,
  options: ApplyWorkspaceMutationOptions
): DecodedWorkspaceMutation => {
  const expectedEditSequences = options.expectedDocumentEditSeqById;

  const updatedDocuments = mutation.updatedDocuments.flatMap(
    (confirmedDocument) => {
      const expectedEditSequence =
        expectedEditSequences?.[confirmedDocument.id];
      const editedAfterRequest =
        expectedEditSequence !== undefined &&
        (documentEditSeqById[confirmedDocument.id] ?? 0) !==
          expectedEditSequence;
      const currentDocument = workspace.docsById[confirmedDocument.id];
      if (!currentDocument) {
        return editedAfterRequest ? [] : [confirmedDocument];
      }
      return [
        reconcileConfirmedDocument(
          currentDocument,
          confirmedDocument,
          editedAfterRequest
        ),
      ];
    }
  );
  return updatedDocuments.every(
    (document, index) => document === mutation.updatedDocuments[index]
  ) && updatedDocuments.length === mutation.updatedDocuments.length
    ? mutation
    : { ...mutation, updatedDocuments };
};

export const createWorkspaceSlice: StateCreator<
  EditorStore,
  [],
  [],
  WorkspaceSlice
> = (set, get) => ({
  workspace: null,
  workspaceHistory: createWorkspaceHistoryState(),
  documentEditSeqById: {},
  workspaceCapabilities: {},
  workspaceCapabilitiesLoaded: false,
  workspaceReadonly: false,
  setWorkspaceSnapshot: (workspace) =>
    set((state) => {
      const isSameWorkspace = state.workspace?.id === workspace.id;
      return {
        workspace,
        workspaceHistory: resetWorkspaceHistory(state.workspaceHistory),
        documentEditSeqById: {},
        workspaceRevisionConflict: null,
        workspaceConflictResolutionStatus: 'idle',
        workspaceConflictResolutionError: null,
        workspaceCapabilities: isSameWorkspace
          ? state.workspaceCapabilities
          : {},
        workspaceCapabilitiesLoaded: isSameWorkspace
          ? state.workspaceCapabilitiesLoaded
          : false,
        workspaceReadonly: isSameWorkspace ? state.workspaceReadonly : false,
      };
    }),
  setWorkspaceCapabilities: (workspaceId, capabilities) =>
    set((state) => {
      const normalizedWorkspaceId = workspaceId.trim();
      if (
        !normalizedWorkspaceId ||
        normalizedWorkspaceId !== state.workspace?.id
      ) {
        return state;
      }
      return {
        workspaceCapabilities: { ...capabilities },
        workspaceCapabilitiesLoaded: true,
      };
    }),
  setWorkspaceReadonly: (readonly) =>
    set({ workspaceReadonly: Boolean(readonly) }),
  setWorkspaceHistoryLimit: (maxEntries) =>
    set((state) => ({
      workspaceHistory: setCanonicalWorkspaceHistoryLimit(
        state.workspaceHistory,
        maxEntries
      ),
    })),
  clearWorkspaceState: () =>
    set((state) => ({
      workspace: null,
      workspaceHistory: resetWorkspaceHistory(state.workspaceHistory),
      documentEditSeqById: {},
      workspaceCapabilities: {},
      workspaceCapabilitiesLoaded: false,
      workspaceReadonly: false,
      workspaceRevisionConflict: null,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
      runtimeStateByProject: {},
    })),
  setActiveDocumentId: (documentId) =>
    set((state) => {
      if (!state.workspace) return state;
      const normalizedDocumentId = documentId?.trim();
      if (!normalizedDocumentId) {
        if (state.workspace.activeDocumentId === undefined) return state;
        const { activeDocumentId: _activeDocumentId, ...workspace } =
          state.workspace;
        return { workspace };
      }
      if (!state.workspace.docsById[normalizedDocumentId]) return state;
      if (state.workspace.activeDocumentId === normalizedDocumentId) {
        return state;
      }
      return {
        workspace: {
          ...state.workspace,
          activeDocumentId: normalizedDocumentId,
        },
      };
    }),
  applyWorkspaceMutation: (mutation, options = {}) =>
    set((state) => {
      if (!state.workspace || state.workspace.id !== mutation.workspaceId) {
        return state;
      }
      const reconciledMutation = preserveDocumentsEditedAfterRequest(
        state.workspace,
        state.documentEditSeqById,
        mutation,
        options
      );
      const workspace = applyCanonicalWorkspaceMutation(
        state.workspace,
        reconciledMutation
      );
      if (!mutation.removedDocumentIds.length) return { workspace };
      const documentEditSeqById = { ...state.documentEditSeqById };
      mutation.removedDocumentIds.forEach((documentId) => {
        delete documentEditSeqById[documentId];
      });
      return { workspace, documentEditSeqById };
    }),
  dispatchWorkspaceCommand: (command) => {
    const state = get();
    if (!state.workspace || state.workspaceReadonly) return null;
    const result = applyWorkspaceCommand(state.workspace, command);
    if (!result.ok) return result;
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      result.snapshot
    );
    set({
      workspace: result.snapshot,
      workspaceHistory: recordWorkspaceOperation(
        state.workspaceHistory,
        createWorkspaceCommandOperation(command)
      ),
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        result.snapshot
      ),
    });
    return result;
  },
  dispatchWorkspaceTransaction: (transaction) => {
    const state = get();
    if (!state.workspace || state.workspaceReadonly) return null;
    const result = applyWorkspaceTransaction(state.workspace, transaction);
    if (!result.ok) return result;
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      result.snapshot
    );
    set({
      workspace: result.snapshot,
      workspaceHistory: recordWorkspaceOperation(
        state.workspaceHistory,
        createWorkspaceTransactionOperation(transaction)
      ),
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        result.snapshot
      ),
    });
    return result;
  },
  acknowledgeWorkspaceCommand: (command, mutation) => {
    const state = get();
    if (!state.workspace || state.workspace.id !== mutation.workspaceId) {
      return null;
    }
    if (
      mutation.acceptedMutationId &&
      mutation.acceptedMutationId !== command.id
    ) {
      return null;
    }
    const result = applyWorkspaceCommand(state.workspace, command);
    if (!result.ok) return result;
    const confirmedSnapshot = applyCanonicalWorkspaceMutation(
      result.snapshot,
      mutation
    );
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      confirmedSnapshot
    );
    set({
      workspace: confirmedSnapshot,
      workspaceHistory: recordWorkspaceOperation(
        state.workspaceHistory,
        reconcileWorkspaceOperationConfirmation(
          createWorkspaceCommandOperation(command),
          confirmedSnapshot,
          mutation.updatedDocuments.map(({ id }) => id)
        )
      ),
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        confirmedSnapshot
      ),
    });
    return { ...result, snapshot: confirmedSnapshot };
  },
  acknowledgeWorkspaceTransaction: (transaction, mutation) => {
    const state = get();
    if (!state.workspace || state.workspace.id !== mutation.workspaceId) {
      return null;
    }
    if (
      mutation.acceptedMutationId &&
      mutation.acceptedMutationId !== transaction.id
    ) {
      return null;
    }
    const result = applyWorkspaceTransaction(state.workspace, transaction);
    if (!result.ok) return result;
    const confirmedSnapshot = applyCanonicalWorkspaceMutation(
      result.snapshot,
      mutation
    );
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      confirmedSnapshot
    );
    set({
      workspace: confirmedSnapshot,
      workspaceHistory: recordWorkspaceOperation(
        state.workspaceHistory,
        reconcileWorkspaceOperationConfirmation(
          createWorkspaceTransactionOperation(transaction),
          confirmedSnapshot,
          mutation.updatedDocuments.map(({ id }) => id)
        )
      ),
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        confirmedSnapshot
      ),
    });
    return { ...result, snapshot: confirmedSnapshot };
  },
  adoptRebasedWorkspaceOperation: ({
    requestSnapshot,
    serverBaseSnapshot,
    rebasedSnapshot,
    operation,
    mutation,
    expectedDocumentEditSeqById,
    expectedConflictSessionId,
  }) => {
    const state = get();
    const activeConflictSessionId = state.workspaceRevisionConflict?.id;
    if (
      expectedConflictSessionId !== undefined
        ? activeConflictSessionId !== expectedConflictSessionId
        : activeConflictSessionId !== undefined
    ) {
      return {
        status: 'rejected',
        message:
          'A newer workspace revision conflict is already awaiting review.',
      };
    }
    if (
      !state.workspace ||
      state.workspace.id !== requestSnapshot.id ||
      requestSnapshot.id !== serverBaseSnapshot.id ||
      state.workspace.id !== rebasedSnapshot.id ||
      (mutation && rebasedSnapshot.id !== mutation.workspaceId)
    ) {
      return {
        status: 'rejected',
        message: 'Rebased workspace snapshots must share the active workspace.',
      };
    }
    const confirmedRebasedSnapshot = mutation
      ? applyCanonicalWorkspaceMutation(rebasedSnapshot, mutation)
      : rebasedSnapshot;
    const documentEditsObservedDuringRequest = Object.entries(
      expectedDocumentEditSeqById
    ).some(
      ([documentId, expectedEditSeq]) =>
        (state.documentEditSeqById[documentId] ?? 0) !== expectedEditSeq
    );
    const merge = analyzeWorkspaceThreeWay(
      requestSnapshot,
      state.workspace,
      confirmedRebasedSnapshot
    );
    if ('issues' in merge) {
      return {
        status: 'rejected',
        message:
          merge.issues[0]?.message ||
          'Could not reconcile edits made while the workspace was saving.',
      };
    }
    if (merge.analysis.conflicts.length) {
      const createdAt = new Date().toISOString();
      const created = createWorkspaceConflictSession({
        id: createConflictSessionId(),
        createdAt,
        baseSnapshot: requestSnapshot,
        localSnapshot: state.workspace,
        remoteSnapshot: confirmedRebasedSnapshot,
        sourceOperation: operation,
      });
      if ('issues' in created) {
        return {
          status: 'rejected',
          message:
            created.issues[0]?.message ||
            'Could not create a revision conflict session.',
        };
      }
      set({
        workspaceRevisionConflict: created.session,
        workspaceConflictResolutionStatus: 'idle',
        workspaceConflictResolutionError: null,
      });
      return { status: 'conflict', session: created.session };
    }
    const confirmedSnapshot = merge.analysis.candidateSnapshot;
    const rebuilt = createWorkspaceResolutionOperation({
      remoteSnapshot: serverBaseSnapshot,
      resolvedSnapshot: confirmedSnapshot,
      operationId: createRebasedHistoryOperationId(),
      issuedAt: new Date().toISOString(),
      label: 'Adopt rebased workspace operation',
      sourceOperationIds: getWorkspaceOperationSourceIds(operation),
    });
    if ('issues' in rebuilt) {
      return {
        status: 'rejected',
        message:
          rebuilt.issues[0]?.message ||
          'Could not rebuild workspace history after rebasing.',
      };
    }
    const confirmedOperation = rebuilt.operation
      ? reconcileWorkspaceOperationConfirmation(
          rebuilt.operation,
          confirmedSnapshot,
          mutation?.updatedDocuments.map(({ id }) => id) ?? []
        )
      : null;
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      confirmedSnapshot
    );
    const nextHistory = resetWorkspaceHistory(state.workspaceHistory);
    const nextDocumentEditSeqById = updateDocumentEditSequences(
      state.documentEditSeqById,
      affectedDocumentIds.filter(
        (documentId) =>
          !confirmedSnapshot.docsById[documentId] ||
          expectedDocumentEditSeqById[documentId] === undefined
      ),
      confirmedSnapshot
    );
    set({
      workspace: confirmedSnapshot,
      workspaceHistory: confirmedOperation
        ? recordWorkspaceOperation(nextHistory, confirmedOperation)
        : nextHistory,
      documentEditSeqById: nextDocumentEditSeqById,
      workspaceRevisionConflict: null,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
    });
    return {
      status: 'adopted',
      snapshot: confirmedSnapshot,
      operation: confirmedOperation,
      documentEditsObservedDuringRequest,
    };
  },
  undoWorkspaceHistory: (scopes) => {
    const state = get();
    if (!state.workspace || state.workspaceReadonly) return null;
    const result = undoCanonicalWorkspaceHistory(
      state.workspace,
      state.workspaceHistory,
      scopes
    );
    if (!result.ok) return result;
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      result.snapshot
    );
    set({
      workspace: result.snapshot,
      workspaceHistory: result.history,
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        result.snapshot
      ),
    });
    return result;
  },
  redoWorkspaceHistory: (scopes) => {
    const state = get();
    if (!state.workspace || state.workspaceReadonly) return null;
    const result = redoCanonicalWorkspaceHistory(
      state.workspace,
      state.workspaceHistory,
      scopes
    );
    if (!result.ok) return result;
    const affectedDocumentIds = collectChangedWorkspaceDocumentIds(
      state.workspace,
      result.snapshot
    );
    set({
      workspace: result.snapshot,
      workspaceHistory: result.history,
      documentEditSeqById: updateDocumentEditSequences(
        state.documentEditSeqById,
        affectedDocumentIds,
        result.snapshot
      ),
    });
    return result;
  },
  updateActivePirDocument: (updater, options = {}) => {
    const state = get();
    if (!state.workspace || state.workspaceReadonly) return null;
    const activeDocument = selectActivePirDocument(state.workspace);
    if (!activeDocument) return null;
    const candidate = updater(activeDocument.content);
    if (candidate === activeDocument.content) return null;
    const validation = validatePirDocument(candidate);
    if (validation.hasError) return null;
    const command = createWorkspacePirDocumentUpdateCommand({
      workspace: state.workspace,
      before: activeDocument.content,
      after: validation.document,
      ...options,
      commandId: options.commandId ?? createWorkspaceClientOperationId(),
    });
    return command ? state.dispatchWorkspaceCommand(command) : null;
  },
});
