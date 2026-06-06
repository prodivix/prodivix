import type { Meta, StoryObj } from '@storybook/react';
import PdxMessage from './PdxMessage';

const meta: Meta<typeof PdxMessage> = {
  title: 'Components/Message',
  component: PdxMessage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxMessage>;

export const Default: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxMessage text="Info message" type="Info" />
      <PdxMessage text="Success message" type="Success" />
      <PdxMessage text="Warning message" type="Warning" />
      <PdxMessage text="Error message" type="Danger" />
    </div>
  ),
};
