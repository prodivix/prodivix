import type { Meta, StoryObj } from '@storybook/react';
import PdxTabs from './PdxTabs';

const meta: Meta<typeof PdxTabs> = {
  title: 'Components/Tabs',
  component: PdxTabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxTabs>;

export const Default: Story = {
  args: {
    items: [
      { key: 'overview', label: 'Overview', content: 'Overview content' },
      { key: 'details', label: 'Details', content: 'Details content' },
      {
        key: 'settings',
        label: 'Settings',
        content: 'Settings content',
        disabled: true,
      },
    ],
  },
};
