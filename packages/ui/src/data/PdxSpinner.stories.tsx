import type { Meta, StoryObj } from '@storybook/react';
import PdxSpinner from './PdxSpinner';

const meta: Meta<typeof PdxSpinner> = {
  title: 'Components/Spinner',
  component: PdxSpinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxSpinner>;

export const Default: Story = {
  args: {
    label: 'Loading',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
      <PdxSpinner size="Small" />
      <PdxSpinner size="Medium" />
      <PdxSpinner size="Large" />
    </div>
  ),
};
