import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const EXTERNAL_PROP_EXCLUDE_KEYS = new Set([
  'children',
  'className',
  'style',
  'ref',
  'key',
  'sx',
]);
const MAX_EXTERNAL_FIELDS = 16;

export function InspectorExternalPropsFields() {
  const {
    t,
    selectedNode,
    externalComponentItem,
    updateSelectedNode,
    dataModelFieldPaths = [],
  } = useInspectorContext();

  if (!selectedNode || !externalComponentItem) return null;

  const defaultProps = (externalComponentItem.defaultProps ?? {}) as Record<
    string,
    unknown
  >;
  const propOptions = externalComponentItem.propOptions ?? {};
  const optionKeys = Object.keys(propOptions);
  const primitiveDefaultKeys = Object.keys(defaultProps).filter((key) =>
    isPrimitive(defaultProps[key])
  );
  const fieldKeys = [
    ...new Set([...optionKeys, ...primitiveDefaultKeys]).values(),
  ]
    .filter((key) => !EXTERNAL_PROP_EXCLUDE_KEYS.has(key))
    .slice(0, MAX_EXTERNAL_FIELDS);

  if (fieldKeys.length === 0) return null;

  const nodeProps = (selectedNode.props ?? {}) as Record<string, unknown>;
  const resolveValue = (key: string) =>
    nodeProps[key] ?? defaultProps[key] ?? propOptions[key]?.[0] ?? '';
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
        label={t('inspector.fields.externalProps.label', {
          defaultValue: 'External Props',
        })}
        description={t('inspector.fields.externalProps.description', {
          defaultValue: 'Generated from external component metadata (d.ts).',
        })}
        control={
          <div className="grid gap-1.5">
            {fieldKeys.map((key) => {
              const options = propOptions[key];
              const value = resolveValue(key);
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
                      data-testid={`inspector-external-prop-${key}`}
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
                        data-testid={`inspector-external-prop-reset-${key}`}
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
              if (typeof value === 'boolean') {
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="min-w-20 text-[10px] text-(--text-muted)">
                      {key}
                    </span>
                    <label className="inline-flex items-center gap-1 text-xs text-(--text-secondary)">
                      <input
                        data-testid={`inspector-external-prop-${key}`}
                        type="checkbox"
                        checked={value}
                        onChange={(event) =>
                          updateProp(key, event.target.checked)
                        }
                      />
                      {value ? 'true' : 'false'}
                    </label>
                    {canReset && (
                      <button
                        type="button"
                        data-testid={`inspector-external-prop-reset-${key}`}
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
              if (typeof value === 'number') {
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="min-w-20 text-[10px] text-(--text-muted)">
                      {key}
                    </span>
                    <input
                      data-testid={`inspector-external-prop-${key}`}
                      className="h-7 min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary)"
                      type="number"
                      value={value}
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
                        data-testid={`inspector-external-prop-reset-${key}`}
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
                    data-testid={`inspector-external-prop-${key}`}
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
                      data-testid={`inspector-external-prop-reset-${key}`}
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
