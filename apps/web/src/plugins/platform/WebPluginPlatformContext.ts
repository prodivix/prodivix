import { createContext, useContext, useSyncExternalStore } from 'react';
import type {
  PaletteQueryService,
  WebPluginQueryServices,
  WebPluginRuntimeServices,
} from '@/plugins/platform/types';

/** Stable Context identities are isolated from the hot-reloaded Provider. */
export const WebPluginQueryContext =
  createContext<WebPluginQueryServices | null>(null);
export const WebPluginRuntimeContext =
  createContext<WebPluginRuntimeServices | null>(null);

export const useWebPluginQueries = (): WebPluginQueryServices => {
  const services = useContext(WebPluginQueryContext);
  if (!services) {
    throw new Error(
      'Web plugin query services require WebPluginPlatformProvider.'
    );
  }
  return services;
};

export const useWebPluginRuntimeServices = (): WebPluginRuntimeServices => {
  const services = useContext(WebPluginRuntimeContext);
  if (!services) {
    throw new Error(
      'Web plugin runtime services require WebPluginPlatformProvider.'
    );
  }
  return services;
};

export const usePaletteQueryService = (): PaletteQueryService =>
  useWebPluginQueries().palette;

export const usePaletteRegistrySnapshot = () => {
  const palette = usePaletteQueryService();
  return useSyncExternalStore(
    palette.subscribe,
    palette.getSnapshot,
    palette.getSnapshot
  );
};

export const usePaletteGroups = () => usePaletteRegistrySnapshot().groups;

export const useWebExtensionRegistrySnapshot = () => {
  const extensions = useWebPluginQueries().extensions;
  return useSyncExternalStore(
    extensions.subscribe,
    extensions.getSnapshot,
    extensions.getSnapshot
  );
};

export const useCodegenPolicySnapshot = () =>
  useWebExtensionRegistrySnapshot().codegenPolicy;
