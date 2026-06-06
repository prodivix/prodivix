import type { Meta, StoryObj } from '@storybook/react';
import PdxHeading from './PdxHeading';

const meta: Meta<typeof PdxHeading> = {
  title: 'Components/Heading',
  component: PdxHeading,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    level: {
      control: 'select',
      options: [1, 2, 3, 4, 5, 6],
      description: '标题级别',
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
    as: {
      control: 'select',
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'],
      description: '渲染的 HTML 元素',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxHeading>;

export const Default: Story = {
  args: {
    children: 'Heading Level 1',
    level: 1,
  },
};

export const AllLevels: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxHeading level={1}>Heading Level 1</PdxHeading>
      <PdxHeading level={2}>Heading Level 2</PdxHeading>
      <PdxHeading level={3}>Heading Level 3</PdxHeading>
      <PdxHeading level={4}>Heading Level 4</PdxHeading>
      <PdxHeading level={5}>Heading Level 5</PdxHeading>
      <PdxHeading level={6}>Heading Level 6</PdxHeading>
    </div>
  ),
};

export const Weights: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxHeading level={2} weight="Light">
        Light Weight Heading
      </PdxHeading>
      <PdxHeading level={2} weight="Normal">
        Normal Weight Heading
      </PdxHeading>
      <PdxHeading level={2} weight="Medium">
        Medium Weight Heading
      </PdxHeading>
      <PdxHeading level={2} weight="SemiBold">
        SemiBold Weight Heading
      </PdxHeading>
      <PdxHeading level={2} weight="Bold">
        Bold Weight Heading
      </PdxHeading>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxHeading level={3} color="Default">
        Default Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Muted">
        Muted Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Primary">
        Primary Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Secondary">
        Secondary Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Danger">
        Danger Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Warning">
        Warning Color Heading
      </PdxHeading>
      <PdxHeading level={3} color="Success">
        Success Color Heading
      </PdxHeading>
    </div>
  ),
};

export const Alignments: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '400px',
      }}
    >
      <PdxHeading level={3} align="Left">
        Left Aligned Heading
      </PdxHeading>
      <PdxHeading level={3} align="Center">
        Center Aligned Heading
      </PdxHeading>
      <PdxHeading level={3} align="Right">
        Right Aligned Heading
      </PdxHeading>
    </div>
  ),
};

export const CustomElement: Story = {
  args: {
    children: 'This heading renders as a div',
    level: 2,
    as: 'div',
  },
};

export const Combined: Story = {
  args: {
    children: 'This is a level 2, semi-bold, primary colored heading',
    level: 2,
    weight: 'SemiBold',
    color: 'Primary',
    align: 'Center',
  },
};
