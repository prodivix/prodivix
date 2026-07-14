import {
  readValueByPath,
  resolvePirComponentPropValues,
  resolvePirComponentVariantValues,
  resolvePirValueBinding,
  type PIRComponentContract,
  type PIRDataScope,
  type PIRDocument,
  type PIRElementNode,
  type PIRRuntimeValueScope,
  type PIRTriggerBinding,
} from '@prodivix/pir';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import type {
  PIRRenderLocation,
  PIRRenderScopeSnapshot,
  PIRResolvedRendererHost,
} from '../PIRRenderer.types';

export type PIRRuntimeComponentEventBinding = Readonly<{
  trigger: PIRTriggerBinding;
  consumerScope: PIRInternalRenderScope;
  source: PIRRenderLocation;
}>;

export type PIRInternalRenderScope = PIRRenderScopeSnapshot &
  Readonly<{
    componentEventsById: Readonly<
      Record<string, PIRRuntimeComponentEventBinding>
    >;
    setStateById: (stateId: string, value: unknown) => void;
  }>;

export type PIRComponentRuntimeInput = Readonly<{
  propsById: Readonly<Record<string, unknown>>;
  variantsById: Readonly<Record<string, string | undefined>>;
  eventsById: Readonly<Record<string, PIRRuntimeComponentEventBinding>>;
  slotConsumer: PIRSlotConsumerRuntime;
}>;

export type PIRSlotConsumerRuntime = Readonly<{
  document: WorkspacePirDocument;
  instanceNodeId: string;
  instancePath: string;
  scope: PIRInternalRenderScope;
  componentInput?: PIRComponentRuntimeInput;
}>;

const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

const sortedEntries = <Value>(
  value: Readonly<Record<string, Value>>
): Array<[string, Value]> =>
  Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createLogicParamValues = (
  document: PIRDocument,
  overrides: Readonly<Record<string, unknown>> = EMPTY_RECORD
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ...Object.fromEntries(
      sortedEntries(document.logic?.props ?? {}).map(
        ([paramId, definition]) => [paramId, definition.defaultValue]
      )
    ),
    ...overrides,
  });

export const createPirInitialState = (
  document: PIRDocument,
  overrides: Readonly<Record<string, unknown>> = EMPTY_RECORD
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ...Object.fromEntries(
      sortedEntries(document.logic?.state ?? {}).map(
        ([stateId, definition]) => [stateId, definition.initial]
      )
    ),
    ...overrides,
  });

const resolveRootContractValues = (
  contract: PIRComponentContract | undefined,
  props: Readonly<Record<string, unknown>>,
  variants: Readonly<Record<string, string | undefined>>
): Readonly<{
  propsById: Readonly<Record<string, unknown>>;
  variantsById: Readonly<Record<string, string | undefined>>;
}> => {
  if (!contract) {
    return Object.freeze({
      propsById: Object.freeze({ ...props }),
      variantsById: Object.freeze({ ...variants }),
    });
  }
  return Object.freeze({
    propsById: Object.freeze(
      Object.fromEntries(
        sortedEntries(contract.propsById).map(([memberId, member]) => [
          memberId,
          Object.hasOwn(props, memberId)
            ? props[memberId]
            : member.defaultValue,
        ])
      )
    ),
    variantsById: Object.freeze(
      Object.fromEntries(
        sortedEntries(contract.variantAxesById).map(([memberId, member]) => [
          memberId,
          Object.hasOwn(variants, memberId)
            ? variants[memberId]
            : member.defaultOptionId,
        ])
      )
    ),
  });
};

export const createPirDocumentScope = (
  input: Readonly<{
    document: PIRDocument;
    stateById: Readonly<Record<string, unknown>>;
    setStateById: (stateId: string, value: unknown) => void;
    paramsById?: Readonly<Record<string, unknown>>;
    dataById?: Readonly<Record<string, unknown>>;
    componentInput?: PIRComponentRuntimeInput;
    rootComponentPropsById?: Readonly<Record<string, unknown>>;
    rootComponentVariantsById?: Readonly<Record<string, string | undefined>>;
  }>
): PIRInternalRenderScope => {
  const rootContractValues = resolveRootContractValues(
    input.document.componentContract,
    input.rootComponentPropsById ?? EMPTY_RECORD,
    input.rootComponentVariantsById ?? EMPTY_RECORD
  );
  return Object.freeze({
    paramsById: createLogicParamValues(
      input.document,
      input.paramsById ?? EMPTY_RECORD
    ),
    stateById: input.stateById,
    dataById: Object.freeze({ ...(input.dataById ?? EMPTY_RECORD) }),
    collectionSymbolsById: EMPTY_RECORD,
    componentPropsById:
      input.componentInput?.propsById ?? rootContractValues.propsById,
    componentVariantsById:
      input.componentInput?.variantsById ?? rootContractValues.variantsById,
    slotPropsById: EMPTY_RECORD,
    componentEventsById: input.componentInput?.eventsById ?? EMPTY_RECORD,
    setStateById: input.setStateById,
  });
};

export const createPirComponentRuntimeInput = (
  input: Readonly<{
    contract: PIRComponentContract;
    propBindings: Parameters<typeof resolvePirComponentPropValues>[1];
    variantBindings: Readonly<Record<string, string>>;
    eventBindings: Readonly<Record<string, PIRTriggerBinding>>;
    consumerScope: PIRInternalRenderScope;
    instanceLocation: PIRRenderLocation;
    slotConsumer: PIRSlotConsumerRuntime;
    host: PIRResolvedRendererHost;
  }>
): PIRComponentRuntimeInput =>
  Object.freeze({
    propsById: resolvePirComponentPropValues(
      input.contract,
      input.propBindings,
      input.consumerScope,
      input.host.resolveCodeValue
    ),
    variantsById: resolvePirComponentVariantValues(
      input.contract,
      input.variantBindings
    ),
    eventsById: Object.freeze(
      Object.fromEntries(
        sortedEntries(input.eventBindings).map(([memberId, trigger]) => [
          memberId,
          Object.freeze({
            trigger,
            consumerScope: input.consumerScope,
            source: input.instanceLocation,
          }),
        ])
      )
    ),
    slotConsumer: input.slotConsumer,
  });

const resolveDataScopeValue = (
  dataScope: PIRDataScope,
  scope: PIRInternalRenderScope,
  host: PIRResolvedRendererHost
): unknown => {
  const primaryBinding = dataScope.source ?? dataScope.mock ?? dataScope.value;
  let value = primaryBinding
    ? resolvePirValueBinding(primaryBinding, scope, host.resolveCodeValue)
    : undefined;
  if (dataScope.pick?.trim()) value = readValueByPath(value, dataScope.pick);
  if (dataScope.extend) {
    const extension = Object.fromEntries(
      sortedEntries(dataScope.extend).map(([name, binding]) => [
        name,
        resolvePirValueBinding(binding, scope, host.resolveCodeValue),
      ])
    );
    value = {
      ...(isRecord(value) ? value : {}),
      ...extension,
    };
  }
  return value;
};

export const applyPirElementDataScope = (
  node: PIRElementNode,
  scope: PIRInternalRenderScope,
  host: PIRResolvedRendererHost
): PIRInternalRenderScope => {
  if (!node.data) return scope;
  return Object.freeze({
    ...scope,
    dataById: Object.freeze({
      ...scope.dataById,
      [node.id]: resolveDataScopeValue(node.data, scope, host),
    }),
  });
};

export const withPirSlotProps = (
  scope: PIRInternalRenderScope,
  slotPropsById: Readonly<Record<string, unknown>>
): PIRInternalRenderScope =>
  Object.freeze({
    ...scope,
    slotPropsById,
  });

/** Retains Renderer-owned event/state ports while applying a shared PIR scope. */
export const withPirProjectedValueScope = (
  scope: PIRInternalRenderScope,
  projected: PIRRuntimeValueScope
): PIRInternalRenderScope =>
  Object.freeze({
    ...scope,
    paramsById: projected.paramsById ?? scope.paramsById,
    stateById: projected.stateById ?? scope.stateById,
    dataById: projected.dataById ?? scope.dataById,
    collectionSymbolsById:
      projected.collectionSymbolsById ?? scope.collectionSymbolsById,
    componentPropsById:
      projected.componentPropsById ?? scope.componentPropsById,
    componentVariantsById:
      projected.componentVariantsById ?? scope.componentVariantsById,
    slotPropsById: projected.slotPropsById ?? scope.slotPropsById,
  });
