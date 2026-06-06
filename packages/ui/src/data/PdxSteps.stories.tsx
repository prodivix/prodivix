import type { Meta, StoryObj } from '@storybook/react';
import PdxSteps from './PdxSteps';

const meta: Meta<typeof PdxSteps> = {
  title: 'Components/Steps',
  component: PdxSteps,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxSteps>;

export const Default: Story = {
  args: {
    items: [
      { title: 'Create', description: 'Start the task' },
      { title: 'Review', description: 'Pending approval' },
      { title: 'Complete', description: 'Publish' },
    ],
    current: 1,
  },
};

export const Vertical: Story = {
  args: {
    items: [{ title: 'Step 1' }, { title: 'Step 2' }, { title: 'Step 3' }],
    current: 2,
    direction: 'Vertical',
  },
};
