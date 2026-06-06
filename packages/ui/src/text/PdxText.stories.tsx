import type { Meta, StoryObj } from '@storybook/react';
import PdxText from './PdxText';

const meta: Meta<typeof PdxText> = {
  title: 'Components/Text',
  component: PdxText,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Tiny', 'Small', 'Medium', 'Large', 'Big'],
      description: '文本尺寸',
    },
    weight: {
      control: 'select',
      options: ['Light', 'Normal', 'Medium', 'SemiBold', 'Bold'],
      description: '字体粗细',
    },
    color: {
      control: 'select',
      options: [
        'Default',
        'Muted',
        'Primary',
        'Secondary',
        'Danger',
        'Warning',
        'Success',
      ],
      description: '文本颜色',
    },
    align: {
      control: 'select',
      options: ['Left', 'Center', 'Right'],
      description: '对齐方式',
    },
    truncate: {
      control: 'boolean',
      description: '是否截断文本',
    },
    as: {
      control: 'select',
      options: ['span', 'p', 'div', 'label'],
      description: '渲染的 HTML 元素',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxText>;

export const Default: Story = {
  args: {
    children: 'This is a default text',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <PdxText size="Tiny">Tiny Text (12px)</PdxText>
      <PdxText size="Small">Small Text (14px)</PdxText>
      <PdxText size="Medium">Medium Text (16px)</PdxText>
      <PdxText size="Large">Large Text (18px)</PdxText>
      <PdxText size="Big">Big Text (20px)</PdxText>
    </div>
  ),
};

export const Weights: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <PdxText weight="Light">Light weight text</PdxText>
      <PdxText weight="Normal">Normal weight text</PdxText>
      <PdxText weight="Medium">Medium weight text</PdxText>
      <PdxText weight="SemiBold">SemiBold weight text</PdxText>
      <PdxText weight="Bold">Bold weight text</PdxText>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <PdxText color="Default">Default color text</PdxText>
      <PdxText color="Muted">Muted color text</PdxText>
      <PdxText color="Primary">Primary color text</PdxText>
      <PdxText color="Secondary">Secondary color text</PdxText>
      <PdxText color="Danger">Danger color text</PdxText>
      <PdxText color="Warning">Warning color text</PdxText>
      <PdxText color="Success">Success color text</PdxText>
    </div>
  ),
};

export const Alignments: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '400px',
      }}
    >
      <PdxText align="Left">Left aligned text</PdxText>
      <PdxText align="Center">Center aligned text</PdxText>
      <PdxText align="Right">Right aligned text</PdxText>
    </div>
  ),
};

export const Truncated: Story = {
  render: () => (
    <div style={{ width: '200px' }}>
      <PdxText truncate>
        This is a very long text that should be truncated with an ellipsis when
        it exceeds the container width.
      </PdxText>
    </div>
  ),
};

export const AsElement: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <PdxText as="span">Rendered as span</PdxText>
      <PdxText as="p">Rendered as paragraph</PdxText>
      <PdxText as="div">Rendered as div</PdxText>
      <PdxText as="label">Rendered as label</PdxText>
    </div>
  ),
};

export const Combined: Story = {
  args: {
    children: 'This is a bold, large, primary colored text',
    size: 'Large',
    weight: 'Bold',
    color: 'Primary',
  },
};
