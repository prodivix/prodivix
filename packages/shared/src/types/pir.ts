export type {
  DataRef as DataReference,
  IndexRef as IndexReference,
  ItemRef as ItemReference,
  NodeId,
  ParamRef as ParamReference,
  PropDef,
  StateDef,
  StateRef as StateReference,
} from './pir.generated.js';

export { CURRENT_PIR_VERSION } from './pir.generated.js';

import type {
  DataRef as DataReference,
  IndexRef as IndexReference,
  ItemRef as ItemReference,
  NodeId,
  PIRDocument as GeneratedPIRDocument,
  ParamRef as ParamReference,
  StateRef as StateReference,
} from './pir.generated.js';
import type { AnimationDefinition } from '@prodivix/animation';

export type PIRVersion = GeneratedPIRDocument['version'];

export type ScopeSourceReference =
  ParamReference | StateReference | DataReference | ItemReference;

export type ValueOrRef =
  | unknown
  | ParamReference
  | StateReference
  | DataReference
  | ItemReference
  | IndexReference;

export type NodeDataScope = {
  source?: ScopeSourceReference;
  pick?: string;
  value?: ValueOrRef;
  mock?: ValueOrRef;
  extend?: Record<string, ValueOrRef>;
};

export type NodeListRender = {
  source?: ScopeSourceReference;
  arrayField?: string;
  itemAs?: string;
  indexAs?: string;
  keyBy?: string;
  emptyNodeId?: string;
};

export type EventBinding = {
  trigger: string;
  action?: string;
  params?: Record<string, ValueOrRef>;
};

export interface ComponentNode {
  id: string;
  type: string;
  text?: ValueOrRef;
  style?: Record<string, ValueOrRef>;
  props?: Record<string, ValueOrRef>;
  data?: NodeDataScope;
  list?: NodeListRender;
  children?: ComponentNode[];
  events?: Record<string, EventBinding>;
}

export type ComponentNodeData = Omit<ComponentNode, 'children'>;

export type UiGraph = {
  version: 1;
  rootId: NodeId;
  nodesById: Record<NodeId, ComponentNodeData>;
  childIdsById: Record<NodeId, NodeId[]>;
  regionsById?: Record<NodeId, Record<string, NodeId[]>>;
  order?: {
    strategy: 'childIdsById';
  };
};

export interface LogicDefinition {
  props?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array' | string;
      description?: string;
      default?: unknown;
    }
  >;
  state?: Record<
    string,
    {
      type?: string;
      initial: unknown;
    }
  >;
  graphs?: unknown[];
}

export interface PIRDocument {
  version: PIRVersion;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  ui: {
    graph: UiGraph;
  };
  logic?: LogicDefinition;
  animation?: AnimationDefinition;
}
