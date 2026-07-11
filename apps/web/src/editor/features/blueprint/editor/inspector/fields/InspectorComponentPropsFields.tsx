import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorComponentPropDefinition } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const COMPONENT_PROP_EXCLUDE_KEYS = new Set([
  'children',
  'className',
  'style',
  'ref',
  'key',
  'sx',
]);
const MAX_COMPONENT_FIELDS = 20;
const EDITABLE_DECLARED_PROP_TYPES = new Set<
  InspectorComponentPropDefinition['valueType']
>(['string', 'number', 'boolean']);

export function InspectorComponentPropsFields() {
  const {
    t,
    selectedNode,
    componentMeta,
    updateSelectedNode,
    dataModelFieldPaths = [],
  } = useInspectorContext();

  if (!selectedNode || !componentMeta) return null;

  const defaultProps = (componentMeta.defaultProps ?? {}) as Record<
    string,
    unknown
  >;
  const propOptions = componentMeta.propOptions ?? {};
  const propDefinitions = componentMeta.propDefinitions ?? [];
  const nodeProps = (selectedNode.props ?? {}) as Record<string, unknown>;
  const propDefinitionsByKey = new Map(
    propDefinitions.map((definition) => [definition.name, definition])
  );
  const declaredKeys = propDefinitions
    .filter(
      (definition) =>
        EDITABLE_DECLARED_PROP_TYPES.has(definition.valueType) ||
        (definition.valueType === 'unknown' &&
          (isPrimitive(nodeProps[definition.name]) ||
            isPrimitive(defaultProps[definition.name]) ||
            Boolean(propOptions[definition.name]?.length)))
    )
    .map((definition) => definition.name);
  const optionKeys = Object.keys(propOptions);
  const primitiveDefaultKeys = Object.keys(defaultProps).filter((key) =>
    isPrimitive(defaultProps[key])
  );
  const fieldKeys = [
    ...new Set([
      ...declaredKeys,
      ...optionKeys,
      ...primitiveDefaultKeys,
    ]).values(),
  ]
    .filter((key) => !COMPONENT_PROP_EXCLUDE_KEYS.has(key))
    .slice(0, MAX_COMPONENT_FIELDS);

  if (fieldKeys.length === 0) return null;

  const resolveValue = (key: string) => {
    if (Object.prototype.hasOwnProperty.call(nodeProps, key)) {
      return nodeProps[key];
    }
    if (Object.prototype.hasOwnProperty.call(defaultProps, key)) {
      return defaultProps[key];
    }
    const firstOption = propOptions[key]?.[0];
    if (firstOption !== undefined) return firstOption;
    return propDefinitionsByKey.get(key)?.valueType === 'boolean' ? false : '';
  };
  const resolvePropSource = (key: string) =>
    Object.prototype.hasOwnProperty.call(nodeProps, key) ? 'node' : 'default';
  const dataModelPathDatalistId = `inspector-prop-paths-${selectedNode.id}`;

  const updateProp = (key: string, value: unknown) => {
    updateSelectedNode((current) => ({
      ...current,
      props: {
        ...(current.props ?? {}),
        [key]: value,
      },
    }));
  };
  const clearProp = (key: string) => {
    updateSelectedNode((current) => {
      const nextProps = { ...(current.props ?? {}) };
      delete nextProps[key];
      return {
        ...current,
        props: nextProps,
      };
    });
  };

  return (
    <div className="InspectorField flex flex-col gap-1.5">
      <InspectorRow
        layout="vertical"
        label={t(
          componentMeta.source === 'builtIn'
            ? 'inspector.fields.componentProps.label'
            : 'inspector.fields.externalProps.label',
          {
            defaultValue:
              componentMeta.source === 'builtIn'
                ? 'Component Props'
                : 'External Props',
          }
        )}
        description={t(
          componentMeta.source === 'builtIn'
            ? 'inspector.fields.componentProps.description'
            : 'inspector.fields.externalProps.description',
          {
            defaultValue:
              componentMeta.source === 'builtIn'
                ? 'Generated from the @prodivix/ui component manifest.'
                : 'Provided by the active component plugin.',
          }
        )}
        control={
          <div className="grid gap-1.5">
            {fieldKeys.map((key) => {
              const options = propOptions[key];
              const value = resolveValue(key);
              const definition = propDefinitionsByKey.get(key);
              const source = resolvePropSource(key);
              const canReset = source === 'node';
              if (options && options.length > 1) {
                const normalizedValue = String(value);
                const resolvedOptions = options.includes(normalizedValue)
                  ? options
                  : [normalizedValue, ...options];
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="min-w-20 text-[10px] text-(--text-muted)">
                      {key}
                    </span>
                    <select
                      data-testid={`inspector-component-prop-${key}`}
                      aria-label={key}
                      className="h-7 min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary)"
                      value={normalizedValue}
                      onChange={(event) => updateProp(key, event.target.value)}
                    >
                      {resolvedOptions.map((option: string) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {canReset && (
                      <button
                        type="button"
                        data-testid={`inspector-component-prop-reset-${key}`}
                        className="h-7 cursor-pointer rounded-md border border-(--border-default) px-1.5 text-[10px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                        onClick={() => clearProp(key)}
                      >
                        {t('inspector.fields.externalProps.reset', {
                          defaultValue: 'Reset',
                        })}
                      </button>
                    )}
                  </div>
                );
              }
              if (
                definition?.valueType === 'boolean' ||
                typeof value === 'boolean'
              ) {
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="min-w-20 text-[10px] text-(--text-muted)">
                      {key}
                    </span>
                    <label className="inline-flex items-center gap-1 text-xs text-(--text-secondary)">
                      <input
                        data-testid={`inspector-component-prop-${key}`}
                        aria-label={key}
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) =>
                          updateProp(key, event.target.checked)
                        }
                      />
                      {value ? 'true' : 'false'}
                    </label>
                    {canReset && (
                      <button
                        type="button"
                        data-testid={`inspector-component-prop-reset-${key}`}
                        className="h-7 cursor-pointer rounded-md border border-(--border-default) px-1.5 text-[10px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                        onClick={() => clearProp(key)}
                      >
                        {t('inspector.fields.externalProps.reset', {
                          defaultValue: 'Reset',
                        })}
                      </button>
                    )}
                  </div>
                );
              }
              if (
                definition?.valueType === 'number' ||
                typeof value === 'number'
              ) {
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="min-w-20 text-[10px] text-(--text-muted)">
                      {key}
                    </span>
                    <input
                      data-testid={`inspector-component-prop-${key}`}
                      aria-label={key}
                      className="h-7 min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary)"
                      type="number"
                      value={typeof value === 'number' ? value : ''}
                      onChange={(event) => {
                        if (event.target.value === '') {
                          clearProp(key);
                          return;
                        }
                        const nextValue = Number(event.target.value);
                        if (!Number.isFinite(nextValue)) return;
                        updateProp(key, nextValue);
                      }}
                    />
                    {canReset && (
                      <button
                        type="button"
                        data-testid={`inspector-component-prop-reset-${key}`}
                        className="h-7 cursor-pointer rounded-md border border-(--border-default) px-1.5 text-[10px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                        onClick={() => clearProp(key)}
                      >
                        {t('inspector.fields.externalProps.reset', {
                          defaultValue: 'Reset',
                        })}
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="min-w-20 text-[10px] text-(--text-muted)">
                    {key}
                  </span>
                  <input
                    data-testid={`inspector-component-prop-${key}`}
                    aria-label={key}
                    className="h-7 min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary)"
                    list={
                      dataModelFieldPaths.length
                        ? dataModelPathDatalistId
                        : undefined
                    }
                    value={String(value ?? '')}
                    onChange={(event) => updateProp(key, event.target.value)}
                  />
                  {canReset && (
                    <button
                      type="button"
                      data-testid={`inspector-component-prop-reset-${key}`}
                      className="h-7 cursor-pointer rounded-md border border-(--border-default) px-1.5 text-[10px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                      onClick={() => clearProp(key)}
                    >
                      {t('inspector.fields.externalProps.reset', {
                        defaultValue: 'Reset',
                      })}
                    </button>
                  )}
                </div>
              );
            })}
            {dataModelFieldPaths.length ? (
              <datalist id={dataModelPathDatalistId}>
                {dataModelFieldPaths.map((path: string) => (
                  <option key={path} value={path} />
                ))}
              </datalist>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
