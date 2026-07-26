import type { Meta, StoryObj } from '@storybook/react';
import PdxDatePicker from './PdxDatePicker';

const meta: Meta<typeof PdxDatePicker> = {
  title: 'Components/DatePicker',
  component: PdxDatePicker,
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

type Story = StoryObj<typeof PdxDatePicker>;

export const Default: Story = {
  args: {
    label: 'Date',
    value: '2026-01-22',
  },
};

export const States: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '320px',
      }}
    >
      <PdxDatePicker label="Default" value="2026-01-22" />
      <PdxDatePicker
        label="Error"
        value="2026-01-22"
        state="Error"
        message="Invalid date"
      />
      <PdxDatePicker
        label="Warning"
        value="2026-01-22"
        state="Warning"
        message="Check availability"
      />
      <PdxDatePicker
        label="Success"
        value="2026-01-22"
        state="Success"
        message="Looks good"
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
        width: '320px',
      }}
    >
      <PdxDatePicker label="Small" size="Small" value="2026-01-22" />
      <PdxDatePicker label="Medium" size="Medium" value="2026-01-22" />
      <PdxDatePicker label="Large" size="Large" value="2026-01-22" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    value: '2026-01-22',
    disabled: true,
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Start date',
    description: 'Select a start date for the campaign.',
    value: '2026-01-22',
  },
};

/**
 * Type an ISO date, or step it with ArrowUp/ArrowDown and PageUp/PageDown.
 * Alt+ArrowDown opens the calendar and hands focus to the grid, where the arrow
 * keys move by day and week, Home/End reach the ends of the week and
 * PageUp/PageDown change month.
 */
export const BoundedRange: Story = {
  args: {
    label: 'Delivery date',
    description: 'Only the last week of January is available.',
    min: '2026-01-25',
    max: '2026-01-31',
    value: '2026-01-27',
  },
};

export const TypedEntryOnly: Story = {
  args: {
    label: 'Effective from',
    description: 'No calendar toggle; the field still steps with the keyboard.',
    showIcon: false,
    value: '2026-01-22',
  },
};
