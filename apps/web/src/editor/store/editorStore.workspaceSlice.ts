import type { StateCreator } from 'zustand';
import type {
  WorkspaceDocumentRecord,
  WorkspaceMutationResponse,
  WorkspaceSnapshot,
} from '@/editor/editorApi';
import { resolveCanonicalWorkspaceDocumentId } from '@/pir/resolvePirDocument';
import {
  isWorkspacePirDocument,
  normalizeRouteManifest,
  normalizeWorkspaceDocument,
  normalizeWorkspaceTree,
  resolveActiveRouteNodeId,
} from './editorStore.normalizers';
import {
  DEFAULT_ROUTE_MANIFEST,
  type WorkspaceVfsNode,
} from './editorStore.types';
import type { EditorStore } from './editorStore.shape';

export interface WorkspaceSlice {
  workspaceId?: string;
  workspaceRev?: number;
  routeRev?: number;
  opSeq?: number;
  activeDocumentId?: string;
  workspaceDocumentsById: Record<string, WorkspaceDocumentRecord>;
  treeRootId?: string;
  treeById: Record<string, WorkspaceVfsNode>;
  workspaceCapabilities: Record<string, boolean>;
  workspaceCapabilitiesLoaded: boolean;
  setWorkspaceSnapshot: (workspace: WorkspaceSnapshot) => void;
  setWorkspaceCapabilities: (
    workspaceId: string,
    capabilities: Record<string, boolean>
  ) => void;
  clearWorkspaceState: () => void;
  setActiveDocumentId: (documentId: string | undefined) => void;
  applyWorkspaceMutation: (mutation: WorkspaceMutationResponse) => void;
}

export const createWorkspaceSlice: StateCreator<
  EditorStore,
  [],
  [],
  WorkspaceSlice
> = (set) => ({
  workspaceId: undefined,
  workspaceRev: undefined,
  routeRev: undefined,
  opSeq: undefined,
  activeDocumentId: undefined,
  workspaceDocumentsById: {},
  treeRootId: undefined,
  treeById: {},
  workspaceCapabilities: {},
  workspaceCapabilitiesLoaded: false,
  setWorkspaceSnapshot: (workspace) =>
    set((state) => {
      const isSameWorkspace = state.workspaceId === workspace.id;
      const nextDocumentsById: Record<string, WorkspaceDocumentRecord> = {};
      workspace.documents.forEach((document) => {
        nextDocumentsById[document.id] = normalizeWorkspaceDocument(document);
      });

      const nextActiveDocumentId =
        state.activeDocumentId && nextDocumentsById[state.activeDocumentId]
          ? state.activeDocumentId
          : resolveCanonicalWorkspaceDocumentId(workspace.documents);
      const { treeRootId, treeById } = normalizeWorkspaceTree(
        workspace.tree,
        nextDocumentsById
      );
      const activeDocument = nextActiveDocumentId
        ? nextDocumentsById[nextActiveDocumentId]
        : undefined;
      const nextRouteManifest = normalizeRouteManifest(workspace.routeManifest);
      const nextActiveRouteNodeId = resolveActiveRouteNodeId(
        nextRouteManifest,
        [workspace.activeRouteNodeId, state.activeRouteNodeId]
      );

      const nextPirDoc = isWorkspacePirDocument(activeDocument)
        ? activeDocument.content
        : state.pirDoc;
      return {
        workspaceId: workspace.id,
        workspaceRev: workspace.workspaceRev,
        routeRev: workspace.routeRev,
        opSeq: workspace.opSeq,
        workspaceDocumentsById: nextDocumentsById,
        treeRootId,
        treeById,
        workspaceCapabilities: isSameWorkspace
          ? state.workspaceCapabilities
          : {},
        workspaceCapabilitiesLoaded: isSameWorkspace
          ? state.workspaceCapabilitiesLoaded
          : false,
        routeManifest: nextRouteManifest,
        activeRouteNodeId: nextActiveRouteNodeId,
        activeDocumentId: nextActiveDocumentId,
        pirDoc: nextPirDoc,
        pirDocRevision:
          nextPirDoc === state.pirDoc
            ? state.pirDocRevision
            : state.pirDocRevision + 1,
      };
    }),
  setWorkspaceCapabilities: (workspaceId, capabilities) =>
    set((state) => {
      const normalizedWorkspaceId = workspaceId.trim();
      if (
        !normalizedWorkspaceId ||
        normalizedWorkspaceId !== state.workspaceId
      ) {
        return state;
      }
      return {
        workspaceCapabilities: { ...capabilities },
        workspaceCapabilitiesLoaded: true,
      };
    }),
  clearWorkspaceState: () =>
    set({
      workspaceId: undefined,
      workspaceRev: undefined,
      routeRev: undefined,
      opSeq: undefined,
      activeDocumentId: undefined,
      workspaceDocumentsById: {},
      treeRootId: undefined,
      treeById: {},
      workspaceCapabilities: {},
      workspaceCapabilitiesLoaded: false,
      routeManifest: DEFAULT_ROUTE_MANIFEST,
      activeRouteNodeId: undefined,
      runtimeStateByProject: {},
    }),
  setActiveDocumentId: (documentId) =>
    set((state) => {
      const normalizedDocumentId = documentId?.trim();
      if (!normalizedDocumentId) {
        if (state.activeDocumentId === undefined) return state;
        return { activeDocumentId: undefined };
      }
      const nextDocument = state.workspaceDocumentsById[normalizedDocumentId];
      if (!nextDocument) {
        return state;
      }
      if (!isWorkspacePirDocument(nextDocument)) {
        return { activeDocumentId: normalizedDocumentId };
      }
      const pirDocChanged = nextDocument.content !== state.pirDoc;
      return {
        activeDocumentId: normalizedDocumentId,
        pirDoc: nextDocument.content,
        pirDocRevision: pirDocChanged
          ? state.pirDocRevision + 1
          : state.pirDocRevision,
      };
    }),
  applyWorkspaceMutation: (mutation) =>
    set((state) => {
      if (!state.workspaceId || state.workspaceId !== mutation.workspaceId) {
        return state;
      }

      let nextDocumentsById = state.workspaceDocumentsById;
      if (mutation.updatedDocuments?.length) {
        nextDocumentsById = { ...state.workspaceDocumentsById };
        mutation.updatedDocuments.forEach((documentRevision) => {
          const previousDocument = nextDocumentsById[documentRevision.id];
          if (!previousDocument) {
            return;
          }
          nextDocumentsById[documentRevision.id] = {
            ...previousDocument,
            contentRev: documentRevision.contentRev,
            metaRev: documentRevision.metaRev,
            ...(documentRevision.id === state.activeDocumentId
              ? { content: state.pirDoc }
              : null),
          };
        });
      }

      return {
        workspaceRev: mutation.workspaceRev,
        routeRev: mutation.routeRev,
        opSeq: mutation.opSeq,
        workspaceDocumentsById: nextDocumentsById,
      };
    }),
});
