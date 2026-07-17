import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

type TriggerNavigateFieldsProps = {
  itemKey: string;
  toValue: string;
  isValidLinkValue: boolean;
  replaceValue: boolean;
  targetValue: string;
  stateValue: string;
  disabled?: boolean;
};

export function TriggerNavigateFields({
  itemKey,
  toValue,
  isValidLinkValue,
  replaceValue,
  targetValue,
  stateValue,
  disabled = false,
}: TriggerNavigateFieldsProps) {
  const { t, routeOptions, updateTrigger } = useInspectorContext();

  return (
    <>
      <div className="grid gap-1">
        <span className="text-[10px] font-medium text-(--text-muted)">
          {t('inspector.groups.triggers.toLabel', {
            defaultValue: 'Destination',
          })}
        </span>
        <input
          className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          value={toValue}
          disabled={disabled}
          title={t('inspector.groups.triggers.toHelp', {
            defaultValue:
              'Use https:// for external links, or /path for in-app preview routes.',
          })}
          onChange={(event) => {
            const destination = event.target.value;
            const route = routeOptions.find(
              (candidate) => candidate.path === destination
            );
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              action: 'navigate',
              params: Object.fromEntries(
                Object.entries({
                  ...(currentEvent.params ?? {}),
                  to: destination,
                  routeId: route?.id,
                }).filter(([, value]) => value !== undefined)
              ),
            }));
          }}
          placeholder={t('inspector.groups.triggers.toPlaceholder', {
            defaultValue: 'https://example.com',
          })}
        />
        {!isValidLinkValue && (
          <span className="text-[10px] text-(--danger-color)">
            {t('inspector.groups.triggers.httpsOnly', {
              defaultValue:
                'Use https:// for external links or /path for internal links.',
            })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <label
          className="inline-flex items-center gap-1 text-[11px] text-(--text-muted)"
          title={t('inspector.groups.triggers.replaceHelp', {
            defaultValue:
              'When enabled, this navigation replaces the current history entry.',
          })}
        >
          <input
            type="checkbox"
            checked={replaceValue}
            disabled
            onChange={(event) => {
              updateTrigger(itemKey, (currentEvent) => ({
                ...currentEvent,
                action: 'navigate',
                params: {
                  ...(currentEvent.params ?? {}),
                  replace: event.target.checked,
                },
              }));
            }}
          />
          {t('inspector.groups.triggers.replace', {
            defaultValue: 'Replace',
          })}
        </label>
        <select
          className="h-7 w-24 min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none"
          value={targetValue}
          disabled
          title={t('inspector.groups.triggers.targetHelp', {
            defaultValue: 'Browser tab target used by navigation actions.',
          })}
          onChange={(event) => {
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              action: 'navigate',
              params: {
                ...(currentEvent.params ?? {}),
                target: event.target.value,
              },
            }));
          }}
        >
          <option value="_self">
            {t('inspector.groups.triggers.targets.self', {
              defaultValue: '_self',
            })}
          </option>
          <option value="_blank">
            {t('inspector.groups.triggers.targets.blank', {
              defaultValue: '_blank',
            })}
          </option>
        </select>
        <input
          className="h-7 min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          value={stateValue}
          disabled
          title={t('inspector.groups.triggers.stateHelp', {
            defaultValue:
              'Optional navigation state. Plain text or JSON string.',
          })}
          onChange={(event) => {
            updateTrigger(itemKey, (currentEvent) => ({
              ...currentEvent,
              action: 'navigate',
              params: {
                ...(currentEvent.params ?? {}),
                state: event.target.value,
              },
            }));
          }}
          placeholder={t('inspector.groups.triggers.statePlaceholder', {
            defaultValue: 'state (optional JSON)',
          })}
        />
      </div>
      <span className="text-[10px] text-(--text-muted)">
        PIR-current stores the typed destination binding. Browser target,
        history replacement, and ad-hoc state are retained as read-only UI until
        their typed navigation contract is available.
      </span>
    </>
  );
}
