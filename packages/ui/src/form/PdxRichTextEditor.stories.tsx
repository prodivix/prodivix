import type { Meta, StoryObj } from '@storybook/react';
import PdxRichTextEditor from './PdxRichTextEditor';

const meta: Meta<typeof PdxRichTextEditor> = {
  title: 'Components/RichTextEditor',
  component: PdxRichTextEditor,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxRichTextEditor>;

export const Default: Story = {
  args: {
    label: 'Article',
    description: 'Use the toolbar to format your content.',
  },
};

export const Prefilled: Story = {
  args: {
    label: 'Notes',
    defaultValue: '<p><strong>Rich</strong> text content</p>',
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Read only',
    defaultValue: '<p>This content is locked.</p>',
    readOnly: true,
    showToolbar: false,
  },
};
