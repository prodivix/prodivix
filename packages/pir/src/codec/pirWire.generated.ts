/* eslint-disable */
/**
 * Generated wire contract from specs/pir/PIR-current.json
 * Owned by the @prodivix/pir codec boundary; domain consumers must decode this shape.
 * DO NOT EDIT - Run `pnpm run pir:sync-wire` to regenerate.
 */

export type PIRWireJsonValue =
  | null
  | boolean
  | number
  | string
  | PIRWireJsonValue[]
  | {
      [k: string]: PIRWireJsonValue;
    };
export type PIRWireComponentTokenTarget =
  | {
      kind: 'prop';
      memberId: string;
    }
  | {
      kind: 'part';
      memberId: string;
    };
export type PIRWireNode =
  | PIRWireElementNode
  | PIRWireComponentInstanceNode
  | PIRWireComponentSlotOutletNode
  | PIRWireCollectionNode;
export type PIRWireValueBinding =
  | {
      kind: 'literal';
      value: PIRWireJsonValue;
    }
  | {
      kind: 'param';
      paramId: string;
      path?: string;
    }
  | {
      kind: 'state';
      stateId: string;
      path?: string;
    }
  | {
      kind: 'data';
      dataId: string;
      path?: string;
    }
  | {
      kind: 'collection-symbol';
      symbolId: string;
      path?: string;
    }
  | {
      kind: 'component-prop';
      memberId: string;
      path?: string;
    }
  | {
      kind: 'component-variant';
      memberId: string;
      path?: string;
    }
  | {
      kind: 'slot-prop';
      memberId: string;
      path?: string;
    }
  | {
      kind: 'code';
      reference: PIRWireCodeReference;
    };
export type PIRWireTriggerBinding =
  | {
      kind: 'open-url';
      href: string;
    }
  | {
      kind: 'navigate-route';
      routeId: string;
    }
  | {
      kind: 'run-nodegraph';
      documentId: string;
      inputMapping?: unknown;
    }
  | {
      kind: 'play-animation';
      documentId: string;
      timelineId: string;
      command: 'play' | 'pause' | 'seek';
    }
  | {
      kind: 'call-code';
      slotId: string;
      reference: PIRWireCodeReference;
    }
  | {
      kind: 'emit-component-event';
      memberId: string;
      payload?: PIRWireValueBinding;
    };
export type PIRWireCollectionSourceBinding =
  | {
      kind: 'literal';
      value: PIRWireJsonValue[];
    }
  | {
      kind: 'binding';
      value: PIRWireValueBinding;
    };
export type PIRWireCollectionKeyBinding =
  | {
      kind: 'binding';
      value: PIRWireValueBinding;
    }
  | {
      kind: 'index';
    };
export type PIRWireNodeIdArray = string[];

export interface PIRWireDocument {
  version: '1.4';
  metadata?: PIRWireMetadata;
  componentContract?: PIRWireComponentContract;
  ui: {
    graph: PIRWireUiGraph;
  };
  logic?: PIRWireLogicDefinition;
}
export interface PIRWireMetadata {
  name?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface PIRWireComponentContract {
  propsById: {
    [k: string]: PIRWireComponentPropContract;
  };
  eventsById: {
    [k: string]: PIRWireComponentEventContract;
  };
  slotsById: {
    [k: string]: PIRWireComponentSlotContract;
  };
  variantAxesById: {
    [k: string]: PIRWireComponentVariantContract;
  };
  partsById?: {
    [k: string]: PIRWireComponentPartContract;
  };
  tokenBindings?: PIRWireComponentTokenContract[];
  accessibility?: PIRWireComponentAccessibilityContract;
}
export interface PIRWireComponentPropContract {
  id: string;
  name: string;
  typeRef: string;
  required?: boolean;
  defaultValue?: PIRWireJsonValue;
  capabilityIds?: string[];
}
export interface PIRWireComponentEventContract {
  id: string;
  name: string;
  payloadTypeRef?: string;
  capabilityIds?: string[];
}
export interface PIRWireComponentSlotContract {
  id: string;
  name: string;
  minChildren?: number;
  maxChildren?: number;
  capabilityIds?: string[];
  propsById?: {
    [k: string]: PIRWireComponentPropContract;
  };
}
export interface PIRWireComponentVariantContract {
  id: string;
  name: string;
  required?: boolean;
  defaultOptionId?: string;
  optionsById: {
    [k: string]: PIRWireComponentVariantOption;
  };
}
export interface PIRWireComponentVariantOption {
  id: string;
  name: string;
}
export interface PIRWireComponentPartContract {
  id: string;
  name: string;
  targetNodeId: string;
  capabilityIds?: string[];
}
export interface PIRWireComponentTokenContract {
  id: string;
  tokenPath: string;
  target: PIRWireComponentTokenTarget;
  required?: boolean;
}
export interface PIRWireComponentAccessibilityContract {
  requiredRole?: string;
  requiresAccessibleName?: boolean;
  description?: string;
}
export interface PIRWireUiGraph {
  version: 1;
  rootId: string;
  nodesById: {
    [k: string]: PIRWireNode;
  };
  childIdsById: {
    [k: string]: PIRWireNodeIdArray;
  };
  regionsById?: {
    [k: string]: PIRWireRegionMap;
  };
  order?: {
    strategy: 'childIdsById';
  };
}
export interface PIRWireElementNode {
  id: string;
  kind: 'element';
  type: string;
  text?: PIRWireValueBinding;
  style?: {
    [k: string]: PIRWireValueBinding;
  };
  props?: {
    [k: string]: PIRWireValueBinding;
  };
  data?: PIRWireDataScope;
  events?: {
    [k: string]: PIRWireTriggerBinding;
  };
}
export interface PIRWireCodeReference {
  artifactId: string;
  exportName?: string;
  symbolId?: string;
  sourceSpan?: PIRWireSourceSpan;
}
export interface PIRWireSourceSpan {
  artifactId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface PIRWireDataScope {
  source?: PIRWireValueBinding;
  pick?: string;
  value?: PIRWireValueBinding;
  mock?: PIRWireValueBinding;
  extend?: {
    [k: string]: PIRWireValueBinding;
  };
}
export interface PIRWireComponentInstanceNode {
  id: string;
  kind: 'component-instance';
  componentDocumentId: string;
  bindings: PIRWireComponentInstanceBindings;
}
export interface PIRWireComponentInstanceBindings {
  props: {
    [k: string]: PIRWireValueBinding;
  };
  events: {
    [k: string]: PIRWireTriggerBinding;
  };
  variants: {
    [k: string]: string;
  };
}
export interface PIRWireComponentSlotOutletNode {
  id: string;
  kind: 'component-slot-outlet';
  slotMemberId: string;
  bindings: {
    props: {
      [k: string]: PIRWireValueBinding;
    };
  };
}
export interface PIRWireCollectionNode {
  id: string;
  kind: 'collection';
  source: PIRWireCollectionSourceBinding;
  key: PIRWireCollectionKeyBinding;
  symbols: PIRWireCollectionSymbols;
}
export interface PIRWireCollectionSymbols {
  itemId: string;
  itemName: string;
  indexId: string;
  indexName: string;
  errorId?: string;
}
/**
 * Named node regions. Collection owners use item, empty, loading, and error regions; Component Instance owners use stable slot member ids.
 */
export interface PIRWireRegionMap {
  [k: string]: PIRWireNodeIdArray;
}
export interface PIRWireLogicDefinition {
  props?: {
    [k: string]: PIRWireLogicPropDefinition;
  };
  state?: {
    [k: string]: PIRWireLogicStateDefinition;
  };
}
export interface PIRWireLogicPropDefinition {
  name?: string;
  typeRef: string;
  description?: string;
  defaultValue?: PIRWireJsonValue;
}
export interface PIRWireLogicStateDefinition {
  name?: string;
  typeRef?: string;
  initial: PIRWireJsonValue;
}

export const CURRENT_PIR_WIRE_VERSION = '1.4' as PIRWireDocument['version'];
