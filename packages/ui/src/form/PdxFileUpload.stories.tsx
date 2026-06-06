import type { Meta, StoryObj } from '@storybook/react';
import PdxFileUpload from './PdxFileUpload';

const meta: Meta<typeof PdxFileUpload> = {
  title: 'Components/FileUpload',
  component: PdxFileUpload,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxFileUpload>;

export const Default: Story = {
  args: {
    label: 'Upload files',
    description: 'Select files to upload.',
  },
};

export const Multiple: Story = {
  args: {
    label: 'Upload documents',
    multiple: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Upload disabled',
    disabled: true,
  },
};
