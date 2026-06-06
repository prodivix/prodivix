import type { Meta, StoryObj } from '@storybook/react';
import PdxBadge from './PdxBadge';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxBadge> = {
  title: 'Components/Badge',
  component: PdxBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxBadge>;

export const Default: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
      <PdxBadge count={3}>
        <PdxButton text="Inbox" />
      </PdxBadge>
      <PdxBadge count={120} max={99}>
        <PdxButton text="Alerts" />
      </PdxBadge>
      <PdxBadge dot>
        <PdxButton text="Live" />
      </PdxBadge>
    </div>
  ),
};
