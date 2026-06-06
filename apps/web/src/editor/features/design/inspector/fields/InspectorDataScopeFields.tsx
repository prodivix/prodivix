import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { useInspectorContext } from '@/editor/features/design/inspector/InspectorContext';

const LEGACY_DATA_MODEL_KEY = 'x-prodivix-data-model';
const LEGACY_DATA_SCHEMA_KEY = 'x-prodivix-data-schema';
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asSchemaText = (value: unknown) => {
  try {
    return value === undefined ? '' : JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

export function InspectorDataScopeFields() {
  const { t, selectedNode, updateSelectedNode, expandedPanels, togglePanel } =
    useInspectorContext();
  const selectedNodeData = selectedNode?.data as
    | Record<string, unknown>
    | undefined;
  const panelKey = 'basic-data-model';
  const isExpanded = expandedPanels[panelKey] ?? true;

  const mountedDataModel = useMemo(() => {
    const data = selectedNodeData;
    if (isPlainObject(data?.value)) {
      return data.value;
    }
    const extendModel = data?.extend;
    if (
      extendModel &&
      typeof extendModel === 'object' &&
      !Array.isArray(extendModel)
    ) {
      return extendModel;
    }
    const legacy =
      data?.[LEGACY_DATA_MODEL_KEY] ?? data?.[LEGACY_DATA_SCHEMA_KEY];
    return isPlainObject(legacy) ? legacy : {};
  }, [selectedNodeData]);
  const mountedMockData = useMemo(() => {
    const data = selectedNodeData;
    if (data?.mock !== undefined) {
      return data.mock;
    }
    if (Array.isArray(data?.value)) {
      return data.value;
    }
    return {};
  }, [selectedNodeData]);
  const [schemaDraft, setSchemaDraft] = useState(
    asSchemaText(mountedDataModel)
  );
  const [mockDraft, setMockDraft] = useState(asSchemaText(mountedMockData));
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [mockError, setMockError] = useState<string | null>(null);
  const isMounted = selectedNodeData !== undefined;

  useEffect(() => {
    setSchemaDraft(asSchemaText(mountedDataModel));
    setSchemaError(null);
  }, [mountedDataModel]);
  useEffect(() => {
    setMockDraft(asSchemaText(mountedMockData));
    setMockError(null);
  }, [mountedMockData]);

  if (!selectedNode) return null;

  const applySchemaDraft = () => {
    const raw = schemaDraft.trim();
    if (!raw) {
      updateSelectedNode((current) => {
        const nextNode = { ...current };
        delete nextNode.data;
        return nextNode;
      });
      setSchemaError(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) {
        setSchemaError(
          t('inspector.fields.dataModel.schemaObjectOnly', {
            defaultValue: 'Data model must be a JSON object.',
          })
        );
        return;
      }
      setSchemaError(null);
      updateSelectedNode((current) => {
        const nextData = {
          ...(current.data ?? {}),
          value: parsed,
        } as Record<string, unknown>;
        if (nextData.mock === undefined) {
          nextData.mock = {};
        }
        delete nextData.extend;
        delete nextData[LEGACY_DATA_MODEL_KEY];
        delete nextData[LEGACY_DATA_SCHEMA_KEY];
        return { ...current, data: nextData };
      });
    } catch {
      setSchemaError(
        t('inspector.fields.dataModel.invalidJson', {
          defaultValue: 'Invalid JSON format.',
        })
      );
    }
  };
  const applyMockDraft = () => {
    const raw = mockDraft.trim();
    if (!raw) {
      updateSelectedNode((current) => {
        if (!current.data) return current;
        const nextData = { ...(current.data as Record<string, unknown>) };
        delete nextData.mock;
        return {
          ...current,
          data: nextData,
        };
      });
      setMockError(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setMockError(null);
      updateSelectedNode((current) => {
        const nextData = {
          ...(current.data ?? {}),
          mock: parsed,
        } as Record<string, unknown>;
        delete nextData[LEGACY_DATA_MODEL_KEY];
        delete nextData[LEGACY_DATA_SCHEMA_KEY];
        return { ...current, data: nextData };
      });
    } catch {
      setMockError(
        t('inspector.fields.dataModel.invalidJson', {
          defaultValue: 'Invalid JSON format.',
        })
      );
    }
  };

  return (
    <div className="pt-1">
      <button
        type="button"
        className="flex min-h-5.5 w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left"
        onClick={() => togglePanel(panelKey)}
      >
        <span className="InspectorLabel text-[11px] font-semibold text-(--text-secondary)">
          {t('inspector.fields.dataModel.title', {
            defaultValue: 'Data Model',
          })}
        </span>
        <ChevronDown
          size={14}
          className={`${isExpanded ? 'rotate-0' : '-rotate-90'} text-(--text-muted) transition-transform`}
        />
      </button>
      {isExpanded ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <InspectorRow
            label={t('inspector.fields.dataModel.mountLabel', {
              defaultValue: 'Mounted',
            })}
            control={
              <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
                <input
                  data-testid="inspector-data-model-enable"
                  type="checkbox"
                  checked={isMounted}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    updateSelectedNode((current) => {
                      if (!checked) {
                        const nextNode = { ...current };
                        delete nextNode.data;
                        return nextNode;
                      }
                      const nextData = {
                        ...(current.data ?? {}),
                        value: {},
                        mock: {},
                      } as Record<string, unknown>;
                      delete nextData.extend;
                      delete nextData[LEGACY_DATA_MODEL_KEY];
                      delete nextData[LEGACY_DATA_SCHEMA_KEY];
                      return { ...current, data: nextData };
                    });
                  }}
                />
                {t('inspector.fields.dataModel.enable', {
                  defaultValue: 'Mount data model JSON on this component',
                })}
              </label>
            }
          />
          {isMounted ? (
            <>
              <InspectorRow
                layout="vertical"
                label={t('inspector.fields.dataModel.schemaLabel', {
                  defaultValue: 'Schema JSON',
                })}
                control={
                  <textarea
                    data-testid="inspector-data-model-schema"
                    className="min-h-24 w-full resize-y rounded-md border border-(--border-default) bg-transparent px-2.5 py-1 text-xs leading-[1.35] text-(--text-primary) outline-none placeholder:text-(--text-muted)"
                    value={schemaDraft}
                    placeholder={t(
                      'inspector.fields.dataModel.schemaPlaceholder',
                      {
                        defaultValue:
                          '{\n  "totalCount": "number",\n  "items": [\n    {\n      "data": "string"\n    }\n  ]\n}',
                      }
                    )}
                    onChange={(event) => {
                      setSchemaDraft(event.target.value);
                      setSchemaError(null);
                    }}
                    onBlur={applySchemaDraft}
                  />
                }
              />
              {schemaError ? (
                <p className="m-0 text-[10px] text-(--danger-color)">
                  {schemaError}
                </p>
              ) : null}
              <InspectorRow
                layout="vertical"
                label={t('inspector.fields.dataModel.mockLabel', {
                  defaultValue: 'Mock JSON',
                })}
                control={
                  <textarea
                    data-testid="inspector-data-model-mock"
                    className="min-h-24 w-full resize-y rounded-md border border-(--border-default) bg-transparent px-2.5 py-1 text-xs leading-[1.35] text-(--text-primary) outline-none placeholder:text-(--text-muted)"
                    value={mockDraft}
                    placeholder={t(
                      'inspector.fields.dataModel.mockPlaceholder',
                      {
                        defaultValue:
                          '{\n  "totalCount": 2,\n  "items": [\n    {\n      "data": "prodivix"\n    }\n  ]\n}',
                      }
                    )}
                    onChange={(event) => {
                      setMockDraft(event.target.value);
                      setMockError(null);
                    }}
                    onBlur={applyMockDraft}
                  />
                }
              />
              {mockError ? (
                <p className="m-0 text-[10px] text-(--danger-color)">
                  {mockError}
                </p>
              ) : null}
              <p className="m-0 text-[10px] text-(--text-muted)">
                {t('inspector.fields.dataModel.hint', {
                  defaultValue:
                    'Child properties can bind with field paths directly in their own inputs.',
                })}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
