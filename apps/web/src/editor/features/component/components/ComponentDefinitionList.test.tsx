import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComponentDefinitionList } from './ComponentDefinitionList';

describe('ComponentDefinitionList creation controls', () => {
  it('creates a definition through compact accessible controls', async () => {
    const onCreate = vi.fn(async () => true);
    const user = userEvent.setup();

    render(
      <ComponentDefinitionList
        definitions={[]}
        selectedDocumentId={null}
        readonly={false}
        creating={false}
        onSelect={vi.fn()}
        onCreate={onCreate}
      />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Component name' }),
      'Hero'
    );
    await user.click(
      screen.getByRole('combobox', { name: 'Root element type' })
    );
    await user.click(screen.getByRole('option', { name: 'section' }));
    await user.click(screen.getByRole('button', { name: 'Create definition' }));

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Hero',
      rootType: 'section',
    });
  });
});
