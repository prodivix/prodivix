import { Plus } from 'lucide-react';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import { InspectorTriggerItem } from '@/editor/features/blueprint/editor/inspector/fields/triggers/InspectorTriggerItem';
import type { InspectorPanelDefinition } from './types';

function AddTriggerAction() {
  const { t, addTrigger, expandedPanels, togglePanel } = useInspectorContext();
  const isExpanded = expandedPanels.triggers ?? true;

  return (
    <button
      type="button"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
      data-testid="inspector-add-trigger"
      onClick={() => {
        addTrigger();
        if (!isExpanded) {
          togglePanel('triggers');
        }
      }}
      aria-label={t('inspector.groups.triggers.add', {
        defaultValue: 'Add trigger',
      })}
      title={t('inspector.groups.triggers.add', {
        defaultValue: 'Add trigger',
      })}
    >
      <Plus size={14} />
    </button>
  );
}

function TriggersPanelView() {
  const { t, hasLinkTriggerConflict, triggerEntries } = useInspectorContext();

  return (
    <div className="flex flex-col gap-2 pt-1 pb-1">
      {hasLinkTriggerConflict ? (
        <div
          className="rounded-md border border-(--danger-color) bg-(--danger-subtle) px-2 py-1.5 text-[10px] text-(--danger-color)"
          role="alert"
        >
          {t('inspector.groups.triggers.linkConflict', {
            defaultValue:
              'This component has a destination and an onClick trigger. Click may run both.',
          })}
        </div>
      ) : null}
      {triggerEntries.length ? (
        triggerEntries.map((item) => (
          <InspectorTriggerItem key={item.key} item={item} />
        ))
      ) : (
        <div className="InspectorDescription text-[10px] text-(--text-muted)">
          {t('inspector.groups.triggers.empty', {
            defaultValue:
              'No triggers configured yet. Event bindings will appear here.',
          })}
        </div>
      )}
    </div>
  );
}

export const triggersPanel: InspectorPanelDefinition = {
  key: 'triggers',
  title: 'Triggers',
  tab: 'code',
  match: () => true,
  headerActions: <AddTriggerAction />,
  render: () => <TriggersPanelView />,
};
