import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceId } from './types';
import {
  normalizeBinaryAssetMediaType,
  readBinaryAssetBlobReference,
  type BinaryAssetBlobReference,
} from '@prodivix/assets';

export type WorkspaceAssetMetadata = Readonly<{
  originalFileName?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}>;

export type WorkspaceAssetDocumentContent = {
  kind: 'asset';
  mime: string;
  category?: string;
  size: number;
  blob: BinaryAssetBlobReference;
  metadata?: WorkspaceAssetMetadata;
};

export type WorkspaceProjectConfigDocumentContent<TValue = unknown> = {
  kind: 'config';
  value: TValue;
  metadata?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const isOptionalBoundedNumber = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000);

const isWorkspaceAssetMetadata = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, ['originalFileName', 'width', 'height', 'durationMs'])
  ) {
    return false;
  }
  if (
    value.originalFileName !== undefined &&
    (typeof value.originalFileName !== 'string' ||
      !value.originalFileName.trim() ||
      value.originalFileName.length > 512)
  ) {
    return false;
  }
  return (
    isOptionalBoundedNumber(value.width) &&
    isOptionalBoundedNumber(value.height) &&
    isOptionalBoundedNumber(value.durationMs)
  );
};

export const isWorkspaceAssetDocumentContent = (
  value: unknown
): value is WorkspaceAssetDocumentContent => {
  if (!isRecord(value) || value.kind !== 'asset') return false;
  if (
    !hasOnlyKeys(value, [
      'kind',
      'mime',
      'category',
      'size',
      'blob',
      'metadata',
    ])
  ) {
    return false;
  }
  if (typeof value.mime !== 'string') return false;
  let blob: BinaryAssetBlobReference;
  try {
    if (normalizeBinaryAssetMediaType(value.mime) !== value.mime) return false;
    blob = readBinaryAssetBlobReference(value.blob);
  } catch {
    return false;
  }
  if (
    value.category !== undefined &&
    (typeof value.category !== 'string' ||
      !value.category.trim() ||
      value.category.length > 128)
  ) {
    return false;
  }
  if (
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    value.size !== blob.byteLength ||
    value.mime !== blob.mediaType
  ) {
    return false;
  }
  return (
    value.metadata === undefined || isWorkspaceAssetMetadata(value.metadata)
  );
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Replaces only the reference-owned Asset fields through one reversible resource command. */
export const createWorkspaceAssetContentUpdateCommand = (input: {
  commandId: string;
  document: WorkspaceDocument;
  issuedAt: string;
  label?: string;
  content: WorkspaceAssetDocumentContent;
  workspaceId: WorkspaceId;
}): WorkspaceCommandEnvelope | null => {
  if (
    input.document.type !== 'asset' ||
    !isWorkspaceAssetDocumentContent(input.document.content) ||
    !isWorkspaceAssetDocumentContent(input.content)
  ) {
    return null;
  }
  const current = input.document.content;
  const next = input.content;
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  const replaceRequired = (
    path: '/mime' | '/size' | '/blob',
    previous: unknown,
    value: unknown
  ) => {
    if (valuesEqual(previous, value)) return;
    forwardOps.push({ op: 'replace', path, value });
    reverseOps.unshift({ op: 'replace', path, value: previous });
  };
  const replaceOptional = (
    path: '/category' | '/metadata',
    previous: unknown,
    value: unknown
  ) => {
    if (valuesEqual(previous, value)) return;
    if (previous === undefined) {
      forwardOps.push({ op: 'add', path, value });
      reverseOps.unshift({ op: 'remove', path });
    } else if (value === undefined) {
      forwardOps.push({ op: 'remove', path });
      reverseOps.unshift({ op: 'add', path, value: previous });
    } else {
      forwardOps.push({ op: 'replace', path, value });
      reverseOps.unshift({ op: 'replace', path, value: previous });
    }
  };
  replaceRequired('/mime', current.mime, next.mime);
  replaceRequired('/size', current.size, next.size);
  replaceRequired('/blob', current.blob, next.blob);
  replaceOptional('/category', current.category, next.category);
  replaceOptional('/metadata', current.metadata, next.metadata);
  if (!forwardOps.length) return null;
  return {
    id: input.commandId,
    namespace: 'core.resource',
    type: 'asset.content.replace',
    version: '1.0',
    issuedAt: input.issuedAt,
    target: {
      workspaceId: input.workspaceId,
      documentId: input.document.id,
    },
    domainHint: 'resource',
    mergeKey: `asset-content:${input.document.id}`,
    label: input.label ?? `Replace ${input.document.path}`,
    forwardOps,
    reverseOps,
  };
};

export const isWorkspaceProjectConfigDocumentContent = <TValue = unknown>(
  value: unknown
): value is WorkspaceProjectConfigDocumentContent<TValue> =>
  isRecord(value) &&
  value.kind === 'config' &&
  Object.hasOwn(value, 'value') &&
  (value.metadata === undefined || isRecord(value.metadata));

export const createWorkspaceProjectConfigDocumentContent = <TValue>(
  value: TValue,
  metadata?: Record<string, unknown>
): WorkspaceProjectConfigDocumentContent<TValue> => ({
  kind: 'config',
  value,
  ...(metadata ? { metadata } : {}),
});

/** Creates the reversible document command consumed by History and Outbox. */
export const createWorkspaceProjectConfigValueUpdateCommand = <TValue>(input: {
  commandId: string;
  document: WorkspaceDocument;
  issuedAt: string;
  label?: string;
  value: TValue;
  workspaceId: WorkspaceId;
}): WorkspaceCommandEnvelope | null => {
  if (
    input.document.type !== 'project-config' ||
    !isWorkspaceProjectConfigDocumentContent<TValue>(input.document.content)
  ) {
    return null;
  }
  return {
    id: input.commandId,
    namespace: 'core.resource',
    type: 'project-config.value.update',
    version: '1.0',
    issuedAt: input.issuedAt,
    target: {
      workspaceId: input.workspaceId,
      documentId: input.document.id,
    },
    domainHint: 'resource',
    ...(input.label ? { label: input.label } : {}),
    forwardOps: [{ op: 'replace', path: '/value', value: input.value }],
    reverseOps: [
      {
        op: 'replace',
        path: '/value',
        value: input.document.content.value,
      },
    ],
  };
};
