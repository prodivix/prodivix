import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import PdxSpacer from './PdxSpacer';

const boxStyle: CSSProperties = {
  padding: 'var(--spacing-sm)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
};

const meta: Meta<typeof PdxSpacer> = {
  title: 'Components/Spacer',
  component: PdxSpacer,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    axis: {
      control: 'inline-radio',
      options: ['Horizontal', 'Vertical', 'Both'],
      description: '占位方向',
    },
    size: {
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
      description: '固定尺寸刻度',
    },
    flexible: { control: 'boolean', description: '弹性填充剩余空间' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxSpacer>;

export const FixedVertical: Story = {
  render: () => (
    <div>
      <div style={boxStyle}>Toolbar</div>
      <PdxSpacer axis="Vertical" size="Large" />
      <div style={boxStyle}>Canvas</div>
    </div>
  ),
};

export const FixedHorizontal: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={boxStyle}>Undo</div>
      <PdxSpacer axis="Horizontal" size="Medium" />
      <div style={boxStyle}>Redo</div>
    </div>
  ),
};

/** A flexible spacer pushes the trailing content to the far edge. */
export const FlexiblePush: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px dashed var(--border-default)',
        padding: 'var(--spacing-sm)',
      }}
    >
      <div style={boxStyle}>Project</div>
      <PdxSpacer flexible />
      <div style={boxStyle}>Publish</div>
    </div>
  ),
};
