import type { Meta, StoryObj } from '@storybook/react';
import PdxModal from './PdxModal';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxModal> = {
  title: 'Components/Modal',
  component: PdxModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxModal>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirm action',
    children: 'Are you sure you want to continue?',
    footer: (
      <>
        <PdxButton text="Cancel" size="Small" category="Secondary" />
        <PdxButton text="Confirm" size="Small" category="Primary" />
      </>
    ),
  },
};
