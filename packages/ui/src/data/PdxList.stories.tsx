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

export const Default: Story = {
  args: {
    items: [
      {
        title: 'Design review',
        description: 'Today at 3 PM',
        extra: '30m',
      },
      {
        title: 'Product sync',
        description: 'Tomorrow at 10 AM',
        extra: '1h',
      },
      { title: 'Sprint demo', description: 'Friday', extra: '45m' },
    ],
    bordered: true,
  },
};

export const Split: Story = {
  args: {
    items: [
      { title: 'Item A', description: 'Detail A' },
      { title: 'Item B', description: 'Detail B' },
      { title: 'Item C', description: 'Detail C' },
    ],
    split: true,
  },
};
