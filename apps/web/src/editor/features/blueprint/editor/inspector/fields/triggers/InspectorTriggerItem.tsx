import { useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { getNavigateLinkKind } from '@prodivix/router';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import { TriggerNavigateFields } from './TriggerNavigateFields';
import { TriggerGraphFields } from './TriggerGraphFields';
import { TriggerDataMutationFields } from './TriggerDataMutationFields';

const DOM_EVENT_TRIGGERS = [
  'onClick',
  'onDoubleClick',
  'onChange',
  'onInput',
  'onSubmit',
  'onFocus',
  'onBlur',
  'onPointerEnter',
  'onPointerLeave',
] as const;
const BUILT_IN_ACTION_OPTIONS = [
  {
    value: 'navigate',
    label: 'Navigate',
    labelKey: 'inspector.groups.triggers.actions.navigate',
  },
  {
    value: 'executeGraph',
    label: 'Execute Graph',
    labelKey: 'inspector.groups.triggers.actions.executeGraph',
  },
  {
    value: 'executeDataMutation',
    label: 'Execute Data Mutation',
    labelKey: 'inspector.groups.triggers.actions.executeDataMutation',
  },
] as const;
type BuiltInActionName = (typeof BUILT_IN_ACTION_OPTIONS)[number]['value'];
const normalizeBuiltInAction = (
  value: string | undefined
): BuiltInActionName =>
  value === 'executeGraph' || value === 'executeDataMutation'
    ? value
    : 'navigate';
const createDefaultActionParams = (
  action: BuiltInActionName
): Record<string, unknown> =>
  action === 'executeGraph'
    ? { graphMode: 'existing', graphId: '' }
    : action === 'executeDataMutation'
      ? { operation: {}, input: { kind: 'literal', value: null } }
      : { to: '' };

export function InspectorTriggerItem({ item }: { item: TriggerEntry }) {
  const {
    t,
    graphOptions,
    routeOptions,
    dataMutationOptions,
    updateTrigger,
    removeTrigger,
  } = useInspectorContext();
  const editable = item.editable !== false;
  const rawToValue = typeof item.params.to === 'string' ? item.params.to : '';
  const routeId =
    typeof item.params.routeId === 'string' ? item.params.routeId : rawToValue;
  const selectedRoute = routeOptions.find((route) => route.id === routeId);
  const toValue = selectedRoute?.path ?? rawToValue;
  const targetValue = item.params.target === '_self' ? '_self' : '_blank';
  const actionValue = normalizeBuiltInAction(
    typeof item.action === 'string' ? item.action : undefined
  );
  const replaceValue = Boolean(item.params.replace);
  const isValidLinkValue =
    !toValue ||
    (Boolean(getNavigateLinkKind(toValue)) &&
      (!toValue.startsWith('/') ||
        routeOptions.some((route) => route.path === toValue)));
  const graphMode = item.params.graphMode === 'existing' ? 'existing' : 'new';
  const graphName =
    typeof item.params.graphName === 'string' ? item.params.graphName : '';
  const selectedGraphId = useMemo(() => {
    const rawGraphId =
      typeof item.params.graphId === 'string' ? item.params.graphId.trim() : '';
    if (
      rawGraphId &&
      graphOptions.some((option: { id: string }) => option.id === rawGraphId)
    ) {
      return rawGraphId;
    }
    return graphOptions[0]?.id ?? '';
  }, [graphOptions, item.params.graphId]);
  const stateValue =
    typeof item.params.state === 'string'
      ? item.params.state
      : item.params.state === undefined
        ? ''
        : JSON.stringify(item.params.state);
  const dataOperation =
    item.params.operation &&
    typeof item.params.operation === 'object' &&
    !Array.isArray(item.params.operation)
      ? (item.params.operation as {
          documentId?: unknown;
          operationId?: unknown;
        })
      : undefined;
  const selectedDataOperation =
    typeof dataOperation?.documentId === 'string' &&
    typeof dataOperation.operationId === 'string'
      ? {
          documentId: dataOperation.documentId,
          operationId: dataOperation.operationId,
        }
      : dataMutationOptions[0]?.reference;
  const dataInput =
    item.params.input &&
    typeof item.params.input === 'object' &&
    !Array.isArray(item.params.input)
      ? (item.params
          .input as import('@prodivix/data').DataOperationInputBinding)
      : undefined;

  useEffect(() => {
    if (!editable) return;
    if (actionValue !== 'executeGraph') return;
    if (graphMode !== 'existing') return;
    const rawGraphId =
      typeof item.params.graphId === 'string' ? item.params.graphId.trim() : '';
    const nextGraphOption = graphOptions.find(
      (option: { id: string; label: string }) => option.id === selectedGraphId
    );
    const rawGraphName =
      typeof item.params.graphName === 'string'
        ? item.params.graphName.trim()
        : '';
    const nextGraphName = nextGraphOption?.label ?? '';
    if (rawGraphId === selectedGraphId && rawGraphName === nextGraphName) {
      return;
    }
    updateTrigger(item.key, (currentEvent) => ({
      ...currentEvent,
      params: {
        ...(currentEvent.params ?? {}),
        graphId: selectedGraphId,
        graphName: nextGraphName,
      },
    }));
  }, [
    actionValue,
    graphMode,
    graphOptions,
    item.key,
    item.params.graphId,
    item.params.graphName,
    selectedGraphId,
    updateTrigger,
    editable,
  ]);

  return (
    <div className="grid gap-1.5" data-testid={`inspector-trigger-${item.key}`}>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <div className="grid gap-1">
          <span className="text-[10px] font-medium text-(--text-muted)">
            {t('inspector.groups.triggers.eventLabel', {
              defaultValue: 'Trigger Event',
            })}
          </span>
          <select
            className="h-7 min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none"
            value={item.trigger}
            disabled={!editable}
            title={t('inspector.groups.triggers.eventHelp', {
              defaultValue: 'Choose which DOM event will trigger this action.',
            })}
            onChange={(event) => {
              updateTrigger(item.key, (currentEvent) => ({
                ...currentEvent,
                trigger: event.target.value,
              }));
            }}
          >
            {DOM_EVENT_TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {trigger}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <span className="text-[10px] font-medium text-(--text-muted)">
            {t('inspector.groups.triggers.actionLabel', {
              defaultValue: 'Action',
            })}
          </span>
          <select
            className="h-7 min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none"
            value={actionValue}
            disabled={!editable}
            title={t('inspector.groups.triggers.actionHelp', {
              defaultValue: 'Choose what should run when the event is fired.',
            })}
            onChange={(event) => {
              const action = normalizeBuiltInAction(
                event.target.value as BuiltInActionName
              );
              const params = createDefaultActionParams(action);
              updateTrigger(item.key, (currentEvent) => ({
                ...currentEvent,
                action,
                params:
                  action === 'executeDataMutation' && dataMutationOptions[0]
                    ? {
                        ...params,
                        operation: dataMutationOptions[0].reference,
                      }
                    : params,
              }));
            }}
          >
            {BUILT_IN_ACTION_OPTIONS.map((actionOption) => (
              <option key={actionOption.value} value={actionOption.value}>
                {t(actionOption.labelKey, {
                  defaultValue: actionOption.label,
                })}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="mt-[18px] inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--danger-color)"
          data-testid={`inspector-delete-trigger-${item.key}`}
          onClick={() => removeTrigger(item.key)}
          disabled={!editable}
          aria-label={t('inspector.groups.triggers.delete', {
            defaultValue: 'Delete trigger',
          })}
          title={t('inspector.groups.triggers.delete', {
            defaultValue: 'Delete trigger',
          })}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {!editable ? (
        <div className="rounded-md border border-(--border-default) px-2 py-1.5 text-[10px] text-(--text-muted)">
          {item.diagnostic ??
            'This binding is managed by its owning authoring environment.'}
        </div>
      ) : actionValue === 'navigate' ? (
        <TriggerNavigateFields
          itemKey={item.key}
          toValue={toValue}
          isValidLinkValue={isValidLinkValue}
          replaceValue={replaceValue}
          targetValue={targetValue}
          stateValue={stateValue}
          disabled={!editable}
        />
      ) : actionValue === 'executeGraph' ? (
        <TriggerGraphFields
          itemKey={item.key}
          graphMode={graphMode}
          graphName={graphName}
          selectedGraphId={selectedGraphId}
          disabled={!editable}
        />
      ) : (
        <TriggerDataMutationFields
          itemKey={item.key}
          operation={selectedDataOperation}
          input={dataInput}
          disabled={!editable}
        />
      )}
    </div>
  );
}
