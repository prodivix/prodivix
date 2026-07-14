import type { CodeReference } from '@prodivix/authoring';
import { readValueByPath } from './readValueByPath';
import type {
  PIRComponentContract,
  PIRComponentSlotOutletNode,
  PIRJsonValue,
  PIRUiGraph,
  PIRValueBinding,
} from '../pir.types';

export type PIRValueProjectionSourceKind =
  | 'param'
  | 'state'
  | 'data'
  | 'collection-symbol'
  | 'component-prop'
  | 'component-variant'
  | 'slot-prop';

export type PIRValueProjectionPort<Result> = Readonly<{
  literal(value: PIRJsonValue): Result;
  reference(kind: PIRValueProjectionSourceKind, id: string): Result;
  code(reference: CodeReference): Result;
  accessPath(value: Result, path: string): Result;
}>;

export type PIRRuntimeValueScope = Readonly<{
  paramsById?: Readonly<Record<string, unknown>>;
  stateById?: Readonly<Record<string, unknown>>;
  dataById?: Readonly<Record<string, unknown>>;
  collectionSymbolsById?: Readonly<Record<string, unknown>>;
  componentPropsById?: Readonly<Record<string, unknown>>;
  componentVariantsById?: Readonly<Record<string, unknown>>;
  slotPropsById?: Readonly<Record<string, unknown>>;
}>;

export type PIRCodeValueResolver = (
  reference: CodeReference,
  scope: PIRRuntimeValueScope
) => unknown;

const unreachableBinding = (binding: never): never => {
  throw new Error(
    `Unsupported PIR-current value binding: ${JSON.stringify(binding)}`
  );
};

/** Projects one value binding through a target-specific value port. */
export const projectPirValueBinding = <Result>(
  binding: PIRValueBinding,
  port: PIRValueProjectionPort<Result>
): Result => {
  let value: Result;
  switch (binding.kind) {
    case 'literal':
      value = port.literal(binding.value);
      break;
    case 'param':
      value = port.reference('param', binding.paramId);
      break;
    case 'state':
      value = port.reference('state', binding.stateId);
      break;
    case 'data':
      value = port.reference('data', binding.dataId);
      break;
    case 'collection-symbol':
      value = port.reference('collection-symbol', binding.symbolId);
      break;
    case 'component-prop':
      value = port.reference('component-prop', binding.memberId);
      break;
    case 'component-variant':
      value = port.reference('component-variant', binding.memberId);
      break;
    case 'slot-prop':
      value = port.reference('slot-prop', binding.memberId);
      break;
    case 'code':
      value = port.code(binding.reference);
      break;
    default:
      return unreachableBinding(binding);
  }
  return binding.kind !== 'literal' &&
    binding.kind !== 'code' &&
    binding.path !== undefined
    ? port.accessPath(value, binding.path)
    : value;
};

const readRuntimeSource = (
  scope: PIRRuntimeValueScope,
  kind: PIRValueProjectionSourceKind,
  id: string
): unknown => {
  switch (kind) {
    case 'param':
      return scope.paramsById?.[id];
    case 'state':
      return scope.stateById?.[id];
    case 'data':
      return scope.dataById?.[id];
    case 'collection-symbol':
      return scope.collectionSymbolsById?.[id];
    case 'component-prop':
      return scope.componentPropsById?.[id];
    case 'component-variant':
      return scope.componentVariantsById?.[id];
    case 'slot-prop':
      return scope.slotPropsById?.[id];
  }
};

/** Resolves one binding without widening the lexical scope implicitly. */
export const resolvePirValueBinding = (
  binding: PIRValueBinding,
  scope: PIRRuntimeValueScope,
  resolveCodeValue: PIRCodeValueResolver = () => undefined
): unknown =>
  projectPirValueBinding(binding, {
    literal: (value) => value,
    reference: (kind, id) => readRuntimeSource(scope, kind, id),
    code: (reference) => resolveCodeValue(reference, scope),
    accessPath: readValueByPath,
  });

export const resolvePirComponentPropValues = (
  contract: PIRComponentContract,
  bindings: Readonly<Record<string, PIRValueBinding>>,
  consumerScope: PIRRuntimeValueScope,
  resolveCodeValue?: PIRCodeValueResolver
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(contract.propsById)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([memberId, member]) => [
          memberId,
          bindings[memberId]
            ? resolvePirValueBinding(
                bindings[memberId],
                consumerScope,
                resolveCodeValue
              )
            : member.defaultValue,
        ])
    )
  );

export const resolvePirComponentVariantValues = (
  contract: PIRComponentContract,
  bindings: Readonly<Record<string, string>>
): Readonly<Record<string, string | undefined>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(contract.variantAxesById)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([memberId, member]) => [
          memberId,
          bindings[memberId] ?? member.defaultOptionId,
        ])
    )
  );

export const resolvePirSlotPropValues = (
  outlet: PIRComponentSlotOutletNode,
  definitionScope: PIRRuntimeValueScope,
  resolveCodeValue?: PIRCodeValueResolver
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(outlet.bindings.props)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([memberId, binding]) => [
          memberId,
          resolvePirValueBinding(binding, definitionScope, resolveCodeValue),
        ])
    )
  );

export type PIRSlotProjection =
  | Readonly<{
      kind: 'consumer';
      nodeIds: readonly string[];
    }>
  | Readonly<{
      kind: 'fallback';
      nodeIds: readonly string[];
    }>;

/** Presence of a consumer region, including an empty region, suppresses fallback. */
export const selectPirSlotProjection = (
  input: Readonly<{
    consumerGraph: PIRUiGraph;
    instanceNodeId: string;
    slotMemberId: string;
    fallbackNodeIds: readonly string[];
  }>
): PIRSlotProjection => {
  const regions = input.consumerGraph.regionsById?.[input.instanceNodeId];
  if (regions && Object.hasOwn(regions, input.slotMemberId)) {
    return Object.freeze({
      kind: 'consumer',
      nodeIds: Object.freeze([...(regions[input.slotMemberId] ?? [])]),
    });
  }
  return Object.freeze({
    kind: 'fallback',
    nodeIds: Object.freeze([...input.fallbackNodeIds]),
  });
};
