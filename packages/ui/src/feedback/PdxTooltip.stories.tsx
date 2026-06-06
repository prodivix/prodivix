import type { Meta, StoryObj } from '@storybook/react';
import PdxTooltip from './PdxTooltip';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxTooltip> = {
  title: 'Components/Tooltip',
  component: PdxTooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxTooltip>;

export const Default: Story = {
  render: () => (
    <PdxTooltip content="Helpful tip" placement="Top">
      <PdxButton text="Hover me" size="Small" />
    </PdxTooltip>
  ),
};
