import {
  isWorkspaceCodeDocumentContent,
  type WorkspaceDocument,
  type WorkspaceDocumentType,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  appendJsonPointer,
  cloneJsonValue,
  decodeJsonPointerSegment,
  isRecord,
  resolveStableIdArrayPair,
  semanticJsonValuesEqual,
  stableIdArrayPointer,
  type JsonValueState,
} from './jsonValue';
import {
  captureWorkspaceRevisions,
  type WorkspaceRevisions,
} from './workspaceRevisions';
import { diffWorkspaceText, type WorkspaceTextHunk } from './workspaceTextDiff';

export type WorkspaceChangeValue = JsonValueState;

export type WorkspaceChangeTarget =
  | { kind: 'workspace-tree'; path: string }
  | { kind: 'route-manifest'; path: string }
  | {
      kind: 'document';
      documentId: string;
      documentType: WorkspaceDocumentType;
      area: 'document' | 'metadata' | 'content';
      path: string;
    };

export type WorkspaceChangeSemantic =
  | { kind: 'workspace-tree'; nodeId?: string; fieldPath: string }
  | { kind: 'route'; fieldPath: string }
  | {
      kind: 'graph-node';
      graphKind: 'pir-ui' | 'nodegraph';
      graphId?: string;
      nodeId: string;
      fieldPath: string;
    }
  | {
      kind: 'graph-edge';
      graphKind: 'nodegraph';
      graphId?: string;
      edgeId: string;
      fieldPath: string;
    }
  | {
      kind: 'graph-structure';
      graphKind: 'pir-ui' | 'nodegraph';
      graphId?: string;
      ownerNodeId?: string;
      region?: string;
      fieldPath: string;
    }
  | {
      kind: 'animation-entity';
      entityKind:
        | 'timeline'
        | 'track'
        | 'keyframe'
        | 'binding'
        | 'svg-filter'
        | 'svg-primitive';
      entityId: string;
      fieldPath: string;
    }
  | {
      kind: 'code-source';
      language: string;
      hunks: WorkspaceTextHunk[];
    }
  | {
      kind: 'document';
      documentId: string;
      area: 'document' | 'metadata' | 'content';
      fieldPath: string;
    };

export type WorkspaceSemanticChange = {
  id: string;
  kind: 'add' | 'delete' | 'modify';
  target: WorkspaceChangeTarget;
  base: WorkspaceChangeValue;
  next: WorkspaceChangeValue;
  semantic: WorkspaceChangeSemantic;
};

export type WorkspaceChangeSet = {
  workspaceId: string;
  baseRevisions: WorkspaceRevisions;
  nextRevisions: WorkspaceRevisions;
  changes: WorkspaceSemanticChange[];
};

export type WorkspaceDiffIssue = {
  code: 'WKS_SYNC_WORKSPACE_MISMATCH';
  path: '/id';
  message: string;
};

export type WorkspaceDiffResult =
  | { ok: true; changeSet: WorkspaceChangeSet }
  | { ok: false; issues: WorkspaceDiffIssue[] };

type ChangeCollector = (
  path: string,
  base: WorkspaceChangeValue,
  next: WorkspaceChangeValue
) => void;

const createValueState = (value: unknown): WorkspaceChangeValue => ({
  present: true,
  value: cloneJsonValue(value),
});

const collectJsonChanges = (
  base: WorkspaceChangeValue,
  next: WorkspaceChangeValue,
  path: string,
  collect: ChangeCollector
) => {
  if (!base.present || !next.present) {
    if (base.present !== next.present) collect(path, base, next);
    return;
  }
  if (semanticJsonValuesEqual(base.value, next.value, path)) return;
  const stablePair = resolveStableIdArrayPair(base.value, next.value, path);
  if (stablePair) {
    const collectionPath = stableIdArrayPointer(path);
    const ids = new Set([
      ...Object.keys(stablePair.left.valuesById),
      ...Object.keys(stablePair.right.valuesById),
    ]);
    [...ids].sort().forEach((id) => {
      const baseEntry = stablePair.left.valuesById[id];
      const nextEntry = stablePair.right.valuesById[id];
      collectJsonChanges(
        baseEntry === undefined
          ? { present: false }
          : createValueState(baseEntry),
        nextEntry === undefined
          ? { present: false }
          : createValueState(nextEntry),
        appendJsonPointer(collectionPath, id),
        collect
      );
    });
    return;
  }
  if (isRecord(base.value) && isRecord(next.value)) {
    const keys = new Set([
      ...Object.keys(base.value),
      ...Object.keys(next.value),
    ]);
    [...keys]
      .sort()
      .forEach((key) =>
        collectJsonChanges(
          Object.hasOwn(base.value as Record<string, unknown>, key)
            ? createValueState((base.value as Record<string, unknown>)[key])
            : { present: false },
          Object.hasOwn(next.value as Record<string, unknown>, key)
            ? createValueState((next.value as Record<string, unknown>)[key])
            : { present: false },
          appendJsonPointer(path, key),
          collect
        )
      );
    return;
  }
  collect(path, base, next);
};

const changeKind = (
  base: WorkspaceChangeValue,
  next: WorkspaceChangeValue
): WorkspaceSemanticChange['kind'] =>
  !base.present ? 'add' : !next.present ? 'delete' : 'modify';

const targetIdentity = (target: WorkspaceChangeTarget): string => {
  if (target.kind !== 'document') return target.kind;
  return `document:${target.documentId}:${target.area}`;
};

const createChangeId = (target: WorkspaceChangeTarget): string =>
  `${targetIdentity(target)}:${target.path || '/'}`;

const documentAuthoringValue = (
  document: WorkspaceDocument
): Record<string, unknown> => ({
  id: document.id,
  type: document.type,
  ...(document.name === undefined ? {} : { name: document.name }),
  path: document.path,
  content: cloneJsonValue(document.content),
  ...(document.capabilities === undefined
    ? {}
    : { capabilities: [...document.capabilities] }),
});

const decodePointerPath = (path: string): string[] =>
  path === ''
    ? []
    : path
        .slice(1)
        .split('/')
        .map((segment) => decodeJsonPointerSegment(segment));

const remainderPath = (segments: readonly string[], offset: number): string =>
  segments.length <= offset
    ? ''
    : `/${segments
        .slice(offset)
        .map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1'))
        .join('/')}`;

const resolvePirAnimationSemantic = (
  segments: readonly string[]
): WorkspaceChangeSemantic | undefined => {
  if (segments[0] !== 'animation') return undefined;
  if (
    segments[1] === 'svgFiltersById' &&
    segments[2] &&
    segments[3] === 'primitivesById' &&
    segments[4]
  ) {
    return {
      kind: 'animation-entity',
      entityKind: 'svg-primitive',
      entityId: segments[4],
      fieldPath: remainderPath(segments, 5),
    };
  }
  if (segments[1] === 'svgFiltersById' && segments[2]) {
    return {
      kind: 'animation-entity',
      entityKind: 'svg-filter',
      entityId: segments[2],
      fieldPath: remainderPath(segments, 3),
    };
  }
  if (segments[1] !== 'timelinesById' || !segments[2]) return undefined;
  if (
    segments[3] === 'bindingsById' &&
    segments[4] &&
    segments[5] === 'tracksById' &&
    segments[6]
  ) {
    return {
      kind: 'animation-entity',
      entityKind: 'track',
      entityId: segments[6],
      fieldPath: remainderPath(segments, 7),
    };
  }
  if (segments[3] === 'bindingsById' && segments[4]) {
    return {
      kind: 'animation-entity',
      entityKind: 'binding',
      entityId: segments[4],
      fieldPath: remainderPath(segments, 5),
    };
  }
  return {
    kind: 'animation-entity',
    entityKind: 'timeline',
    entityId: segments[2],
    fieldPath: remainderPath(segments, 3),
  };
};

export const resolveWorkspaceDocumentChangeSemantic = (
  target: Extract<WorkspaceChangeTarget, { kind: 'document' }>,
  base: WorkspaceChangeValue,
  next: WorkspaceChangeValue,
  language?: string
): WorkspaceChangeSemantic => {
  const segments = decodePointerPath(target.path);
  if (target.area === 'content') {
    if (target.documentType === 'code' && target.path === '/source') {
      const baseSource =
        base.present && typeof base.value === 'string' ? base.value : '';
      const nextSource =
        next.present && typeof next.value === 'string' ? next.value : '';
      return {
        kind: 'code-source',
        language: language ?? 'text',
        hunks: diffWorkspaceText(baseSource, nextSource),
      };
    }
    if (
      segments[0] === 'ui' &&
      segments[1] === 'graph' &&
      segments[2] === 'nodesById' &&
      segments[3]
    ) {
      return {
        kind: 'graph-node',
        graphKind: 'pir-ui',
        nodeId: segments[3],
        fieldPath: remainderPath(segments, 4),
      };
    }
    if (
      segments[0] === 'ui' &&
      segments[1] === 'graph' &&
      (segments[2] === 'childIdsById' || segments[2] === 'regionsById')
    ) {
      return {
        kind: 'graph-structure',
        graphKind: 'pir-ui',
        ...(segments[3] ? { ownerNodeId: segments[3] } : {}),
        ...(segments[2] === 'regionsById' && segments[4]
          ? { region: segments[4] }
          : {}),
        fieldPath: remainderPath(
          segments,
          segments[2] === 'regionsById' ? 5 : 4
        ),
      };
    }
    if (target.documentType === 'pir-graph') {
      if (segments[0] === 'nodesById' && segments[1]) {
        return {
          kind: 'graph-node',
          graphKind: 'nodegraph',
          nodeId: segments[1],
          fieldPath: remainderPath(segments, 2),
        };
      }
      if (segments[0] === 'edgesById' && segments[1]) {
        return {
          kind: 'graph-edge',
          graphKind: 'nodegraph',
          edgeId: segments[1],
          fieldPath: remainderPath(segments, 2),
        };
      }
      if (segments[0] === 'groupsById') {
        return {
          kind: 'graph-structure',
          graphKind: 'nodegraph',
          ...(segments[1] ? { ownerNodeId: segments[1] } : {}),
          fieldPath: remainderPath(segments, 2),
        };
      }
    }
    if (
      segments[0] === 'logic' &&
      segments[1] === 'graphsById' &&
      segments[2]
    ) {
      const graphId = segments[2];
      if (segments[3] === 'nodesById' && segments[4]) {
        return {
          kind: 'graph-node',
          graphKind: 'nodegraph',
          graphId,
          nodeId: segments[4],
          fieldPath: remainderPath(segments, 5),
        };
      }
      if (segments[3] === 'edgesById' && segments[4]) {
        return {
          kind: 'graph-edge',
          graphKind: 'nodegraph',
          graphId,
          edgeId: segments[4],
          fieldPath: remainderPath(segments, 5),
        };
      }
      return {
        kind: 'graph-structure',
        graphKind: 'nodegraph',
        graphId,
        fieldPath: remainderPath(segments, 3),
      };
    }
    if (
      segments[0] === 'logic' &&
      segments[1] === 'x-nodeGraphEditor' &&
      segments[2] === 'graphsById' &&
      segments[3]
    ) {
      const graphId = segments[3];
      if (segments[4] === 'nodesById' && segments[5]) {
        return {
          kind: 'graph-node',
          graphKind: 'nodegraph',
          graphId,
          nodeId: segments[5],
          fieldPath: remainderPath(segments, 6),
        };
      }
      return {
        kind: 'graph-structure',
        graphKind: 'nodegraph',
        graphId,
        fieldPath: remainderPath(segments, 4),
      };
    }
    if (segments[0] === 'animation') {
      const animationEntity = resolvePirAnimationSemantic(segments);
      if (animationEntity) return animationEntity;
    }
    if (target.documentType === 'pir-animation') {
      const entityKinds = {
        timelinesById: 'timeline',
        tracksById: 'track',
        keyframesById: 'keyframe',
        bindingsById: 'binding',
      } as const;
      const entityKind = segments[0]
        ? entityKinds[segments[0] as keyof typeof entityKinds]
        : undefined;
      if (entityKind && segments[1]) {
        return {
          kind: 'animation-entity',
          entityKind,
          entityId: segments[1],
          fieldPath: remainderPath(segments, 2),
        };
      }
    }
  }
  return {
    kind: 'document',
    documentId: target.documentId,
    area: target.area,
    fieldPath: target.path,
  };
};

const pushChange = (
  changes: WorkspaceSemanticChange[],
  target: WorkspaceChangeTarget,
  base: WorkspaceChangeValue,
  next: WorkspaceChangeValue,
  semantic: WorkspaceChangeSemantic
) => {
  changes.push({
    id: createChangeId(target),
    kind: changeKind(base, next),
    target,
    base,
    next,
    semantic,
  });
};

const collectDocumentChanges = (
  baseDocument: WorkspaceDocument | undefined,
  nextDocument: WorkspaceDocument | undefined,
  changes: WorkspaceSemanticChange[]
) => {
  const document = nextDocument ?? baseDocument;
  if (!document) return;
  if (!baseDocument || !nextDocument) {
    const target: WorkspaceChangeTarget = {
      kind: 'document',
      documentId: document.id,
      documentType: document.type,
      area: 'document',
      path: '',
    };
    const base = baseDocument
      ? createValueState(documentAuthoringValue(baseDocument))
      : ({ present: false } as const);
    const next = nextDocument
      ? createValueState(documentAuthoringValue(nextDocument))
      : ({ present: false } as const);
    pushChange(changes, target, base, next, {
      kind: 'document',
      documentId: document.id,
      area: 'document',
      fieldPath: '',
    });
    return;
  }

  const metadataBase = {
    type: baseDocument.type,
    ...(baseDocument.name === undefined ? {} : { name: baseDocument.name }),
    path: baseDocument.path,
    ...(baseDocument.capabilities === undefined
      ? {}
      : { capabilities: baseDocument.capabilities }),
  };
  const metadataNext = {
    type: nextDocument.type,
    ...(nextDocument.name === undefined ? {} : { name: nextDocument.name }),
    path: nextDocument.path,
    ...(nextDocument.capabilities === undefined
      ? {}
      : { capabilities: nextDocument.capabilities }),
  };
  collectJsonChanges(
    createValueState(metadataBase),
    createValueState(metadataNext),
    '',
    (path, base, next) => {
      const target: WorkspaceChangeTarget = {
        kind: 'document',
        documentId: document.id,
        documentType: nextDocument.type,
        area: 'metadata',
        path,
      };
      pushChange(changes, target, base, next, {
        kind: 'document',
        documentId: document.id,
        area: 'metadata',
        fieldPath: path,
      });
    }
  );

  const codeLanguage = isWorkspaceCodeDocumentContent(nextDocument.content)
    ? nextDocument.content.language
    : undefined;
  collectJsonChanges(
    createValueState(baseDocument.content),
    createValueState(nextDocument.content),
    '',
    (path, base, next) => {
      const target: WorkspaceChangeTarget = {
        kind: 'document',
        documentId: document.id,
        documentType: nextDocument.type,
        area: 'content',
        path,
      };
      pushChange(
        changes,
        target,
        base,
        next,
        resolveWorkspaceDocumentChangeSemantic(target, base, next, codeLanguage)
      );
    }
  );
};

/** Diffs canonical authoring state while deliberately excluding server revisions and UI selection. */
export const diffWorkspaceSnapshots = (
  base: WorkspaceSnapshot,
  next: WorkspaceSnapshot
): WorkspaceDiffResult => {
  if (base.id !== next.id) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_WORKSPACE_MISMATCH',
          path: '/id',
          message: 'Workspace snapshots must belong to the same workspace.',
        },
      ],
    };
  }
  const changes: WorkspaceSemanticChange[] = [];
  const baseTree = {
    treeRootId: base.treeRootId,
    treeById: base.treeById,
  };
  const nextTree = {
    treeRootId: next.treeRootId,
    treeById: next.treeById,
  };
  collectJsonChanges(
    createValueState(baseTree),
    createValueState(nextTree),
    '',
    (path, baseValue, nextValue) => {
      const target: WorkspaceChangeTarget = { kind: 'workspace-tree', path };
      const segments = decodePointerPath(path);
      pushChange(changes, target, baseValue, nextValue, {
        kind: 'workspace-tree',
        ...(segments[0] === 'treeById' && segments[1]
          ? { nodeId: segments[1] }
          : {}),
        fieldPath: path,
      });
    }
  );
  collectJsonChanges(
    createValueState(base.routeManifest),
    createValueState(next.routeManifest),
    '',
    (path, baseValue, nextValue) => {
      const target: WorkspaceChangeTarget = { kind: 'route-manifest', path };
      pushChange(changes, target, baseValue, nextValue, {
        kind: 'route',
        fieldPath: path,
      });
    }
  );
  const documentIds = new Set([
    ...Object.keys(base.docsById),
    ...Object.keys(next.docsById),
  ]);
  [...documentIds]
    .sort()
    .forEach((documentId) =>
      collectDocumentChanges(
        base.docsById[documentId],
        next.docsById[documentId],
        changes
      )
    );
  return {
    ok: true,
    changeSet: {
      workspaceId: base.id,
      baseRevisions: captureWorkspaceRevisions(base),
      nextRevisions: captureWorkspaceRevisions(next),
      changes,
    },
  };
};
