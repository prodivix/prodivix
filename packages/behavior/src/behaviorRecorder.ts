import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  BehaviorAction,
  BehaviorJsonValue,
  BehaviorRecorderDraft,
  BehaviorScenario,
  BehaviorSemanticTargetRef,
  BehaviorStep,
} from './behavior.types';

export type BehaviorRecorderRawEvent = Readonly<{
  id: string;
  kind: 'click' | 'input';
  fieldName?: string;
  value?: BehaviorJsonValue;
  targetCandidates: readonly BehaviorSemanticTargetRef[];
  suggestedAction?: BehaviorAction;
  sensitive?: boolean;
}>;

export type CreateBehaviorRecorderDraftInput = Readonly<{
  id: string;
  workspaceRevision: number;
  maximumEvents: number;
  events: readonly BehaviorRecorderRawEvent[];
}>;

export type BehaviorRecorderAdoptionResult =
  | Readonly<{ status: 'ready'; scenario: BehaviorScenario }>
  | Readonly<{
      status: 'blocked';
      reason: 'revision-drift' | 'unresolved-event' | 'empty-selection';
      eventIds?: readonly string[];
    }>
  | Readonly<{ status: 'cancelled' }>;

const SENSITIVE_FIELD =
  /(?:pass(?:word)?|secret|token|authorization|cookie|api[-_ ]?key|credential|private[-_ ]?key)/i;
const SENSITIVE_VALUE =
  /(?:^|\s)(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

const containsSensitiveJson = (
  value: BehaviorJsonValue | undefined,
  depth = 0,
  seen = new Set<object>()
): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value);
  if (typeof value !== 'object') return false;
  if (depth >= 32 || seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveJson(item, depth + 1, seen));
  }
  if (!isPlainObject(value)) return true;
  return Object.entries(value).some(
    ([key, child]) =>
      SENSITIVE_FIELD.test(key) ||
      containsSensitiveJson(child as BehaviorJsonValue, depth + 1, seen)
  );
};

const isSensitiveRecorderEvent = (event: BehaviorRecorderRawEvent): boolean =>
  event.sensitive === true ||
  SENSITIVE_FIELD.test(event.fieldName ?? '') ||
  containsSensitiveJson(event.value) ||
  containsSensitiveJson(event.suggestedAction?.input);

const createSuggestedAction = (
  event: BehaviorRecorderRawEvent,
  target: BehaviorSemanticTargetRef
): BehaviorAction => {
  if (event.suggestedAction) {
    return Object.freeze({
      ...event.suggestedAction,
      target,
    });
  }
  return Object.freeze({
    kind: event.kind === 'click' ? 'semantic-click' : 'semantic-input',
    target,
    ...(event.kind === 'input' && event.value !== undefined
      ? { input: event.value }
      : {}),
    capabilityId: event.kind === 'click' ? 'pir.click' : 'pir.input',
    runtimeZone: 'client',
    effect: event.kind === 'click' ? 'none' : 'write',
    cancellation: 'none',
  });
};

const targetIdentity = (target: BehaviorSemanticTargetRef): string =>
  canonicalJsonText(target);

/**
 * Converts transient adapter events into a bounded, selector-free draft.
 * Sensitive values are classified before any value or action reaches output.
 */
export const createBehaviorRecorderDraft = (
  input: CreateBehaviorRecorderDraftInput
): BehaviorRecorderDraft => {
  const maximumEvents = Math.max(1, Math.floor(input.maximumEvents));
  const accepted = input.events.slice(0, maximumEvents);
  const events: Array<BehaviorRecorderDraft['events'][number]> = [];
  accepted.forEach((rawEvent) => {
    if (isSensitiveRecorderEvent(rawEvent)) {
      events.push(
        Object.freeze({
          id: rawEvent.id,
          resolution: 'sensitive',
        })
      );
      return;
    }
    const candidates = [...rawEvent.targetCandidates].sort((left, right) =>
      compareUnicodeCodePoints(targetIdentity(left), targetIdentity(right))
    );
    if (!candidates.length) {
      events.push(Object.freeze({ id: rawEvent.id, resolution: 'unresolved' }));
      return;
    }
    if (candidates.length > 1) {
      events.push(
        Object.freeze({
          id: rawEvent.id,
          resolution: 'ambiguous',
          alternatives: Object.freeze(candidates),
          confidence: 0,
        })
      );
      return;
    }
    const target = candidates[0]!;
    const event = Object.freeze({
      id: rawEvent.id,
      resolution: 'resolved' as const,
      target,
      confidence: 1,
      suggestedAction: createSuggestedAction(rawEvent, target),
    });
    const previous = events.at(-1);
    if (
      event.suggestedAction.kind === 'semantic-input' &&
      previous?.resolution === 'resolved' &&
      previous.suggestedAction?.kind === 'semantic-input' &&
      previous.target &&
      targetIdentity(previous.target) === targetIdentity(target)
    ) {
      events[events.length - 1] = event;
    } else {
      events.push(event);
    }
  });
  return Object.freeze({
    id: input.id,
    workspaceRevision: input.workspaceRevision,
    maximumEvents,
    truncatedEventCount: Math.max(0, input.events.length - maximumEvents),
    events: Object.freeze(events),
  });
};

export const resolveBehaviorRecorderDraftEvent = (
  draft: BehaviorRecorderDraft,
  eventId: string,
  target: BehaviorSemanticTargetRef,
  action: BehaviorAction
): BehaviorRecorderDraft =>
  Object.freeze({
    ...draft,
    events: Object.freeze(
      draft.events.map((event) =>
        event.id === eventId && event.resolution !== 'sensitive'
          ? Object.freeze({
              id: event.id,
              resolution: 'resolved' as const,
              target,
              confidence: 1,
              suggestedAction: Object.freeze({ ...action, target }),
            })
          : event
      )
    ),
  });

export const adoptBehaviorRecorderDraft = (
  input: Readonly<{
    draft: BehaviorRecorderDraft;
    scenario: BehaviorScenario;
    workspaceRevision: number;
    selectedEventIds: readonly string[];
    cancel?: boolean;
  }>
): BehaviorRecorderAdoptionResult => {
  if (input.cancel) return Object.freeze({ status: 'cancelled' });
  if (input.workspaceRevision !== input.draft.workspaceRevision) {
    return Object.freeze({ status: 'blocked', reason: 'revision-drift' });
  }
  const selectedIds = new Set(input.selectedEventIds);
  if (!selectedIds.size) {
    return Object.freeze({ status: 'blocked', reason: 'empty-selection' });
  }
  const selected = input.draft.events.filter((event) =>
    selectedIds.has(event.id)
  );
  const selectedCounts = new Map<string, number>();
  selected.forEach(({ id }) =>
    selectedCounts.set(id, (selectedCounts.get(id) ?? 0) + 1)
  );
  const selectedEventIds = new Set(selected.map(({ id }) => id));
  const unresolved = [
    ...new Set([
      ...[...selectedIds].filter((id) => !selectedEventIds.has(id)),
      ...[...selectedCounts].filter(([, count]) => count > 1).map(([id]) => id),
      ...selected
        .filter(
          (event) =>
            event.resolution !== 'resolved' ||
            !event.suggestedAction ||
            !event.target
        )
        .map(({ id }) => id),
    ]),
  ].sort(compareUnicodeCodePoints);
  if (unresolved.length) {
    return Object.freeze({
      status: 'blocked',
      reason: 'unresolved-event',
      eventIds: Object.freeze(unresolved),
    });
  }
  const adoptedSteps = selected.map((event): BehaviorStep =>
    Object.freeze({
      id: `recorded:${event.id}`,
      kind: 'action',
      action: event.suggestedAction!,
      failureMode: 'stop',
    })
  );
  return Object.freeze({
    status: 'ready',
    scenario: Object.freeze({
      ...input.scenario,
      steps: Object.freeze([...input.scenario.steps, ...adoptedSteps]),
    }),
  });
};
