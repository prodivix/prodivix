import type { WorkspaceDocument, WorkspaceSnapshot } from './types';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  type WorkspaceCommandApplyResult,
  type WorkspaceCommandEnvelope,
  type WorkspaceCommandIssue,
  type WorkspaceTransactionApplyResult,
  type WorkspaceTransactionIssue,
} from './workspaceCommand';
import {
  resolveActiveRouteNodeId,
  resolveDefaultActiveRouteNodeId,
} from './workspaceCodec';
import { resolveCanonicalWorkspaceDocumentId } from './resolveCanonicalWorkspaceDocumentId';
import {
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  getWorkspaceOperationSourceIds,
  type WorkspaceOperation,
} from './workspaceOperation';

export type WorkspaceHistoryOperationIdContext = {
  direction: 'undo' | 'redo';
  role: 'operation' | 'command';
  sourceOperationId: string;
  sequence: number;
  commandIndex?: number;
};

export type WorkspaceHistoryExecutionOptions = {
  idFactory?: (context: WorkspaceHistoryOperationIdContext) => string;
  clock?: () => string;
};

export type WorkspaceHistoryOperationApplyResult =
  | { ok: true; snapshot: WorkspaceSnapshot }
  | {
      ok: false;
      commandIssues?: WorkspaceCommandIssue[];
      transactionIssues?: WorkspaceTransactionIssue[];
    };

type SelectionValue = { present: true; value: string } | { present: false };
type WorkspaceSelectionBaseline = Partial<
  Record<'activeDocumentId' | 'activeRouteNodeId', SelectionValue>
>;

const SELECTION_PATHS = {
  activeDocumentId: '/activeDocumentId',
  activeRouteNodeId: '/activeRouteNodeId',
} as const;

const defaultOperationIdFactory = (
  context: WorkspaceHistoryOperationIdContext
): string => {
  const suffix =
    context.role === 'command' ? `:command:${context.commandIndex ?? 0}` : '';
  return `${context.sourceOperationId}:${context.direction}:${context.sequence}${suffix}`;
};

const freshOperationId = (
  options: WorkspaceHistoryExecutionOptions,
  context: WorkspaceHistoryOperationIdContext
): string => (options.idFactory ?? defaultOperationIdFactory)(context);

const isWholeDocumentAdd = (
  operation: WorkspaceCommandEnvelope['forwardOps'][number]
): boolean => {
  if (operation.op !== 'add') return false;
  const segments = operation.path.split('/');
  return (
    segments.length === 3 &&
    segments[0] === '' &&
    segments[1] === 'docsById' &&
    Boolean(segments[2])
  );
};

const rebaseRecreatedDocumentIdentity = (
  operations: WorkspaceCommandEnvelope['forwardOps']
): WorkspaceCommandEnvelope['forwardOps'] =>
  operations.map((operation) => {
    if (
      !isWholeDocumentAdd(operation) ||
      !operation.value ||
      typeof operation.value !== 'object' ||
      Array.isArray(operation.value)
    ) {
      return operation;
    }
    const value = { ...(operation.value as Record<string, unknown>) };
    value.contentRev = 1;
    value.metaRev = 1;
    delete value.updatedAt;
    return { ...operation, value };
  });

const cloneCommandForDirection = (
  command: WorkspaceCommandEnvelope,
  input: { id: string; issuedAt: string; reverse: boolean }
): WorkspaceCommandEnvelope => ({
  ...command,
  id: input.id,
  issuedAt: input.issuedAt,
  forwardOps: input.reverse
    ? rebaseRecreatedDocumentIdentity(command.reverseOps)
    : command.forwardOps,
  reverseOps: input.reverse
    ? command.forwardOps
    : rebaseRecreatedDocumentIdentity(command.reverseOps),
});

export const createDirectionalWorkspaceOperation = (
  source: WorkspaceOperation,
  direction: 'undo' | 'redo',
  sequence: number,
  causalOperationId: string,
  options: WorkspaceHistoryExecutionOptions
): WorkspaceOperation => {
  const sourceId = getWorkspaceOperationId(source);
  const issuedAt = options.clock?.() ?? new Date().toISOString();
  const reverse = direction === 'undo';
  const causality =
    direction === 'undo'
      ? { undoOf: causalOperationId }
      : { redoOf: causalOperationId };
  const sourceOperationIds = getWorkspaceOperationSourceIds(source);
  if (source.kind === 'command') {
    return {
      kind: 'command',
      command: cloneCommandForDirection(source.command, {
        id: freshOperationId(options, {
          direction,
          role: 'operation',
          sourceOperationId: sourceId,
          sequence,
        }),
        issuedAt,
        reverse,
      }),
      ...causality,
      sourceOperationIds,
    };
  }
  const sourceCommands = reverse
    ? [...source.transaction.commands].reverse()
    : source.transaction.commands;
  return {
    kind: 'transaction',
    transaction: {
      ...source.transaction,
      id: freshOperationId(options, {
        direction,
        role: 'operation',
        sourceOperationId: sourceId,
        sequence,
      }),
      issuedAt,
      commands: sourceCommands.map((command, commandIndex) =>
        cloneCommandForDirection(command, {
          id: freshOperationId(options, {
            direction,
            role: 'command',
            sourceOperationId: sourceId,
            sequence,
            commandIndex,
          }),
          issuedAt,
          reverse,
        })
      ),
    },
    ...causality,
    sourceOperationIds,
  };
};

const selectionValueFromReverseOperation = (
  command: WorkspaceCommandEnvelope,
  path: string
): SelectionValue | undefined => {
  if (!command.forwardOps.some((operation) => operation.path === path)) {
    return undefined;
  }
  const reverseOperation = [...command.reverseOps]
    .reverse()
    .find((operation) => operation.path === path);
  if (!reverseOperation) return undefined;
  if (reverseOperation.op === 'remove') return { present: false };
  if (
    (reverseOperation.op === 'add' || reverseOperation.op === 'replace') &&
    typeof reverseOperation.value === 'string'
  ) {
    return { present: true, value: reverseOperation.value };
  }
  return undefined;
};

const resolveSelectionBaseline = (
  operation: WorkspaceOperation
): WorkspaceSelectionBaseline => {
  const baseline: WorkspaceSelectionBaseline = {};
  for (const command of getWorkspaceOperationCommands(operation)) {
    for (const [key, path] of Object.entries(SELECTION_PATHS) as Array<
      [keyof typeof SELECTION_PATHS, string]
    >) {
      if (baseline[key]) continue;
      const value = selectionValueFromReverseOperation(command, path);
      if (value) baseline[key] = value;
    }
  }
  return baseline;
};

const alignSelectionForOperation = (
  snapshot: WorkspaceSnapshot,
  baseline: WorkspaceSelectionBaseline
): WorkspaceSnapshot => {
  if (!baseline.activeDocumentId && !baseline.activeRouteNodeId) {
    return snapshot;
  }
  const aligned = { ...snapshot };
  for (const key of Object.keys(baseline) as Array<
    keyof WorkspaceSelectionBaseline
  >) {
    const value = baseline[key];
    if (!value) continue;
    if (value.present) aligned[key] = value.value;
    else delete aligned[key];
  }
  return aligned;
};

const restoreSelection = (
  snapshot: WorkspaceSnapshot,
  requested: Pick<WorkspaceSnapshot, 'activeDocumentId' | 'activeRouteNodeId'>,
  baseline: WorkspaceSelectionBaseline
): WorkspaceSnapshot => {
  const activeDocumentId =
    requested.activeDocumentId && snapshot.docsById[requested.activeDocumentId]
      ? requested.activeDocumentId
      : snapshot.activeDocumentId &&
          snapshot.docsById[snapshot.activeDocumentId]
        ? snapshot.activeDocumentId
        : resolveCanonicalWorkspaceDocumentId(
            Object.values(snapshot.docsById) as WorkspaceDocument[]
          );
  const restored = { ...snapshot };
  if (baseline.activeDocumentId) {
    if (activeDocumentId) restored.activeDocumentId = activeDocumentId;
    else delete restored.activeDocumentId;
  }
  if (baseline.activeRouteNodeId) {
    restored.activeRouteNodeId = resolveActiveRouteNodeId(
      snapshot.routeManifest,
      [
        requested.activeRouteNodeId,
        snapshot.activeRouteNodeId,
        resolveDefaultActiveRouteNodeId(snapshot.routeManifest),
      ]
    );
  }
  return restored;
};

export const applyWorkspaceOperationForHistory = (
  snapshot: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceHistoryOperationApplyResult => {
  const selectionBaseline = resolveSelectionBaseline(operation);
  const alignedSnapshot = alignSelectionForOperation(
    snapshot,
    selectionBaseline
  );
  if (operation.kind === 'command') {
    const result: WorkspaceCommandApplyResult = applyWorkspaceCommand(
      alignedSnapshot,
      operation.command
    );
    return result.ok
      ? {
          ok: true,
          snapshot: restoreSelection(
            result.snapshot,
            snapshot,
            selectionBaseline
          ),
        }
      : { ok: false, commandIssues: result.issues };
  }
  const result: WorkspaceTransactionApplyResult = applyWorkspaceTransaction(
    alignedSnapshot,
    operation.transaction
  );
  return result.ok
    ? {
        ok: true,
        snapshot: restoreSelection(
          result.snapshot,
          snapshot,
          selectionBaseline
        ),
      }
    : { ok: false, transactionIssues: result.issues };
};
