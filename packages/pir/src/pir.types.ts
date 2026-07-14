import type { CodeReference, TriggerBinding } from '@prodivix/authoring';

export type PIRJsonValue =
  null | boolean | number | string | readonly PIRJsonValue[] | PIRJsonObject;

export type PIRJsonObject = {
  readonly [key: string]: PIRJsonValue;
};

export type PIRValueBinding =
  | Readonly<{ kind: 'literal'; value: PIRJsonValue }>
  | Readonly<{ kind: 'param'; paramId: string; path?: string }>
  | Readonly<{ kind: 'state'; stateId: string; path?: string }>
  | Readonly<{ kind: 'data'; dataId: string; path?: string }>
  | Readonly<{
      kind: 'collection-symbol';
      symbolId: string;
      path?: string;
    }>
  | Readonly<{
      kind: 'component-prop';
      memberId: string;
      path?: string;
    }>
  | Readonly<{
      kind: 'component-variant';
      memberId: string;
      path?: string;
    }>
  | Readonly<{
      kind: 'slot-prop';
      memberId: string;
      path?: string;
    }>
  | Readonly<{ kind: 'code'; reference: CodeReference }>;

export type PIRTriggerBinding =
  | TriggerBinding
  | Readonly<{
      kind: 'emit-component-event';
      memberId: string;
      payload?: PIRValueBinding;
    }>;

export type PIRComponentPropContract = Readonly<{
  id: string;
  name: string;
  typeRef: string;
  required?: boolean;
  defaultValue?: PIRJsonValue;
  capabilityIds?: readonly string[];
}>;

export type PIRComponentEventContract = Readonly<{
  id: string;
  name: string;
  payloadTypeRef?: string;
  capabilityIds?: readonly string[];
}>;

export type PIRComponentSlotContract = Readonly<{
  id: string;
  name: string;
  minChildren?: number;
  maxChildren?: number;
  capabilityIds?: readonly string[];
  propsById?: Readonly<Record<string, PIRComponentPropContract>>;
}>;

export type PIRComponentVariantOption = Readonly<{
  id: string;
  name: string;
}>;

export type PIRComponentVariantContract = Readonly<{
  id: string;
  name: string;
  required?: boolean;
  defaultOptionId?: string;
  optionsById: Readonly<Record<string, PIRComponentVariantOption>>;
}>;

export type PIRComponentPartContract = Readonly<{
  id: string;
  name: string;
  targetNodeId: string;
  capabilityIds?: readonly string[];
}>;

export type PIRComponentTokenContract = Readonly<{
  id: string;
  tokenPath: string;
  target:
    | Readonly<{ kind: 'prop'; memberId: string }>
    | Readonly<{ kind: 'part'; memberId: string }>;
  required?: boolean;
}>;

export type PIRComponentAccessibilityContract = Readonly<{
  requiredRole?: string;
  requiresAccessibleName?: boolean;
  description?: string;
}>;

export type PIRComponentContract = Readonly<{
  propsById: Readonly<Record<string, PIRComponentPropContract>>;
  eventsById: Readonly<Record<string, PIRComponentEventContract>>;
  slotsById: Readonly<Record<string, PIRComponentSlotContract>>;
  variantAxesById: Readonly<Record<string, PIRComponentVariantContract>>;
  partsById?: Readonly<Record<string, PIRComponentPartContract>>;
  tokenBindings?: readonly PIRComponentTokenContract[];
  accessibility?: PIRComponentAccessibilityContract;
}>;

export type PIRDataScope = Readonly<{
  source?: PIRValueBinding;
  pick?: string;
  value?: PIRValueBinding;
  mock?: PIRValueBinding;
  extend?: Readonly<Record<string, PIRValueBinding>>;
}>;

export type PIRElementNode = Readonly<{
  id: string;
  kind: 'element';
  type: string;
  text?: PIRValueBinding;
  style?: Readonly<Record<string, PIRValueBinding>>;
  props?: Readonly<Record<string, PIRValueBinding>>;
  data?: PIRDataScope;
  events?: Readonly<Record<string, PIRTriggerBinding>>;
}>;

export type PIRComponentInstanceNode = Readonly<{
  id: string;
  kind: 'component-instance';
  componentDocumentId: string;
  bindings: Readonly<{
    props: Readonly<Record<string, PIRValueBinding>>;
    events: Readonly<Record<string, PIRTriggerBinding>>;
    variants: Readonly<Record<string, string>>;
  }>;
}>;

export type PIRComponentSlotOutletNode = Readonly<{
  id: string;
  kind: 'component-slot-outlet';
  slotMemberId: string;
  bindings: Readonly<{
    props: Readonly<Record<string, PIRValueBinding>>;
  }>;
}>;

export type PIRCollectionSourceBinding =
  | Readonly<{ kind: 'literal'; value: readonly PIRJsonValue[] }>
  | Readonly<{ kind: 'binding'; value: PIRValueBinding }>;

export type PIRCollectionKeyBinding =
  | Readonly<{ kind: 'binding'; value: PIRValueBinding }>
  | Readonly<{ kind: 'index' }>;

export type PIRCollectionNode = Readonly<{
  id: string;
  kind: 'collection';
  source: PIRCollectionSourceBinding;
  key: PIRCollectionKeyBinding;
  symbols: Readonly<{
    itemId: string;
    itemName: string;
    indexId: string;
    indexName: string;
    errorId?: string;
  }>;
}>;

export type PIRNode =
  | PIRElementNode
  | PIRComponentInstanceNode
  | PIRComponentSlotOutletNode
  | PIRCollectionNode;

export type PIRUiGraph = Readonly<{
  rootId: string;
  nodesById: Readonly<Record<string, PIRNode>>;
  childIdsById: Readonly<Record<string, readonly string[]>>;
  regionsById?: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
  order?: Readonly<{ strategy: 'childIdsById' }>;
}>;

export type PIRLogicDefinition = Readonly<{
  props?: Readonly<
    Record<
      string,
      Readonly<{
        name?: string;
        typeRef: string;
        description?: string;
        defaultValue?: PIRJsonValue;
      }>
    >
  >;
  state?: Readonly<
    Record<
      string,
      Readonly<{
        name?: string;
        typeRef?: string;
        initial: PIRJsonValue;
      }>
    >
  >;
}>;

export type PIRDocument = Readonly<{
  metadata?: Readonly<{
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  componentContract?: PIRComponentContract;
  ui: Readonly<{ graph: PIRUiGraph }>;
  logic?: PIRLogicDefinition;
}>;
