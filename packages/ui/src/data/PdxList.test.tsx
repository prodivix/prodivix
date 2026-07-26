import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxList, { type PdxListItem } from './PdxList';

const items: PdxListItem[] = [
  { description: 'Today at 3 PM', id: 'review', title: 'Design review' },
  { description: 'Tomorrow at 10 AM', id: 'sync', title: 'Product sync' },
  { disabled: true, id: 'demo', title: 'Sprint demo' },
];

describe('PdxList read-only rows', () => {
  it('stays a plain list with no selection state', () => {
    render(<PdxList items={items} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    screen
      .getAllByRole('listitem')
      .forEach((item) => expect(item).not.toHaveAttribute('aria-selected'));
  });
});

describe('PdxList selectable rows', () => {
  it('becomes a listbox whose options are reachable from the keyboard', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxList
        aria-label="Meetings"
        items={items}
        onSelectionChange={onSelectionChange}
        selectionMode="Single"
      />
    );

    expect(
      screen.getByRole('listbox', { name: 'Meetings' })
    ).toBeInTheDocument();
    const options = screen.getAllByRole('option');

    await user.tab();
    expect(options[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onSelectionChange).toHaveBeenCalledWith(['sync']);
    expect(screen.getAllByRole('option')[1]).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('reaches a disabled option but refuses to select it', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxList
        aria-label="Meetings"
        items={items}
        onSelectionChange={onSelectionChange}
        selectionMode="Multiple"
      />
    );

    const options = screen.getAllByRole('option');
    expect(options[2]).toHaveAttribute('aria-disabled', 'true');

    await user.tab();
    await user.keyboard('{End}');
    expect(options[2]).toHaveFocus();

    await user.keyboard('[Space]');
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('accumulates options in multiple mode', async () => {
    const user = userEvent.setup();
    render(
      <PdxList aria-label="Meetings" items={items} selectionMode="Multiple" />
    );

    await user.click(screen.getByText('Design review'));
    await user.click(screen.getByText('Product sync'));

    expect(
      screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true')
        .length
    ).toBe(2);
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-multiselectable',
      'true'
    );
  });
});

describe('PdxList empty and loading states', () => {
  it('shows the shared empty state instead of an empty list', () => {
    render(<PdxList items={[]} emptyText="No meetings scheduled" />);

    expect(screen.getByText('No meetings scheduled')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('marks itself busy while loading', () => {
    render(<PdxList items={items} loading loadingRows={2} />);

    expect(screen.queryByText('Design review')).not.toBeInTheDocument();
  });
});
