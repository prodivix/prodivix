import type { PIRDocument } from '@prodivix/shared/types/pir';
import { normalizePirDocumentToCurrentSchema } from '@/pir/graph/normalize';

export type WorkspaceLikeDocument = {
  id?: string;
  type?: string;
  path?: string;
  content?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Pick the workspace document that should drive the editor's active pirDoc.
 * Order: (1) pir-page at root path, (2) first pir-page. Code and other
 * non-PIR documents must not be treated as fallback PIR documents.
 */
export const resolveCanonicalWorkspaceDocumentId = (
  documents: WorkspaceLikeDocument[]
): string | undefined => {
  if (!documents.length) return undefined;

  const rootPage = documents.find(
    (document) =>
      document.type === 'pir-page' &&
      ((document.path ?? '').trim() === '/' ||
        (document.path ?? '').trim() === '')
  );
  if (rootPage?.id) return rootPage.id;

  const firstPage = documents.find((document) => document.type === 'pir-page');
  if (firstPage?.id) return firstPage.id;

  return undefined;
};

export const hasDirectPirShape = (source: unknown): boolean => {
  if (!isPlainObject(source)) return false;
  const ui = source.ui;
  if (!isPlainObject(ui)) return false;
  return isPlainObject(ui.graph) || isPlainObject(ui.root);
};

export const tryResolveFromWorkspaceShape = (
  source: unknown
): PIRDocument | null => {
  if (!isPlainObject(source)) return null;
  if (!Array.isArray(source.documents)) return null;
  const documents = source.documents.filter((item) =>
    isPlainObject(item)
  ) as WorkspaceLikeDocument[];
  if (!documents.length) return null;
  const activeId = resolveCanonicalWorkspaceDocumentId(documents);
  if (!activeId) return null;
  const activeDocument = documents.find((document) => document.id === activeId);
  if (!activeDocument) return null;
  return normalizePirDocumentToCurrentSchema(activeDocument.content);
};
