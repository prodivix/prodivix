import {
  WorkspaceCodecError,
  decodeWorkspaceMutation,
  getWorkspaceOperationId,
  type DecodedWorkspaceMutation,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { validateWorkspaceOperationCommitMutation } from './workspaceOperationCommitResponseValidation';

const COMMIT_RESPONSE_FIELDS = new Set([
  'workspaceId',
  'workspaceRev',
  'routeRev',
  'opSeq',
  'tree',
  'updatedDocuments',
  'removedDocumentIds',
  'routeManifest',
  'acceptedMutationId',
]);

const requireCommitResponseRecord = (
  value: unknown
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkspaceCodecError('/mutation', 'Expected an object.');
  }
  return value as Record<string, unknown>;
};

/** Decodes the strict aggregate response owned by Atomic WorkspaceOperation Commit. */
export const decodeWorkspaceOperationCommitResponse = (
  value: unknown,
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
): DecodedWorkspaceMutation => {
  const source = requireCommitResponseRecord(value);
  const unknownField = Object.keys(source).find(
    (field) => !COMMIT_RESPONSE_FIELDS.has(field)
  );
  if (unknownField) {
    throw new WorkspaceCodecError(
      `/mutation/${unknownField}`,
      'Field is not part of an Atomic WorkspaceOperation Commit response.'
    );
  }

  const mutation = decodeWorkspaceMutation(source, workspace);
  validateWorkspaceOperationCommitMutation(
    source,
    mutation,
    workspace,
    operation
  );
  const operationId = getWorkspaceOperationId(operation);
  if (mutation.acceptedMutationId !== operationId) {
    throw new WorkspaceCodecError(
      '/mutation/acceptedMutationId',
      'Expected the committed command or transaction id.'
    );
  }
  return mutation;
};
