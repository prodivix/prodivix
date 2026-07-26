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
    label: 'Notification channels',
    description: 'Choose where operational alerts should be delivered.',
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

export const Horizontal: Story = {
  args: {
    label: 'Visible panels',
    orientation: 'Horizontal',
    items: [
      { label: 'Layers', value: 'layers', checked: true },
      { label: 'Inspector', value: 'inspector', checked: true },
      { label: 'Issues', value: 'issues' },
    ],
  },
};

export const Compact: Story = {
  args: {
    label: 'Visible panels',
    size: 'Small',
    items: [
      { label: 'Layers', value: 'layers', checked: true },
      { label: 'Inspector', value: 'inspector' },
      { label: 'Issues', value: 'issues' },
    ],
  },
};

export const Empty: Story = {
  args: {
    label: 'Archived channels',
    items: [],
    emptyText: 'No archived channels',
  },
};
