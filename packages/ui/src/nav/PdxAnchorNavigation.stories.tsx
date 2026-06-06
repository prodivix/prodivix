import type { Meta, StoryObj } from '@storybook/react';
import PdxAnchorNavigation from './PdxAnchorNavigation';

const meta: Meta<typeof PdxAnchorNavigation> = {
  title: 'Components/AnchorNavigation',
  component: PdxAnchorNavigation,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxAnchorNavigation>;

export const Default: Story = {
  args: {
    items: [
      { id: 'intro', label: 'Introduction' },
      { id: 'usage', label: 'Usage' },
      { id: 'api', label: 'API' },
    ],
    activeId: 'usage',
  },
};

export const Horizontal: Story = {
  args: {
    items: [
      { id: 'one', label: 'Section 1' },
      { id: 'two', label: 'Section 2' },
    ],
    orientation: 'Horizontal',
    activeId: 'one',
  },
};
