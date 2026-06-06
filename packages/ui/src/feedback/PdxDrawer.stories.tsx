import type { Meta, StoryObj } from '@storybook/react';
import PdxDrawer from './PdxDrawer';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxDrawer> = {
  title: 'Components/Drawer',
  component: PdxDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxDrawer>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Settings',
    children: 'Drawer content goes here.',
    footer: <PdxButton text="Save" size="Small" category="Primary" />,
  },
};

export const Left: Story = {
  args: {
    open: true,
    title: 'Filters',
    placement: 'Left',
    children: 'Filter options',
  },
};
