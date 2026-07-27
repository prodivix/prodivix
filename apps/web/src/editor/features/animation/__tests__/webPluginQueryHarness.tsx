import { useMemo, type ElementType, type ReactNode } from 'react';
import { WebPluginQueryContext } from '@/plugins/platform/WebPluginPlatformContext';
import type {
  PaletteRegistrySnapshot,
  RendererComponentProjection,
  WebExtensionRegistrySnapshot,
  WebPluginQueryServices,
} from '@/plugins/platform/types';

const unsubscribe = () => undefined;
const subscribe = () => unsubscribe;

const CONTAINER_NATIVE_SURFACE: RendererComponentProjection['surface'] = {
  compatibility: 'container-native',
  viewport: 'container',
  browserMetrics: 'none',
  styles: 'inherited',
  focusKeyboard: 'host-native',
  intrinsicSize: 'parent-constrained',
};

const EMPTY_PALETTE_SNAPSHOT: PaletteRegistrySnapshot = {
  revision: 1,
  groups: [],
  itemsById: new Map(),
  itemsByRuntimeType: new Map(),
  creationRecipesByItemId: new Map(),
  compositionRulesByRuntimeType: new Map(),
};

export const createRendererComponentProjection = (
  runtimeType: string,
  component: ElementType
): RendererComponentProjection => ({
  owner: {
    pluginId: 'test.plugin',
    installationId: 'installation-test',
    generation: 1,
  },
  contributionId: `render-policy-${runtimeType}`,
  libraryId: 'test-library',
  runtimeType,
  component,
  adapter: { kind: 'custom', supportsChildren: true },
  surface: CONTAINER_NATIVE_SURFACE,
});

const createQueryServices = (
  rendererComponents: readonly RendererComponentProjection[]
): WebPluginQueryServices => {
  const extensionSnapshot: WebExtensionRegistrySnapshot = {
    revision: 1,
    externalLibraries: [],
    externalComponentsByRuntimeType: new Map(),
    rendererComponents,
    iconProviders: [],
    codegenPolicy: {
      schemaVersion: '1.0',
      registryRevision: 1,
      targetPreset: 'react-vite',
      libraries: [],
      iconProviders: [],
    },
  };
  return {
    workspaceId: 'workspace-animation-test',
    palette: {
      getSnapshot: () => EMPTY_PALETTE_SNAPSHOT,
      getItemById: () => undefined,
      getItemByRuntimeType: () => undefined,
      getCreationRecipe: () => undefined,
      getCompositionRule: () => undefined,
      subscribe,
    },
    extensions: {
      getSnapshot: () => extensionSnapshot,
      subscribe,
    },
  };
};

/**
 * Publishes a fixed plugin extension registry so editor surfaces can be tested
 * without booting a real plugin Host session.
 */
export const WebPluginQueryHarness = ({
  children,
  rendererComponents = [],
}: Readonly<{
  children: ReactNode;
  rendererComponents?: readonly RendererComponentProjection[];
}>) => {
  const services = useMemo(
    () => createQueryServices(rendererComponents),
    [rendererComponents]
  );
  return (
    <WebPluginQueryContext.Provider value={services}>
      {children}
    </WebPluginQueryContext.Provider>
  );
};
