import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type {
  InspectorContextValue,
  TriggerEntry,
} from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { InspectorTriggerItem } from './InspectorTriggerItem';

const createContext = (
  item: TriggerEntry,
  actions: {
    save: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }
): InspectorContextValue =>
  ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
    triggerEntries: [item],
    graphOptions: [],
    routeOptions: [],
    dataMutationOptions: [],
    updateTrigger: vi.fn(),
    saveTrigger: actions.save,
    cancelTrigger: actions.cancel,
    removeTrigger: vi.fn(),
  }) as unknown as InspectorContextValue;

const renderItem = (
  item: TriggerEntry,
  actions = { save: vi.fn(), cancel: vi.fn() }
) => {
  render(
    <InspectorContext.Provider value={createContext(item, actions)}>
      <InspectorTriggerItem item={item} />
    </InspectorContext.Provider>
  );
  return actions;
};

describe('InspectorTriggerItem draft controls', () => {
  it('keeps Save disabled for an incomplete draft and allows cancellation', () => {
    const item: TriggerEntry = {
      key: '__draft__',
      trigger: 'onClick',
      action: 'navigate',
      params: { to: '' },
      editable: true,
      draft: true,
    };
    const actions = renderItem(item);

    expect(
      (
        screen.getByRole('button', {
          name: 'Save trigger',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText('Enter a destination before saving.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel trigger' }));
    expect(actions.cancel).toHaveBeenCalledWith('__draft__');
    expect(actions.save).not.toHaveBeenCalled();
  });

  it('saves a complete draft through the explicit commit action', () => {
    const item: TriggerEntry = {
      key: '__draft__',
      trigger: 'onClick',
      action: 'navigate',
      params: { to: 'https://example.test' },
      editable: true,
      draft: true,
    };
    const actions = renderItem(item);
    const save = screen.getByRole('button', {
      name: 'Save trigger',
    }) as HTMLButtonElement;

    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(actions.save).toHaveBeenCalledWith('__draft__');
  });
});
