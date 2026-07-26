import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import PdxStack from './PdxStack';

const boxStyle: CSSProperties = {
  padding: 'var(--spacing-sm)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
};

const meta: Meta<typeof PdxStack> = {
  title: 'Components/Stack',
  component: PdxStack,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: 'select',
      options: ['Row', 'Column', 'RowReverse', 'ColumnReverse'],
      description: '主轴方向',
    },
    gap: {
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
      description: '间距刻度',
    },
    align: {
      control: 'select',
      options: ['Start', 'Center', 'End', 'Stretch', 'Baseline'],
      description: '交叉轴对齐',
    },
    justify: {
      control: 'select',
      options: [
        'Start',
        'Center',
        'End',
        'SpaceBetween',
        'SpaceAround',
        'SpaceEvenly',
      ],
      description: '主轴对齐',
    },
    wrap: { control: 'boolean', description: '是否换行' },
    inline: { control: 'boolean', description: '行内布局' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxStack>;

export const Default: Story = {
  args: {
    children: (
      <>
        <div style={boxStyle}>Blueprint</div>
        <div style={boxStyle}>NodeGraph</div>
        <div style={boxStyle}>Animation</div>
      </>
    ),
  },
};

export const Row: Story = {
  args: {
    direction: 'Row',
    gap: 'Medium',
    align: 'Center',
    children: (
      <>
        <div style={boxStyle}>Inspector</div>
        <div style={boxStyle}>Issues</div>
        <div style={boxStyle}>History</div>
      </>
    ),
  },
};

export const Justify: Story = {
  render: () => (
    <PdxStack gap="Medium">
      {(['Start', 'Center', 'End', 'SpaceBetween', 'SpaceEvenly'] as const).map(
        (justify) => (
          <PdxStack
            key={justify}
            direction="Row"
            gap="Small"
            justify={justify}
            style={{ border: '1px dashed var(--border-default)' }}
          >
            <div style={boxStyle}>A</div>
            <div style={boxStyle}>B</div>
            <div style={boxStyle}>{justify}</div>
          </PdxStack>
        )
      )}
    </PdxStack>
  ),
};

export const Wrapping: Story = {
  args: {
    direction: 'Row',
    gap: 'Small',
    wrap: true,
    style: { maxWidth: '260px' },
    children: (
      <>
        <div style={boxStyle}>pir</div>
        <div style={boxStyle}>workspace</div>
        <div style={boxStyle}>router</div>
        <div style={boxStyle}>animation</div>
        <div style={boxStyle}>tokens</div>
      </>
    ),
  },
};
