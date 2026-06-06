import type { Meta, StoryObj } from '@storybook/react';
import PdxImageUpload from './PdxImageUpload';

const meta: Meta<typeof PdxImageUpload> = {
  title: 'Components/ImageUpload',
  component: PdxImageUpload,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxImageUpload>;

export const Default: Story = {
  args: {
    label: 'Upload images',
    description: 'PNG, JPG or GIF files.',
  },
};

export const Multiple: Story = {
  args: {
    label: 'Gallery images',
    multiple: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Upload disabled',
    disabled: true,
  },
};
