import type { Meta, StoryObj } from '@storybook/react';
import PdxInput from './PdxInput';
import { useState } from 'react';

const meta: Meta<typeof PdxInput> = {
  title: 'Components/Input',
  component: PdxInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: [
        'Text',
        'Password',
        'Email',
        'Number',
        'Tel',
        'Url',
        'Search',
        'Date',
        'Time',
      ],
      description: '输入类型',
    },
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '输入框尺寸',
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
      description: '输入框状态',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    readOnly: {
      control: 'boolean',
      description: '是否只读',
    },
    iconPosition: {
      control: 'select',
      options: ['Left', 'Right'],
      description: '图标位置',
    },
    icon: {
      control: 'object',
      description: '图标',
    },
    onChange: { action: 'changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxInput>;

export const Default: Story = {
  args: {
    type: 'Text',
    placeholder: 'Enter text...',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '300px',
      }}
    >
      <PdxInput size="Small" placeholder="Small input" />
      <PdxInput size="Medium" placeholder="Medium input" />
      <PdxInput size="Large" placeholder="Large input" />
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '300px',
      }}
    >
      <PdxInput type="Text" placeholder="Text input" />
      <PdxInput type="Email" placeholder="Email input" />
      <PdxInput type="Password" placeholder="Password input" />
      <PdxInput type="Number" placeholder="Number input" />
      <PdxInput type="Tel" placeholder="Phone input" />
      <PdxInput type="Url" placeholder="URL input" />
      <PdxInput type="Date" placeholder="Date input" />
      <PdxInput type="Time" placeholder="Time input" />
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
        width: '300px',
      }}
    >
      <PdxInput state="Default" placeholder="Default state" />
      <PdxInput state="Error" placeholder="Error state" />
      <PdxInput state="Warning" placeholder="Warning state" />
      <PdxInput state="Success" placeholder="Success state" />
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    placeholder: 'Search...',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
    iconPosition: 'Left',
  },
};

export const IconRight: Story = {
  args: {
    placeholder: 'Enter amount',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v12M8 12h8" />
      </svg>
    ),
    iconPosition: 'Right',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
    value: 'Cannot edit',
  },
};

export const ReadOnly: Story = {
  args: {
    placeholder: 'Read only input',
    readOnly: true,
    value: 'Read only value',
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{ width: '300px' }}>
        <PdxInput
          placeholder="Type something..."
          value={value}
          onChange={setValue}
        />
        <p style={{ marginTop: '8px' }}>Value: {value}</p>
      </div>
    );
  },
};
