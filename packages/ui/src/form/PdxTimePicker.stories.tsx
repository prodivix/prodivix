import type { Meta, StoryObj } from '@storybook/react';
import PdxTimePicker from './PdxTimePicker';

const meta: Meta<typeof PdxTimePicker> = {
  title: 'Components/TimePicker',
  component: PdxTimePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxTimePicker>;

export const Default: Story = {
  args: {
    label: 'Time',
    value: '09:30',
  },
};

export const States: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '280px',
      }}
    >
      <PdxTimePicker label="Default" value="09:30" />
      <PdxTimePicker
        label="Error"
        value="09:30"
        state="Error"
        message="Invalid time"
      />
      <PdxTimePicker
        label="Warning"
        value="09:30"
        state="Warning"
        message="Outside range"
      />
      <PdxTimePicker
        label="Success"
        value="09:30"
        state="Success"
        message="Available"
      />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '280px',
      }}
    >
      <PdxTimePicker label="Small" size="Small" value="09:30" />
      <PdxTimePicker label="Medium" size="Medium" value="09:30" />
      <PdxTimePicker label="Large" size="Large" value="09:30" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    value: '09:30',
    disabled: true,
  },
};
