import { getNavigateLinkKind } from '@prodivix/router';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';

export const DOM_EVENT_TRIGGERS = [
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

export const BUILT_IN_ACTION_OPTIONS = [
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

export type BuiltInActionName =
  (typeof BUILT_IN_ACTION_OPTIONS)[number]['value'];

export type TriggerDraftIssue =
  | 'source-missing'
  | 'event-conflict'
  | 'destination-required'
  | 'destination-invalid'
  | 'route-unresolved'
  | 'graph-required'
  | 'data-operation-required'
  | 'data-input-required';

export type TriggerAuthoringIssue =
  TriggerDraftIssue | 'all-events-used' | 'save-failed';

export const TRIGGER_AUTHORING_ISSUE_DEFAULT_MESSAGES: Readonly<
  Record<TriggerAuthoringIssue, string>
> = {
  'source-missing':
    'The saved trigger changed while this draft was open. Cancel and edit it again.',
  'event-conflict': 'This event already has a trigger.',
  'destination-required': 'Enter a destination before saving.',
  'destination-invalid':
    'Use https:// for external links or choose an existing internal route.',
  'route-unresolved': 'Choose an existing internal route before saving.',
  'graph-required': 'Select an existing graph before saving.',
  'data-operation-required': 'Select a mutation before saving.',
  'data-input-required': 'Provide a valid typed input mapping before saving.',
  'all-events-used': 'All supported trigger events are already configured.',
  'save-failed': 'The trigger draft could not be saved.',
};

export const NEW_TRIGGER_DRAFT_KEY = '__new-trigger-draft__';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeBuiltInAction = (
  value: string | undefined
): BuiltInActionName =>
  value === 'executeGraph' || value === 'executeDataMutation'
    ? value
    : 'navigate';

export const createDefaultActionParams = (
  action: BuiltInActionName
): Record<string, unknown> =>
  action === 'executeGraph'
    ? { graphMode: 'existing', graphId: '' }
    : action === 'executeDataMutation'
      ? { operation: {}, input: { kind: 'literal', value: null } }
      : { to: '' };

export const createNewTriggerDraft = (
  canonicalEntries: readonly TriggerEntry[]
): TriggerEntry | null => {
  const occupiedEvents = new Set(
    canonicalEntries.map((entry) => entry.trigger.trim())
  );
  const trigger = DOM_EVENT_TRIGGERS.find(
    (candidate) => !occupiedEvents.has(candidate)
  );
  if (!trigger) return null;
  return {
    key: NEW_TRIGGER_DRAFT_KEY,
    trigger,
    action: 'navigate',
    params: createDefaultActionParams('navigate'),
    editable: true,
    draft: true,
  };
};

export const getTriggerDraftIssue = (
  entry: TriggerEntry,
  canonicalEntries: readonly TriggerEntry[]
): TriggerDraftIssue | undefined => {
  if (entry.sourceKey) {
    const sourceExists = canonicalEntries.some(
      (candidate) => candidate.key === entry.sourceKey
    );
    if (!sourceExists) return 'source-missing';
  }

  const trigger = entry.trigger.trim();
  const eventConflict = canonicalEntries.some(
    (candidate) =>
      candidate.key !== entry.sourceKey && candidate.trigger.trim() === trigger
  );
  if (eventConflict) return 'event-conflict';

  const action = normalizeBuiltInAction(entry.action);
  if (action === 'executeGraph') {
    const graphId =
      typeof entry.params.graphId === 'string'
        ? entry.params.graphId.trim()
        : '';
    return graphId ? undefined : 'graph-required';
  }
  if (action === 'executeDataMutation') {
    const operation = isRecord(entry.params.operation)
      ? entry.params.operation
      : undefined;
    const documentId =
      typeof operation?.documentId === 'string'
        ? operation.documentId.trim()
        : '';
    const operationId =
      typeof operation?.operationId === 'string'
        ? operation.operationId.trim()
        : '';
    if (!documentId || !operationId) return 'data-operation-required';
    return isRecord(entry.params.input) ? undefined : 'data-input-required';
  }

  const destination =
    typeof entry.params.to === 'string' ? entry.params.to.trim() : '';
  if (!destination) return 'destination-required';
  const linkKind = getNavigateLinkKind(destination);
  if (!linkKind) return 'destination-invalid';
  if (linkKind === 'external') return undefined;
  const routeId =
    typeof entry.params.routeId === 'string' ? entry.params.routeId.trim() : '';
  return routeId ? undefined : 'route-unresolved';
};
