import type { Meta, StoryObj } from '@storybook/react';
import PdxRange from './PdxRange';

const meta: Meta<typeof PdxRange> = {
  title: 'Components/Range',
  component: PdxRange,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxRange>;

export const Default: Story = {
  args: {
    label: 'Price range',
    defaultValue: { min: 20, max: 80 },
  },
};

export const CustomRange: Story = {
  args: {
    label: 'Salary',
    min: 0,
    max: 100,
    step: 5,
    defaultValue: { min: 30, max: 70 },
  },
};
