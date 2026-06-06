import type { Meta, StoryObj } from '@storybook/react';
import PdxBreadcrumb from './PdxBreadcrumb';

const meta: Meta<typeof PdxBreadcrumb> = {
  title: 'Components/Breadcrumb',
  component: PdxBreadcrumb,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxBreadcrumb>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Home', href: '#' },
      { label: 'Library', href: '#' },
      { label: 'Data' },
    ],
  },
};
