import type { Meta, StoryObj } from '@storybook/react';
import PdxSkeleton from './PdxSkeleton';

const meta: Meta<typeof PdxSkeleton> = {
  title: 'Components/Skeleton',
  component: PdxSkeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxSkeleton>;

export const Default: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '320px',
      }}
    >
      <PdxSkeleton variant="Text" lines={3} />
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <PdxSkeleton variant="Circle" />
        <PdxSkeleton variant="Rect" width={200} height={48} />
      </div>
    </div>
  ),
};
