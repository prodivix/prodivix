import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

type TriggerGraphFieldsProps = {
  itemKey: string;
  graphMode: 'new' | 'existing';
  graphName: string;
  selectedGraphId: string;
};

export function TriggerGraphFields({
  itemKey,
  graphMode,
  graphName,
  selectedGraphId,
}: TriggerGraphFieldsProps) {
  const { t, updateTrigger, graphOptions } = useInspectorContext();
  const selectedGraphOption = graphOptions.find(
    (option: { id: string; label: string }) => option.id === selectedGraphId
  );

  return (
    <div className="grid gap-1 rounded-md border border-(--border-default) p-2">
      <div className="inline-flex gap-1">
        <button
          type="button"
          className={`h-6 rounded-md border px-2 text-[11px] ${graphMode === 'new' ? 'border-(--border-strong) text-(--text-primary)' : 'border-transparent text-(--text-muted)'}`}
          title={t('inspector.groups.triggers.graph.newHelp', {
            defaultValue: 'Create and execute a new node graph.',
          })}
          onClick={() => {
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              params: {
                ...(currentEvent.params ?? {}),
                graphMode: 'new',
                graphId: '',
              },
            }));
          }}
        >
          {t('inspector.groups.triggers.graph.new', {
            defaultValue: 'New Graph',
          })}
        </button>
        <button
          type="button"
          className={`h-6 rounded-md border px-2 text-[11px] ${graphMode === 'existing' ? 'border-(--border-strong) text-(--text-primary)' : 'border-transparent text-(--text-muted)'}`}
          title={t('inspector.groups.triggers.graph.selectHelp', {
            defaultValue: 'Run one of the existing node graphs.',
          })}
          onClick={() => {
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              params: {
                ...(currentEvent.params ?? {}),
                graphMode: 'existing',
                graphId: selectedGraphOption?.id ?? '',
                graphName: selectedGraphOption?.label ?? '',
              },
            }));
          }}
        >
          {t('inspector.groups.triggers.graph.select', {
            defaultValue: 'Select Graph',
          })}
        </button>
      </div>
      {graphMode === 'new' ? (
        <input
          className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          value={graphName}
          title={t('inspector.groups.triggers.graph.nameHelp', {
            defaultValue: 'Name for the new node graph to be created.',
          })}
          onChange={(event) => {
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              params: {
                ...(currentEvent.params ?? {}),
                graphName: event.target.value,
              },
            }));
          }}
          placeholder={t('inspector.groups.triggers.graph.namePlaceholder', {
            defaultValue: 'New graph name',
          })}
        />
      ) : (
        <select
          className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none"
          value={selectedGraphId}
          title={t('inspector.groups.triggers.graph.selectHelp', {
            defaultValue: 'Run one of the existing node graphs.',
          })}
          onChange={(event) => {
            const nextGraphId = event.target.value;
            const nextGraphOption = graphOptions.find(
              (option: { id: string; label: string }) =>
                option.id === nextGraphId
            );
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              params: {
                ...(currentEvent.params ?? {}),
                graphMode: 'existing',
                graphId: nextGraphId,
                graphName: nextGraphOption?.label ?? '',
              },
            }));
          }}
        >
          {graphOptions.length ? (
            graphOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))
          ) : (
            <option value="">
              {t('inspector.groups.triggers.graph.empty', {
                defaultValue: 'No graph available',
              })}
            </option>
          )}
        </select>
      )}
    </div>
  );
}
