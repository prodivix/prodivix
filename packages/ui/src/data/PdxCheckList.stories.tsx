import type { Meta, StoryObj } from '@storybook/react';
import PdxCheckList from './PdxCheckList';

const meta: Meta<typeof PdxCheckList> = {
  title: 'Components/CheckList',
  component: PdxCheckList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxCheckList>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Email notifications', value: 'email' },
      { label: 'Push notifications', value: 'push' },
      { label: 'SMS alerts', value: 'sms', disabled: true },
    ],
  },
};

export const Preselected: Story = {
  args: {
    items: [
      { label: 'Marketing updates', value: 'marketing' },
      { label: 'Product tips', value: 'tips' },
    ],
    defaultValue: ['marketing'],
  },
};
