import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxDataGrid, { type PdxDataGridColumn } from './PdxDataGrid';

type GridRow = { product: string; stock: number };

const columns: Array<PdxDataGridColumn<GridRow>> = [
  { dataIndex: 'product', key: 'product', sortable: true, title: 'Product' },
  { dataIndex: 'stock', key: 'stock', sortable: true, title: 'Stock' },
];

const plainColumns: Array<PdxDataGridColumn<GridRow>> = [
  { dataIndex: 'product', key: 'product', title: 'Product' },
  { dataIndex: 'stock', key: 'stock', title: 'Stock' },
];

const data: GridRow[] = [
  { product: 'Marker', stock: 80 },
  { product: 'Backpack', stock: 9 },
  { product: 'Notebook', stock: 24 },
];

const dataRows = () => screen.getAllByRole('row').slice(1);

const productsInOrder = (cellRole: 'cell' | 'gridcell') =>
  dataRows().map(
    (row) => within(row).getAllByRole(cellRole)[0]?.textContent ?? ''
  );

describe('PdxDataGrid roles', () => {
  it('is a table until its rows can be operated, then a grid', () => {
    const { rerender } = render(
      <PdxDataGrid columns={plainColumns} data={data} />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    rerender(
      <PdxDataGrid columns={plainColumns} data={data} selectionMode="Single" />
    );

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell').length).toBe(6);
  });
});

describe('PdxDataGrid sorting', () => {
  it('sorts from a real header button and carries the state on the header', async () => {
    const user = userEvent.setup();
    render(<PdxDataGrid columns={columns} data={data} rowKey="product" />);

    await user.click(screen.getByRole('button', { name: /Stock/ }));

    expect(productsInOrder('cell')).toEqual(['Backpack', 'Notebook', 'Marker']);
    expect(screen.getByRole('columnheader', { name: /Stock/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Stock ascending'
    );
  });

  it('hands sort state to the caller without reordering when the caller owns order', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxDataGrid
        columns={columns}
        data={data}
        externalSort
        onSortChange={onSortChange}
        rowKey="product"
        sort={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /Product/ }));

    expect(onSortChange).toHaveBeenCalledWith({
      columnKey: 'product',
      direction: 'Ascending',
    });
    expect(productsInOrder('cell')).toEqual(['Marker', 'Backpack', 'Notebook']);
  });
});

describe('PdxDataGrid row selection', () => {
  it('walks rows with the arrow keys and toggles with Space', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxDataGrid
        columns={plainColumns}
        data={data}
        onSelectionChange={onSelectionChange}
        rowKey="product"
        selectionMode="Multiple"
      />
    );

    const rows = dataRows();
    await user.tab();
    await user.tab();
    expect(rows[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('[Space]');
    expect(onSelectionChange).toHaveBeenCalledWith(['Backpack']);

    await user.keyboard('{ArrowDown}');
    await user.keyboard('[Space]');
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      'Backpack',
      'Notebook',
    ]);
    expect(
      dataRows().filter((row) => row.getAttribute('aria-selected') === 'true')
        .length
    ).toBe(2);
  });

  it('does not move focus past the ends of the grid', async () => {
    const user = userEvent.setup();
    render(
      <PdxDataGrid
        columns={plainColumns}
        data={data}
        rowKey="product"
        selectionMode="Single"
      />
    );

    const rows = dataRows();
    await user.tab();
    await user.tab();

    await user.keyboard('{ArrowUp}');
    expect(rows[0]).toHaveFocus();

    await user.keyboard('{End}{ArrowDown}');
    expect(rows[2]).toHaveFocus();
  });
});

describe('PdxDataGrid empty and loading states', () => {
  it('shows the shared empty state', () => {
    render(
      <PdxDataGrid columns={columns} data={[]} emptyText="Nothing in stock" />
    );

    expect(screen.getByText('Nothing in stock')).toBeInTheDocument();
  });

  it('renders placeholder rows instead of records while loading', () => {
    render(
      <PdxDataGrid columns={plainColumns} data={data} loading loadingRows={2} />
    );

    expect(screen.queryByText('Marker')).not.toBeInTheDocument();
    expect(dataRows().length).toBe(2);
  });
});
