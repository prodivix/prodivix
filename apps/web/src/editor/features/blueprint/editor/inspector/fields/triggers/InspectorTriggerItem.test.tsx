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
  },
  routeOptions: Array<{ id: string; path: string }>
): InspectorContextValue =>
  ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
    triggerEntries: [item],
    graphOptions: [],
    routeOptions,
    // Mirrors the controller: every picker route resolves, plus the root the
    // picker list omits.
    knownRouteIds: new Set(['root', ...routeOptions.map((route) => route.id)]),
    dataMutationOptions: [],
    updateTrigger: vi.fn(),
    saveTrigger: actions.save,
    cancelTrigger: actions.cancel,
    removeTrigger: vi.fn(),
  }) as unknown as InspectorContextValue;

const renderItem = (
  item: TriggerEntry,
  actions = { save: vi.fn(), cancel: vi.fn() },
  routeOptions: Array<{ id: string; path: string }> = []
) => {
  render(
    <InspectorContext.Provider
      value={createContext(item, actions, routeOptions)}
    >
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

  it('keeps a draft of a saved internal route saveable and shows its path', () => {
    const item: TriggerEntry = {
      key: 'onClick',
      trigger: 'onPointerEnter',
      action: 'navigate',
      params: { routeId: 'route-2' },
      editable: true,
      draft: true,
    };
    renderItem(item, { save: vi.fn(), cancel: vi.fn() }, [
      { id: 'route-2', path: '/about' },
    ]);

    expect(
      (
        screen.getByRole('button', {
          name: 'Save trigger',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      (screen.getByPlaceholderText('https://example.com') as HTMLInputElement)
        .value
    ).toBe('/about');
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
