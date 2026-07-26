import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import PdxSwitch from './PdxSwitch';

const meta: Meta<typeof PdxSwitch> = {
  title: 'Components/Switch',
  component: PdxSwitch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['ExtraSmall', 'Small', 'Medium', 'Large'],
      description: '控件尺寸',
    },
    labelPosition: {
      control: 'inline-radio',
      options: ['Start', 'End'],
      description: '标签位置',
    },
    disabled: { control: 'boolean', description: '是否禁用' },
    onCheckedChange: { action: 'checkedChange' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxSwitch>;

export const Default: Story = {
  args: {
    label: 'Live preview',
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Auto commit',
    description: 'Every accepted transaction is committed immediately.',
    defaultChecked: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxSwitch size="ExtraSmall" label="Extra small" defaultChecked />
      <PdxSwitch size="Small" label="Small" defaultChecked />
      <PdxSwitch size="Medium" label="Medium" defaultChecked />
      <PdxSwitch size="Large" label="Large" defaultChecked />
    </div>
  ),
};

export const LabelPlacement: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxSwitch label="Label after the track" labelPosition="End" />
      <PdxSwitch label="Label before the track" labelPosition="Start" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxSwitch label="Disabled off" disabled />
      <PdxSwitch label="Disabled on" disabled defaultChecked />
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [enabled, setEnabled] = useState(false);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <PdxSwitch
          checked={enabled}
          label="Snap to grid"
          onCheckedChange={setEnabled}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Snapping is {enabled ? 'on' : 'off'}.
        </span>
      </div>
    );
  },
};
