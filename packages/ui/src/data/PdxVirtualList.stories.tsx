import type { Meta, StoryObj } from '@storybook/react';
import PdxVirtualList from './PdxVirtualList';

const meta: Meta<typeof PdxVirtualList> = {
  title: 'Components/VirtualList',
  component: PdxVirtualList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    rowHeight: { control: 'number', description: '固定行高（像素）' },
    height: { control: 'number', description: '滚动视口高度（像素）' },
    overscan: { control: 'number', description: '视口上下各保留的行数' },
    onActiveKeyChange: { action: 'active changed' },
    onSelectedKeyChange: { action: 'selection changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxVirtualList>;

const files = Array.from({ length: 5000 }, (_unused, index) => ({
  key: `file-${index}`,
  content: `src/module-${String(index + 1).padStart(4, '0')}.ts`,
}));

export const Default: Story = {
  args: {
    'aria-label': 'Project files',
    items: files,
    height: 320,
    rowHeight: 32,
  },
  render: (args) => (
    <div style={{ width: '320px' }}>
      <PdxVirtualList {...args} />
    </div>
  ),
};

export const WithSelection: Story = {
  args: {
    'aria-label': 'Project files',
    items: files,
    defaultSelectedKey: 'file-3',
    defaultActiveKey: 'file-3',
    height: 320,
    rowHeight: 32,
  },
  render: (args) => (
    <div style={{ width: '320px' }}>
      <PdxVirtualList {...args} />
    </div>
  ),
};

export const Dense: Story = {
  args: {
    'aria-label': 'Log lines',
    items: Array.from({ length: 20000 }, (_unused, index) => ({
      key: `line-${index}`,
      content: `[${String(index + 1).padStart(5, '0')}] compile step finished`,
    })),
    height: 280,
    rowHeight: 22,
  },
  render: (args) => (
    <div style={{ width: '420px' }}>
      <PdxVirtualList {...args} />
    </div>
  ),
};

export const WithDisabledRows: Story = {
  args: {
    'aria-label': 'Targets',
    items: [
      { key: 'react', content: 'React + Vite' },
      { key: 'vue', content: 'Vue + Vite' },
      { key: 'native', content: 'Native (unavailable)', disabled: true },
      { key: 'static', content: 'Static export' },
    ],
    height: 160,
    rowHeight: 32,
  },
  render: (args) => (
    <div style={{ width: '280px' }}>
      <PdxVirtualList {...args} />
    </div>
  ),
};
