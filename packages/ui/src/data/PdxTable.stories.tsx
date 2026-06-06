import type { Meta, StoryObj } from '@storybook/react';
import PdxTable, { type PdxTableColumn } from './PdxTable';

interface RowData {
  name: string;
  role: string;
  status: string;
}

const columns: Array<PdxTableColumn<RowData>> = [
  { key: 'name', title: 'Name', dataIndex: 'name' },
  { key: 'role', title: 'Role', dataIndex: 'role' },
  { key: 'status', title: 'Status', dataIndex: 'status', align: 'Center' },
];

const data: RowData[] = [
  { name: 'Alice', role: 'Designer', status: 'Active' },
  { name: 'Ben', role: 'Developer', status: 'Away' },
  { name: 'Chloe', role: 'PM', status: 'Active' },
];

const meta: Meta<typeof PdxTable<RowData>> = {
  title: 'Components/Table',
  component: PdxTable,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxTable<RowData>>;

export const Default: Story = {
  args: {
    title: 'Team members',
    columns,
    data,
    striped: true,
    hoverable: true,
  },
};

export const Empty: Story = {
  args: {
    title: 'Empty table',
    columns,
    data: [],
    emptyText: 'No records yet',
  },
};
