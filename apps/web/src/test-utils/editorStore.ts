import { createEmptyPirDocument, type PIRDocument } from '@prodivix/pir';
import {
  createWorkspaceHistoryState,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createGlobalDefaults,
  type GlobalSettingsState,
} from '@/editor/features/settings/SettingsDefaults';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';

type EditorState = ReturnType<typeof useEditorStore.getState>;

export const createPirDoc = (): PIRDocument => createEmptyPirDocument();

export const createEditorWorkspace = (
  pirDocument: PIRDocument = createPirDoc()
): WorkspaceSnapshot => ({
  id: 'workspace-test',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['doc-page-home'],
    },
    'doc-page-home': {
      id: 'doc-page-home',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: pirDocument,
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [{ id: 'route-home', index: true, pageDocId: 'page-home' }],
    },
  },
  activeDocumentId: 'page-home',
  activeRouteNodeId: 'route-home',
});

export const resetEditorStore = (overrides: Partial<EditorState> = {}) => {
  const state = useEditorStore.getState();
  useEditorStore.setState(
    {
      ...state,
      workspace: null,
      workspaceHistory: createWorkspaceHistoryState(),
      documentEditSeqById: {},
      workspaceCapabilities: {},
      workspaceCapabilitiesLoaded: false,
      workspaceReadonly: false,
      workspaceRevisionConflict: null,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
      blueprintStateByProject: {},
      runtimeStateByProject: {},
      projectsById: {},
      ...overrides,
    },
    true
  );
};

export const resetSettingsStore = (
  overrides: Partial<GlobalSettingsState> = {}
) => {
  const state = useSettingsStore.getState();
  useSettingsStore.setState(
    {
      ...state,
      global: { ...createGlobalDefaults(), ...overrides },
      projectGlobalById: {},
    },
    true
  );
};
