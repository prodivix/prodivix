export { PIRRenderer } from './PIRRenderer';
export { PIR_RENDERER_BLOCKING_ISSUE_CODES } from './PIRRenderer.types';
export { resolvePirRendererHost } from './host/pirRendererHost';
export {
  registerNodeCapability,
  resolveLinkCapability,
  resolveNodeCapabilities,
} from './host/capabilities';
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
} from './host/iconRegistry';
export {
  createComponentRegistry,
  createOrderedComponentRegistry,
  defaultComponentRegistry,
  parseResolverOrder,
} from './host/registry';
export {
  resolvePdxOutletRouteNodeId,
  resolvePdxRouteRendererProps,
  shouldRenderPdxOutletChildren,
} from './runtime/pirRouteContext';
export {
  createRouteDebugSnapshot,
  getRouteDebugEventDetail,
  isRouteDebugEnabled,
  logRouteDebug,
} from './runtime/routeDebug';

export type {
  PIRElementHostEntry,
  PIRElementProjectionInput,
  PIRElementProjectionResult,
  PIRExternalTriggerBinding,
  PIRRenderLocation,
  PIRRendererBlockingIssue,
  PIRRendererBlockingIssueCode,
  PIRRendererHost,
  PIRRendererHostResolution,
  PIRRendererProps,
  PIRRenderRole,
  PIRRenderScopeSnapshot,
  PIRResolvedRendererHost,
  PIRTriggerDispatchRequest,
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
} from './host/registry';
export type {
  IconComponent,
  IconLibraryMeta,
  IconProviderMeta,
  IconProviderRegistration,
  IconProviderState,
  IconProviderStatus,
  IconRef,
} from './host/iconRegistry';
export type {
  LinkCapability,
  NodeCapability,
  TriggerConflictPolicy,
} from './host/capabilities';
export type { PdxRouteRendererContext } from './runtime/pirRouteContext';
export type { RouteDebugSnapshot } from './runtime/routeDebug';
