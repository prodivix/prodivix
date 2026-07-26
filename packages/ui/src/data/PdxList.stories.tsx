import type { Meta, StoryObj } from '@storybook/react';
import PdxList from './PdxList';

const meta: Meta<typeof PdxList> = {
  title: 'Components/List',
  component: PdxList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxList>;

const meetings = [
  {
    id: 'review',
    title: 'Design review',
    description: 'Today at 3 PM',
    extra: '30m',
  },
  {
    id: 'sync',
    title: 'Product sync',
    description: 'Tomorrow at 10 AM',
    extra: '1h',
  },
  { id: 'demo', title: 'Sprint demo', description: 'Friday', extra: '45m' },
];

export const Default: Story = {
  args: {
    items: meetings,
    bordered: true,
  },
};

export const Split: Story = {
  args: {
    items: [
      { id: 'a', title: 'Item A', description: 'Detail A' },
      { id: 'b', title: 'Item B', description: 'Detail B' },
      { id: 'c', title: 'Item C', description: 'Detail C' },
    ],
    split: true,
  },
};

/** Selection turns the list into a `listbox` with a roving tabindex. */
export const Selectable: Story = {
  args: {
    'aria-label': 'Meetings',
    bordered: true,
    defaultSelectedKeys: ['sync'],
    items: [
      ...meetings,
      { id: 'locked', title: 'Locked meeting', disabled: true },
    ],
    selectionMode: 'Multiple',
  },
};

export const Compact: Story = {
  args: {
    bordered: true,
    items: meetings,
    size: 'Small',
  },
};

export const Loading: Story = {
  args: {
    bordered: true,
    items: [],
    loading: true,
    loadingRows: 3,
  },
};

export const Empty: Story = {
  args: {
    items: [],
    emptyText: 'No meetings scheduled',
  },
};
