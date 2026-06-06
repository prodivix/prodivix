import type { Meta, StoryObj } from '@storybook/react';
import PdxPopover from './PdxPopover';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxPopover> = {
  title: 'Components/Popover',
  component: PdxPopover,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxPopover>;

export const Default: Story = {
  render: () => (
    <PdxPopover title="Details" content="Popover content goes here">
      <PdxButton text="Click" size="Small" />
    </PdxPopover>
  ),
};

export const Hover: Story = {
  render: () => (
    <PdxPopover title="Quick info" content="Hover content" trigger="Hover">
      <PdxButton text="Hover" size="Small" />
    </PdxPopover>
  ),
};
