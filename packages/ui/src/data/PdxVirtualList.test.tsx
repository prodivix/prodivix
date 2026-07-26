import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PdxVirtualList, { type PdxVirtualListItem } from './PdxVirtualList';

const rows: PdxVirtualListItem[] = Array.from(
  { length: 1000 },
  (_unused, index) => ({
    key: `row-${index}`,
    content: `Row ${index + 1}`,
  })
);

const renderList = (
  props: Partial<ComponentProps<typeof PdxVirtualList>> = {}
) =>
  render(
    <PdxVirtualList
      aria-label="Files"
      height={320}
      items={rows}
      rowHeight={32}
      {...props}
    />
  );

const setScrollTop = (element: HTMLElement, value: number) => {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    value,
    writable: true,
  });
};

describe('PdxVirtualList', () => {
  it('renders a window of rows while reporting the whole collection', () => {
    renderList();

    expect(screen.getAllByRole('option').length).toBeLessThan(rows.length);
    expect(screen.queryByRole('option', { name: 'Row 500' })).toBeNull();

    const first = screen.getByRole('option', { name: 'Row 1' });
    expect(first).toHaveAttribute('aria-setsize', '1000');
    expect(first).toHaveAttribute('aria-posinset', '1');
  });

  it('moves the active option through the full list and brings the window with it', async () => {
    const onActiveKeyChange = vi.fn();
    const user = userEvent.setup();
    renderList({ onActiveKeyChange });

    const list = screen.getByRole('listbox', { name: 'Files' });
    list.focus();
    await user.keyboard('{ArrowDown>40/}');

    const active = screen.getByRole('option', { name: 'Row 41' });
    expect(active).toHaveAttribute('aria-posinset', '41');
    expect(list).toHaveAttribute('aria-activedescendant', active.id);
    expect(onActiveKeyChange).toHaveBeenLastCalledWith('row-40');
    expect(screen.queryByRole('option', { name: 'Row 1' })).toBeNull();
  });

  it('jumps to the ends of the list with Home and End', async () => {
    const user = userEvent.setup();
    renderList();

    const list = screen.getByRole('listbox', { name: 'Files' });
    list.focus();
    await user.keyboard('{End}');

    const last = screen.getByRole('option', { name: 'Row 1000' });
    expect(last).toHaveAttribute('aria-posinset', '1000');
    expect(list).toHaveAttribute('aria-activedescendant', last.id);

    await user.keyboard('{Home}');
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Row 1' }).id
    );
  });

  it('moves by a viewport with the page keys', async () => {
    const user = userEvent.setup();
    renderList();

    const list = screen.getByRole('listbox', { name: 'Files' });
    list.focus();
    await user.keyboard('{PageDown}');

    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Row 11' }).id
    );

    await user.keyboard('{PageUp}');
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Row 1' }).id
    );
  });

  it('selects the active option from the keyboard', async () => {
    const onSelectedKeyChange = vi.fn();
    const user = userEvent.setup();
    renderList({ onSelectedKeyChange });

    const list = screen.getByRole('listbox', { name: 'Files' });
    list.focus();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelectedKeyChange).toHaveBeenLastCalledWith('row-1');
    expect(screen.getByRole('option', { name: 'Row 2' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Row 1' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('selects the row a pointer activates', async () => {
    const onSelectedKeyChange = vi.fn();
    const user = userEvent.setup();
    renderList({ onSelectedKeyChange });

    await user.click(screen.getByRole('option', { name: 'Row 3' }));

    expect(onSelectedKeyChange).toHaveBeenLastCalledWith('row-2');
    expect(screen.getByRole('option', { name: 'Row 3' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('skips disabled rows in both directions', async () => {
    const user = userEvent.setup();
    render(
      <PdxVirtualList
        aria-label="Steps"
        height={160}
        items={[
          { key: 'a', content: 'Alpha' },
          { key: 'b', content: 'Bravo', disabled: true },
          { key: 'c', content: 'Charlie' },
        ]}
        rowHeight={32}
      />
    );

    const list = screen.getByRole('listbox', { name: 'Steps' });
    list.focus();
    await user.keyboard('{ArrowDown}');

    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Charlie' }).id
    );

    await user.keyboard('{ArrowUp}');
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Alpha' }).id
    );
  });

  it('does not select a disabled row that is clicked', async () => {
    const onSelectedKeyChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxVirtualList
        aria-label="Steps"
        height={160}
        items={[
          { key: 'a', content: 'Alpha' },
          { key: 'b', content: 'Bravo', disabled: true },
        ]}
        onSelectedKeyChange={onSelectedKeyChange}
        rowHeight={32}
      />
    );

    await user.click(screen.getByRole('option', { name: 'Bravo' }));

    expect(onSelectedKeyChange).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'Bravo' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('renders the rows for the scrolled window', () => {
    renderList();

    const list = screen.getByRole('listbox', { name: 'Files' });
    setScrollTop(list, 3200);
    fireEvent.scroll(list);

    expect(screen.getByRole('option', { name: 'Row 101' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Row 50' })).toBeNull();
  });

  it('keeps the active option mounted after the window scrolls away from it', () => {
    renderList({ defaultActiveKey: 'row-0' });

    const list = screen.getByRole('listbox', { name: 'Files' });
    setScrollTop(list, 3200);
    fireEvent.scroll(list);

    const active = screen.getByRole('option', { name: 'Row 1' });
    expect(list).toHaveAttribute('aria-activedescendant', active.id);
  });

  it('lets the caller own the active row', async () => {
    const onActiveKeyChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderList({
      activeKey: 'row-0',
      onActiveKeyChange,
    });

    const list = screen.getByRole('listbox', { name: 'Files' });
    list.focus();
    await user.keyboard('{ArrowDown}');

    expect(onActiveKeyChange).toHaveBeenLastCalledWith('row-1');
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Row 1' }).id
    );

    rerender(
      <PdxVirtualList
        activeKey="row-1"
        aria-label="Files"
        height={320}
        items={rows}
        onActiveKeyChange={onActiveKeyChange}
        rowHeight={32}
      />
    );
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Row 2' }).id
    );
  });

  it('renders an empty list without an active descendant', () => {
    render(<PdxVirtualList aria-label="Files" items={[]} />);

    const list = screen.getByRole('listbox', { name: 'Files' });
    expect(list).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
