import type { WorkspaceCommandEnvelope } from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceId } from './types';

export type WorkspaceAssetDocumentContent = {
  kind: 'asset';
  mime: string;
  category?: string;
  size?: number;
  dataUrl?: string;
  text?: string;
  metadata?: Record<string, unknown>;
};

export type WorkspaceProjectConfigDocumentContent<TValue = unknown> = {
  kind: 'config';
  value: TValue;
  metadata?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const isWorkspaceAssetDocumentContent = (
  value: unknown
): value is WorkspaceAssetDocumentContent => {
  if (!isRecord(value) || value.kind !== 'asset') return false;
  if (typeof value.mime !== 'string' || !value.mime.trim()) return false;
  if (value.category !== undefined && typeof value.category !== 'string') {
    return false;
  }
  if (
    value.size !== undefined &&
    (typeof value.size !== 'number' ||
      !Number.isSafeInteger(value.size) ||
      value.size < 0)
  ) {
    return false;
  }
  if (value.dataUrl !== undefined && typeof value.dataUrl !== 'string') {
    return false;
  }
  if (value.text !== undefined && typeof value.text !== 'string') return false;
  return value.metadata === undefined || isRecord(value.metadata);
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
