import {
  resolvePirComponentVariantValues,
  type PIRComponentContract,
  type PIRNode,
  type PIRTriggerBinding,
  type PIRValueBinding,
} from '@prodivix/pir';
import type { TargetAdapterNode } from '#src/core/adapter';
import { compilePirBindingExpression } from '#src/workspace/pirBindingCompiler';
import {
  toPirContractMemberPath,
  toPirNodePath,
} from '#src/workspace/pirSourceTrace';

type PirNodeOf<Kind extends PIRNode['kind']> = Extract<PIRNode, { kind: Kind }>;

/**
 * PIR-to-TypeScript expression compilation shared by every framework target.
 *
 * Binding resolution, trigger dispatch, data scope derivation and collection
 * projectability are PIR semantics, not framework syntax. A target that
 * reimplements them would silently diverge on the exact behaviour G3 needs to
 * compare across targets, so they live here and targets only decide how the
 * resulting expressions are placed into element syntax.
 */

export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

export const toJson = (value: unknown): string =>
  JSON.stringify(value) ?? 'null';

export const literalBindingValues = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(bindings ?? {})
      .filter(([, binding]) => binding.kind === 'literal')
      .map(([key, binding]) => [
        key,
        binding.kind === 'literal' ? binding.value : undefined,
      ])
  );

export const createAdapterNode = (
  node: PirNodeOf<'element'>,
  documentId: string
): TargetAdapterNode => ({
  id: node.id,
  type: node.type,
  path: `${documentId}${toPirNodePath(node.id)}`,
  text: undefined,
  style: literalBindingValues(node.style),
  props: literalBindingValues(node.props),
  events: {},
  children: [],
});

export const compileRecord = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined,
  scopeExpression: string
): string => {
  const entries = Object.entries(bindings ?? {})
    .sort(([left], [right]) => compareText(left, right))
    .map(
      ([key, binding]) =>
        `${toJson(key)}: ${compilePirBindingExpression(binding, scopeExpression)}`
    );
  return `{ ${entries.join(', ')} }`;
};

export const compileTriggerSource = (
  documentId: string,
  nodeId: string,
  eventName: string,
  instancePathExpression: string
): string =>
  `{ documentId: ${toJson(documentId)}, nodeId: ${toJson(nodeId)}, eventName: ${toJson(eventName)}, instancePath: ${instancePathExpression} }`;

export const compileTriggerHandler = (
  trigger: PIRTriggerBinding,
  scopeExpression: string,
  payloadName: string,
  sourceExpression: string,
  onContractMemberTrace: (path: string) => void
): string => {
  if (trigger.kind === 'emit-component-event') {
    onContractMemberTrace(
      toPirContractMemberPath('eventsById', trigger.memberId)
    );
    const payload = trigger.payload
      ? compilePirBindingExpression(trigger.payload, scopeExpression)
      : payloadName;
    return `(${payloadName}: unknown) => __pdxEventsById[${toJson(trigger.memberId)}]?.(${payload})`;
  }
  return `(${payloadName}: unknown) => __pdxRuntime.dispatchTrigger({ binding: ${toJson(trigger)}, payload: ${payloadName}, scope: ${scopeExpression}, runtimeValuesById: __pdxDataRuntimeValuesFromScope(${scopeExpression}), setStateById: __pdxSetStateById, source: ${sourceExpression} })`;
};

export const compileDataScopeExpression = (
  node: PirNodeOf<'element'>,
  parentScopeExpression: string
): string => {
  const data = node.data;
  if (!data) return 'undefined';
  const baseBinding = data.source ?? data.mock ?? data.value;
  let baseExpression = baseBinding
    ? compilePirBindingExpression(baseBinding, parentScopeExpression)
    : 'undefined';
  if (data.pick?.trim()) {
    baseExpression = `__pdxReadPath(${baseExpression}, ${toJson(data.pick)})`;
  }
  if (data.extend === undefined) return baseExpression;
  return `__pdxMergeData(${baseExpression}, ${compileRecord(data.extend, parentScopeExpression)})`;
};

export const compileInstanceVariantValues = (
  contract: PIRComponentContract | undefined,
  target: PirNodeOf<'component-instance'>
): string =>
  contract
    ? toJson(
        resolvePirComponentVariantValues(contract, target.bindings.variants)
      )
    : '{}';

/**
 * Whether a Collection can be expanded at build time instead of projected at
 * runtime. Getting this wrong changes the emitted module topology, so both
 * targets must answer it identically.
 */
export const canStaticallyProjectCollection = (
  node: PirNodeOf<'collection'>
): boolean => {
  if (node.source.kind !== 'literal' || node.source.value.length === 0) {
    return node.source.kind === 'literal';
  }
  if (node.key.kind === 'index') return true;
  const binding = node.key.value;
  return (
    binding.kind === 'literal' ||
    (binding.kind === 'collection-symbol' &&
      (binding.symbolId === node.symbols.itemId ||
        binding.symbolId === node.symbols.indexId))
  );
};
