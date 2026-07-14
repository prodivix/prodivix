import React, { useMemo } from 'react';
import { resolvePirValueBinding, type PIRElementNode } from '@prodivix/pir';
import {
  mergeHandlers,
  stripChildProps,
  toReactEventName,
} from '../runtime/reactProjection';
import type {
  PIRRenderLocation,
  PIRResolvedRendererHost,
  PIRTriggerDispatchRequest,
} from '../PIRRenderer.types';
import {
  applyPirElementDataScope,
  type PIRInternalRenderScope,
} from '../runtime/pirRenderScope';
import { dispatchPirTrigger } from '../runtime/pirTriggerDispatch';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const isSameLocation = (
  left: PIRRenderLocation | undefined,
  right: PIRRenderLocation
): boolean =>
  left?.documentId === right.documentId &&
  left.nodeId === right.nodeId &&
  left.instancePath === right.instancePath &&
  left.role === right.role;

export const PIRElementProjection: React.FC<{
  node: PIRElementNode;
  location: PIRRenderLocation;
  scope: PIRInternalRenderScope;
  host: PIRResolvedRendererHost;
  selectedLocation?: PIRRenderLocation;
  dispatchTrigger: (request: PIRTriggerDispatchRequest) => void;
  renderChildren?: (scope: PIRInternalRenderScope) => React.ReactNode;
}> = ({
  node,
  location,
  scope,
  host,
  selectedLocation,
  dispatchTrigger,
  renderChildren,
}) => {
  const scoped = useMemo(
    () => applyPirElementDataScope(node, scope, host),
    [host, node, scope]
  );
  const resolvedProps = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(node.props ?? {}).map(([name, binding]) => [
          name,
          resolvePirValueBinding(binding, scoped, host.resolveCodeValue),
        ])
      ),
    [host.resolveCodeValue, node.props, scoped]
  );
  const resolvedStyle = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(node.style ?? {}).map(([name, binding]) => [
          name,
          resolvePirValueBinding(binding, scoped, host.resolveCodeValue),
        ])
      ),
    [host.resolveCodeValue, node.style, scoped]
  );
  const resolvedText = useMemo(
    () =>
      node.text
        ? resolvePirValueBinding(node.text, scoped, host.resolveCodeValue)
        : undefined,
    [host.resolveCodeValue, node.text, scoped]
  );
  const selected = isSameLocation(selectedLocation, location);
  const hostEntry = host.elementsByType[node.type];
  if (!hostEntry) return null;
  const projected =
    hostEntry.project?.({
      node,
      location,
      resolvedProps,
      resolvedStyle,
      resolvedText,
      selected,
    }) ?? {};
  const eventProps: Record<string, unknown> = {};
  for (const [eventName, trigger] of Object.entries(node.events ?? {})) {
    const reactEventName = toReactEventName(eventName);
    if (!reactEventName) continue;
    eventProps[reactEventName] = (payload: unknown) => {
      dispatchPirTrigger({
        trigger,
        scope: scoped,
        payload,
        source: location,
        host,
        dispatchExternal: dispatchTrigger,
      });
    };
  }

  const props: Record<string, unknown> = {
    ...(projected.props ?? resolvedProps),
  };
  for (const [eventName, handler] of Object.entries(eventProps)) {
    props[eventName] = mergeHandlers(props[eventName], handler);
  }
  const projectedStyle = props.style;
  props.style = {
    ...(projectedStyle && typeof projectedStyle === 'object'
      ? (projectedStyle as Record<string, unknown>)
      : {}),
    ...resolvedStyle,
  };
  if (Object.keys(props.style as object).length === 0) delete props.style;

  const Component = hostEntry.component;
  const isVoid =
    projected.isVoid ??
    hostEntry.isVoid ??
    (typeof Component === 'string' && VOID_ELEMENTS.has(Component));
  const supportsChildren =
    (projected.supportsChildren ?? hostEntry.supportsChildren ?? true) &&
    !isVoid;
  if (!supportsChildren) {
    return (
      <Component key={projected.instanceKey} {...stripChildProps(props)} />
    );
  }
  const leadingChildren =
    projected.children !== undefined ? projected.children : resolvedText;
  return (
    <Component key={projected.instanceKey} {...props}>
      {leadingChildren as React.ReactNode}
      {projected.renderGraphChildren === false
        ? null
        : renderChildren?.(scoped)}
    </Component>
  );
};

export { isSameLocation as isSamePirRenderLocation };
