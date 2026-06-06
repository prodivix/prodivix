import type { Meta, StoryObj } from '@storybook/react';
import PdxStatistic from './PdxStatistic';

const meta: Meta<typeof PdxStatistic> = {
  title: 'Components/Statistic',
  component: PdxStatistic,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxStatistic>;

export const Default: Story = {
  args: {
    title: 'Monthly revenue',
    value: 28450,
    prefix: '$',
    trend: 'Up',
  },
};

export const Down: Story = {
  args: {
    title: 'Bounce rate',
    value: 42.8,
    suffix: '%',
    trend: 'Down',
    precision: 1,
  },
};
