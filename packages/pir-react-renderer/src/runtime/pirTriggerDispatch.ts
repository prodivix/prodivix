import {
  resolvePirValueBinding,
  type PIRRuntimeValueScope,
  type PIRTriggerBinding,
} from '@prodivix/pir';
import type {
  PIRRenderLocation,
  PIRRenderScopeSnapshot,
  PIRResolvedRendererHost,
  PIRTriggerDispatchRequest,
} from '../PIRRenderer.types';
import type { PIRInternalRenderScope } from './pirRenderScope';

const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

export const snapshotPirRenderScope = (
  scope: PIRRuntimeValueScope
): PIRRenderScopeSnapshot =>
  Object.freeze({
    paramsById: scope.paramsById ?? EMPTY_RECORD,
    stateById: scope.stateById ?? EMPTY_RECORD,
    dataById: scope.dataById ?? EMPTY_RECORD,
    collectionSymbolsById: scope.collectionSymbolsById ?? EMPTY_RECORD,
    componentPropsById: scope.componentPropsById ?? EMPTY_RECORD,
    componentVariantsById: scope.componentVariantsById ?? EMPTY_RECORD,
    slotPropsById: scope.slotPropsById ?? EMPTY_RECORD,
  });

export const dispatchPirTrigger = (
  input: Readonly<{
    trigger: PIRTriggerBinding;
    scope: PIRInternalRenderScope;
    payload?: unknown;
    source: PIRRenderLocation;
    emissionSource?: PIRRenderLocation;
    host: PIRResolvedRendererHost;
    dispatchExternal: (request: PIRTriggerDispatchRequest) => void;
  }>
): void => {
  if (input.trigger.kind !== 'emit-component-event') {
    input.dispatchExternal({
      trigger: input.trigger,
      payload: input.payload,
      source: input.source,
      ...(input.emissionSource ? { emissionSource: input.emissionSource } : {}),
      scope: snapshotPirRenderScope(input.scope),
      setStateById: input.scope.setStateById,
    });
    return;
  }
  const binding = input.scope.componentEventsById[input.trigger.memberId];
  if (!binding) return;
  const payload = input.trigger.payload
    ? resolvePirValueBinding(
        input.trigger.payload,
        input.scope,
        input.host.resolveCodeValue
      )
    : input.payload;
  dispatchPirTrigger({
    trigger: binding.trigger,
    scope: binding.consumerScope,
    payload,
    source: binding.source,
    emissionSource: input.emissionSource ?? input.source,
    host: input.host,
    dispatchExternal: input.dispatchExternal,
  });
};
