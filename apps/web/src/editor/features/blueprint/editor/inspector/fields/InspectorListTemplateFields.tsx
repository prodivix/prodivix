import { ChevronDown } from 'lucide-react';
import type { NodeListRender } from '@prodivix/shared/types/pir';
import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

export function InspectorListTemplateFields() {
  const { t, selectedNode, updateSelectedNode, expandedPanels, togglePanel } =
    useInspectorContext();
  if (!selectedNode) return null;

  const enabled = Boolean(selectedNode.list);
  const arrayField =
    typeof selectedNode.list?.arrayField === 'string'
      ? selectedNode.list.arrayField
      : '';
  const panelKey = 'basic-list-template';
  const isExpanded = expandedPanels[panelKey] ?? true;

  return (
    <div className="pt-1">
      <button
        type="button"
        className="flex min-h-5.5 w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left"
        onClick={() => togglePanel(panelKey)}
      >
        <span className="InspectorLabel text-[11px] font-medium text-(--text-secondary)">
          {t('inspector.fields.listTemplate.title', {
            defaultValue: 'List Template',
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
            label={t('inspector.fields.listTemplate.mountLabel', {
              defaultValue: 'Mounted',
            })}
            control={
              <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
                <input
                  data-testid="inspector-list-template-enable"
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    updateSelectedNode((current) => {
                      if (!checked) {
                        const next = { ...current };
                        delete next.list;
                        return next;
                      }
                      const nextList: NodeListRender = {
                        arrayField: '',
                        itemAs: 'item',
                        indexAs: 'index',
                      };
                      return { ...current, list: nextList };
                    });
                  }}
                />
                {t('inspector.fields.listTemplate.enable', {
                  defaultValue: 'Promote node as list template',
                })}
              </label>
            }
          />
          {enabled ? (
            <InspectorRow
              layout="vertical"
              label={t('inspector.fields.listTemplate.arrayField', {
                defaultValue: 'Array Field',
              })}
              control={
                <input
                  data-testid="inspector-list-array-field"
                  className="h-7 min-w-0 rounded-md border border-(--border-default) bg-transparent px-2.5 text-xs text-(--text-primary) outline-none"
                  value={arrayField}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    updateSelectedNode((current) => {
                      if (!current.list) return current;
                      return {
                        ...current,
                        list: {
                          ...current.list,
                          arrayField: nextValue,
                        },
                      };
                    });
                  }}
                  placeholder={t(
                    'inspector.fields.listTemplate.arrayFieldPlaceholder',
                    {
                      defaultValue: 'items',
                    }
                  )}
                />
              }
            />
          ) : null}
          {enabled ? (
            <span className="text-[10px] text-(--text-muted)">
              {t('inspector.fields.listTemplate.hint', {
                defaultValue:
                  'Item and index aliases are managed automatically in code generation.',
              })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
