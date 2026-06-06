import type { Meta, StoryObj } from '@storybook/react';
import PdxEmpty from './PdxEmpty';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxEmpty> = {
  title: 'Components/Empty',
  component: PdxEmpty,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxEmpty>;

export const Default: Story = {
  args: {
    title: 'No results',
    description: 'Try adjusting your filters.',
    action: <PdxButton text="Reset" size="Small" category="Secondary" />,
  },
};
