import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxTable, { type PdxTableColumn } from './PdxTable';

type Row = { name: string; score: number };

const columns: Array<PdxTableColumn<Row>> = [
  { dataIndex: 'name', key: 'name', sortable: true, title: 'Name' },
  {
    align: 'Right',
    dataIndex: 'score',
    key: 'score',
    sortable: true,
    title: 'Score',
  },
  { dataIndex: 'team', key: 'team', title: 'Team' },
];

const plainColumns: Array<PdxTableColumn<Row>> = [
  { dataIndex: 'name', key: 'name', title: 'Name' },
  { dataIndex: 'score', key: 'score', title: 'Score' },
];

const data: Row[] = [
  { name: 'Chloe', score: 2 },
  { name: 'Alice', score: 10 },
  { name: 'Ben', score: 1 },
];

const dataRows = () => screen.getAllByRole('row').slice(1);

const namesInOrder = (cellRole: 'cell' | 'gridcell' = 'cell') =>
  dataRows().map(
    (row) => within(row).getAllByRole(cellRole)[0]?.textContent ?? ''
  );

const selectedRowCount = () =>
  dataRows().filter((row) => row.getAttribute('aria-selected') === 'true')
    .length;

describe('PdxTable sorting', () => {
  it('sorts from a column header button and reports the state on the header', async () => {
    const user = userEvent.setup();
    render(<PdxTable columns={columns} data={data} rowKey="name" />);

    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'none'
    );

    await user.click(screen.getByRole('button', { name: /Name/ }));

    expect(namesInOrder()).toEqual(['Alice', 'Ben', 'Chloe']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('cycles descending and then back to the incoming order', async () => {
    const user = userEvent.setup();
    render(<PdxTable columns={columns} data={data} rowKey="name" />);
    const sortByName = screen.getByRole('button', { name: /Name/ });

    await user.click(sortByName);
    await user.click(sortByName);
    expect(namesInOrder()).toEqual(['Chloe', 'Ben', 'Alice']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );

    await user.click(sortByName);
    expect(namesInOrder()).toEqual(['Chloe', 'Alice', 'Ben']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'none'
    );
  });

  it('sorts numbers as numbers rather than as text', async () => {
    const user = userEvent.setup();
    render(<PdxTable columns={columns} data={data} rowKey="name" />);

    await user.click(screen.getByRole('button', { name: /Score/ }));

    expect(namesInOrder()).toEqual(['Ben', 'Chloe', 'Alice']);
  });

  it('announces the sort state instead of only drawing it', async () => {
    const user = userEvent.setup();
    render(<PdxTable columns={columns} data={data} rowKey="name" />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Name ascending'
    );

    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Name descending'
    );
  });

  it('reports sort changes and leaves ordering alone when the caller owns it', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxTable
        columns={columns}
        data={data}
        externalSort
        onSortChange={onSortChange}
        rowKey="name"
        sort={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /Name/ }));

    expect(onSortChange).toHaveBeenCalledWith({
      columnKey: 'name',
      direction: 'Ascending',
    });
    expect(namesInOrder()).toEqual(['Chloe', 'Alice', 'Ben']);
  });

  it('offers no sort control for a column that did not ask for one', () => {
    render(<PdxTable columns={columns} data={data} rowKey="name" />);

    expect(
      screen.queryByRole('button', { name: /Team/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Team' })
    ).not.toHaveAttribute('aria-sort');
  });
});

describe('PdxTable row selection', () => {
  it('reaches every row from the keyboard and selects the focused one', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxTable
        columns={plainColumns}
        data={data}
        onSelectionChange={onSelectionChange}
        rowKey="name"
        selectionMode="Single"
      />
    );

    const rows = dataRows();
    await user.tab();
    await user.tab();
    expect(rows[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();

    await user.keyboard('{End}');
    expect(rows[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(rows[0]).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onSelectionChange).toHaveBeenCalledWith(['Chloe']);
    expect(dataRows()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps one selected row in single mode and accumulates in multiple mode', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PdxTable
        columns={plainColumns}
        data={data}
        rowKey="name"
        selectionMode="Single"
      />
    );

    await user.click(screen.getByText('Chloe'));
    await user.click(screen.getByText('Alice'));
    expect(selectedRowCount()).toBe(1);

    rerender(
      <PdxTable
        columns={plainColumns}
        data={data}
        rowKey="name"
        selectionMode="Multiple"
      />
    );
    await user.click(screen.getByText('Ben'));
    expect(selectedRowCount()).toBe(2);
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-multiselectable',
      'true'
    );
  });

  it('stays a plain table with no selection state when selection is off', () => {
    render(<PdxTable columns={plainColumns} data={data} rowKey="name" />);

    dataRows().forEach((row) =>
      expect(row).not.toHaveAttribute('aria-selected')
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('PdxTable empty and loading states', () => {
  it('shows the shared empty state when there is nothing to show', () => {
    render(<PdxTable columns={columns} data={[]} emptyText="No members yet" />);

    expect(screen.getByText('No members yet')).toBeInTheDocument();
  });

  it('marks itself busy while loading and shows no rows', () => {
    render(
      <PdxTable columns={plainColumns} data={data} loading loadingRows={2} />
    );

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Chloe')).not.toBeInTheDocument();
  });
});
