import type { WorkspaceDocumentId, WorkspaceSnapshot } from './types';
import {
  resolveWorkspaceCommandDomain,
  type WorkspaceCommandDomain,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
} from './workspaceCommand';

export type WorkspaceHistoryDocumentDomain = Extract<
  WorkspaceCommandDomain,
  'pir' | 'nodegraph' | 'animation' | 'code'
>;

export type WorkspaceHistoryScope =
  | {
      kind: 'document';
      workspaceId: string;
      documentId: WorkspaceDocumentId;
      domain: WorkspaceHistoryDocumentDomain;
    }
  | {
      kind: 'workspace';
      workspaceId: string;
    }
  | {
      kind: 'route';
      workspaceId: string;
    };

export type WorkspaceOperation = (
  | {
      kind: 'command';
      command: WorkspaceCommandEnvelope;
    }
  | {
      kind: 'transaction';
      transaction: WorkspaceTransactionEnvelope;
    }
) & {
  undoOf?: string;
  redoOf?: string;
  sourceOperationIds?: string[];
};

const DOCUMENT_DOMAINS: readonly WorkspaceHistoryDocumentDomain[] = [
  'pir',
  'nodegraph',
  'animation',
  'code',
];

const isDocumentDomain = (
  domain: WorkspaceCommandDomain
): domain is WorkspaceHistoryDocumentDomain =>
  DOCUMENT_DOMAINS.includes(domain as WorkspaceHistoryDocumentDomain);

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        valuesEqual(leftRecord[key], rightRecord[key])
    )
  );
};

const decodePointerSegment = (value: string): string =>
  value.replaceAll('~1', '/').replaceAll('~0', '~');

const collectDocumentIdsFromCommand = (
  command: WorkspaceCommandEnvelope
): WorkspaceDocumentId[] => {
  const documentIds = new Set<WorkspaceDocumentId>();
  if (command.target.documentId) documentIds.add(command.target.documentId);
  [...command.forwardOps, ...command.reverseOps].forEach((operation) => {
    const match = /^\/docsById\/([^/]+)/.exec(operation.path);
    if (match?.[1]) documentIds.add(decodePointerSegment(match[1]));
  });
  return [...documentIds];
};

const reconcileConfirmedWorkspaceCommand = (
  command: WorkspaceCommandEnvelope,
  confirmedSnapshot: WorkspaceSnapshot,
  confirmedDocumentIds: ReadonlySet<WorkspaceDocumentId>
): WorkspaceCommandEnvelope => {
  if (command.target.documentId || !confirmedDocumentIds.size) return command;
  let changed = false;
  const forwardOps = command.forwardOps.map((operation) => {
    if (operation.op !== 'add' && operation.op !== 'replace') return operation;
    const match = /^\/docsById\/([^/]+)$/.exec(operation.path);
    const documentId = match?.[1] ? decodePointerSegment(match[1]) : undefined;
    const document = documentId
      ? confirmedSnapshot.docsById[documentId]
      : undefined;
    if (!documentId || !confirmedDocumentIds.has(documentId) || !document) {
      return operation;
    }
    changed = true;
    return { ...operation, value: document };
  });
  return changed ? { ...command, forwardOps } : command;
};

export const getWorkspaceOperationId = (
  operation: WorkspaceOperation
): string =>
  operation.kind === 'command'
    ? operation.command.id
    : operation.transaction.id;

export const getWorkspaceOperationIssuedAt = (
  operation: WorkspaceOperation
): string =>
  operation.kind === 'command'
    ? operation.command.issuedAt
    : operation.transaction.issuedAt;

export const getWorkspaceOperationMergeKey = (
  operation: WorkspaceOperation
): string | undefined =>
  operation.kind === 'command'
    ? operation.command.mergeKey
    : operation.transaction.mergeKey;

export const getWorkspaceOperationCommands = (
  operation: WorkspaceOperation
): readonly WorkspaceCommandEnvelope[] =>
  operation.kind === 'command'
    ? [operation.command]
    : operation.transaction.commands;

export const getWorkspaceOperationSourceIds = (
  operation: WorkspaceOperation
): string[] =>
  operation.sourceOperationIds ?? [getWorkspaceOperationId(operation)];

export const createWorkspaceCommandOperation = (
  command: WorkspaceCommandEnvelope
): WorkspaceOperation => ({ kind: 'command', command });

export const createWorkspaceTransactionOperation = (
  transaction: WorkspaceTransactionEnvelope
): WorkspaceOperation => ({ kind: 'transaction', transaction });

export const resolveWorkspaceCommandScope = (
  command: WorkspaceCommandEnvelope
): WorkspaceHistoryScope => {
  const domain = resolveWorkspaceCommandDomain(command);
  if (command.target.documentId && isDocumentDomain(domain)) {
    return {
      kind: 'document',
      workspaceId: command.target.workspaceId,
      documentId: command.target.documentId,
      domain,
    };
  }
  if (domain === 'route' || command.target.routeNodeId) {
    return { kind: 'route', workspaceId: command.target.workspaceId };
  }
  return { kind: 'workspace', workspaceId: command.target.workspaceId };
};

export const workspaceHistoryScopesEqual = (
  left: WorkspaceHistoryScope,
  right: WorkspaceHistoryScope
): boolean => {
  if (left.kind !== right.kind || left.workspaceId !== right.workspaceId) {
    return false;
  }
  if (left.kind === 'document' && right.kind === 'document') {
    return left.documentId === right.documentId && left.domain === right.domain;
  }
  return true;
};

export const dedupeWorkspaceHistoryScopes = (
  scopes: readonly WorkspaceHistoryScope[]
): WorkspaceHistoryScope[] =>
  scopes.filter(
    (scope, index) =>
      scopes.findIndex((candidate) =>
        workspaceHistoryScopesEqual(scope, candidate)
      ) === index
  );

export const resolveWorkspaceOperationAffectedScopes = (
  operation: WorkspaceOperation
): WorkspaceHistoryScope[] =>
  dedupeWorkspaceHistoryScopes(
    getWorkspaceOperationCommands(operation).map(resolveWorkspaceCommandScope)
  );

export const resolveWorkspaceOperationScope = (
  operation: WorkspaceOperation
): WorkspaceHistoryScope => {
  const affectedScopes = resolveWorkspaceOperationAffectedScopes(operation);
  const firstScope = affectedScopes[0];
  if (
    firstScope &&
    affectedScopes.every((scope) =>
      workspaceHistoryScopesEqual(firstScope, scope)
    )
  ) {
    return firstScope;
  }
  const workspaceId =
    operation.kind === 'command'
      ? operation.command.target.workspaceId
      : operation.transaction.workspaceId;
  return { kind: 'workspace', workspaceId };
};

export const collectWorkspaceOperationDocumentIds = (
  operation: WorkspaceOperation
): WorkspaceDocumentId[] => [
  ...new Set(
    getWorkspaceOperationCommands(operation).flatMap(
      collectDocumentIdsFromCommand
    )
  ),
];

export const collectChangedWorkspaceDocumentIds = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): WorkspaceDocumentId[] => {
  const documentIds = new Set([
    ...Object.keys(before.docsById),
    ...Object.keys(after.docsById),
  ]);
  return [...documentIds].filter(
    (documentId) =>
      !valuesEqual(before.docsById[documentId], after.docsById[documentId])
  );
};

/** Reconciles confirmed document metadata into workspace-level patch values. */
export const reconcileWorkspaceOperationConfirmation = (
  operation: WorkspaceOperation,
  confirmedSnapshot: WorkspaceSnapshot,
  confirmedDocumentIds: readonly WorkspaceDocumentId[]
): WorkspaceOperation => {
  const documentIds = new Set(confirmedDocumentIds);
  if (operation.kind === 'command') {
    const command = reconcileConfirmedWorkspaceCommand(
      operation.command,
      confirmedSnapshot,
      documentIds
    );
    return command === operation.command
      ? operation
      : { ...operation, command };
  }
  const commands = operation.transaction.commands.map((command) =>
    reconcileConfirmedWorkspaceCommand(command, confirmedSnapshot, documentIds)
  );
  return commands.every(
    (command, index) => command === operation.transaction.commands[index]
  )
    ? operation
    : {
        ...operation,
        transaction: { ...operation.transaction, commands },
      };
};
