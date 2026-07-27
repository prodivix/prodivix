import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorContextValue } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { InspectorDataScopeFields } from './InspectorDataScopeFields';

/** Mirrors the read projection: equal data, brand-new object identity. */
const mountedNodeView = () => ({
  id: 'node-1',
  kind: 'element' as const,
  type: 'section',
  data: { value: { totalCount: 'number' }, mock: { totalCount: 2 } },
});

const renderFields = (
  updateSelectedNode: ReturnType<typeof vi.fn> = vi.fn()
) => {
  const contextValue = (): InspectorContextValue =>
    ({
      t: (key: string, options?: Record<string, unknown>) =>
        String(options?.defaultValue ?? key),
      selectedNode: mountedNodeView(),
      updateSelectedNode,
      expandedPanels: {},
      togglePanel: vi.fn(),
    }) as unknown as InspectorContextValue;
  const view = render(
    <InspectorContext.Provider value={contextValue()}>
      <InspectorDataScopeFields />
    </InspectorContext.Provider>
  );
  return {
    updateSelectedNode,
    /** Replays a Workspace snapshot swap that did not change this node. */
    replaySnapshot: () =>
      view.rerender(
        <InspectorContext.Provider value={contextValue()}>
          <InspectorDataScopeFields />
        </InspectorContext.Provider>
      ),
  };
};

const mockField = () =>
  screen.getByTestId('inspector-data-model-mock') as HTMLTextAreaElement;

describe('Inspector Data Model drafts', () => {
  it('keeps uncommitted Mock JSON across an unrelated Workspace snapshot', () => {
    const { replaySnapshot } = renderFields();

    fireEvent.focus(mockField());
    fireEvent.change(mockField(), {
      target: { value: '{ "totalCount": 30' },
    });
    replaySnapshot();

    expect(mockField().value).toBe('{ "totalCount": 30');
  });

  it('commits the Mock draft when the author leaves the field', () => {
    const { updateSelectedNode } = renderFields();

    fireEvent.focus(mockField());
    fireEvent.change(mockField(), { target: { value: '{ "totalCount": 7 }' } });
    fireEvent.blur(mockField());

    expect(updateSelectedNode).toHaveBeenCalledTimes(1);
  });
});
