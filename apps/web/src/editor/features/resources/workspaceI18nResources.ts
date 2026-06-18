import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import {
  createDefaultI18nStore,
  normalizeI18nStore,
  type I18nLocaleStore,
} from './i18nStore';
import {
  findWorkspaceDocumentByPath,
  isWorkspaceConfigContent,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';

export type WorkspaceI18nResourceValue = {
  store: I18nLocaleStore;
  reviewedMap: Record<string, boolean>;
};

const normalizeReviewedMap = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== 'object') return {};
  const reviewedMap: Record<string, boolean> = {};
  Object.entries(value as Record<string, unknown>).forEach(
    ([key, reviewed]) => {
      if (typeof reviewed === 'boolean') reviewedMap[key] = reviewed;
    }
  );
  return reviewedMap;
};

export const createDefaultI18nResourceValue =
  (): WorkspaceI18nResourceValue => ({
    store: createDefaultI18nStore(),
    reviewedMap: {},
  });

export const normalizeI18nResourceValue = (
  value: unknown
): WorkspaceI18nResourceValue => {
  if (!value || typeof value !== 'object') {
    return createDefaultI18nResourceValue();
  }
  const record = value as Record<string, unknown>;
  return {
    store: normalizeI18nStore(record.store),
    reviewedMap: normalizeReviewedMap(record.reviewedMap),
  };
};

export const getWorkspaceI18nResourceDocument = (
  documentsById: Record<string, WorkspaceDocumentRecord>
) =>
  findWorkspaceDocumentByPath(
    documentsById,
    RESOURCE_ROOTS.i18n,
    'project-config'
  );

export const buildI18nResourceValueFromWorkspace = (
  documentsById: Record<string, WorkspaceDocumentRecord>
): WorkspaceI18nResourceValue => {
  const document = getWorkspaceI18nResourceDocument(documentsById);
  if (!document || !isWorkspaceConfigContent(document.content)) {
    return createDefaultI18nResourceValue();
  }
  return normalizeI18nResourceValue(document.content.value);
};
