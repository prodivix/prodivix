import type { Meta, StoryObj } from '@storybook/react';
import PdxRating from './PdxRating';

const meta: Meta<typeof PdxRating> = {
  title: 'Components/Rating',
  component: PdxRating,
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

type Story = StoryObj<typeof PdxRating>;

export const Default: Story = {
  args: {
    label: 'Rating',
    defaultValue: 3,
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxRating label="Small" size="Small" defaultValue={2} />
      <PdxRating label="Medium" size="Medium" defaultValue={4} />
      <PdxRating label="Large" size="Large" defaultValue={5} />
    </div>
  ),
};

export const ReadOnly: Story = {
  args: {
    label: 'Read only',
    value: 4,
    readOnly: true,
  },
};
