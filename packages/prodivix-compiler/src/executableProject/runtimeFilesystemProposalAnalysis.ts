import { CONTROLLED_SOURCE_METADATA_KEY } from '@prodivix/authoring';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import type {
  ExecutionFilesystemDiff,
  ExecutionFilesystemDiffChange,
} from '@prodivix/runtime-core';
import {
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceDocumentIntentRequest,
  createWorkspaceVfsIntentPlan,
  deleteWorkspaceCodeDocumentIntentRequest,
  isWorkspaceCodeDocumentContent,
  isWorkspaceAssetDocumentContent,
  projectWorkspaceCodeArtifactLifecycles,
  type WorkspaceCodeDocumentLanguage,
  type WorkspaceAssetDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type {
  AnalyzedRuntimeFilesystemProposalEntry,
  RuntimeFilesystemProposalBlockReason,
  WorkspaceRuntimeFilesystemProposalAnalysis,
} from './runtimeFilesystemProposal.types';

type LifecycleAnalysis = Readonly<{
  available: boolean;
  statusByArtifactId: ReadonlyMap<
    string,
    'workspace-module' | 'active' | 'orphan'
  >;
}>;

const PREFLIGHT_ISSUED_AT = '1970-01-01T00:00:00.000Z';

const blocked = (
  change: ExecutionFilesystemDiffChange,
  reason: RuntimeFilesystemProposalBlockReason,
  documentId?: string,
  documentType?: 'code' | 'asset'
): AnalyzedRuntimeFilesystemProposalEntry =>
  Object.freeze({
    changeId: change.changeId,
    kind: change.kind,
    path: change.path,
    status: 'blocked',
    ...(documentId ? { documentId } : {}),
    ...(documentType ? { documentType } : {}),
    reason,
  });

const decodeCode = (contents: Uint8Array | undefined): string | undefined => {
  if (!contents) return undefined;
  try {
    const source = new (
      globalThis as unknown as {
        TextDecoder: new (
          label?: string,
          options?: Readonly<{ fatal?: boolean }>
        ) => { decode(input: Uint8Array): string };
      }
    ).TextDecoder('utf-8', { fatal: true }).decode(contents);
    return source.includes('\0') ? undefined : source;
  } catch {
    return undefined;
  }
};

const partitionRevision = (
  diff: ExecutionFilesystemDiff,
  partition: string
): string | undefined => diff.workspace.partitionRevisions?.[partition];

const documentRevision = (
  diff: ExecutionFilesystemDiff,
  documentId: string,
  partition: 'content' | 'meta'
): string | undefined =>
  partitionRevision(diff, `document:${documentId}:${partition}`);

const inferLanguage = (
  path: string
): WorkspaceCodeDocumentLanguage | undefined => {
  const lower = path.toLowerCase();
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  )
    return 'ts';
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  )
    return 'js';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.glsl')) return 'glsl';
  if (lower.endsWith('.wgsl')) return 'wgsl';
  if (lower.endsWith('.expr')) return 'expr';
  return undefined;
};

const ASSET_MEDIA_TYPES_BY_EXTENSION = Object.freeze(
  new Map<string, string>([
    ['.avif', 'image/avif'],
    ['.gif', 'image/gif'],
    ['.ico', 'image/x-icon'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.otf', 'font/otf'],
    ['.pdf', 'application/pdf'],
    ['.png', 'image/png'],
    ['.ttf', 'font/ttf'],
    ['.webp', 'image/webp'],
    ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2'],
  ])
);

const inferAssetMediaType = (path: string): string | undefined => {
  const fileName = path.split('/').at(-1)?.toLocaleLowerCase('en-US') ?? '';
  const extension = [...ASSET_MEDIA_TYPES_BY_EXTENSION.keys()].find((entry) =>
    fileName.endsWith(entry)
  );
  return extension ? ASSET_MEDIA_TYPES_BY_EXTENSION.get(extension) : undefined;
};

const startsWithBytes = (
  contents: Uint8Array,
  expected: readonly number[]
): boolean =>
  contents.byteLength >= expected.length &&
  expected.every((value, index) => contents[index] === value);

const startsWithAscii = (contents: Uint8Array, value: string): boolean =>
  startsWithBytes(
    contents,
    [...value].map((character) => character.charCodeAt(0))
  );

const matchesKnownAssetMediaType = (
  contents: Uint8Array,
  mediaType: string
): boolean => {
  switch (mediaType) {
    case 'image/png':
      return startsWithBytes(contents, [137, 80, 78, 71, 13, 10, 26, 10]);
    case 'image/jpeg':
      return startsWithBytes(contents, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return (
        startsWithAscii(contents, 'GIF87a') ||
        startsWithAscii(contents, 'GIF89a')
      );
    case 'image/webp':
      return (
        startsWithAscii(contents, 'RIFF') &&
        contents.byteLength >= 12 &&
        startsWithAscii(contents.subarray(8), 'WEBP')
      );
    case 'image/avif':
      return (
        contents.byteLength >= 12 &&
        startsWithAscii(contents.subarray(4), 'ftyp') &&
        (startsWithAscii(contents.subarray(8), 'avif') ||
          startsWithAscii(contents.subarray(8), 'avis'))
      );
    case 'image/x-icon':
      return startsWithBytes(contents, [0, 0, 1, 0]);
    case 'font/woff':
      return startsWithAscii(contents, 'wOFF');
    case 'font/woff2':
      return startsWithAscii(contents, 'wOF2');
    case 'font/ttf':
      return (
        startsWithBytes(contents, [0, 1, 0, 0]) ||
        startsWithAscii(contents, 'true')
      );
    case 'font/otf':
      return startsWithAscii(contents, 'OTTO');
    case 'application/pdf':
      return startsWithAscii(contents, '%PDF-');
    default:
      return true;
  }
};

export const createRuntimeCodeDocumentId = (
  change: Pick<ExecutionFilesystemDiffChange, 'changeId'>
): string =>
  `runtime-code:${change.changeId.replace('filesystem-change:', '')}`;

export const createRuntimeAssetDocumentId = (
  change: Pick<ExecutionFilesystemDiffChange, 'changeId'>
): string =>
  `runtime-asset:${change.changeId.replace('filesystem-change:', '')}`;

const createAssetContent = (
  change: ExecutionFilesystemDiffChange,
  mediaType: string
): WorkspaceAssetDocumentContent | undefined => {
  const contents = change.runtime?.contents;
  if (!contents || !matchesKnownAssetMediaType(contents, mediaType)) {
    return undefined;
  }
  const reference = createBinaryAssetBlobReference({ contents, mediaType });
  const originalFileName = change.path.split('/').at(-1);
  return Object.freeze({
    kind: 'asset',
    mime: reference.mediaType,
    category: reference.mediaType.startsWith('image/')
      ? 'image'
      : reference.mediaType.startsWith('font/')
        ? 'font'
        : 'file',
    size: reference.byteLength,
    blob: reference,
    ...(originalFileName
      ? { metadata: Object.freeze({ originalFileName }) }
      : {}),
  });
};

const analyzeAddedAssetChange = (
  workspace: WorkspaceSnapshot,
  change: ExecutionFilesystemDiffChange,
  mediaType: string
): AnalyzedRuntimeFilesystemProposalEntry => {
  const nextAssetContent = createAssetContent(change, mediaType);
  if (!nextAssetContent) return blocked(change, 'asset-media-mismatch');
  const canonicalPath = `/${change.path}`;
  if (
    Object.values(workspace.docsById).some(
      (document) => document.path === canonicalPath
    )
  ) {
    return blocked(change, 'path-conflict');
  }
  const documentId = createRuntimeAssetDocumentId(change);
  if (workspace.docsById[documentId]) {
    return blocked(change, 'document-id-conflict', documentId, 'asset');
  }
  const plan = createWorkspaceVfsIntentPlan(
    workspace,
    createWorkspaceDocumentIntentRequest({
      workspaceRev: workspace.workspaceRev,
      intentId: `${change.changeId}:preflight`,
      issuedAt: PREFLIGHT_ISSUED_AT,
      documentId,
      path: canonicalPath,
      type: 'asset',
      content: nextAssetContent,
    })
  );
  if (!plan) return blocked(change, 'operation-rejected', documentId, 'asset');
  return Object.freeze({
    changeId: change.changeId,
    kind: change.kind,
    path: change.path,
    status: 'eligible',
    documentId,
    documentType: 'asset',
    nextAssetContent,
    assetUpload: Object.freeze({
      changeId: change.changeId,
      documentId,
      mediaType: nextAssetContent.mime,
      contents: new Uint8Array(change.runtime!.contents),
      expectedReference: nextAssetContent.blob,
    }),
  });
};

const analyzeAddedChange = (
  workspace: WorkspaceSnapshot,
  diff: ExecutionFilesystemDiff,
  change: ExecutionFilesystemDiffChange
): AnalyzedRuntimeFilesystemProposalEntry => {
  if (partitionRevision(diff, 'workspace') !== String(workspace.workspaceRev))
    return blocked(change, 'stale-workspace-revision');
  if (change.sourceTrace?.length)
    return blocked(change, 'unexpected-source-trace');
  const mediaType = inferAssetMediaType(change.path);
  if (mediaType) return analyzeAddedAssetChange(workspace, change, mediaType);
  const nextSource = decodeCode(change.runtime?.contents);
  if (nextSource === undefined) return blocked(change, 'binary-content');
  const language = inferLanguage(change.path);
  if (!language) return blocked(change, 'unsupported-code-path');
  const canonicalPath = `/${change.path}`;
  if (
    Object.values(workspace.docsById).some(
      (document) => document.path === canonicalPath
    )
  )
    return blocked(change, 'path-conflict');
  const documentId = createRuntimeCodeDocumentId(change);
  if (workspace.docsById[documentId])
    return blocked(change, 'document-id-conflict', documentId);
  const plan = createWorkspaceVfsIntentPlan(
    workspace,
    createWorkspaceCodeDocumentIntentRequest({
      workspaceRev: workspace.workspaceRev,
      intentId: `${change.changeId}:preflight`,
      issuedAt: PREFLIGHT_ISSUED_AT,
      documentId,
      path: canonicalPath,
      content: { language, source: nextSource },
    })
  );
  if (!plan) return blocked(change, 'operation-rejected', documentId);
  return Object.freeze({
    changeId: change.changeId,
    kind: change.kind,
    path: change.path,
    status: 'eligible',
    documentId,
    documentType: 'code',
    nextSource,
    language,
  });
};

const analyzeExistingAssetChange = (
  workspace: WorkspaceSnapshot,
  diff: ExecutionFilesystemDiff,
  change: ExecutionFilesystemDiffChange,
  documentId: string
): AnalyzedRuntimeFilesystemProposalEntry => {
  const document = workspace.docsById[documentId];
  if (
    !document ||
    document.type !== 'asset' ||
    !isWorkspaceAssetDocumentContent(document.content)
  ) {
    return blocked(change, 'missing-asset-document', documentId, 'asset');
  }
  if (
    documentRevision(diff, documentId, 'content') !==
    String(document.contentRev)
  ) {
    return blocked(change, 'stale-content-revision', documentId, 'asset');
  }
  if (documentRevision(diff, documentId, 'meta') !== String(document.metaRev)) {
    return blocked(change, 'stale-meta-revision', documentId, 'asset');
  }
  if (
    change.baseline?.digest !== document.content.blob.digest ||
    change.baseline?.size !== document.content.blob.byteLength
  ) {
    return blocked(change, 'baseline-drift', documentId, 'asset');
  }
  if (change.kind === 'deleted') {
    return blocked(change, 'asset-deletion-unsupported', documentId, 'asset');
  }
  if (change.kind !== 'modified' || !change.runtime) {
    return blocked(change, 'unsupported-change-kind', documentId, 'asset');
  }
  if (
    !matchesKnownAssetMediaType(change.runtime.contents, document.content.mime)
  ) {
    return blocked(change, 'asset-media-mismatch', documentId, 'asset');
  }
  const reference = createBinaryAssetBlobReference({
    contents: change.runtime.contents,
    mediaType: document.content.mime,
  });
  if (reference.digest === document.content.blob.digest) {
    return blocked(change, 'unchanged-runtime', documentId, 'asset');
  }
  const nextAssetContent: WorkspaceAssetDocumentContent = Object.freeze({
    ...document.content,
    mime: reference.mediaType,
    size: reference.byteLength,
    blob: reference,
  });
  return Object.freeze({
    changeId: change.changeId,
    kind: change.kind,
    path: change.path,
    status: 'eligible',
    documentId,
    documentType: 'asset',
    nextAssetContent,
    assetUpload: Object.freeze({
      changeId: change.changeId,
      documentId,
      mediaType: reference.mediaType,
      contents: new Uint8Array(change.runtime.contents),
      expectedReference: reference,
    }),
  });
};

const analyzeExistingCodeChange = (
  workspace: WorkspaceSnapshot,
  diff: ExecutionFilesystemDiff,
  change: ExecutionFilesystemDiffChange,
  lifecycle: LifecycleAnalysis
): AnalyzedRuntimeFilesystemProposalEntry => {
  if (!change.sourceTrace?.length)
    return blocked(change, 'missing-source-trace');
  if (change.sourceTrace.length !== 1)
    return blocked(change, 'ambiguous-source-trace');
  const trace = change.sourceTrace[0]!;
  if (trace.sourceSpan) return blocked(change, 'partial-source-trace');
  if (trace.sourceRef.kind === 'document') {
    return analyzeExistingAssetChange(
      workspace,
      diff,
      change,
      trace.sourceRef.documentId
    );
  }
  if (trace.sourceRef.kind !== 'code-artifact')
    return blocked(change, 'unsupported-source-owner');
  const documentId = trace.sourceRef.artifactId;
  const document = workspace.docsById[documentId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  )
    return blocked(change, 'missing-code-document', documentId);
  if (
    documentRevision(diff, documentId, 'content') !==
    String(document.contentRev)
  )
    return blocked(change, 'stale-content-revision', documentId);
  if (documentRevision(diff, documentId, 'meta') !== String(document.metaRev))
    return blocked(change, 'stale-meta-revision', documentId);
  const baseline = decodeCode(change.baseline?.contents);
  if (baseline === undefined)
    return blocked(change, 'binary-content', documentId);
  if (baseline !== document.content.source)
    return blocked(change, 'baseline-drift', documentId);

  if (change.kind === 'modified') {
    const nextSource = decodeCode(change.runtime?.contents);
    if (nextSource === undefined)
      return blocked(change, 'binary-content', documentId);
    if (nextSource === document.content.source)
      return blocked(change, 'unchanged-runtime', documentId);
    return Object.freeze({
      changeId: change.changeId,
      kind: change.kind,
      path: change.path,
      status: 'eligible',
      documentId,
      documentType: 'code',
      nextSource,
    });
  }

  if (change.kind !== 'deleted')
    return blocked(change, 'unsupported-change-kind', documentId);
  if (partitionRevision(diff, 'workspace') !== String(workspace.workspaceRev))
    return blocked(change, 'stale-workspace-revision', documentId);
  if (partitionRevision(diff, 'route') !== String(workspace.routeRev))
    return blocked(change, 'stale-route-revision', documentId);
  if (!lifecycle.available)
    return blocked(change, 'lifecycle-unavailable', documentId);
  const lifecycleStatus = lifecycle.statusByArtifactId.get(documentId);
  if (!lifecycleStatus)
    return blocked(change, 'lifecycle-unavailable', documentId);
  if (lifecycleStatus === 'active')
    return blocked(change, 'active-code-artifact', documentId);
  if (
    Object.hasOwn(
      document.content.metadata ?? {},
      CONTROLLED_SOURCE_METADATA_KEY
    )
  )
    return blocked(change, 'controlled-code-artifact', documentId);
  const plan = createWorkspaceVfsIntentPlan(
    workspace,
    deleteWorkspaceCodeDocumentIntentRequest({
      workspaceRev: workspace.workspaceRev,
      intentId: `${change.changeId}:preflight`,
      issuedAt: PREFLIGHT_ISSUED_AT,
      documentId,
    })
  );
  if (!plan) return blocked(change, 'operation-rejected', documentId);
  return Object.freeze({
    changeId: change.changeId,
    kind: change.kind,
    path: change.path,
    status: 'eligible',
    documentId,
    documentType: 'code',
  });
};

const analyzeLifecycles = (workspace: WorkspaceSnapshot): LifecycleAnalysis => {
  const projection = projectWorkspaceCodeArtifactLifecycles(workspace);
  if (projection.status !== 'ready')
    return Object.freeze({ available: false, statusByArtifactId: new Map() });
  return Object.freeze({
    available: true,
    statusByArtifactId: new Map(
      projection.records.map(({ artifact, lifecycle }) => [
        artifact.id,
        lifecycle.status,
      ])
    ),
  });
};

export const analyzeRuntimeFilesystemEntries = (
  workspace: WorkspaceSnapshot,
  diff: ExecutionFilesystemDiff
): readonly AnalyzedRuntimeFilesystemProposalEntry[] => {
  const lifecycle =
    diff.complete &&
    diff.workspace.workspaceId === workspace.id &&
    diff.changes.some((change) => change.kind === 'deleted')
      ? analyzeLifecycles(workspace)
      : Object.freeze({
          available: true,
          statusByArtifactId: new Map<
            string,
            'workspace-module' | 'active' | 'orphan'
          >(),
        });
  const initial = diff.changes.map((change) => {
    if (!diff.complete) return blocked(change, 'incomplete-capture');
    if (diff.workspace.workspaceId !== workspace.id)
      return blocked(change, 'workspace-mismatch');
    return change.kind === 'added'
      ? analyzeAddedChange(workspace, diff, change)
      : analyzeExistingCodeChange(workspace, diff, change, lifecycle);
  });
  const targetCounts = new Map<string, number>();
  for (const entry of initial) {
    if (entry.status !== 'eligible' || !entry.documentId) continue;
    targetCounts.set(
      entry.documentId,
      (targetCounts.get(entry.documentId) ?? 0) + 1
    );
  }
  return Object.freeze(
    initial.map((entry, index) =>
      entry.status === 'eligible' &&
      entry.documentId &&
      (targetCounts.get(entry.documentId) ?? 0) > 1
        ? blocked(
            diff.changes[index]!,
            'duplicate-target',
            entry.documentId,
            entry.documentType
          )
        : entry
    )
  );
};

export const projectRuntimeFilesystemAnalysis = (
  diff: ExecutionFilesystemDiff,
  entries: readonly AnalyzedRuntimeFilesystemProposalEntry[]
): WorkspaceRuntimeFilesystemProposalAnalysis => {
  const projectedEntries = Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        changeId: entry.changeId,
        kind: entry.kind,
        path: entry.path,
        status: entry.status,
        ...(entry.documentId ? { documentId: entry.documentId } : {}),
        ...(entry.documentType ? { documentType: entry.documentType } : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
      })
    )
  );
  return Object.freeze({
    complete: diff.complete,
    entries: projectedEntries,
    eligibleChangeIds: Object.freeze(
      projectedEntries.flatMap((entry) =>
        entry.status === 'eligible' ? [entry.changeId] : []
      )
    ),
  });
};
