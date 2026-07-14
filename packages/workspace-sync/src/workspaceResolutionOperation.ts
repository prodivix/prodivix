import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceCommandOperation,
  createWorkspaceTransactionOperation,
  type WorkspaceCommandDomain,
  type WorkspaceCommandEnvelope,
  type WorkspaceDocument,
  type WorkspaceOperation,
  type WorkspacePatchOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  appendJsonPointer,
  cloneJsonValue,
  isRecord,
  semanticJsonValuesEqual,
  type JsonValueState,
} from './jsonValue';
import { diffWorkspaceSnapshots } from './workspaceSemanticDiff';
import type { WorkspaceConflictSession } from './workspaceConflictSession';

export type CreateWorkspaceResolutionOperationInput = {
  remoteSnapshot: WorkspaceSnapshot;
  resolvedSnapshot: WorkspaceSnapshot;
  operationId: string;
  issuedAt: string;
  label?: string;
  sourceOperationIds?: string[];
};

export type WorkspaceResolutionOperationIssue = {
  code:
    | 'WKS_SYNC_WORKSPACE_MISMATCH'
    | 'WKS_SYNC_CONFLICTS_UNRESOLVED'
    | 'WKS_SYNC_RESOLUTION_OPERATION_INVALID'
    | 'WKS_SYNC_RESOLUTION_PATH_UNSUPPORTED';
  path: string;
  message: string;
  documentId?: string;
};

export type WorkspaceResolutionOperationResult =
  | { ok: true; operation: WorkspaceOperation | null }
  | { ok: false; issues: WorkspaceResolutionOperationIssue[] };

export type CreateWorkspaceConflictResolutionOperationInput = {
  session: WorkspaceConflictSession;
  operationId: string;
  issuedAt: string;
  label?: string;
};

type CommandDraft = {
  key: string;
  namespace: string;
  type: string;
  domainHint: WorkspaceCommandDomain;
  target: WorkspaceCommandEnvelope['target'];
  forwardOps: WorkspacePatchOperation[];
  reverseOps: WorkspacePatchOperation[];
};

const state = (record: Record<string, unknown>, key: string): JsonValueState =>
  Object.hasOwn(record, key)
    ? { present: true, value: record[key] }
    : { present: false };

const createPatchPair = (
  path: string,
  before: JsonValueState,
  after: JsonValueState
): {
  forward: WorkspacePatchOperation;
  reverse: WorkspacePatchOperation;
} | null => {
  if (
    before.present === after.present &&
    (!before.present ||
      (after.present &&
        semanticJsonValuesEqual(before.value, after.value, path)))
  ) {
    return null;
  }
  if (!before.present && after.present) {
    return {
      forward: { op: 'add', path, value: cloneJsonValue(after.value) },
      reverse: { op: 'remove', path },
    };
  }
  if (before.present && !after.present) {
    return {
      forward: { op: 'remove', path },
      reverse: { op: 'add', path, value: cloneJsonValue(before.value) },
    };
  }
  if (before.present && after.present) {
    return {
      forward: { op: 'replace', path, value: cloneJsonValue(after.value) },
      reverse: { op: 'replace', path, value: cloneJsonValue(before.value) },
    };
  }
  return null;
};

const addPatchPair = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  pair: ReturnType<typeof createPatchPair>
) => {
  if (!pair) return;
  forwardOps.push(pair.forward);
  reverseOps.unshift(pair.reverse);
};

const createFreshDocumentIdentity = (
  document: WorkspaceDocument
): WorkspaceDocument => {
  const fresh = cloneJsonValue(document) as WorkspaceDocument;
  fresh.contentRev = 1;
  fresh.metaRev = 1;
  delete fresh.updatedAt;
  return fresh;
};

const createWorkspaceDraft = (
  remote: WorkspaceSnapshot,
  resolved: WorkspaceSnapshot
): CommandDraft | null => {
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  addPatchPair(
    forwardOps,
    reverseOps,
    createPatchPair(
      '/treeRootId',
      { present: true, value: remote.treeRootId },
      { present: true, value: resolved.treeRootId }
    )
  );
  addPatchPair(
    forwardOps,
    reverseOps,
    createPatchPair(
      '/treeById',
      { present: true, value: remote.treeById },
      { present: true, value: resolved.treeById }
    )
  );

  const documentIds = new Set([
    ...Object.keys(remote.docsById),
    ...Object.keys(resolved.docsById),
  ]);
  [...documentIds].sort().forEach((documentId) => {
    const remoteDocument = remote.docsById[documentId];
    const resolvedDocument = resolved.docsById[documentId];
    const documentPath = appendJsonPointer('/docsById', documentId);
    if (!remoteDocument || !resolvedDocument) {
      addPatchPair(
        forwardOps,
        reverseOps,
        createPatchPair(
          documentPath,
          remoteDocument
            ? { present: true, value: remoteDocument }
            : { present: false },
          resolvedDocument
            ? {
                present: true,
                value: remoteDocument
                  ? resolvedDocument
                  : createFreshDocumentIdentity(resolvedDocument),
              }
            : { present: false }
        )
      );
      return;
    }
    const remoteMetadata: Record<string, unknown> = {
      type: remoteDocument.type,
      ...(remoteDocument.name === undefined
        ? {}
        : { name: remoteDocument.name }),
      path: remoteDocument.path,
      ...(remoteDocument.capabilities === undefined
        ? {}
        : { capabilities: remoteDocument.capabilities }),
    };
    const resolvedMetadata: Record<string, unknown> = {
      type: resolvedDocument.type,
      ...(resolvedDocument.name === undefined
        ? {}
        : { name: resolvedDocument.name }),
      path: resolvedDocument.path,
      ...(resolvedDocument.capabilities === undefined
        ? {}
        : { capabilities: resolvedDocument.capabilities }),
    };
    ['name', 'path', 'capabilities'].forEach((field) =>
      addPatchPair(
        forwardOps,
        reverseOps,
        createPatchPair(
          appendJsonPointer(documentPath, field),
          state(remoteMetadata, field),
          state(resolvedMetadata, field)
        )
      )
    );
  });
  if (!forwardOps.length) return null;
  return {
    key: 'workspace',
    namespace: 'core.workspace-sync',
    type: 'resolution.workspace.apply',
    domainHint: 'workspace',
    target: { workspaceId: remote.id },
    forwardOps,
    reverseOps,
  };
};

const documentDomain = (
  document: WorkspaceDocument
): WorkspaceCommandDomain | null => {
  if (
    document.type === 'pir-page' ||
    document.type === 'pir-layout' ||
    document.type === 'pir-component'
  ) {
    return 'pir';
  }
  if (document.type === 'pir-graph') return 'nodegraph';
  if (document.type === 'pir-animation') return 'animation';
  if (document.type === 'code') return 'code';
  if (document.type === 'asset' || document.type === 'project-config') {
    return 'resource';
  }
  return null;
};

const allowedContentPaths = (document: WorkspaceDocument): string[] | null => {
  if (
    document.type === 'pir-page' ||
    document.type === 'pir-layout' ||
    document.type === 'pir-component'
  ) {
    return ['/componentContract', '/ui/graph', '/logic', '/metadata'];
  }
  if (document.type === 'pir-graph') {
    return ['/nodes', '/edges'];
  }
  if (document.type === 'pir-animation') {
    return ['/target', '/timelines', '/svgFilters', '/x-animationEditor'];
  }
  if (document.type === 'code') return ['/language', '/source', '/metadata'];
  if (document.type === 'project-config') return ['/value', '/metadata'];
  if (document.type === 'asset') {
    return ['/mime', '/category', '/size', '/dataUrl', '/text', '/metadata'];
  }
  return null;
};

const contentStateAtPath = (
  content: Record<string, unknown>,
  path: string
): JsonValueState => {
  if (path === '/ui/graph') {
    const ui = content.ui;
    return isRecord(ui) && Object.hasOwn(ui, 'graph')
      ? { present: true, value: ui.graph }
      : { present: false };
  }
  return state(content, path.slice(1));
};

const createDocumentDraft = (
  remoteDocument: WorkspaceDocument,
  resolvedDocument: WorkspaceDocument
):
  | { ok: true; draft: CommandDraft | null }
  | { ok: false; issue: WorkspaceResolutionOperationIssue } => {
  if (remoteDocument.type !== resolvedDocument.type) {
    return {
      ok: false,
      issue: {
        code: 'WKS_SYNC_RESOLUTION_PATH_UNSUPPORTED',
        path: `/docsById/${remoteDocument.id}/type`,
        message: 'Conflict recovery cannot change a document type in place.',
        documentId: remoteDocument.id,
      },
    };
  }
  if (
    semanticJsonValuesEqual(
      remoteDocument.content,
      resolvedDocument.content,
      ''
    )
  ) {
    return { ok: true, draft: null };
  }
  const domainHint = documentDomain(resolvedDocument);
  const paths = allowedContentPaths(resolvedDocument);
  if (
    !domainHint ||
    !paths ||
    !isRecord(remoteDocument.content) ||
    !isRecord(resolvedDocument.content)
  ) {
    return {
      ok: false,
      issue: {
        code: 'WKS_SYNC_RESOLUTION_PATH_UNSUPPORTED',
        path: `/docsById/${remoteDocument.id}/content`,
        message: 'This document type has no command-safe recovery paths.',
        documentId: remoteDocument.id,
      },
    };
  }
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  paths.forEach((path) =>
    addPatchPair(
      forwardOps,
      reverseOps,
      createPatchPair(
        path,
        contentStateAtPath(
          remoteDocument.content as Record<string, unknown>,
          path
        ),
        contentStateAtPath(
          resolvedDocument.content as Record<string, unknown>,
          path
        )
      )
    )
  );
  const knownRootKeys = new Set(
    paths.map((path) => (path === '/ui/graph' ? 'ui' : path.slice(1)))
  );
  knownRootKeys.add('version');
  const extensionKeys = new Set(
    [
      ...Object.keys(remoteDocument.content),
      ...Object.keys(resolvedDocument.content),
    ].filter((key) => key.startsWith('x-'))
  );
  extensionKeys.forEach((key) => {
    knownRootKeys.add(key);
    const path = appendJsonPointer('', key);
    addPatchPair(
      forwardOps,
      reverseOps,
      createPatchPair(
        path,
        state(remoteDocument.content as Record<string, unknown>, key),
        state(resolvedDocument.content as Record<string, unknown>, key)
      )
    );
  });
  const unsupportedKey = [
    ...Object.keys(remoteDocument.content),
    ...Object.keys(resolvedDocument.content),
  ].find(
    (key) =>
      !knownRootKeys.has(key) &&
      !semanticJsonValuesEqual(
        (remoteDocument.content as Record<string, unknown>)[key],
        (resolvedDocument.content as Record<string, unknown>)[key],
        appendJsonPointer('', key)
      )
  );
  if (unsupportedKey) {
    return {
      ok: false,
      issue: {
        code: 'WKS_SYNC_RESOLUTION_PATH_UNSUPPORTED',
        path: `/docsById/${remoteDocument.id}/content/${unsupportedKey}`,
        message: 'Resolved content changed outside command-safe paths.',
        documentId: remoteDocument.id,
      },
    };
  }
  if (!forwardOps.length) return { ok: true, draft: null };
  return {
    ok: true,
    draft: {
      key: `document:${resolvedDocument.id}`,
      namespace: `core.${domainHint}`,
      type: 'resolution.document.apply',
      domainHint,
      target: {
        workspaceId: '',
        documentId: resolvedDocument.id,
      },
      forwardOps,
      reverseOps,
    },
  };
};

const createRouteDraft = (
  remote: WorkspaceSnapshot,
  resolved: WorkspaceSnapshot
): CommandDraft | null => {
  const pair = createPatchPair(
    '/routeManifest',
    { present: true, value: remote.routeManifest },
    { present: true, value: resolved.routeManifest }
  );
  if (!pair) return null;
  return {
    key: 'route',
    namespace: 'core.route',
    type: 'resolution.manifest.apply',
    domainHint: 'route',
    target: { workspaceId: remote.id },
    forwardOps: [pair.forward],
    reverseOps: [pair.reverse],
  };
};

const buildCommand = (
  draft: CommandDraft,
  id: string,
  workspaceId: string,
  issuedAt: string,
  label: string
): WorkspaceCommandEnvelope => ({
  id,
  namespace: draft.namespace,
  type: draft.type,
  version: '1.0',
  issuedAt,
  target: { ...draft.target, workspaceId },
  domainHint: draft.domainHint,
  label,
  forwardOps: draft.forwardOps,
  reverseOps: draft.reverseOps,
});

const operationMatchesResolution = (
  remote: WorkspaceSnapshot,
  resolved: WorkspaceSnapshot,
  operation: WorkspaceOperation
): boolean => {
  const applied =
    operation.kind === 'command'
      ? applyWorkspaceCommand(remote, operation.command)
      : applyWorkspaceTransaction(remote, operation.transaction);
  if (!applied.ok) return false;
  const diff = diffWorkspaceSnapshots(applied.snapshot, resolved);
  return diff.ok && diff.changeSet.changes.length === 0;
};

/** Builds fresh, reversible commands relative to the latest remote snapshot. */
export const createWorkspaceResolutionOperation = ({
  remoteSnapshot,
  resolvedSnapshot,
  operationId,
  issuedAt,
  label = 'Resolve revision conflict',
  sourceOperationIds,
}: CreateWorkspaceResolutionOperationInput): WorkspaceResolutionOperationResult => {
  if (remoteSnapshot.id !== resolvedSnapshot.id) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_WORKSPACE_MISMATCH',
          path: '/id',
          message: 'Remote and resolved snapshots must share a workspace id.',
        },
      ],
    };
  }
  if (!operationId.trim() || !issuedAt.trim()) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_RESOLUTION_OPERATION_INVALID',
          path: !operationId.trim() ? '/operationId' : '/issuedAt',
          message: 'Resolution operation id and issuedAt are required.',
        },
      ],
    };
  }
  const issues: WorkspaceResolutionOperationIssue[] = [];
  const drafts: CommandDraft[] = [];
  const workspaceDraft = createWorkspaceDraft(remoteSnapshot, resolvedSnapshot);
  if (workspaceDraft) drafts.push(workspaceDraft);
  const routeDraft = createRouteDraft(remoteSnapshot, resolvedSnapshot);
  if (routeDraft) drafts.push(routeDraft);
  Object.keys(remoteSnapshot.docsById)
    .filter((documentId) => resolvedSnapshot.docsById[documentId])
    .sort()
    .forEach((documentId) => {
      const result = createDocumentDraft(
        remoteSnapshot.docsById[documentId]!,
        resolvedSnapshot.docsById[documentId]!
      );
      if (!result.ok) issues.push(result.issue);
      else if (result.draft) drafts.push(result.draft);
    });
  if (issues.length) return { ok: false, issues };
  if (!drafts.length) return { ok: true, operation: null };
  const commands = drafts.map((draft) =>
    buildCommand(
      draft,
      drafts.length === 1 ? operationId : `${operationId}:${draft.key}`,
      remoteSnapshot.id,
      issuedAt,
      label
    )
  );
  const operation: WorkspaceOperation =
    commands.length === 1
      ? {
          ...createWorkspaceCommandOperation(commands[0]!),
          ...(sourceOperationIds?.length
            ? { sourceOperationIds: [...new Set(sourceOperationIds)] }
            : {}),
        }
      : {
          ...createWorkspaceTransactionOperation({
            id: operationId,
            workspaceId: remoteSnapshot.id,
            issuedAt,
            label,
            commands,
          }),
          ...(sourceOperationIds?.length
            ? { sourceOperationIds: [...new Set(sourceOperationIds)] }
            : {}),
        };
  if (
    !operationMatchesResolution(remoteSnapshot, resolvedSnapshot, operation)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_RESOLUTION_OPERATION_INVALID',
          path: '/',
          message:
            'Generated recovery commands did not reproduce the resolved workspace.',
        },
      ],
    };
  }
  return { ok: true, operation };
};

/** Converts only a fully reviewed session into a causally linked operation. */
export const createWorkspaceConflictResolutionOperation = ({
  session,
  operationId,
  issuedAt,
  label,
}: CreateWorkspaceConflictResolutionOperationInput): WorkspaceResolutionOperationResult => {
  if (session.status !== 'resolved' || !session.resolvedSnapshot) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICTS_UNRESOLVED',
          path: '/unresolvedConflictIds',
          message: 'Every conflict requires an explicit local/remote choice.',
        },
      ],
    };
  }
  const sourceOperationIds = session.sourceOperation
    ? (session.sourceOperation.sourceOperationIds ?? [
        session.sourceOperation.kind === 'command'
          ? session.sourceOperation.command.id
          : session.sourceOperation.transaction.id,
      ])
    : undefined;
  return createWorkspaceResolutionOperation({
    remoteSnapshot: session.remoteSnapshot,
    resolvedSnapshot: session.resolvedSnapshot,
    operationId,
    issuedAt,
    ...(label ? { label } : {}),
    ...(sourceOperationIds ? { sourceOperationIds } : {}),
  });
};
