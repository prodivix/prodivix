import {
  WorkspaceCodecError,
  type DecodedWorkspaceMutation,
  type WorkspaceDocument,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { jsonValuesEqual } from './jsonValue';
import {
  analyzeWorkspaceAuthoringDelta,
  workspaceDocumentAuthoringState,
  workspaceDocumentMetadataAuthoringState,
  workspaceTreeAuthoringState,
} from './workspaceAuthoringDelta';
import {
  applyPersistentWorkspaceOperation,
  planWorkspaceOperationCommit,
} from './workspaceOperationCommit';

type DocumentDelta = {
  contentChanged: boolean;
  metadataChanged: boolean;
  expected: WorkspaceDocument;
};

const requireExactRevision = (
  actual: number,
  expected: number,
  path: string
): void => {
  if (actual !== expected) {
    throw new WorkspaceCodecError(
      path,
      `Expected revision ${expected}, received ${actual}.`
    );
  }
};

const requireNonEmptyOptionalArray = (
  source: Record<string, unknown>,
  field: 'updatedDocuments' | 'removedDocumentIds'
): void => {
  if (Object.hasOwn(source, field) && Array.isArray(source[field])) {
    if ((source[field] as unknown[]).length === 0) {
      throw new WorkspaceCodecError(
        `/mutation/${field}`,
        'Optional aggregate delta arrays must be omitted instead of empty.'
      );
    }
  }
};

/** Proves that an Atomic Commit acknowledgement is the exact durable delta. */
export const validateWorkspaceOperationCommitMutation = (
  source: Record<string, unknown>,
  mutation: DecodedWorkspaceMutation,
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
): void => {
  requireNonEmptyOptionalArray(source, 'updatedDocuments');
  requireNonEmptyOptionalArray(source, 'removedDocumentIds');

  const plan = planWorkspaceOperationCommit(workspace, operation);
  if (!plan.ok) {
    throw new WorkspaceCodecError(
      '/operation',
      plan.issues[0]?.message ||
        'WorkspaceOperation cannot be planned from its confirmed base snapshot.'
    );
  }
  const expectedSnapshot = applyPersistentWorkspaceOperation(
    workspace,
    operation
  );
  if (!expectedSnapshot) {
    throw new WorkspaceCodecError(
      '/operation',
      'WorkspaceOperation cannot be applied to its confirmed base snapshot.'
    );
  }

  const updatedById = new Map(
    mutation.updatedDocuments.map((document) => [document.id, document])
  );
  const removedIds = new Set(mutation.removedDocumentIds);
  if (mutation.opSeq <= workspace.opSeq) {
    throw new WorkspaceCodecError(
      '/mutation/opSeq',
      'Atomic commit opSeq must advance beyond the confirmed base snapshot.'
    );
  }
  const unseenCommitCount = mutation.opSeq - workspace.opSeq - 1;
  if (removedIds.size !== mutation.removedDocumentIds.length) {
    throw new WorkspaceCodecError(
      '/mutation/removedDocumentIds',
      'Removed document ids must be unique.'
    );
  }
  for (const documentId of removedIds) {
    if (updatedById.has(documentId)) {
      throw new WorkspaceCodecError(
        '/mutation',
        `Document ${documentId} cannot be updated and removed in one aggregate delta.`
      );
    }
  }

  const authoringDelta = analyzeWorkspaceAuthoringDelta(
    workspace,
    expectedSnapshot
  );
  const expectedUpdated = new Map<string, DocumentDelta>();
  const expectedRemoved = new Set<string>();
  for (const documentDelta of authoringDelta.documents) {
    const { documentId, before, after } = documentDelta;
    if (documentDelta.kind === 'add' && after) {
      expectedUpdated.set(documentId, {
        contentChanged: true,
        metadataChanged: true,
        expected: after,
      });
      continue;
    }
    if (documentDelta.kind === 'delete') {
      expectedRemoved.add(documentId);
      continue;
    }
    if (!before || !after) continue;
    if (before.type !== after.type) {
      throw new WorkspaceCodecError(
        `/operation/docsById/${documentId}/type`,
        'WorkspaceOperation cannot change a document type in place.'
      );
    }
    expectedUpdated.set(documentId, {
      contentChanged: documentDelta.contentChanged,
      metadataChanged: documentDelta.metadataChanged,
      expected: after,
    });
  }

  if (
    updatedById.size !== expectedUpdated.size ||
    removedIds.size !== expectedRemoved.size
  ) {
    throw new WorkspaceCodecError(
      '/mutation',
      'Aggregate document delta does not match the committed WorkspaceOperation.'
    );
  }
  for (const documentId of expectedRemoved) {
    if (!removedIds.has(documentId)) {
      throw new WorkspaceCodecError(
        '/mutation/removedDocumentIds',
        `Missing removed document ${documentId}.`
      );
    }
  }
  for (const [documentId, expectedDelta] of expectedUpdated) {
    const actual = updatedById.get(documentId);
    if (!actual) {
      throw new WorkspaceCodecError(
        '/mutation/updatedDocuments',
        `Missing updated document ${documentId}.`
      );
    }
    if (
      actual.id !== expectedDelta.expected.id ||
      actual.type !== expectedDelta.expected.type
    ) {
      throw new WorkspaceCodecError(
        `/mutation/updatedDocuments/${documentId}`,
        'Updated document identity or type does not match the committed operation.'
      );
    }
    const before = workspace.docsById[documentId];
    if (!before) {
      if (
        !jsonValuesEqual(
          workspaceDocumentAuthoringState(actual),
          workspaceDocumentAuthoringState(expectedDelta.expected)
        )
      ) {
        throw new WorkspaceCodecError(
          `/mutation/updatedDocuments/${documentId}`,
          'Created document does not match the committed authoring state.'
        );
      }
      requireExactRevision(
        actual.contentRev,
        1,
        `/mutation/updatedDocuments/${documentId}/contentRev`
      );
      requireExactRevision(
        actual.metaRev,
        1,
        `/mutation/updatedDocuments/${documentId}/metaRev`
      );
    } else {
      if (
        expectedDelta.contentChanged &&
        !jsonValuesEqual(actual.content, expectedDelta.expected.content)
      ) {
        throw new WorkspaceCodecError(
          `/mutation/updatedDocuments/${documentId}/content`,
          'Updated document content does not match the committed operation.'
        );
      }
      if (
        expectedDelta.metadataChanged &&
        !jsonValuesEqual(
          workspaceDocumentMetadataAuthoringState(actual),
          workspaceDocumentMetadataAuthoringState(expectedDelta.expected)
        )
      ) {
        throw new WorkspaceCodecError(
          `/mutation/updatedDocuments/${documentId}`,
          'Updated document metadata does not match the committed operation.'
        );
      }
      if (expectedDelta.contentChanged) {
        requireExactRevision(
          actual.contentRev,
          before.contentRev + 1,
          `/mutation/updatedDocuments/${documentId}/contentRev`
        );
      } else {
        const revisionDelta = actual.contentRev - before.contentRev;
        const stateChanged = !jsonValuesEqual(actual.content, before.content);
        if (
          revisionDelta < 0 ||
          revisionDelta > unseenCommitCount ||
          (stateChanged && revisionDelta === 0)
        ) {
          throw new WorkspaceCodecError(
            `/mutation/updatedDocuments/${documentId}/contentRev`,
            'Unscoped document content must advance its revision within the observed operation sequence gap.'
          );
        }
      }
      if (expectedDelta.metadataChanged) {
        requireExactRevision(
          actual.metaRev,
          before.metaRev + 1,
          `/mutation/updatedDocuments/${documentId}/metaRev`
        );
      } else {
        const revisionDelta = actual.metaRev - before.metaRev;
        const stateChanged = !jsonValuesEqual(
          workspaceDocumentMetadataAuthoringState(actual),
          workspaceDocumentMetadataAuthoringState(before)
        );
        if (
          revisionDelta < 0 ||
          revisionDelta > unseenCommitCount ||
          (stateChanged && revisionDelta === 0)
        ) {
          throw new WorkspaceCodecError(
            `/mutation/updatedDocuments/${documentId}/metaRev`,
            'Unscoped document metadata must advance its revision within the observed operation sequence gap.'
          );
        }
      }
    }
    if (!actual.updatedAt) {
      throw new WorkspaceCodecError(
        `/mutation/updatedDocuments/${documentId}/updatedAt`,
        'Atomic document deltas require the server update timestamp.'
      );
    }
  }

  const treeChanged = authoringDelta.treeChanged;
  if (treeChanged !== (mutation.tree !== undefined)) {
    throw new WorkspaceCodecError(
      '/mutation/tree',
      treeChanged
        ? 'Missing committed workspace tree delta.'
        : 'Unexpected workspace tree delta.'
    );
  }
  if (
    mutation.tree &&
    !jsonValuesEqual(
      mutation.tree,
      workspaceTreeAuthoringState(expectedSnapshot)
    )
  ) {
    throw new WorkspaceCodecError(
      '/mutation/tree',
      'Workspace tree delta does not match the committed operation.'
    );
  }
  const routeChanged = authoringDelta.routeChanged;
  if (routeChanged !== (mutation.routeManifest !== undefined)) {
    throw new WorkspaceCodecError(
      '/mutation/routeManifest',
      routeChanged
        ? 'Missing committed route manifest delta.'
        : 'Unexpected route manifest delta.'
    );
  }
  if (
    mutation.routeManifest &&
    !jsonValuesEqual(mutation.routeManifest, expectedSnapshot.routeManifest)
  ) {
    throw new WorkspaceCodecError(
      '/mutation/routeManifest',
      'Route manifest delta does not match the committed operation.'
    );
  }
  if (!authoringDelta.hasDurableDelta) {
    throw new WorkspaceCodecError(
      '/mutation',
      'Expected at least one durable workspace, route, or document delta.'
    );
  }

  const expectedWorkspaceRev =
    workspace.workspaceRev + (authoringDelta.workspaceChanged ? 1 : 0);
  if (plan.request.expected.workspaceRev !== undefined) {
    requireExactRevision(
      mutation.workspaceRev,
      expectedWorkspaceRev,
      '/mutation/workspaceRev'
    );
  } else if (
    mutation.workspaceRev - workspace.workspaceRev < 0 ||
    mutation.workspaceRev - workspace.workspaceRev > unseenCommitCount
  ) {
    throw new WorkspaceCodecError(
      '/mutation/workspaceRev',
      'An unscoped workspace revision exceeds the observed operation sequence gap.'
    );
  }

  const expectedRouteRev = workspace.routeRev + (routeChanged ? 1 : 0);
  if (plan.request.expected.routeRev !== undefined) {
    requireExactRevision(
      mutation.routeRev,
      expectedRouteRev,
      '/mutation/routeRev'
    );
  } else if (
    mutation.routeRev - workspace.routeRev < 0 ||
    mutation.routeRev - workspace.routeRev > unseenCommitCount
  ) {
    throw new WorkspaceCodecError(
      '/mutation/routeRev',
      'An unscoped route revision exceeds the observed operation sequence gap.'
    );
  }
};
