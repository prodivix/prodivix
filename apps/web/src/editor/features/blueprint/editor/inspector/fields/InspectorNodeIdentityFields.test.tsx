import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorContextValue } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import type { TextFieldMode } from '@/editor/features/blueprint/editor/model/blueprintText';
import { InspectorNodeIdentityFields } from './InspectorNodeIdentityFields';

const SWITCH_TO_RICH = 'Switch to rich text editor (bold/italic/color/size)';
const SWITCH_TO_PLAIN = 'Switch to plain text input';

function IdentityFieldsHarness({
  updateSelectedNode,
}: {
  updateSelectedNode: ReturnType<typeof vi.fn>;
}) {
  const [primaryTextFieldMode, setPrimaryTextFieldMode] =
    useState<TextFieldMode>('plain');
  const value = {
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
    selectedNode: {
      id: 'node-1',
      kind: 'element',
      type: 'span',
      text: 'Hello',
    },
    primaryTextField: { kind: 'node', key: 'text', value: 'Hello' },
    primaryTextFieldMode,
    setPrimaryTextFieldMode,
    updateSelectedNode,
  } as unknown as InspectorContextValue;
  return (
    <InspectorContext.Provider value={value}>
      <InspectorNodeIdentityFields />
    </InspectorContext.Provider>
  );
}

describe('Inspector primary text field mode', () => {
  it('switches between plain and rich editing without writing to the node', () => {
    const updateSelectedNode = vi.fn();
    render(<IdentityFieldsHarness updateSelectedNode={updateSelectedNode} />);

    fireEvent.click(screen.getByRole('button', { name: SWITCH_TO_RICH }));
    expect(screen.getByRole('button', { name: SWITCH_TO_PLAIN })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: SWITCH_TO_PLAIN }));
    expect(screen.getByRole('button', { name: SWITCH_TO_RICH })).toBeTruthy();

    expect(updateSelectedNode).not.toHaveBeenCalled();
  });
});
