import type { Meta, StoryObj } from '@storybook/react';
import PdxDivider from './PdxDivider';

const meta: Meta<typeof PdxDivider> = {
  title: 'Components/Divider',
  component: PdxDivider,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['Horizontal', 'Vertical'],
      description: '方向',
    },
    labelPosition: {
      control: 'inline-radio',
      options: ['Start', 'Center', 'End'],
      description: '标签位置',
    },
    variant: {
      control: 'inline-radio',
      options: ['Solid', 'Dashed'],
      description: '线条样式',
    },
    spacing: {
      control: 'select',
      options: [
        'None',
        'ExtraSmall',
        'Small',
        'Medium',
        'Large',
        'ExtraLarge',
        'ExtraExtraLarge',
      ],
      description: '外间距',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxDivider>;

export const Default: Story = {
  render: (args) => (
    <div>
      <p>Workspace revision 41</p>
      <PdxDivider {...args} />
      <p>Workspace revision 42</p>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div>
      <p>Recent projects</p>
      <PdxDivider label="Archived" />
      <p>Catalog 2024</p>
    </div>
  ),
};

export const LabelPositions: Story = {
  render: () => (
    <div>
      <PdxDivider label="Start" labelPosition="Start" />
      <PdxDivider label="Center" labelPosition="Center" />
      <PdxDivider label="End" labelPosition="End" />
    </div>
  ),
};

export const Dashed: Story = {
  render: () => (
    <div>
      <p>Committed</p>
      <PdxDivider variant="Dashed" label="Pending outbox" />
      <p>Queued</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
      <span>Blueprint</span>
      <PdxDivider orientation="Vertical" spacing="Small" />
      <span>NodeGraph</span>
      <PdxDivider orientation="Vertical" spacing="Small" />
      <span>Animation</span>
    </div>
  ),
};
