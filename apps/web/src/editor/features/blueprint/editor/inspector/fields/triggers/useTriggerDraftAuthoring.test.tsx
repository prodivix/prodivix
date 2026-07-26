import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { DOM_EVENT_TRIGGERS } from './triggerAuthoring';
import { useTriggerDraftAuthoring } from './useTriggerDraftAuthoring';

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

describe('useTriggerDraftAuthoring', () => {
  it('keeps a new trigger local until an explicit valid save succeeds', async () => {
    const onCommit = vi.fn(async () => true);
    const { result } = renderHook(() =>
      useTriggerDraftAuthoring({
        ownerKey: 'page:button',
        readOnly: false,
        canonicalEntries: [],
        onCommit,
      })
    );

    act(() => result.current.add());
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.entries[0]).toMatchObject({
      draft: true,
      params: { to: '' },
    });

    const draftKey = result.current.entries[0].key;
    act(() =>
      result.current.update(draftKey, (current) => ({
        ...current,
        params: { to: 'https://example.test' },
      }))
    );
    act(() => result.current.save(draftKey));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        trigger: 'onClick',
        params: { to: 'https://example.test' },
      })
    );
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });

  it('fails closed for an incomplete draft without calling the commit boundary', () => {
    const onCommit = vi.fn(async () => true);
    const onIssue = vi.fn();
    const { result } = renderHook(() =>
      useTriggerDraftAuthoring({
        ownerKey: 'page:button',
        readOnly: false,
        canonicalEntries: [],
        onCommit,
        onIssue,
      })
    );

    act(() => result.current.add());
    const draftKey = result.current.entries[0].key;
    act(() => result.current.save(draftKey));

    expect(onCommit).not.toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith('destination-required');
    expect(result.current.entries[0].draft).toBe(true);
  });

  it('preserves a valid draft when the canonical commit is rejected', async () => {
    const onCommit = vi.fn(async () => false);
    const { result } = renderHook(() =>
      useTriggerDraftAuthoring({
        ownerKey: 'page:button',
        readOnly: false,
        canonicalEntries: [],
        onCommit,
      })
    );

    act(() => result.current.add());
    const draftKey = result.current.entries[0].key;
    act(() =>
      result.current.update(draftKey, (current) => ({
        ...current,
        params: { to: 'https://example.test' },
      }))
    );
    act(() => result.current.save(draftKey));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.entries[0].saving).toBe(false));
    expect(result.current.entries[0].draft).toBe(true);
  });

  it('stages and cancels edits without mutating the canonical entry', () => {
    const entry = canonicalEntry('onClick');
    const { result } = renderHook(() =>
      useTriggerDraftAuthoring({
        ownerKey: 'page:button',
        readOnly: false,
        canonicalEntries: [entry],
        onCommit: vi.fn(async () => true),
      })
    );

    act(() =>
      result.current.update('onClick', (current) => ({
        ...current,
        trigger: 'onBlur',
      }))
    );
    expect(result.current.entries[0]).toMatchObject({
      trigger: 'onBlur',
      draft: true,
      sourceKey: 'onClick',
    });
    expect(entry.trigger).toBe('onClick');

    act(() => result.current.cancel('onClick'));
    expect(result.current.entries[0]).toEqual(entry);
  });

  it('reports exhaustion without creating or committing a draft', () => {
    const onCommit = vi.fn(async () => true);
    const onIssue = vi.fn();
    const canonicalEntries = DOM_EVENT_TRIGGERS.map((event) =>
      canonicalEntry(event)
    );
    const { result } = renderHook(() =>
      useTriggerDraftAuthoring({
        ownerKey: 'page:button',
        readOnly: false,
        canonicalEntries,
        onCommit,
        onIssue,
      })
    );

    act(() => result.current.add());
    expect(result.current.entries).toEqual(canonicalEntries);
    expect(onIssue).toHaveBeenCalledWith('all-events-used');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
