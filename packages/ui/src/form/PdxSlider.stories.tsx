import type { Meta, StoryObj } from '@storybook/react';
import PdxSlider from './PdxSlider';

const meta: Meta<typeof PdxSlider> = {
  title: 'Components/Slider',
  component: PdxSlider,
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

type Story = StoryObj<typeof PdxSlider>;

export const Default: Story = {
  args: {
    label: 'Volume',
    defaultValue: 40,
  },
};

export const Range: Story = {
  args: {
    label: 'Opacity',
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: 0.6,
  },
};
