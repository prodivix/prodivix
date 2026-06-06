import type { Meta, StoryObj } from '@storybook/react';
import PdxSidebar from './PdxSidebar';

const meta: Meta<typeof PdxSidebar> = {
  title: 'Components/Sidebar',
  component: PdxSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxSidebar>;

export const Default: Story = {
  args: {
    title: 'Workspace',
    items: [
      { label: 'Overview', active: true },
      { label: 'Projects' },
      { label: 'Team' },
    ],
  },
};

export const Collapsed: Story = {
  args: {
    title: 'Menu',
    collapsed: true,
    items: [
      { label: 'Overview', active: true },
      { label: 'Projects' },
      { label: 'Team' },
    ],
  },
};
