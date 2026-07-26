import type { Meta, StoryObj } from '@storybook/react';
import PdxDataGrid, { type PdxDataGridColumn } from './PdxDataGrid';

interface GridRow {
  product: string;
  price: string;
  stock: number;
}

const columns: Array<PdxDataGridColumn<GridRow>> = [
  { key: 'product', title: 'Product', dataIndex: 'product', sortable: true },
  { key: 'price', title: 'Price', dataIndex: 'price', align: 'Right' },
  {
    key: 'stock',
    title: 'Stock',
    dataIndex: 'stock',
    align: 'Center',
    sortable: true,
  },
];

const data: GridRow[] = [
  { product: 'Notebook', price: '$9.99', stock: 24 },
  { product: 'Marker', price: '$2.50', stock: 80 },
  { product: 'Backpack', price: '$49.00', stock: 12 },
];

const meta: Meta<typeof PdxDataGrid<GridRow>> = {
  title: 'Components/DataGrid',
  component: PdxDataGrid,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxDataGrid<GridRow>>;

export const Default: Story = {
  args: {
    columns,
    data,
    striped: true,
    hoverable: true,
    bordered: true,
  },
};

export const Sortable: Story = {
  args: {
    columns,
    data,
    defaultSort: { columnKey: 'stock', direction: 'Ascending' },
    rowKey: 'product',
  },
};

/** With selection on it becomes a real `grid`: rows carry focus and state. */
export const SelectableRows: Story = {
  args: {
    columns,
    data,
    defaultSelectedRowKeys: ['Marker'],
    rowKey: 'product',
    selectionMode: 'Single',
  },
};

export const StickyHeader: Story = {
  args: {
    columns,
    data: Array.from({ length: 40 }, (_unused, index) => ({
      product: `SKU ${index + 1}`,
      price: `$${(index * 3 + 4).toFixed(2)}`,
      stock: (index * 11) % 97,
    })),
    maxBodyHeight: 240,
    rowKey: 'product',
    stickyHeader: true,
  },
};

export const Loading: Story = {
  args: {
    columns,
    data: [],
    loading: true,
    loadingRows: 4,
  },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
  },
};
