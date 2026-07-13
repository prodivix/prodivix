export { PIRRenderer } from './PIRRenderer';
export {
  registerNodeCapability,
  resolveLinkCapability,
  resolveNodeCapabilities,
} from './capabilities';
export {
  ensureIconProviderReady,
  getIconProviderState,
  getIconRegistryRevision,
  getRegisteredIconLibraries,
  isIconRef,
  listIconNamesByProvider,
  listIconProviders,
  registerIconProvider,
  resolveIconRef,
  setConfiguredIconLibraryIds,
  subscribeIconRegistry,
  unregisterIconProvider,
} from './iconRegistry';
export {
  createComponentRegistry,
  createOrderedComponentRegistry,
  defaultComponentRegistry,
  parseResolverOrder,
} from './registry';
export {
  resolvePdxOutletRouteNodeId,
  resolvePdxRouteRendererProps,
  shouldRenderPdxOutletChildren,
} from './PIRRenderer.routeContext';
export {
  createRouteDebugSnapshot,
  getRouteDebugEventDetail,
  isRouteDebugEnabled,
  logRouteDebug,
} from './routeDebug';

export type {
  ActionContext,
  ActionHandlers,
  BuiltInActionDispatchOptions,
  PIRInteractionMode,
  PIRRendererProps,
  RendererCodeArtifact,
  RenderContext,
  RenderParams,
  RenderState,
} from './PIRRenderer.types';
export type {
  AdapterContext,
  AdapterResult,
  ComponentAdapter,
  ComponentKind,
  ComponentRegistry,
  RegistryEntry,
  RegistryGroup,
  ResolvedComponent,
} from './registry';
export type {
  IconComponent,
  IconLibraryMeta,
  IconProviderMeta,
  IconProviderRegistration,
  IconProviderState,
  IconProviderStatus,
  IconRef,
} from './iconRegistry';
export type {
  LinkCapability,
  NodeCapability,
  TriggerConflictPolicy,
} from './capabilities';
export type { PdxRouteRendererContext } from './PIRRenderer.routeContext';
export type { RouteDebugSnapshot } from './routeDebug';
