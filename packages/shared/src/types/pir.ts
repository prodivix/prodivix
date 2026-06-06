/* eslint-disable */
/**
 * Generated from PIR Schema v1.0
 * DO NOT EDIT - Run `pnpm run generate-types` to regenerate
 */

export interface PIRDocumentV10 {
  version: string;
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
    [k: string]: unknown;
  };
  ui: {
    root: ComponentNode;
  };
  logic?: {
    graphs?: {
      [k: string]: NodeGraph;
    };
    state?: {
      [k: string]: StateDef;
    };
  };
}
export interface ComponentNode {
  id?: string;
  type: string;
  text?: string;
  style?: {
    [k: string]: unknown;
  };
  props?: {
    [k: string]: unknown;
  };
  children?: ComponentNode[];
  events?: {
    [k: string]: EventBinding;
  };
  binding?: DataBinding;
  resources?: {
    [k: string]: Resource;
  };
  _comment?: string;
}
export interface EventBinding {
  target: string;
  payload?: {
    [k: string]: unknown;
  };
  debounce?: number;
  preventDefault?: boolean;
}
export interface DataBinding {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}
export interface Resource {
  type: 'file' | 'url' | 'inline';
  value: string;
  mimeType?: string;
}
export interface NodeGraph {
  id: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface GraphNode {
  id: string;
  type: string;
  inputs?: {
    [k: string]: unknown;
  }[];
  outputs?: {
    [k: string]: unknown;
  }[];
  config?: {
    [k: string]: unknown;
  };
}
export interface GraphEdge {
  id: string;
  source: {
    nodeId: string;
    port: string;
    [k: string]: unknown;
  };
  target: {
    nodeId: string;
    port: string;
    [k: string]: unknown;
  };
}
export interface StateDef {
  type: 'local' | 'global' | 'derived';
  initial?: unknown;
  schema?: {
    [k: string]: unknown;
  };
}
