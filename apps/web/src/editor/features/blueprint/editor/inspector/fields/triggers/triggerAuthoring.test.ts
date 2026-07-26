import { describe, expect, it } from 'vitest';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import {
  DOM_EVENT_TRIGGERS,
  createNewTriggerDraft,
  getTriggerDraftIssue,
} from './triggerAuthoring';

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
    expect(getTriggerDraftIssue(blank, [])).toBe('destination-required');

    const invalid = {
      ...blank,
      params: { to: 'example.test' },
    };
    expect(getTriggerDraftIssue(invalid, [])).toBe('destination-invalid');

    const unresolved = {
      ...blank,
      params: { to: '/products' },
    };
    expect(getTriggerDraftIssue(unresolved, [])).toBe('route-unresolved');

    expect(
      getTriggerDraftIssue(
        {
          ...blank,
          params: { to: '/products', routeId: 'route-products' },
        },
        []
      )
    ).toBeUndefined();
    expect(
      getTriggerDraftIssue(
        { ...blank, params: { to: 'https://example.test' } },
        []
      )
    ).toBeUndefined();
  });

  it('requires typed targets for graph and data mutation actions', () => {
    const draft = createNewTriggerDraft([])!;
    expect(
      getTriggerDraftIssue(
        {
          ...draft,
          action: 'executeGraph',
          params: { graphMode: 'existing', graphId: '' },
        },
        []
      )
    ).toBe('graph-required');
    expect(
      getTriggerDraftIssue(
        {
          ...draft,
          action: 'executeGraph',
          params: { graphMode: 'existing', graphId: 'graph-main' },
        },
        []
      )
    ).toBeUndefined();
    expect(
      getTriggerDraftIssue(
        {
          ...draft,
          action: 'executeDataMutation',
          params: { operation: {}, input: { kind: 'literal', value: null } },
        },
        []
      )
    ).toBe('data-operation-required');
    expect(
      getTriggerDraftIssue(
        {
          ...draft,
          action: 'executeDataMutation',
          params: {
            operation: { documentId: 'catalog', operationId: 'remove' },
            input: { kind: 'literal', value: null },
          },
        },
        []
      )
    ).toBeUndefined();
  });

  it('allows an edit to retain its event but rejects another event owner', () => {
    const entries = [canonicalEntry('onClick'), canonicalEntry('onSubmit')];
    const draft: TriggerEntry = {
      ...entries[0],
      draft: true,
      sourceKey: 'onClick',
    };
    expect(getTriggerDraftIssue(draft, entries)).toBeUndefined();
    expect(
      getTriggerDraftIssue({ ...draft, trigger: 'onSubmit' }, entries)
    ).toBe('event-conflict');
  });
});
