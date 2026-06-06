import type { Meta, StoryObj } from '@storybook/react';
import PdxDateRangePicker from './PdxDateRangePicker';

const meta: Meta<typeof PdxDateRangePicker> = {
  title: 'Components/DateRangePicker',
  component: PdxDateRangePicker,
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

type Story = StoryObj<typeof PdxDateRangePicker>;

export const Default: Story = {
  args: {
    label: 'Date range',
    startValue: '2026-01-22',
    endValue: '2026-01-28',
  },
};

export const States: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '360px',
      }}
    >
      <PdxDateRangePicker
        label="Default"
        startValue="2026-01-22"
        endValue="2026-01-28"
      />
      <PdxDateRangePicker
        label="Error"
        startValue="2026-01-22"
        endValue="2026-01-28"
        state="Error"
        message="Range not available"
      />
      <PdxDateRangePicker
        label="Warning"
        startValue="2026-01-22"
        endValue="2026-01-28"
        state="Warning"
        message="Limited slots"
      />
      <PdxDateRangePicker
        label="Success"
        startValue="2026-01-22"
        endValue="2026-01-28"
        state="Success"
        message="Confirmed"
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
        width: '360px',
      }}
    >
      <PdxDateRangePicker
        label="Small"
        size="Small"
        startValue="2026-01-22"
        endValue="2026-01-28"
      />
      <PdxDateRangePicker
        label="Medium"
        size="Medium"
        startValue="2026-01-22"
        endValue="2026-01-28"
      />
      <PdxDateRangePicker
        label="Large"
        size="Large"
        startValue="2026-01-22"
        endValue="2026-01-28"
      />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    startValue: '2026-01-22',
    endValue: '2026-01-28',
    disabled: true,
  },
};
