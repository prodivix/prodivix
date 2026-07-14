import {
  validateWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  cloneJsonValue,
  decodeJsonPointerSegment,
  indexStableIdArray,
  isRecord,
  resolveStableIdArrayPair,
  semanticJsonValuesEqual,
  stableIdArrayPointer,
  appendJsonPointer,
  type JsonValueState,
} from './jsonValue';
import {
  diffWorkspaceSnapshots,
  resolveWorkspaceDocumentChangeSemantic,
  type WorkspaceChangeSemantic,
  type WorkspaceChangeSet,
  type WorkspaceChangeTarget,
  type WorkspaceChangeValue,
  type WorkspaceSemanticChange,
} from './workspaceSemanticDiff';
import {
  captureWorkspaceRevisions,
  type WorkspaceRevisions,
} from './workspaceRevisions';
import {
  mergeWorkspaceText,
  type WorkspaceTextConflict,
} from './workspaceTextDiff';

export type WorkspaceConflictResolutionChoice = 'local' | 'remote';

export type WorkspaceMergeConflictKind =
  'value' | 'concurrent-add' | 'delete-modify' | 'structural' | 'text';

export type WorkspaceMergeConflict = {
  id: string;
  kind: WorkspaceMergeConflictKind;
  target: WorkspaceChangeTarget;
  semantic: WorkspaceChangeSemantic;
  base: WorkspaceChangeValue;
  local: WorkspaceChangeValue;
  remote: WorkspaceChangeValue;
  textConflicts?: WorkspaceTextConflict[];
};

export type WorkspaceThreeWayStatus =
  'unchanged' | 'auto-merged' | 'conflicted';

export type WorkspaceThreeWayAnalysis = {
  workspaceId: string;
  status: WorkspaceThreeWayStatus;
  baseRevisions: WorkspaceRevisions;
  remoteRevisions: WorkspaceRevisions;
  localChanges: WorkspaceChangeSet;
  remoteChanges: WorkspaceChangeSet;
  candidateSnapshot: WorkspaceSnapshot;
  conflicts: WorkspaceMergeConflict[];
};

export type WorkspaceThreeWayIssue = {
  code: 'WKS_SYNC_WORKSPACE_MISMATCH' | 'WKS_SYNC_MERGED_SNAPSHOT_INVALID';
  path: string;
  message: string;
  validationIssues?: ReturnType<typeof validateWorkspaceSnapshot>['issues'];
};

export type WorkspaceThreeWayAnalysisResult =
  | { ok: true; analysis: WorkspaceThreeWayAnalysis }
  | { ok: false; issues: WorkspaceThreeWayIssue[] };

export type WorkspaceAutoRebaseResult =
  | {
      ok: true;
      status: 'already-applied' | 'rebased';
      snapshot: WorkspaceSnapshot;
      analysis: WorkspaceThreeWayAnalysis;
    }
  | {
      ok: false;
      status: 'conflicted';
      analysis: WorkspaceThreeWayAnalysis;
    }
  | {
      ok: false;
      status: 'invalid';
      issues: WorkspaceThreeWayIssue[];
    };

type MergeContext = {
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>;
  conflicts: WorkspaceMergeConflict[];
  target: (
    path: string,
    base: WorkspaceChangeValue,
    local: WorkspaceChangeValue,
    remote: WorkspaceChangeValue
  ) => { target: WorkspaceChangeTarget; semantic: WorkspaceChangeSemantic };
  textPath?: string;
};

type MergeResult = JsonValueState;

const absent = (): JsonValueState => ({ present: false });
const present = (
  value: unknown
): Extract<JsonValueState, { present: true }> => ({
  present: true,
  value: cloneJsonValue(value),
});

const statesEqual = (
  left: JsonValueState,
  right: JsonValueState,
  path: string
): boolean =>
  left.present === right.present &&
  (!left.present ||
    (right.present && semanticJsonValuesEqual(left.value, right.value, path)));

const targetIdentity = (target: WorkspaceChangeTarget): string => {
  if (target.kind === 'workspace-tree') return 'workspace-tree';
  if (target.kind === 'route-manifest') return 'route-manifest';
  return `document:${target.documentId}:${target.area}`;
};

const createConflictId = (
  kind: WorkspaceMergeConflictKind,
  target: WorkspaceChangeTarget
): string => `conflict:${kind}:${targetIdentity(target)}:${target.path || '/'}`;

const chooseConflictState = (
  kind: WorkspaceMergeConflictKind,
  path: string,
  base: WorkspaceChangeValue,
  local: WorkspaceChangeValue,
  remote: WorkspaceChangeValue,
  context: MergeContext,
  textConflicts?: WorkspaceTextConflict[]
): MergeResult => {
  const descriptor = context.target(path, base, local, remote);
  const id = createConflictId(kind, descriptor.target);
  const conflict: WorkspaceMergeConflict = {
    id,
    kind,
    target: descriptor.target,
    semantic: descriptor.semantic,
    base: cloneJsonValue(base),
    local: cloneJsonValue(local),
    remote: cloneJsonValue(remote),
    ...(textConflicts?.length
      ? { textConflicts: cloneJsonValue(textConflicts) }
      : {}),
  };
  context.conflicts.push(conflict);
  return cloneJsonValue(context.resolutions[id] === 'local' ? local : remote);
};

const mergeRecordStates = (
  base: Extract<JsonValueState, { present: true }>,
  local: Extract<JsonValueState, { present: true }>,
  remote: Extract<JsonValueState, { present: true }>,
  path: string,
  context: MergeContext
): MergeResult => {
  const baseRecord = base.value as Record<string, unknown>;
  const localRecord = local.value as Record<string, unknown>;
  const remoteRecord = remote.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(localRecord),
    ...Object.keys(remoteRecord),
  ]);
  [...keys].sort().forEach((key) => {
    const next = mergeValueStates(
      Object.hasOwn(baseRecord, key) ? present(baseRecord[key]) : absent(),
      Object.hasOwn(localRecord, key) ? present(localRecord[key]) : absent(),
      Object.hasOwn(remoteRecord, key) ? present(remoteRecord[key]) : absent(),
      appendJsonPointer(path, key),
      context
    );
    if (next.present) result[key] = next.value;
  });
  return present(result);
};

const stableCollection = (value: unknown) => indexStableIdArray(value);

const mergeStableArrayStates = (
  base: Extract<JsonValueState, { present: true }>,
  local: Extract<JsonValueState, { present: true }>,
  remote: Extract<JsonValueState, { present: true }>,
  path: string,
  context: MergeContext
): MergeResult | null => {
  const pair =
    resolveStableIdArrayPair(base.value, local.value, path) ??
    resolveStableIdArrayPair(base.value, remote.value, path) ??
    resolveStableIdArrayPair(local.value, remote.value, path);
  if (!pair) return null;
  const baseCollection = stableCollection(base.value);
  const localCollection = stableCollection(local.value);
  const remoteCollection = stableCollection(remote.value);
  if (!baseCollection || !localCollection || !remoteCollection) return null;
  const resultById = new Map<string, unknown>();
  const collectionPath = stableIdArrayPointer(path);
  const ids = new Set([
    ...baseCollection.order,
    ...localCollection.order,
    ...remoteCollection.order,
  ]);
  [...ids].sort().forEach((id) => {
    const next = mergeValueStates(
      baseCollection.valuesById[id]
        ? present(baseCollection.valuesById[id])
        : absent(),
      localCollection.valuesById[id]
        ? present(localCollection.valuesById[id])
        : absent(),
      remoteCollection.valuesById[id]
        ? present(remoteCollection.valuesById[id])
        : absent(),
      appendJsonPointer(collectionPath, id),
      context
    );
    if (next.present) resultById.set(id, next.value);
  });
  const order = [
    ...remoteCollection.order,
    ...localCollection.order,
    ...baseCollection.order,
  ].filter((id, index, all) => all.indexOf(id) === index);
  return present(
    order.filter((id) => resultById.has(id)).map((id) => resultById.get(id))
  );
};

const mergeValueStates = (
  base: WorkspaceChangeValue,
  local: WorkspaceChangeValue,
  remote: WorkspaceChangeValue,
  path: string,
  context: MergeContext
): MergeResult => {
  if (statesEqual(local, remote, path)) return cloneJsonValue(local);
  if (statesEqual(local, base, path)) return cloneJsonValue(remote);
  if (statesEqual(remote, base, path)) return cloneJsonValue(local);

  if (!base.present) {
    if (
      local.present &&
      remote.present &&
      isRecord(local.value) &&
      isRecord(remote.value)
    ) {
      return mergeRecordStates(
        present({}),
        local as Extract<JsonValueState, { present: true }>,
        remote as Extract<JsonValueState, { present: true }>,
        path,
        context
      );
    }
    if (
      local.present &&
      remote.present &&
      Array.isArray(local.value) &&
      Array.isArray(remote.value)
    ) {
      const stableResult = mergeStableArrayStates(
        present([]),
        local as Extract<JsonValueState, { present: true }>,
        remote as Extract<JsonValueState, { present: true }>,
        path,
        context
      );
      if (stableResult) return stableResult;
    }
    return chooseConflictState(
      'concurrent-add',
      path,
      base,
      local,
      remote,
      context
    );
  }
  if (!local.present || !remote.present) {
    return chooseConflictState(
      'delete-modify',
      path,
      base,
      local,
      remote,
      context
    );
  }

  if (
    context.textPath === path &&
    typeof base.value === 'string' &&
    typeof local.value === 'string' &&
    typeof remote.value === 'string'
  ) {
    const mergedText = mergeWorkspaceText(
      base.value,
      local.value,
      remote.value
    );
    if (mergedText.ok) return present(mergedText.text);
    return chooseConflictState(
      'text',
      path,
      base,
      local,
      remote,
      context,
      mergedText.conflicts
    );
  }

  if (isRecord(base.value) && isRecord(local.value) && isRecord(remote.value)) {
    return mergeRecordStates(base, local, remote, path, context);
  }
  if (
    Array.isArray(base.value) &&
    Array.isArray(local.value) &&
    Array.isArray(remote.value)
  ) {
    const stableResult = mergeStableArrayStates(
      base,
      local,
      remote,
      path,
      context
    );
    if (stableResult) return stableResult;
  }
  return chooseConflictState('value', path, base, local, remote, context);
};

const workspaceTarget = (
  path: string
): { target: WorkspaceChangeTarget; semantic: WorkspaceChangeSemantic } => {
  const target: WorkspaceChangeTarget = { kind: 'workspace-tree', path };
  const nodeMatch = /^\/treeById\/([^/]+)/.exec(path);
  return {
    target,
    semantic: {
      kind: 'workspace-tree',
      ...(nodeMatch?.[1]
        ? { nodeId: decodeJsonPointerSegment(nodeMatch[1]) }
        : {}),
      fieldPath: path,
    },
  };
};

const routeTarget = (
  path: string
): { target: WorkspaceChangeTarget; semantic: WorkspaceChangeSemantic } => ({
  target: { kind: 'route-manifest', path },
  semantic: { kind: 'route', fieldPath: path },
});

const documentTarget =
  (
    document: WorkspaceDocument,
    area: 'document' | 'metadata' | 'content',
    language?: string
  ) =>
  (
    path: string,
    base: WorkspaceChangeValue,
    _local: WorkspaceChangeValue,
    remote: WorkspaceChangeValue
  ): { target: WorkspaceChangeTarget; semantic: WorkspaceChangeSemantic } => {
    const target: WorkspaceChangeTarget = {
      kind: 'document',
      documentId: document.id,
      documentType: document.type,
      area,
      path,
    };
    return {
      target,
      semantic:
        area === 'document'
          ? {
              kind: 'document',
              documentId: document.id,
              area,
              fieldPath: path,
            }
          : resolveWorkspaceDocumentChangeSemantic(
              target,
              base,
              remote,
              language
            ),
    };
  };

const documentAuthoringState = (
  document: WorkspaceDocument | undefined
): WorkspaceChangeValue =>
  document
    ? present({
        id: document.id,
        type: document.type,
        ...(document.name === undefined ? {} : { name: document.name }),
        path: document.path,
        content: document.content,
        ...(document.capabilities === undefined
          ? {}
          : { capabilities: document.capabilities }),
      })
    : absent();

const documentMetadataState = (document: WorkspaceDocument) =>
  present({
    type: document.type,
    ...(document.name === undefined ? {} : { name: document.name }),
    path: document.path,
    ...(document.capabilities === undefined
      ? {}
      : { capabilities: document.capabilities }),
  });

const structurallyConflictedDocumentIds = (
  localChanges: WorkspaceChangeSet,
  remoteChanges: WorkspaceChangeSet
): Set<string> => {
  const documentIds = new Set<string>();
  const inspect = (
    deletions: readonly WorkspaceSemanticChange[],
    otherChanges: readonly WorkspaceSemanticChange[]
  ) => {
    deletions.forEach((deletion) => {
      if (
        deletion.kind !== 'delete' ||
        deletion.semantic.kind !== 'graph-node' ||
        deletion.target.kind !== 'document'
      ) {
        return;
      }
      const documentId = deletion.target.documentId;
      const nodeId = deletion.semantic.nodeId;
      const graphKind = deletion.semantic.graphKind;
      const dependent = otherChanges.some((change) => {
        if (
          change.target.kind !== 'document' ||
          change.target.documentId !== documentId
        ) {
          return false;
        }
        if (
          change.semantic.kind === 'graph-node' &&
          change.semantic.nodeId === nodeId
        ) {
          return true;
        }
        if (
          change.semantic.kind === 'graph-edge' ||
          change.semantic.kind === 'graph-structure'
        ) {
          return change.semantic.graphKind === graphKind;
        }
        return change.semantic.kind === 'animation-entity';
      });
      if (dependent) documentIds.add(documentId);
    });
  };
  inspect(localChanges.changes, remoteChanges.changes);
  inspect(remoteChanges.changes, localChanges.changes);
  return documentIds;
};

const mergeDocument = (
  baseDocument: WorkspaceDocument | undefined,
  localDocument: WorkspaceDocument | undefined,
  remoteDocument: WorkspaceDocument | undefined,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>,
  conflicts: WorkspaceMergeConflict[],
  forceStructuralConflict: boolean
): WorkspaceDocument | undefined => {
  const exemplar = remoteDocument ?? localDocument ?? baseDocument;
  if (!exemplar) return undefined;
  const rootContext: MergeContext = {
    resolutions,
    conflicts,
    target: documentTarget(exemplar, 'document'),
  };
  if (!baseDocument || !localDocument || !remoteDocument) {
    const root = mergeValueStates(
      documentAuthoringState(baseDocument),
      documentAuthoringState(localDocument),
      documentAuthoringState(remoteDocument),
      '',
      rootContext
    );
    if (!root.present || !isRecord(root.value)) return undefined;
    const serverBase = remoteDocument ?? localDocument ?? baseDocument!;
    return {
      ...serverBase,
      ...(cloneJsonValue(root.value) as WorkspaceDocument),
    };
  }

  const language =
    localDocument.type === 'code' &&
    isRecord(localDocument.content) &&
    typeof localDocument.content.language === 'string'
      ? localDocument.content.language
      : undefined;
  const metadata = mergeValueStates(
    documentMetadataState(baseDocument),
    documentMetadataState(localDocument),
    documentMetadataState(remoteDocument),
    '',
    {
      resolutions,
      conflicts,
      target: documentTarget(remoteDocument, 'metadata', language),
    }
  );
  const contentContext: MergeContext = {
    resolutions,
    conflicts,
    target: documentTarget(remoteDocument, 'content', language),
    ...(remoteDocument.type === 'code' ? { textPath: '/source' } : {}),
  };
  const content = forceStructuralConflict
    ? chooseConflictState(
        'structural',
        '',
        present(baseDocument.content),
        present(localDocument.content),
        present(remoteDocument.content),
        contentContext
      )
    : mergeValueStates(
        present(baseDocument.content),
        present(localDocument.content),
        present(remoteDocument.content),
        '',
        contentContext
      );
  if (!metadata.present || !isRecord(metadata.value) || !content.present) {
    return undefined;
  }
  return {
    ...remoteDocument,
    ...(cloneJsonValue(metadata.value) as Pick<
      WorkspaceDocument,
      'type' | 'name' | 'path' | 'capabilities'
    >),
    content: cloneJsonValue(content.value),
  };
};

const restoreLocalDocumentMount = (
  treeRootId: string,
  treeById: WorkspaceSnapshot['treeById'],
  local: WorkspaceSnapshot,
  documentId: string
): WorkspaceSnapshot['treeById'] => {
  const localDocumentNode = Object.values(local.treeById).find(
    (node) => node.kind === 'doc' && node.docId === documentId
  );
  if (!localDocumentNode) return treeById;

  const chain: string[] = [];
  const seen = new Set<string>();
  let current = localDocumentNode;
  while (!seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current.id);
    if (current.parentId === null) break;
    const parent = local.treeById[current.parentId];
    if (!parent) return treeById;
    current = parent;
  }
  if (chain[0] !== treeRootId) return treeById;

  const restored = cloneJsonValue(treeById) as WorkspaceSnapshot['treeById'];
  chain.forEach((nodeId) => {
    if (restored[nodeId]) return;
    const localNode = cloneJsonValue(local.treeById[nodeId]!);
    restored[nodeId] =
      localNode.kind === 'dir' ? { ...localNode, children: [] } : localNode;
  });
  for (let index = 1; index < chain.length; index += 1) {
    const parentId = chain[index - 1]!;
    const childId = chain[index]!;
    const parent = restored[parentId];
    const localParent = local.treeById[parentId];
    if (parent?.kind !== 'dir' || localParent?.kind !== 'dir') return treeById;
    const children = [...(parent.children ?? [])];
    if (children.includes(childId)) continue;
    const localChildren = localParent.children ?? [];
    const localIndex = localChildren.indexOf(childId);
    const precedingSibling = localChildren
      .slice(0, Math.max(localIndex, 0))
      .reverse()
      .find((candidate) => children.includes(candidate));
    const followingSibling = localChildren
      .slice(Math.max(localIndex + 1, 0))
      .find((candidate) => children.includes(candidate));
    const insertionIndex = precedingSibling
      ? children.indexOf(precedingSibling) + 1
      : followingSibling
        ? children.indexOf(followingSibling)
        : Math.min(Math.max(localIndex, 0), children.length);
    children.splice(insertionIndex, 0, childId);
    restored[parentId] = { ...parent, children };
  }
  return restored;
};

const mergeWorkspace = (
  base: WorkspaceSnapshot,
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot,
  localChanges: WorkspaceChangeSet,
  remoteChanges: WorkspaceChangeSet,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>
): { snapshot: WorkspaceSnapshot; conflicts: WorkspaceMergeConflict[] } => {
  const conflicts: WorkspaceMergeConflict[] = [];
  const tree = mergeValueStates(
    present({ treeRootId: base.treeRootId, treeById: base.treeById }),
    present({ treeRootId: local.treeRootId, treeById: local.treeById }),
    present({ treeRootId: remote.treeRootId, treeById: remote.treeById }),
    '',
    { resolutions, conflicts, target: workspaceTarget }
  );
  const route = mergeValueStates(
    present(base.routeManifest),
    present(local.routeManifest),
    present(remote.routeManifest),
    '',
    { resolutions, conflicts, target: routeTarget }
  );
  const treeValue = tree.present && isRecord(tree.value) ? tree.value : {};
  const routeValue = route.present ? route.value : remote.routeManifest;
  const forcedDocumentIds = structurallyConflictedDocumentIds(
    localChanges,
    remoteChanges
  );
  const docsById: Record<string, WorkspaceDocument> = {};
  const documentIds = new Set([
    ...Object.keys(base.docsById),
    ...Object.keys(local.docsById),
    ...Object.keys(remote.docsById),
  ]);
  [...documentIds].sort().forEach((documentId) => {
    const document = mergeDocument(
      base.docsById[documentId],
      local.docsById[documentId],
      remote.docsById[documentId],
      resolutions,
      conflicts,
      forcedDocumentIds.has(documentId)
    );
    if (document) docsById[documentId] = document;
  });
  let treeById = isRecord(treeValue.treeById)
    ? (treeValue.treeById as WorkspaceSnapshot['treeById'])
    : remote.treeById;
  conflicts
    .filter(
      (conflict) =>
        conflict.target.kind === 'document' &&
        conflict.target.area === 'document' &&
        resolutions[conflict.id] === 'local' &&
        !remote.docsById[conflict.target.documentId] &&
        Boolean(docsById[conflict.target.documentId])
    )
    .forEach((conflict) => {
      if (conflict.target.kind !== 'document') return;
      treeById = restoreLocalDocumentMount(
        typeof treeValue.treeRootId === 'string'
          ? treeValue.treeRootId
          : remote.treeRootId,
        treeById,
        local,
        conflict.target.documentId
      );
    });
  const remoteActiveDocumentId = remote.activeDocumentId;
  const localActiveDocumentId = local.activeDocumentId;
  const activeDocumentId =
    remoteActiveDocumentId && docsById[remoteActiveDocumentId]
      ? remoteActiveDocumentId
      : localActiveDocumentId && docsById[localActiveDocumentId]
        ? localActiveDocumentId
        : undefined;
  return {
    snapshot: {
      ...remote,
      treeRootId:
        typeof treeValue.treeRootId === 'string'
          ? treeValue.treeRootId
          : remote.treeRootId,
      treeById,
      docsById,
      routeManifest: routeValue as WorkspaceSnapshot['routeManifest'],
      ...(activeDocumentId ? { activeDocumentId } : {}),
    },
    conflicts,
  };
};

const mismatchIssue = (): WorkspaceThreeWayIssue => ({
  code: 'WKS_SYNC_WORKSPACE_MISMATCH',
  path: '/id',
  message: 'Base, local, and remote snapshots must share a workspace id.',
});

/** Computes a semantic diff3 candidate; unresolved conflicts retain remote values. */
export const analyzeWorkspaceThreeWay = (
  base: WorkspaceSnapshot,
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>> = {}
): WorkspaceThreeWayAnalysisResult => {
  if (base.id !== local.id || base.id !== remote.id) {
    return { ok: false, issues: [mismatchIssue()] };
  }
  const localDiff = diffWorkspaceSnapshots(base, local);
  const remoteDiff = diffWorkspaceSnapshots(base, remote);
  if (!localDiff.ok || !remoteDiff.ok) {
    return { ok: false, issues: [mismatchIssue()] };
  }
  const merged = mergeWorkspace(
    base,
    local,
    remote,
    localDiff.changeSet,
    remoteDiff.changeSet,
    resolutions
  );
  const remoteToCandidate = diffWorkspaceSnapshots(remote, merged.snapshot);
  const hasCandidateChanges =
    remoteToCandidate.ok && remoteToCandidate.changeSet.changes.length > 0;
  return {
    ok: true,
    analysis: {
      workspaceId: base.id,
      status: merged.conflicts.length
        ? 'conflicted'
        : hasCandidateChanges
          ? 'auto-merged'
          : 'unchanged',
      baseRevisions: captureWorkspaceRevisions(base),
      remoteRevisions: captureWorkspaceRevisions(remote),
      localChanges: localDiff.changeSet,
      remoteChanges: remoteDiff.changeSet,
      candidateSnapshot: merged.snapshot,
      conflicts: merged.conflicts,
    },
  };
};

/** Returns only validator-safe automatic rebases; conflicts never overwrite remote state. */
export const autoRebaseWorkspaceSnapshots = (
  base: WorkspaceSnapshot,
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot
): WorkspaceAutoRebaseResult => {
  const result = analyzeWorkspaceThreeWay(base, local, remote);
  if (!result.ok)
    return { ok: false, status: 'invalid', issues: result.issues };
  if (result.analysis.conflicts.length) {
    return { ok: false, status: 'conflicted', analysis: result.analysis };
  }
  const validation = validateWorkspaceSnapshot(
    result.analysis.candidateSnapshot
  );
  if (!validation.valid) {
    return {
      ok: false,
      status: 'invalid',
      issues: [
        {
          code: 'WKS_SYNC_MERGED_SNAPSHOT_INVALID',
          path: '/',
          message: 'The automatically merged workspace is invalid.',
          validationIssues: validation.issues,
        },
      ],
    };
  }
  return {
    ok: true,
    status:
      result.analysis.status === 'unchanged' ? 'already-applied' : 'rebased',
    snapshot: result.analysis.candidateSnapshot,
    analysis: result.analysis,
  };
};
