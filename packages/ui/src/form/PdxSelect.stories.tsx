import type { Meta, StoryObj } from '@storybook/react';
import PdxSelect from './PdxSelect';

const frameworks = [
  { label: 'React/Vite', value: 'react-vite' },
  { label: 'Vue/Vite', value: 'vue-vite' },
  { label: 'Svelte/Vite', value: 'svelte-vite' },
  { label: 'Solid/Vite', value: 'solid-vite' },
  { label: 'Remote runner', value: 'remote', disabled: true },
];

const meta: Meta<typeof PdxSelect> = {
  title: 'Components/Select',
  component: PdxSelect,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    options: frameworks,
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['ExtraSmall', 'Small', 'Medium', 'Large'],
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxSelect>;

export const Default: Story = {
  args: {
    label: 'Framework',
    defaultValue: 'react-vite',
  },
};

/**
 * Focus the field and start typing. Printable characters narrow the list, the
 * arrow keys move through what is left, and Backspace widens it again.
 */
export const Typeahead: Story = {
  args: {
    label: 'Framework',
    description: 'Type to filter, then Enter to choose.',
    filterHint: 'Type to filter the four targets',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 320 }}>
      <PdxSelect label="Extra small" options={frameworks} size="ExtraSmall" />
      <PdxSelect label="Small" options={frameworks} size="Small" />
      <PdxSelect label="Medium" options={frameworks} size="Medium" />
      <PdxSelect label="Large" options={frameworks} size="Large" />
    </div>
  ),
};

export const ValidationStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 320 }}>
      <PdxSelect
        label="Error"
        message="Choose a build target."
        options={frameworks}
        required
        state="Error"
      />
      <PdxSelect
        defaultValue="vue-vite"
        label="Warning"
        message="This target is experimental."
        options={frameworks}
        state="Warning"
      />
      <PdxSelect
        defaultValue="react-vite"
        label="Success"
        message="Target verified."
        options={frameworks}
        state="Success"
      />
      <PdxSelect disabled label="Locked" options={frameworks} />
    </div>
  ),
};
