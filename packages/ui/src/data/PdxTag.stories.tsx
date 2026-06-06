import type { Meta, StoryObj } from '@storybook/react';
import PdxTag from './PdxTag';

const meta: Meta<typeof PdxTag> = {
  title: 'Components/Tag',
  component: PdxTag,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: [
        'Default',
        'Primary',
        'Secondary',
        'Success',
        'Warning',
        'Danger',
      ],
    },
    variant: {
      control: 'select',
      options: ['Solid', 'Outline', 'Soft'],
    },
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxTag>;

export const Default: Story = {
  args: {
    text: 'Tag',
    variant: 'Soft',
  },
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '12px' }}>
      <PdxTag text="Default" />
      <PdxTag text="Primary" color="Primary" />
      <PdxTag text="Secondary" color="Secondary" />
      <PdxTag text="Success" color="Success" />
      <PdxTag text="Warning" color="Warning" />
      <PdxTag text="Danger" color="Danger" />
    </div>
  ),
};

export const Closable: Story = {
  args: {
    text: 'Closable',
    closable: true,
  },
};
