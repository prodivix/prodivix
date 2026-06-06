import type { StableWorkspaceSnapshot, WorkspaceDocumentId } from './types';
import {
  applyWorkspaceCommand,
  type WorkspaceCommandApplyResult,
  type WorkspaceCommandDomain,
  type WorkspaceCommandEnvelope,
  type WorkspaceCommandIssue,
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

export type WorkspaceHistoryEntry = {
  id: string;
  command: WorkspaceCommandEnvelope;
  scope: WorkspaceHistoryScope;
  transactionId?: string;
  appliedAt: string;
};

export type WorkspaceHistoryState = {
  undoStack: WorkspaceHistoryEntry[];
  redoStack: WorkspaceHistoryEntry[];
};

export type WorkspaceHistoryIssueCode =
  | 'WKS_HISTORY_ENTRY_NOT_FOUND'
  | 'WKS_HISTORY_COMMAND_FAILED';

export type WorkspaceHistoryIssue = {
  code: WorkspaceHistoryIssueCode;
  message: string;
  commandIssues?: WorkspaceCommandIssue[];
};

export type WorkspaceHistoryResult =
  | {
      ok: true;
      snapshot: StableWorkspaceSnapshot;
      history: WorkspaceHistoryState;
      entry: WorkspaceHistoryEntry;
    }
  | {
      ok: false;
      issues: WorkspaceHistoryIssue[];
    };

const DOCUMENT_DOMAINS: WorkspaceHistoryDocumentDomain[] = [
  'pir',
  'nodegraph',
  'animation',
  'code',
];

const inferCommandDomain = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandDomain => {
  if (command.domainHint) return command.domainHint;
  if (command.namespace.startsWith('core.nodegraph')) return 'nodegraph';
  if (command.namespace.startsWith('core.animation')) return 'animation';
  if (command.namespace.startsWith('core.code')) return 'code';
  if (
    command.namespace.startsWith('core.route') ||
    command.target.routeNodeId
  ) {
    return 'route';
  }
  if (command.namespace.startsWith('core.workspace')) return 'workspace';
  return 'pir';
};

const toDocumentDomain = (
  domain: WorkspaceCommandDomain
): WorkspaceHistoryDocumentDomain =>
  DOCUMENT_DOMAINS.includes(domain as WorkspaceHistoryDocumentDomain)
    ? (domain as WorkspaceHistoryDocumentDomain)
    : 'pir';

const reverseCommand = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandEnvelope => ({
  ...command,
  id: `${command.id}:undo`,
  forwardOps: command.reverseOps,
  reverseOps: command.forwardOps,
});

const isCommandApplyFailure = (
  result: WorkspaceCommandApplyResult
): result is Extract<WorkspaceCommandApplyResult, { ok: false }> =>
  result.ok === false;

const findLastMatchingEntryIndex = (
  entries: WorkspaceHistoryEntry[],
  scope: WorkspaceHistoryScope
): number => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (workspaceHistoryScopesEqual(entries[index].scope, scope)) return index;
  }
  return -1;
};

const removeEntryAt = (
  entries: WorkspaceHistoryEntry[],
  index: number
): [WorkspaceHistoryEntry, WorkspaceHistoryEntry[]] => [
  entries[index],
  entries.filter((_, entryIndex) => entryIndex !== index),
];

export const createWorkspaceHistoryState = (): WorkspaceHistoryState => ({
  undoStack: [],
  redoStack: [],
});

export const resolveWorkspaceCommandScope = (
  command: WorkspaceCommandEnvelope
): WorkspaceHistoryScope => {
  const domain = inferCommandDomain(command);
  if (command.target.documentId) {
    return {
      kind: 'document',
      workspaceId: command.target.workspaceId,
      documentId: command.target.documentId,
      domain: toDocumentDomain(domain),
    };
  }

  if (domain === 'route' || command.target.routeNodeId) {
    return {
      kind: 'route',
      workspaceId: command.target.workspaceId,
    };
  }

  return {
    kind: 'workspace',
    workspaceId: command.target.workspaceId,
  };
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

export const pushWorkspaceHistoryEntry = (
  history: WorkspaceHistoryState,
  entry:
    | WorkspaceHistoryEntry
    | {
        command: WorkspaceCommandEnvelope;
        transactionId?: string;
        appliedAt?: string;
      }
): WorkspaceHistoryState => {
  const historyEntry: WorkspaceHistoryEntry =
    'scope' in entry
      ? entry
      : {
          id: entry.command.id,
          command: entry.command,
          scope: resolveWorkspaceCommandScope(entry.command),
          transactionId: entry.transactionId,
          appliedAt: entry.appliedAt ?? entry.command.issuedAt,
        };

  return {
    undoStack: [...history.undoStack, historyEntry],
    redoStack: history.redoStack.filter(
      (redoEntry) =>
        !workspaceHistoryScopesEqual(redoEntry.scope, historyEntry.scope)
    ),
  };
};

export const canUndoWorkspaceHistory = (
  history: WorkspaceHistoryState,
  scope: WorkspaceHistoryScope
): boolean => findLastMatchingEntryIndex(history.undoStack, scope) >= 0;

export const canRedoWorkspaceHistory = (
  history: WorkspaceHistoryState,
  scope: WorkspaceHistoryScope
): boolean => findLastMatchingEntryIndex(history.redoStack, scope) >= 0;

export const undoWorkspaceHistory = (
  snapshot: StableWorkspaceSnapshot,
  history: WorkspaceHistoryState,
  scope: WorkspaceHistoryScope
): WorkspaceHistoryResult => {
  const entryIndex = findLastMatchingEntryIndex(history.undoStack, scope);
  if (entryIndex < 0) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_ENTRY_NOT_FOUND',
          message: 'No undo history entry matches the requested scope.',
        },
      ],
    };
  }

  const [entry, nextUndoStack] = removeEntryAt(history.undoStack, entryIndex);
  const commandResult = applyWorkspaceCommand(
    snapshot,
    reverseCommand(entry.command)
  );

  if (isCommandApplyFailure(commandResult)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_COMMAND_FAILED',
          message: 'Undo command failed to apply.',
          commandIssues: commandResult.issues,
        },
      ],
    };
  }

  return {
    ok: true,
    snapshot: commandResult.snapshot,
    history: {
      undoStack: nextUndoStack,
      redoStack: [...history.redoStack, entry],
    },
    entry,
  };
};

export const redoWorkspaceHistory = (
  snapshot: StableWorkspaceSnapshot,
  history: WorkspaceHistoryState,
  scope: WorkspaceHistoryScope
): WorkspaceHistoryResult => {
  const entryIndex = findLastMatchingEntryIndex(history.redoStack, scope);
  if (entryIndex < 0) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_ENTRY_NOT_FOUND',
          message: 'No redo history entry matches the requested scope.',
        },
      ],
    };
  }

  const [entry, nextRedoStack] = removeEntryAt(history.redoStack, entryIndex);
  const commandResult = applyWorkspaceCommand(snapshot, entry.command);

  if (isCommandApplyFailure(commandResult)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_HISTORY_COMMAND_FAILED',
          message: 'Redo command failed to apply.',
          commandIssues: commandResult.issues,
        },
      ],
    };
  }

  return {
    ok: true,
    snapshot: commandResult.snapshot,
    history: {
      undoStack: [...history.undoStack, entry],
      redoStack: nextRedoStack,
    },
    entry,
  };
};
