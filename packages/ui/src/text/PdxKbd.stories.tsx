import type { Meta, StoryObj } from '@storybook/react';
import { Command, Search } from 'lucide-react';
import PdxKbd from './PdxKbd';

const meta: Meta<typeof PdxKbd> = {
  title: 'Components/Kbd',
  component: PdxKbd,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Tiny', 'Small', 'Medium', 'Large'],
    },
    texture: {
      control: 'select',
      options: ['Flat', 'Soft', 'Raised', 'Inset'],
    },
    tone: {
      control: 'select',
      options: ['Default', 'Muted', 'Primary', 'Danger', 'Warning', 'Success'],
    },
    iconPosition: {
      control: 'select',
      options: ['Left', 'Right'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxKbd>;

export const Default: Story = {
  args: {
    text: 'Ctrl',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <PdxKbd text="Esc" size="Tiny" />
      <PdxKbd text="Tab" size="Small" />
      <PdxKbd text="Shift" size="Medium" />
      <PdxKbd text="Enter" size="Large" />
    </div>
  ),
};

export const Textures: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <PdxKbd text="Flat" texture="Flat" />
      <PdxKbd text="Soft" texture="Soft" />
      <PdxKbd text="Raised" texture="Raised" />
      <PdxKbd text="Inset" texture="Inset" />
    </div>
  ),
};

export const BorderAndFill: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <PdxKbd text="Default" />
      <PdxKbd text="No border" bordered={false} />
      <PdxKbd text="No fill" filled={false} />
      <PdxKbd text="Bare" bordered={false} filled={false} texture="Flat" />
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <PdxKbd text="K" showIcon />
      <PdxKbd text="P" icon={<Command size={12} />} tone="Primary" />
      <PdxKbd
        text="Search"
        icon={<Search size={12} />}
        iconPosition="Right"
        texture="Raised"
      />
    </div>
  ),
};

export const ShortcutGroup: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <PdxKbd text="Ctrl" />
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <PdxKbd text="Shift" />
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <PdxKbd text="P" tone="Primary" />
    </div>
  ),
};
