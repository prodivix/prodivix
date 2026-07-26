import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import PdxGrid from './PdxGrid';

const cellStyle: CSSProperties = {
  padding: 'var(--spacing-sm)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
};

const cells = [
  'pir',
  'workspace',
  'router',
  'nodegraph',
  'animation',
  'tokens',
];

const meta: Meta<typeof PdxGrid> = {
  title: 'Components/Grid',
  component: PdxGrid,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    columns: { control: { type: 'number', min: 1 }, description: '基础列数' },
    columnsMedium: {
      control: { type: 'number', min: 1 },
      description: '中等视口列数',
    },
    columnsLarge: {
      control: { type: 'number', min: 1 },
      description: '大视口列数',
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
    rowGap: {
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
      description: '行间距刻度',
    },
    align: {
      control: 'select',
      options: ['Start', 'Center', 'End', 'Stretch'],
      description: '块轴对齐',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxGrid>;

export const Default: Story = {
  args: {
    columns: 3,
    gap: 'Medium',
    children: cells.map((cell) => (
      <div key={cell} style={cellStyle}>
        {cell}
      </div>
    )),
  },
};

export const Responsive: Story = {
  args: {
    columns: 1,
    columnsMedium: 2,
    columnsLarge: 3,
    gap: 'Medium',
    children: cells.map((cell) => (
      <div key={cell} style={cellStyle}>
        {cell}
      </div>
    )),
  },
};

export const RowGap: Story = {
  args: {
    columns: 3,
    gap: 'ExtraSmall',
    rowGap: 'Large',
    children: cells.map((cell) => (
      <div key={cell} style={cellStyle}>
        {cell}
      </div>
    )),
  },
};
