import type { Meta, StoryObj } from '@storybook/react';
import PdxTextarea from './PdxTextarea';
import { useState } from 'react';

const meta: Meta<typeof PdxTextarea> = {
  title: 'Components/Textarea',
  component: PdxTextarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '文本域尺寸',
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
      description: '文本域状态',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    readOnly: {
      control: 'boolean',
      description: '是否只读',
    },
    rows: {
      control: 'number',
      description: '行数',
    },
    resize: {
      control: 'select',
      options: ['None', 'Vertical', 'Horizontal', 'Both'],
      description: '调整大小方式',
    },
    maxLength: {
      control: 'number',
      description: '最大字符数',
    },
    onChange: { action: 'changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxTextarea>;

export const Default: Story = {
  args: {
    placeholder: 'Enter your message...',
    size: 'Medium',
    rows: 4,
  },
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '400px',
      }}
    >
      <PdxTextarea size="Small" placeholder="Small textarea" rows={3} />
      <PdxTextarea size="Medium" placeholder="Medium textarea" rows={4} />
      <PdxTextarea size="Large" placeholder="Large textarea" rows={5} />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '400px',
      }}
    >
      <PdxTextarea state="Default" placeholder="Default state" rows={3} />
      <PdxTextarea state="Error" placeholder="Error state" rows={3} />
      <PdxTextarea state="Warning" placeholder="Warning state" rows={3} />
      <PdxTextarea state="Success" placeholder="Success state" rows={3} />
    </div>
  ),
};

export const ResizeOptions: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '400px',
      }}
    >
      <PdxTextarea resize="None" placeholder="No resize" rows={3} />
      <PdxTextarea resize="Vertical" placeholder="Vertical resize" rows={3} />
      <PdxTextarea
        resize="Horizontal"
        placeholder="Horizontal resize"
        rows={3}
      />
      <PdxTextarea resize="Both" placeholder="Both resize" rows={3} />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled textarea',
    disabled: true,
    value: 'Cannot edit this textarea',
    rows: 4,
  },
};

export const ReadOnly: Story = {
  args: {
    placeholder: 'Read only textarea',
    readOnly: true,
    value: 'This textarea is read only',
    rows: 4,
  },
};

export const WithMaxLength: Story = {
  args: {
    placeholder: 'Enter text (max 100 characters)...',
    maxLength: 100,
    rows: 4,
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{ width: '400px' }}>
        <PdxTextarea
          placeholder="Type something..."
          value={value}
          onChange={setValue}
          rows={4}
        />
        <p style={{ marginTop: '8px' }}>Characters: {value.length}</p>
      </div>
    );
  },
};

export const LongText: Story = {
  args: {
    placeholder: 'Enter a long message...',
    value:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    rows: 6,
  },
};
