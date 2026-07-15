import type React from 'react';
import type {
  PIRCodeValueResolver,
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
  PIRElementNode,
  PIRRuntimeValueScope,
  PIRTriggerBinding,
} from '@prodivix/pir';
import type { WorkspacePirProjectionPlan } from '@prodivix/workspace';

export type PIRRenderRole = 'source' | 'definition' | 'slot-consumer';

export type PIRRenderLocation = Readonly<{
  documentId: string;
  nodeId: string;
  instancePath: string;
  role: PIRRenderRole;
}>;

export type PIRRenderScopeSnapshot = Required<PIRRuntimeValueScope>;

export type PIRExternalTriggerBinding = Exclude<
  PIRTriggerBinding,
  Readonly<{ kind: 'emit-component-event'; memberId: string }>
>;

export type PIRTriggerDispatchRequest = Readonly<{
  trigger: PIRExternalTriggerBinding;
  payload?: unknown;
  source: PIRRenderLocation;
  emissionSource?: PIRRenderLocation;
  scope: PIRRenderScopeSnapshot;
  setStateById: (stateId: string, value: unknown) => void;
}>;

export type PIRElementProjectionInput = Readonly<{
  node: PIRElementNode;
  location: PIRRenderLocation;
  resolvedProps: Readonly<Record<string, unknown>>;
  resolvedStyle: Readonly<Record<string, unknown>>;
  resolvedText: unknown;
  selected: boolean;
}>;

export type PIRElementProjectionResult = Readonly<{
  props?: Readonly<Record<string, unknown>>;
  children?: React.ReactNode;
  supportsChildren?: boolean;
  isVoid?: boolean;
  renderGraphChildren?: boolean;
  instanceKey?: string;
}>;

export type PIRElementHostEntry = Readonly<{
  component: React.ElementType;
  supportsChildren?: boolean;
  isVoid?: boolean;
  project?: (input: PIRElementProjectionInput) => PIRElementProjectionResult;
}>;

export type PIRRendererHost = Readonly<{
  resolveElement(type: string): PIRElementHostEntry | undefined;
  resolveCodeValue?: PIRCodeValueResolver;
}>;

export const PIR_RENDERER_BLOCKING_ISSUE_CODES = Object.freeze({
  elementResolverMissing: 'PIR_RENDER_ELEMENT_RESOLVER_MISSING',
  codeResolverMissing: 'PIR_RENDER_CODE_RESOLVER_MISSING',
  collectionProjectionBlocked: 'PIR_RENDER_COLLECTION_PROJECTION_BLOCKED',
} as const);

export type PIRRendererBlockingIssueCode =
  (typeof PIR_RENDERER_BLOCKING_ISSUE_CODES)[keyof typeof PIR_RENDERER_BLOCKING_ISSUE_CODES];

export type PIRRendererBlockingIssue = Readonly<{
  code: PIRRendererBlockingIssueCode;
  causeCode?: string;
  path: string;
  message: string;
  documentId: string;
  nodeId: string;
  instancePath?: string;
  elementType?: string;
}>;

export type PIRResolvedRendererHost = Readonly<{
  elementsByType: Readonly<Record<string, PIRElementHostEntry>>;
  resolveCodeValue?: PIRCodeValueResolver;
}>;

export type PIRRendererHostResolution =
  | Readonly<{
      status: 'ready';
      host: PIRResolvedRendererHost;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly PIRRendererBlockingIssue[];
    }>;

export type PIRRendererProps = Readonly<{
  plan: WorkspacePirProjectionPlan;
  host: PIRRendererHost;
  rootParamsById?: Readonly<Record<string, unknown>>;
  rootStateById?: Readonly<Record<string, unknown>>;
  rootDataById?: Readonly<Record<string, unknown>>;
  rootComponentPropsById?: Readonly<Record<string, unknown>>;
  rootComponentVariantsById?: Readonly<Record<string, string | undefined>>;
  resolveCollectionPreviewState?: (
    location: PIRCollectionProjectionLocation
  ) => PIRCollectionPreviewInput | undefined;
  dispatchTrigger: (request: PIRTriggerDispatchRequest) => void;
  selectedLocation?: PIRRenderLocation;
  hiddenLocations?: readonly PIRRenderLocation[];
  onNodeSelect?: (
    location: PIRRenderLocation,
    event: React.SyntheticEvent
  ) => void;
  onBlockingIssues: (issues: readonly PIRRendererBlockingIssue[]) => void;
}>;
