import type { Meta, StoryObj } from '@storybook/react';
import PdxProgress from './PdxProgress';

const meta: Meta<typeof PdxProgress> = {
  title: 'Components/Progress',
  component: PdxProgress,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxProgress>;

export const Default: Story = {
  args: {
    label: 'Upload',
    value: 65,
  },
};

export const Statuses: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '360px',
      }}
    >
      <PdxProgress label="Default" value={40} />
      <PdxProgress label="Success" value={100} status="Success" />
      <PdxProgress label="Warning" value={70} status="Warning" />
      <PdxProgress label="Danger" value={30} status="Danger" />
    </div>
  ),
};
