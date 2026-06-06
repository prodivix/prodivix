import type { Meta, StoryObj } from '@storybook/react';
import PdxPasswordStrength from './PdxPasswordStrength';

const meta: Meta<typeof PdxPasswordStrength> = {
  title: 'Components/PasswordStrength',
  component: PdxPasswordStrength,
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

type Story = StoryObj<typeof PdxPasswordStrength>;

export const Default: Story = {
  args: {
    label: 'Password',
    description: 'Use at least 8 characters.',
  },
};

export const Prefilled: Story = {
  args: {
    label: 'Password',
    defaultValue: 'P@ssword123',
  },
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '320px',
      }}
    >
      <PdxPasswordStrength label="Small" size="Small" />
      <PdxPasswordStrength label="Medium" size="Medium" />
      <PdxPasswordStrength label="Large" size="Large" />
    </div>
  ),
};
