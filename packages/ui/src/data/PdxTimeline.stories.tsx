import type { Meta, StoryObj } from '@storybook/react';
import PdxTimeline from './PdxTimeline';

const meta: Meta<typeof PdxTimeline> = {
  title: 'Components/Timeline',
  component: PdxTimeline,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxTimeline>;

export const Default: Story = {
  args: {
    items: [
      {
        title: 'Order placed',
        time: '09:00',
        description: 'Order received',
        status: 'Success',
      },
      {
        title: 'Packed',
        time: '10:30',
        description: 'Preparing shipment',
        status: 'Warning',
      },
      {
        title: 'Delivered',
        time: '15:10',
        description: 'Signed by customer',
        status: 'Default',
      },
    ],
  },
};
