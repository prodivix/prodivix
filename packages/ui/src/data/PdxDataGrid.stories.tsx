import type { Meta, StoryObj } from '@storybook/react';
import PdxDataGrid, { type PdxDataGridColumn } from './PdxDataGrid';

interface GridRow {
  product: string;
  price: string;
  stock: number;
}

const columns: Array<PdxDataGridColumn<GridRow>> = [
  { key: 'product', title: 'Product', dataIndex: 'product' },
  { key: 'price', title: 'Price', dataIndex: 'price', align: 'Right' },
  { key: 'stock', title: 'Stock', dataIndex: 'stock', align: 'Center' },
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

export const Empty: Story = {
  args: {
    columns,
    data: [],
  },
};
