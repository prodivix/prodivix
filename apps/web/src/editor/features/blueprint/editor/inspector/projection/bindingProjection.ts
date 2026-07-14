import type {
  PIRDataScope,
  PIRElementNode,
  PIRJsonValue,
  PIRTriggerBinding,
  PIRValueBinding,
} from '@prodivix/pir';
import type { BlueprintInspectorNodeView, InspectorEventView } from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneJsonValue = (value: PIRJsonValue): PIRJsonValue =>
  JSON.parse(JSON.stringify(value)) as PIRJsonValue;

const toJsonValue = (value: unknown): PIRJsonValue | undefined => {
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined
      ? undefined
      : (JSON.parse(encoded) as PIRJsonValue);
  } catch {
    return undefined;
  }
};

export const projectBinding = (
  binding: PIRValueBinding | undefined
): unknown => {
  if (!binding) return undefined;
  return binding.kind === 'literal' ? cloneJsonValue(binding.value) : binding;
};

export const projectBindingRecord = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): Record<string, unknown> | undefined => {
  const entries = Object.entries(bindings ?? {}).map(([key, binding]) => [
    key,
    projectBinding(binding),
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const projectDataScope = (
  data: PIRDataScope | undefined
): Record<string, unknown> | undefined => {
  if (!data) return undefined;
  return {
    ...(data.source ? { source: projectBinding(data.source) } : {}),
    ...(data.pick ? { pick: data.pick } : {}),
    ...(data.value ? { value: projectBinding(data.value) } : {}),
    ...(data.mock ? { mock: projectBinding(data.mock) } : {}),
    ...(data.extend ? { extend: projectBindingRecord(data.extend) ?? {} } : {}),
  };
};

const isReadonlyTrigger = (binding: PIRTriggerBinding): boolean =>
  binding.kind === 'call-code' ||
  binding.kind === 'play-animation' ||
  binding.kind === 'emit-component-event';

const projectTrigger = (
  trigger: string,
  binding: PIRTriggerBinding
): InspectorEventView => {
  if (binding.kind === 'open-url') {
    return {
      trigger,
      action: 'navigate',
      params: { to: binding.href, target: '_blank' },
      editable: true,
    };
  }
  if (binding.kind === 'navigate-route') {
    return {
      trigger,
      action: 'navigate',
      params: { to: binding.routeId, routeId: binding.routeId },
      editable: true,
    };
  }
  if (binding.kind === 'run-nodegraph') {
    return {
      trigger,
      action: 'executeGraph',
      params: {
        graphMode: 'existing',
        graphId: binding.documentId,
        ...(binding.inputMapping === undefined
          ? {}
          : { inputMapping: binding.inputMapping }),
      },
      editable: true,
    };
  }
  return {
    trigger,
    action: binding.kind,
    params: {},
    editable: false,
    diagnostic:
      binding.kind === 'call-code'
        ? 'This event is owned by the shared Code Authoring Environment.'
        : `The ${binding.kind} binding is managed by its domain editor.`,
  };
};

export const projectEvents = (
  events: Readonly<Record<string, PIRTriggerBinding>> | undefined
): Record<string, InspectorEventView> | undefined => {
  const entries = Object.entries(events ?? {}).map(([trigger, binding]) => [
    trigger,
    projectTrigger(trigger, binding),
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const toBindingRecord = (
  next: Record<string, unknown> | undefined,
  current: Readonly<Record<string, PIRValueBinding>> | undefined
): Readonly<Record<string, PIRValueBinding>> | undefined => {
  const result: Record<string, PIRValueBinding> = {};
  const nextValues = next ?? {};
  for (const [key, binding] of Object.entries(current ?? {})) {
    if (binding.kind !== 'literal') {
      result[key] = binding;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(nextValues, key)) continue;
    const value = toJsonValue(nextValues[key]);
    if (value !== undefined) result[key] = { kind: 'literal', value };
  }
  for (const [key, rawValue] of Object.entries(nextValues)) {
    if (current?.[key]) continue;
    const value = toJsonValue(rawValue);
    if (value !== undefined) result[key] = { kind: 'literal', value };
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const toBinding = (
  next: unknown,
  current: PIRValueBinding | undefined
): PIRValueBinding | undefined => {
  if (current && current.kind !== 'literal') return current;
  if (next === undefined) return undefined;
  const value = toJsonValue(next);
  return value === undefined ? current : { kind: 'literal', value };
};

const toDataScope = (
  next: Record<string, unknown> | undefined,
  current: PIRDataScope | undefined
): PIRDataScope | undefined => {
  if (!next) return undefined;
  const source = toBinding(next.source, current?.source);
  const value = toBinding(next.value, current?.value);
  const mock = toBinding(next.mock, current?.mock);
  const extend = toBindingRecord(
    isObject(next.extend) ? next.extend : undefined,
    current?.extend
  );
  const pick =
    typeof next.pick === 'string' && next.pick.trim() ? next.pick : undefined;
  const result: PIRDataScope = {
    ...(source ? { source } : {}),
    ...(pick ? { pick } : {}),
    ...(value ? { value } : {}),
    ...(mock ? { mock } : {}),
    ...(extend ? { extend } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
};

const toEditableTrigger = (
  event: InspectorEventView
): PIRTriggerBinding | null => {
  if (event.action === 'executeGraph') {
    const documentId =
      typeof event.params.graphId === 'string'
        ? event.params.graphId.trim()
        : '';
    if (!documentId) return null;
    return {
      kind: 'run-nodegraph',
      documentId,
      ...(event.params.inputMapping === undefined
        ? {}
        : { inputMapping: event.params.inputMapping }),
    };
  }
  const destination =
    typeof event.params.to === 'string' ? event.params.to.trim() : '';
  if (!destination) return null;
  if (/^https:\/\//i.test(destination)) {
    return { kind: 'open-url', href: destination };
  }
  return {
    kind: 'navigate-route',
    routeId:
      typeof event.params.routeId === 'string' && event.params.routeId.trim()
        ? event.params.routeId.trim()
        : destination,
  };
};

const toEvents = (
  next: Record<string, InspectorEventView> | undefined,
  current: Readonly<Record<string, PIRTriggerBinding>> | undefined
): Readonly<Record<string, PIRTriggerBinding>> | undefined => {
  const result: Record<string, PIRTriggerBinding> = {};
  for (const [key, event] of Object.entries(next ?? {})) {
    const original = current?.[key];
    if ((original && isReadonlyTrigger(original)) || event.editable === false) {
      if (original) result[key] = original;
      continue;
    }
    const trigger = event.trigger.trim();
    const binding = toEditableTrigger(event);
    if (trigger && binding) result[trigger] = binding;
  }
  for (const [key, binding] of Object.entries(current ?? {})) {
    if (isReadonlyTrigger(binding) && !result[key]) result[key] = binding;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export const toElementNode = (
  view: BlueprintInspectorNodeView,
  current: PIRElementNode | undefined
): PIRElementNode => {
  const text = toBinding(view.text, current?.text);
  const style = toBindingRecord(view.style, current?.style);
  const props = toBindingRecord(view.props, current?.props);
  const data = toDataScope(view.data, current?.data);
  const events = toEvents(view.events, current?.events);
  return {
    id: current?.id ?? view.id,
    kind: 'element',
    type: view.type,
    ...(text ? { text } : {}),
    ...(style ? { style } : {}),
    ...(props ? { props } : {}),
    ...(data ? { data } : {}),
    ...(events ? { events } : {}),
  };
};

export const collectReadonlyBindingDiagnostics = (
  node: PIRElementNode
): readonly string[] => {
  const diagnostics = new Set<string>();
  const inspect = (field: string, binding: PIRValueBinding | undefined) => {
    if (!binding || binding.kind === 'literal') return;
    diagnostics.add(
      binding.kind === 'code'
        ? `${field} is owned by a CodeReference and is read-only here.`
        : `${field} uses a ${binding.kind} binding and is read-only in literal controls.`
    );
  };
  inspect('text', node.text);
  Object.entries(node.props ?? {}).forEach(([key, binding]) =>
    inspect(`props.${key}`, binding)
  );
  Object.entries(node.style ?? {}).forEach(([key, binding]) =>
    inspect(`style.${key}`, binding)
  );
  inspect('data.source', node.data?.source);
  inspect('data.value', node.data?.value);
  inspect('data.mock', node.data?.mock);
  Object.entries(node.data?.extend ?? {}).forEach(([key, binding]) =>
    inspect(`data.extend.${key}`, binding)
  );
  return [...diagnostics];
};
