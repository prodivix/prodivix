import {
  projectPirValueBinding,
  type PIRValueBinding,
  type PIRValueProjectionSourceKind,
} from '@prodivix/pir';

const SCOPE_FIELD_BY_SOURCE_KIND: Readonly<
  Record<PIRValueProjectionSourceKind, string>
> = {
  param: 'paramsById',
  state: 'stateById',
  data: 'dataById',
  'collection-symbol': 'collectionSymbolsById',
  'component-prop': 'componentPropsById',
  'component-variant': 'componentVariantsById',
  'slot-prop': 'slotPropsById',
};

const toJson = (value: unknown): string => JSON.stringify(value) ?? 'null';

/** Projects the shared binding algebra into a generated TypeScript expression. */
export const compilePirBindingExpression = (
  binding: PIRValueBinding,
  scopeExpression: string,
  runtimeExpression = '__pdxRuntime'
): string =>
  projectPirValueBinding(binding, {
    literal: toJson,
    reference: (kind, id) =>
      `${scopeExpression}.${SCOPE_FIELD_BY_SOURCE_KIND[kind]}[${toJson(id)}]`,
    code: (reference) =>
      `${runtimeExpression}.resolveCodeValue(${toJson(reference)}, ${scopeExpression})`,
    accessPath: (value, path) => `__pdxReadPath(${value}, ${toJson(path)})`,
  });

export const compilePirBindingRecordExpression = (
  bindings: Readonly<Record<string, PIRValueBinding>>,
  scopeExpression: string,
  runtimeExpression = '__pdxRuntime'
): string => {
  const entries = Object.entries(bindings)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(
      ([id, binding]) =>
        `${toJson(id)}: ${compilePirBindingExpression(binding, scopeExpression, runtimeExpression)}`
    );
  return `{ ${entries.join(', ')} }`;
};
