import {
  selectActiveDocument as selectCoreActiveDocument,
  selectActivePirDocument as selectCoreActivePirDocument,
  selectDocumentById as selectCoreDocumentById,
  type WorkspaceDocument,
  type WorkspaceHistoryState,
  type WorkspaceSnapshot,
  type WorkspaceVfsNode,
} from '@prodivix/workspace';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import type { WorkspaceRouteManifest } from '@prodivix/router';
import type { EditorStore } from './editorStore.shape';

const EMPTY_DOCUMENTS: Record<string, WorkspaceDocument> = Object.freeze({});
const EMPTY_TREE: Record<string, WorkspaceVfsNode> = Object.freeze({});

export const selectWorkspace = (state: EditorStore): WorkspaceSnapshot | null =>
  state.workspace;

export const selectWorkspaceHistory = (
  state: EditorStore
): WorkspaceHistoryState => state.workspaceHistory;

export const selectWorkspaceHistoryLimit = (state: EditorStore): number =>
  state.workspaceHistory.maxEntries;

export const selectWorkspaceId = (state: EditorStore): string | undefined =>
  state.workspace?.id;

export const selectWorkspaceRev = (state: EditorStore): number | undefined =>
  state.workspace?.workspaceRev;

export const selectRouteRev = (state: EditorStore): number | undefined =>
  state.workspace?.routeRev;

export const selectWorkspaceOpSeq = (state: EditorStore): number | undefined =>
  state.workspace?.opSeq;

export const selectWorkspaceDocumentsById = (
  state: EditorStore
): Record<string, WorkspaceDocument> =>
  state.workspace?.docsById ?? EMPTY_DOCUMENTS;

export const selectWorkspaceTreeRootId = (
  state: EditorStore
): string | undefined => state.workspace?.treeRootId;

export const selectWorkspaceTreeById = (
  state: EditorStore
): Record<string, WorkspaceVfsNode> => state.workspace?.treeById ?? EMPTY_TREE;

export const selectRouteManifest = (
  state: EditorStore
): WorkspaceRouteManifest | undefined => state.workspace?.routeManifest;

export const selectActiveDocumentId = (
  state: EditorStore
): string | undefined => state.workspace?.activeDocumentId;

export const selectActiveRouteNodeId = (
  state: EditorStore
): string | undefined => state.workspace?.activeRouteNodeId;

export const selectActiveDocument = (
  state: EditorStore
): WorkspaceDocument | undefined =>
  selectCoreActiveDocument(state.workspace ?? undefined);

export const selectDocumentById = (
  state: EditorStore,
  documentId: string | undefined
): WorkspaceDocument | undefined =>
  selectCoreDocumentById(state.workspace ?? undefined, documentId);

export const selectActivePirDocumentRecord = (
  state: EditorStore
): ReturnType<typeof selectCoreActivePirDocument> =>
  selectCoreActivePirDocument(state.workspace ?? undefined);

export const selectActivePirDocument = (
  state: EditorStore
): PIRDocument | undefined => selectActivePirDocumentRecord(state)?.content;

export const selectDocumentEditSeq = (
  state: EditorStore,
  documentId: string | undefined
): number => (documentId ? (state.documentEditSeqById[documentId] ?? 0) : 0);

export const selectActiveDocumentEditSeq = (state: EditorStore): number =>
  selectDocumentEditSeq(state, state.workspace?.activeDocumentId);
