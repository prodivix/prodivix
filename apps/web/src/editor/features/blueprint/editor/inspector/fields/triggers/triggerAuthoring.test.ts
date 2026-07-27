import { describe, expect, it } from 'vitest';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import {
  DOM_EVENT_TRIGGERS,
  createNewTriggerDraft,
  getTriggerDraftIssue,
} from './triggerAuthoring';

// Mirrors the controller's knownRouteIds: picker routes plus the root that the
// picker list omits.
const KNOWN_ROUTE_IDS: ReadonlySet<string> = new Set([
  'root',
  'route-2',
  'route-products',
]);

const canonicalEntry = (
  key: string,
  input: Partial<TriggerEntry> = {}
): TriggerEntry => ({
  key,
  trigger: key,
  action: 'navigate',
  params: { to: 'https://example.test' },
  editable: true,
  ...input,
});

describe('Trigger authoring drafts', () => {
  it('creates a local draft with the first unoccupied DOM event', () => {
    const draft = createNewTriggerDraft([canonicalEntry('onClick')]);

    expect(draft).toMatchObject({
      trigger: 'onDoubleClick',
      action: 'navigate',
      params: { to: '' },
      draft: true,
    });
  });

  it('does not create a draft when every supported event is occupied', () => {
    const entries = DOM_EVENT_TRIGGERS.map((event) => canonicalEntry(event));
    expect(createNewTriggerDraft(entries)).toBeNull();
  });

  it('requires a complete destination and resolved internal route', () => {
    const blank = createNewTriggerDraft([])!;
    expect(getTriggerDraftIssue(blank, [], KNOWN_ROUTE_IDS)).toBe('destination-required');

    const invalid = {
      ...blank,
      params: { to: 'example.test' },
    };
    expect(getTriggerDraftIssue(invalid, [], KNOWN_ROUTE_IDS)).toBe('destination-invalid');

    const unresolved = {
      ...blank,
      params: { to: '/products' },
    };
    expect(getTriggerDraftIssue(unresolved, [], KNOWN_ROUTE_IDS)).toBe('route-unresolved');

    expect(
      getTriggerDraftIssue({
          ...blank,
          params: { to: '/products', routeId: 'route-products' },
        }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
    expect(
      getTriggerDraftIssue({ ...blank, params: { to: 'https://example.test' } }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
  });

  it('accepts a saved internal route whose destination text was never authored', () => {
    const draft = createNewTriggerDraft([])!;
    expect(
      getTriggerDraftIssue({ ...draft, params: { routeId: 'route-2' } }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
    expect(
      getTriggerDraftIssue({ ...draft, params: { routeId: 'root' } }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
  });

  it('does not treat a routeId left behind by a deleted route as resolved', () => {
    // Resolution requires the route to still exist; otherwise the stale id
    // would save navigation to nowhere while the UI reports it valid.
    const draft = createNewTriggerDraft([])!;
    expect(
      getTriggerDraftIssue(
        { ...draft, params: { to: '/products', routeId: 'route-deleted' } },
        [],
        KNOWN_ROUTE_IDS
      )
    ).toBe('route-unresolved');
    expect(
      getTriggerDraftIssue(
        { ...draft, params: { routeId: 'route-deleted' } },
        [],
        KNOWN_ROUTE_IDS
      )
    ).toBe('destination-required');
  });

  it('requires typed targets for graph and data mutation actions', () => {
    const draft = createNewTriggerDraft([])!;
    expect(
      getTriggerDraftIssue({
          ...draft,
          action: 'executeGraph',
          params: { graphMode: 'existing', graphId: '' },
        }, [], KNOWN_ROUTE_IDS)
    ).toBe('graph-required');
    expect(
      getTriggerDraftIssue({
          ...draft,
          action: 'executeGraph',
          params: { graphMode: 'existing', graphId: 'graph-main' },
        }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
    expect(
      getTriggerDraftIssue({
          ...draft,
          action: 'executeDataMutation',
          params: { operation: {}, input: { kind: 'literal', value: null } },
        }, [], KNOWN_ROUTE_IDS)
    ).toBe('data-operation-required');
    expect(
      getTriggerDraftIssue({
          ...draft,
          action: 'executeDataMutation',
          params: {
            operation: { documentId: 'catalog', operationId: 'remove' },
            input: { kind: 'literal', value: null },
          },
        }, [], KNOWN_ROUTE_IDS)
    ).toBeUndefined();
  });

  it('allows an edit to retain its event but rejects another event owner', () => {
    const entries = [canonicalEntry('onClick'), canonicalEntry('onSubmit')];
    const draft: TriggerEntry = {
      ...entries[0],
      draft: true,
      sourceKey: 'onClick',
    };
    expect(getTriggerDraftIssue(draft, entries, KNOWN_ROUTE_IDS)).toBeUndefined();
    expect(
      getTriggerDraftIssue({ ...draft, trigger: 'onSubmit' }, entries, KNOWN_ROUTE_IDS)
    ).toBe('event-conflict');
  });
});
