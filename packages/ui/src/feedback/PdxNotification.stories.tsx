import type { Meta, StoryObj } from '@storybook/react';
import PdxNotification from './PdxNotification';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxNotification> = {
  title: 'Components/Notification',
  component: PdxNotification,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxNotification>;

export const Default: Story = {
  args: {
    title: 'New update',
    description: 'Version 2.4.0 is now available.',
    actions: <PdxButton text="Update" size="Small" category="Primary" />,
  },
};

export const Success: Story = {
  args: {
    title: 'Upload complete',
    description: 'Your files are ready.',
    type: 'Success',
  },
};
