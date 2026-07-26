import type { Meta, StoryObj } from '@storybook/react';
import PdxTable, { type PdxTableColumn } from './PdxTable';

interface RowData {
  name: string;
  role: string;
  score: number;
  status: string;
}

const columns: Array<PdxTableColumn<RowData>> = [
  { key: 'name', title: 'Name', dataIndex: 'name', sortable: true },
  { key: 'role', title: 'Role', dataIndex: 'role' },
  {
    key: 'score',
    title: 'Score',
    dataIndex: 'score',
    align: 'Right',
    sortable: true,
  },
  { key: 'status', title: 'Status', dataIndex: 'status', align: 'Center' },
];

const data: RowData[] = [
  { name: 'Alice', role: 'Designer', score: 12, status: 'Active' },
  { name: 'Ben', role: 'Developer', score: 3, status: 'Away' },
  { name: 'Chloe', role: 'PM', score: 27, status: 'Active' },
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

export const Sortable: Story = {
  args: {
    title: 'Sort by name or score',
    columns,
    data,
    defaultSort: { columnKey: 'score', direction: 'Descending' },
    rowKey: 'name',
  },
};

/** Rows are a single tab stop; arrows, Home and End move between them. */
export const SelectableRows: Story = {
  args: {
    title: 'Select rows with the keyboard',
    columns,
    data,
    defaultSelectedRowKeys: ['Ben'],
    rowKey: 'name',
    selectionMode: 'Multiple',
  },
};

export const StickyHeader: Story = {
  args: {
    title: 'Long result set',
    columns,
    data: Array.from({ length: 40 }, (_unused, index) => ({
      name: `Member ${index + 1}`,
      role: index % 2 === 0 ? 'Designer' : 'Developer',
      score: (index * 7) % 31,
      status: index % 3 === 0 ? 'Away' : 'Active',
    })),
    maxBodyHeight: 260,
    rowKey: 'name',
    stickyHeader: true,
  },
};

export const Compact: Story = {
  args: {
    title: 'Compact density',
    columns,
    data,
    bordered: true,
    size: 'Small',
  },
};

export const Loading: Story = {
  args: {
    title: 'Loading',
    columns,
    data: [],
    loading: true,
    loadingRows: 4,
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
