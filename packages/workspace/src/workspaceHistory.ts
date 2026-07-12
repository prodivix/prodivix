import type { WorkspaceDocumentId, WorkspaceSnapshot } from './types';
import type {
  WorkspaceCommandIssue,
  WorkspaceTransactionIssue,
} from './workspaceCommand';
import {
  collectChangedWorkspaceDocumentIds,
  dedupeWorkspaceHistoryScopes,
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  getWorkspaceOperationIssuedAt,
  getWorkspaceOperationMergeKey,
  getWorkspaceOperationSourceIds,
  resolveWorkspaceOperationAffectedScopes,
  resolveWorkspaceOperationScope,
  workspaceHistoryScopesEqual,
  type WorkspaceHistoryScope,
  type WorkspaceOperation,
} from './workspaceOperation';
import {
  applyWorkspaceOperationForHistory,
  createDirectionalWorkspaceOperation,
  type WorkspaceHistoryExecutionOptions,
} from './workspaceHistoryReplay';

export {
  collectChangedWorkspaceDocumentIds,
  collectWorkspaceOperationDocumentIds,
  createWorkspaceCommandOperation,
  createWorkspaceTransactionOperation,
  reconcileWorkspaceOperationConfirmation,
  resolveWorkspaceCommandScope,
  resolveWorkspaceOperationAffectedScopes,
  resolveWorkspaceOperationScope,
  workspaceHistoryScopesEqual,
} from './workspaceOperation';
export type {
  WorkspaceHistoryDocumentDomain,
  WorkspaceHistoryScope,
  WorkspaceOperation,
} from './workspaceOperation';
export type {
  WorkspaceHistoryExecutionOptions,
  WorkspaceHistoryOperationIdContext,
} from './workspaceHistoryReplay';

export const DEFAULT_WORKSPACE_HISTORY_MAX_ENTRIES = 80;
export const DEFAULT_WORKSPACE_HISTORY_MERGE_WINDOW_MS = 750;

export type WorkspaceHistoryEntry = {
  id: string;
  operation: WorkspaceOperation;
  scope: WorkspaceHistoryScope;
  affectedScopes: WorkspaceHistoryScope[];
  isBarrier: boolean;
  appliedAt: string;
  recordedSequence: number;
  lastAppliedOperationId: string;
  undoneBy?: string;
};

export type WorkspaceHistoryState = {
  undoStack: WorkspaceHistoryEntry[];
  redoStack: WorkspaceHistoryEntry[];
  maxEntries: number;
  mergeWindowMs: number;
  sequence: number;
};

export type WorkspaceHistoryIssueCode =
  | 'WKS_HISTORY_ENTRY_NOT_FOUND'
  | 'WKS_HISTORY_BARRIER_BLOCKED'
  | 'WKS_HISTORY_OPERATION_FAILED';

export type WorkspaceHistoryIssue = {
  code: WorkspaceHistoryIssueCode;
  message: string;
  commandIssues?: WorkspaceCommandIssue[];
  transactionIssues?: WorkspaceTransactionIssue[];
};

export type WorkspaceHistoryResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
      history: WorkspaceHistoryState;
      entry: WorkspaceHistoryEntry;
      appliedOperation: WorkspaceOperation;
      affectedDocumentIds: WorkspaceDocumentId[];
    }
  | {
      ok: false;
      issues: WorkspaceHistoryIssue[];
    };

export type WorkspaceHistoryRecordOptions = {
  appliedAt?: string;
  maxEntries?: number;
  mergeWindowMs?: number;
};

export type WorkspaceHistoryStateOptions = {
  maxEntries?: number;
  mergeWindowMs?: number;
};

export type WorkspaceHistoryScopeSelector =
  WorkspaceHistoryScope | readonly WorkspaceHistoryScope[];

type HistoryEntryLookup =
  | { kind: 'found'; index: number; entry: WorkspaceHistoryEntry }
  | { kind: 'blocked' }
  | { kind: 'missing' };

const normalizeMaxEntries = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_WORKSPACE_HISTORY_MAX_ENTRIES;
  if (!Number.isFinite(value)) return DEFAULT_WORKSPACE_HISTORY_MAX_ENTRIES;
  return Math.max(0, Math.trunc(value));
};

const normalizeMergeWindow = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_WORKSPACE_HISTORY_MERGE_WINDOW_MS;
  if (!Number.isFinite(value)) return DEFAULT_WORKSPACE_HISTORY_MERGE_WINDOW_MS;
  return Math.max(0, Math.trunc(value));
};

const boundHistoryEntries = (
  entries: WorkspaceHistoryEntry[],
  maxEntries: number
): WorkspaceHistoryEntry[] =>
  maxEntries === 0 ? [] : entries.slice(-maxEntries);

const scopesOverlap = (
  left: WorkspaceHistoryScope,
  right: WorkspaceHistoryScope
): boolean => {
  if (left.workspaceId !== right.workspaceId) return false;
  if (left.kind === 'workspace' || right.kind === 'workspace') return true;
  return workspaceHistoryScopesEqual(left, right);
};

const entryAffectsScope = (
  entry: WorkspaceHistoryEntry,
  scope: WorkspaceHistoryScope
): boolean =>
  entry.affectedScopes.some((affectedScope) =>
    scopesOverlap(affectedScope, scope)
  );

const entriesOverlap = (
  left: WorkspaceHistoryEntry,
  right: WorkspaceHistoryEntry
): boolean =>
  left.affectedScopes.some((leftScope) =>
    right.affectedScopes.some((rightScope) =>
      scopesOverlap(leftScope, rightScope)
    )
  );

const normalizeScopeSelector = (
  selector: WorkspaceHistoryScopeSelector
): WorkspaceHistoryScope[] =>
  dedupeWorkspaceHistoryScopes(Array.isArray(selector) ? selector : [selector]);

const findHistoryEntry = (
  entries: WorkspaceHistoryEntry[],
  selector: WorkspaceHistoryScopeSelector
): HistoryEntryLookup => {
  const scopes = normalizeScopeSelector(selector);
  const blockedScopeIndexes = new Set<number>();
  const laterEntries: WorkspaceHistoryEntry[] = [];
  let encounteredBarrier = false;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const matchingScopeIndex = scopes.findIndex(
      (scope, scopeIndex) =>
        !blockedScopeIndexes.has(scopeIndex) &&
        workspaceHistoryScopesEqual(entry.scope, scope)
    );
    if (matchingScopeIndex >= 0) {
      const crossesDependentEntry =
        entry.scope.kind === 'workspace' &&
        laterEntries.some((laterEntry) => entriesOverlap(entry, laterEntry));
      if (!crossesDependentEntry) return { kind: 'found', index, entry };
      blockedScopeIndexes.add(matchingScopeIndex);
      encounteredBarrier = true;
    }
    scopes.forEach((scope, scopeIndex) => {
      if (blockedScopeIndexes.has(scopeIndex)) return;
      if (entry.isBarrier && entryAffectsScope(entry, scope)) {
        blockedScopeIndexes.add(scopeIndex);
        encounteredBarrier = true;
      }
    });
    laterEntries.push(entry);
  }
  return encounteredBarrier ? { kind: 'blocked' } : { kind: 'missing' };
};

const removeEntryAt = (
  entries: WorkspaceHistoryEntry[],
  index: number
): [WorkspaceHistoryEntry, WorkspaceHistoryEntry[]] => [
  entries[index],
  entries.filter((_, entryIndex) => entryIndex !== index),
];

const createHistoryEntry = (
  operation: WorkspaceOperation,
  appliedAt: string | undefined,
  recordedSequence: number
): WorkspaceHistoryEntry => {
  const scope = resolveWorkspaceOperationScope(operation);
  return {
    id: getWorkspaceOperationId(operation),
    operation,
    scope,
    affectedScopes: resolveWorkspaceOperationAffectedScopes(operation),
    isBarrier: scope.kind === 'workspace',
    appliedAt: appliedAt ?? getWorkspaceOperationIssuedAt(operation),
    recordedSequence,
    lastAppliedOperationId: getWorkspaceOperationId(operation),
  };
};

const hasUniqueCommandIds = (
  operations: readonly WorkspaceOperation[]
): boolean => {
  const ids = operations.flatMap((operation) =>
    getWorkspaceOperationCommands(operation).map(({ id }) => id)
  );
  return new Set(ids).size === ids.length;
};

const mergeWorkspaceOperations = (
  first: WorkspaceOperation,
  latest: WorkspaceOperation
): WorkspaceOperation => {
  const latestEnvelope =
    latest.kind === 'command' ? latest.command : latest.transaction;
  const firstEnvelope =
    first.kind === 'command' ? first.command : first.transaction;
  const sourceOperationIds = [
    ...new Set([
      ...getWorkspaceOperationSourceIds(first),
      ...getWorkspaceOperationSourceIds(latest),
    ]),
  ];
  const mergedOperationId = `history:merge:${sourceOperationIds
    .map((id) => `${id.length}:${id}`)
    .join('|')}`;
  return {
    kind: 'transaction',
    transaction: {
      id: mergedOperationId,
      workspaceId:
        first.kind === 'command'
          ? first.command.target.workspaceId
          : first.transaction.workspaceId,
      issuedAt: getWorkspaceOperationIssuedAt(latest),
      commands: [
        ...getWorkspaceOperationCommands(first),
        ...getWorkspaceOperationCommands(latest),
      ],
      label: latestEnvelope.label ?? firstEnvelope.label,
      mergeKey: getWorkspaceOperationMergeKey(latest),
    },
    sourceOperationIds,
  };
};

const tryMergeHistoryEntries = (
  first: WorkspaceHistoryEntry,
  latest: WorkspaceHistoryEntry,
  mergeWindowMs: number
): WorkspaceHistoryEntry | undefined => {
  const firstMergeKey = getWorkspaceOperationMergeKey(first.operation);
  const latestMergeKey = getWorkspaceOperationMergeKey(latest.operation);
  const firstAppliedAt = Date.parse(first.appliedAt);
  const latestAppliedAt = Date.parse(latest.appliedAt);
  const withinMergeWindow =
    mergeWindowMs > 0 &&
    Number.isFinite(firstAppliedAt) &&
    Number.isFinite(latestAppliedAt) &&
    latestAppliedAt >= firstAppliedAt &&
    latestAppliedAt - firstAppliedAt <= mergeWindowMs;
  if (
    !firstMergeKey ||
    firstMergeKey !== latestMergeKey ||
    !withinMergeWindow ||
    first.recordedSequence !== latest.recordedSequence ||
    !workspaceHistoryScopesEqual(first.scope, latest.scope) ||
    !hasUniqueCommandIds([first.operation, latest.operation])
  ) {
    return undefined;
  }
  return createHistoryEntry(
    mergeWorkspaceOperations(first.operation, latest.operation),
    latest.appliedAt,
    latest.recordedSequence
  );
};

const historyLookupIssue = (
  lookup: Exclude<HistoryEntryLookup, { kind: 'found' }>,
  direction: 'undo' | 'redo'
): WorkspaceHistoryIssue =>
  lookup.kind === 'blocked'
    ? {
        code: 'WKS_HISTORY_BARRIER_BLOCKED',
        message: `The requested ${direction} scope is separated from its history by a dependent workspace barrier.`,
      }
    : {
        code: 'WKS_HISTORY_ENTRY_NOT_FOUND',
        message: `No ${direction} history entry matches the requested scope.`,
      };

export const createWorkspaceHistoryState = (
  options: WorkspaceHistoryStateOptions = {}
): WorkspaceHistoryState => ({
  undoStack: [],
  redoStack: [],
  maxEntries: normalizeMaxEntries(options.maxEntries),
  mergeWindowMs: normalizeMergeWindow(options.mergeWindowMs),
  sequence: 0,
});

export const setWorkspaceHistoryLimit = (
  history: WorkspaceHistoryState,
  maxEntries: number
): WorkspaceHistoryState => {
  const normalizedLimit = normalizeMaxEntries(maxEntries);
  return {
    ...history,
    undoStack:
      normalizedLimit === 0 ? [] : history.undoStack.slice(-normalizedLimit),
    redoStack:
      normalizedLimit === 0 ? [] : history.redoStack.slice(-normalizedLimit),
    maxEntries: normalizedLimit,
  };
};

export const setWorkspaceHistoryMergeWindow = (
  history: WorkspaceHistoryState,
  mergeWindowMs: number
): WorkspaceHistoryState => ({
  ...history,
  mergeWindowMs: normalizeMergeWindow(mergeWindowMs),
});

export const recordWorkspaceOperation = (
  history: WorkspaceHistoryState,
  operation: WorkspaceOperation,
  options: WorkspaceHistoryRecordOptions = {}
): WorkspaceHistoryState => {
  const maxEntries =
    options.maxEntries === undefined
      ? history.maxEntries
      : normalizeMaxEntries(options.maxEntries);
  const mergeWindowMs =
    options.mergeWindowMs === undefined
      ? history.mergeWindowMs
      : normalizeMergeWindow(options.mergeWindowMs);
  const nextEntry = createHistoryEntry(
    operation,
    options.appliedAt,
    history.sequence
  );
  const previousEntry = history.undoStack.at(-1);
  const mergedEntry = previousEntry
    ? tryMergeHistoryEntries(previousEntry, nextEntry, mergeWindowMs)
    : undefined;
  const nextUndoStack = mergedEntry
    ? [...history.undoStack.slice(0, -1), mergedEntry]
    : [...history.undoStack, nextEntry];
  const nextRedoStack = history.redoStack.filter(
    (redoEntry) => !entriesOverlap(redoEntry, mergedEntry ?? nextEntry)
  );
  return {
    undoStack: boundHistoryEntries(nextUndoStack, maxEntries),
    redoStack: boundHistoryEntries(nextRedoStack, maxEntries),
    maxEntries,
    mergeWindowMs,
    sequence: history.sequence,
  };
};

export const selectUndoWorkspaceHistoryEntry = (
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector
): WorkspaceHistoryEntry | undefined => {
  const lookup = findHistoryEntry(history.undoStack, scopes);
  return lookup.kind === 'found' ? lookup.entry : undefined;
};

export const selectRedoWorkspaceHistoryEntry = (
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector
): WorkspaceHistoryEntry | undefined => {
  const lookup = findHistoryEntry(history.redoStack, scopes);
  return lookup.kind === 'found' ? lookup.entry : undefined;
};

export const canUndoWorkspaceHistory = (
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector
): boolean => Boolean(selectUndoWorkspaceHistoryEntry(history, scopes));

export const canRedoWorkspaceHistory = (
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector
): boolean => Boolean(selectRedoWorkspaceHistoryEntry(history, scopes));

export const undoWorkspaceHistory = (
  snapshot: WorkspaceSnapshot,
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector,
  options: WorkspaceHistoryExecutionOptions = {}
): WorkspaceHistoryResult => {
  const lookup = findHistoryEntry(history.undoStack, scopes);
  if (lookup.kind !== 'found') {
    return { ok: false, issues: [historyLookupIssue(lookup, 'undo')] };
  }
  const [entry, nextUndoStack] = removeEntryAt(history.undoStack, lookup.index);
  const sequence = history.sequence + 1;
  const appliedOperation = createDirectionalWorkspaceOperation(
    entry.operation,
    'undo',
    sequence,
    entry.lastAppliedOperationId,
    options
  );
  const operationResult = applyWorkspaceOperationForHistory(
    snapshot,
    appliedOperation
  );
  if (!operationResult.ok) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_OPERATION_FAILED',
          message: 'Undo operation failed to apply.',
          commandIssues: operationResult.commandIssues,
          transactionIssues: operationResult.transactionIssues,
        },
      ],
    };
  }
  const movedEntry = {
    ...entry,
    undoneBy: getWorkspaceOperationId(appliedOperation),
  };
  return {
    ok: true,
    snapshot: operationResult.snapshot,
    history: {
      ...history,
      undoStack: nextUndoStack,
      redoStack: boundHistoryEntries(
        [...history.redoStack, movedEntry],
        history.maxEntries
      ),
      sequence,
    },
    entry: movedEntry,
    appliedOperation,
    affectedDocumentIds: collectChangedWorkspaceDocumentIds(
      snapshot,
      operationResult.snapshot
    ),
  };
};

export const redoWorkspaceHistory = (
  snapshot: WorkspaceSnapshot,
  history: WorkspaceHistoryState,
  scopes: WorkspaceHistoryScopeSelector,
  options: WorkspaceHistoryExecutionOptions = {}
): WorkspaceHistoryResult => {
  const lookup = findHistoryEntry(history.redoStack, scopes);
  if (lookup.kind !== 'found') {
    return { ok: false, issues: [historyLookupIssue(lookup, 'redo')] };
  }
  const [entry, nextRedoStack] = removeEntryAt(history.redoStack, lookup.index);
  const sequence = history.sequence + 1;
  const appliedOperation = createDirectionalWorkspaceOperation(
    entry.operation,
    'redo',
    sequence,
    entry.undoneBy ?? getWorkspaceOperationId(entry.operation),
    options
  );
  const operationResult = applyWorkspaceOperationForHistory(
    snapshot,
    appliedOperation
  );
  if (!operationResult.ok) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_OPERATION_FAILED',
          message: 'Redo operation failed to apply.',
          commandIssues: operationResult.commandIssues,
          transactionIssues: operationResult.transactionIssues,
        },
      ],
    };
  }
  const movedEntry: WorkspaceHistoryEntry = {
    ...entry,
    lastAppliedOperationId: getWorkspaceOperationId(appliedOperation),
  };
  delete movedEntry.undoneBy;
  return {
    ok: true,
    snapshot: operationResult.snapshot,
    history: {
      ...history,
      undoStack: boundHistoryEntries(
        [...history.undoStack, movedEntry],
        history.maxEntries
      ),
      redoStack: nextRedoStack,
      sequence,
    },
    entry: movedEntry,
    appliedOperation,
    affectedDocumentIds: collectChangedWorkspaceDocumentIds(
      snapshot,
      operationResult.snapshot
    ),
  };
};
