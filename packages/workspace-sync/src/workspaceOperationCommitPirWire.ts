import { projectPirPatchValueToWire } from '@prodivix/pir/wire';
import {
  encodeWorkspaceDocument,
  isPirWorkspaceDocumentType,
  type WorkspaceCommandEnvelope,
  type WorkspaceDocument,
  type WorkspaceOperation,
  type WorkspacePatchOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { parsePointer } from './workspaceOperationCommitWire';

const isWorkspaceDocument = (value: unknown): value is WorkspaceDocument =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { type?: unknown }).type === 'string'
  );

const resolveDocument = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  documentId: string
): WorkspaceDocument | undefined =>
  before.docsById[documentId] ?? after.docsById[documentId];

const projectWorkspacePatchValue = (
  operation: WorkspacePatchOperation,
  command: WorkspaceCommandEnvelope,
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): WorkspacePatchOperation => {
  if (!Object.hasOwn(operation, 'value')) return operation;

  if (command.target.documentId) {
    const document = resolveDocument(before, after, command.target.documentId);
    if (!document || !isPirWorkspaceDocumentType(document.type)) {
      return operation;
    }
    return {
      ...operation,
      value: projectPirPatchValueToWire(operation.path, operation.value),
    };
  }

  const segments = parsePointer(operation.path);
  if (segments?.[0] !== 'docsById' || !segments[1]) return operation;
  const documentId = segments[1];
  if (segments.length === 2 && isWorkspaceDocument(operation.value)) {
    return isPirWorkspaceDocumentType(operation.value.type)
      ? { ...operation, value: encodeWorkspaceDocument(operation.value) }
      : operation;
  }

  if (segments[2] !== 'content') return operation;
  const document = resolveDocument(before, after, documentId);
  if (!document || !isPirWorkspaceDocumentType(document.type)) {
    return operation;
  }
  const pirPath =
    segments.length === 3
      ? ''
      : `/${segments
          .slice(3)
          .map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1'))
          .join('/')}`;
  return {
    ...operation,
    value: projectPirPatchValueToWire(pirPath, operation.value),
  };
};

const projectCommand = (
  command: WorkspaceCommandEnvelope,
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): WorkspaceCommandEnvelope => ({
  ...command,
  forwardOps: command.forwardOps.map((operation) =>
    projectWorkspacePatchValue(operation, command, before, after)
  ),
  reverseOps: command.reverseOps.map((operation) =>
    projectWorkspacePatchValue(operation, command, before, after)
  ),
});

/** Projects a commit DTO; callers must retain the separate domain operation. */
export const projectWorkspaceOperationToCommitWire = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceOperation =>
  operation.kind === 'command'
    ? {
        ...operation,
        command: projectCommand(operation.command, before, after),
      }
    : {
        ...operation,
        transaction: {
          ...operation.transaction,
          commands: operation.transaction.commands.map((command) =>
            projectCommand(command, before, after)
          ),
        },
      };
