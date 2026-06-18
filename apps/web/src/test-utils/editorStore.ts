import type { ComponentNode, PIRDocument } from '@prodivix/shared/types/pir';
import {
  createGlobalDefaults,
  type GlobalSettingsState,
} from '@/editor/features/settings/SettingsDefaults';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { normalizePirDocument } from '@/pir/resolvePirDocument';

type EditorState = ReturnType<typeof useEditorStore.getState>;

export const createPirDoc = (children: ComponentNode[] = []): PIRDocument => ({
  ...normalizePirDocument({
    version: '1.0',
    ui: {
      root: {
        id: 'root',
        type: 'container',
        ...(children.length ? { children } : {}),
      },
    },
  }),
});

export const resetEditorStore = (overrides: Partial<EditorState> = {}) => {
  const state = useEditorStore.getState();
  useEditorStore.setState(
    {
      ...state,
      pirDoc: createPirDoc(),
      pirDocRevision: 0,
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
      workspaceReadonly: false,
      routeManifest: {
        version: '1',
        root: { id: 'root', children: [] },
      },
      activeRouteNodeId: undefined,
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
