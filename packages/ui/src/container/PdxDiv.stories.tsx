import type { Meta, StoryObj } from '@storybook/react';
import PdxDiv from './PdxDiv';

const meta: Meta<typeof PdxDiv> = {
  title: 'Components/Div',
  component: PdxDiv,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    display: {
      control: 'select',
      options: ['Block', 'Inline', 'InlineBlock', 'Flex', 'Grid'],
      description: '显示类型',
    },
    flexDirection: {
      control: 'select',
      options: ['Row', 'Column', 'RowReverse', 'ColumnReverse'],
      description: 'Flex 方向',
    },
    justifyContent: {
      control: 'select',
      options: [
        'Start',
        'Center',
        'End',
        'SpaceBetween',
        'SpaceAround',
        'SpaceEvenly',
      ],
      description: 'Flex 主轴对齐',
    },
    alignItems: {
      control: 'select',
      options: ['Start', 'Center', 'End', 'Stretch', 'Baseline'],
      description: 'Flex 交叉轴对齐',
    },
    overflow: {
      control: 'select',
      options: ['Visible', 'Hidden', 'Auto', 'Scroll'],
      description: '溢出处理',
    },
    textAlign: {
      control: 'select',
      options: ['Left', 'Center', 'Right', 'Justify'],
      description: '文本对齐',
    },
    gap: {
      control: 'text',
      description: '间距',
    },
    padding: {
      control: 'text',
      description: '内边距',
    },
    margin: {
      control: 'text',
      description: '外边距',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxDiv>;

export const Default: Story = {
  args: {
    children: 'Default div block',
    display: 'Block',
  },
};

export const FlexContainer: Story = {
  render: () => (
    <PdxDiv
      display="Flex"
      gap="12px"
      padding="16px"
      backgroundColor="#f5f5f5"
      borderRadius="8px"
    >
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 1
      </PdxDiv>
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 2
      </PdxDiv>
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 3
      </PdxDiv>
    </PdxDiv>
  ),
};

export const FlexColumn: Story = {
  render: () => (
    <PdxDiv
      display="Flex"
      flexDirection="Column"
      gap="12px"
      padding="16px"
      backgroundColor="#f5f5f5"
      borderRadius="8px"
      width="200px"
    >
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 1
      </PdxDiv>
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 2
      </PdxDiv>
      <PdxDiv padding="12px" backgroundColor="#e0e0e0" borderRadius="4px">
        Item 3
      </PdxDiv>
    </PdxDiv>
  ),
};

export const JustifyContent: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxDiv
        display="Flex"
        justifyContent="Start"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          Start
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        display="Flex"
        justifyContent="Center"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          Center
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        display="Flex"
        justifyContent="End"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          End
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        display="Flex"
        justifyContent="SpaceBetween"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          SpaceBetween
        </PdxDiv>
      </PdxDiv>
    </div>
  ),
};

export const AlignItems: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxDiv
        display="Flex"
        alignItems="Start"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
        height="80px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          Start
        </PdxDiv>
        <PdxDiv padding="16px" backgroundColor="#e0e0e0" borderRadius="4px">
          Tall
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        display="Flex"
        alignItems="Center"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
        height="80px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          Center
        </PdxDiv>
        <PdxDiv padding="16px" backgroundColor="#e0e0e0" borderRadius="4px">
          Tall
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        display="Flex"
        alignItems="End"
        gap="8px"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
        height="80px"
      >
        <PdxDiv padding="8px" backgroundColor="#e0e0e0" borderRadius="4px">
          End
        </PdxDiv>
        <PdxDiv padding="16px" backgroundColor="#e0e0e0" borderRadius="4px">
          Tall
        </PdxDiv>
      </PdxDiv>
    </div>
  ),
};

export const Overflow: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxDiv
        width="200px"
        overflow="Visible"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv
          width="300px"
          padding="8px"
          backgroundColor="#e0e0e0"
          borderRadius="4px"
        >
          Visible overflow
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        width="200px"
        overflow="Hidden"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv
          width="300px"
          padding="8px"
          backgroundColor="#e0e0e0"
          borderRadius="4px"
        >
          Hidden overflow
        </PdxDiv>
      </PdxDiv>
      <PdxDiv
        width="200px"
        overflow="Auto"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        <PdxDiv
          width="300px"
          padding="8px"
          backgroundColor="#e0e0e0"
          borderRadius="4px"
        >
          Auto overflow
        </PdxDiv>
      </PdxDiv>
    </div>
  ),
};

export const TextAlignment: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxDiv
        textAlign="Left"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        Left aligned text
      </PdxDiv>
      <PdxDiv
        textAlign="Center"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        Center aligned text
      </PdxDiv>
      <PdxDiv
        textAlign="Right"
        padding="12px"
        backgroundColor="#f5f5f5"
        borderRadius="4px"
      >
        Right aligned text
      </PdxDiv>
    </div>
  ),
};

export const CustomStyle: Story = {
  args: {
    children: 'Custom styled div',
    display: 'Block',
    padding: '24px',
    margin: '16px',
    backgroundColor: '#4a90e2',
    borderRadius: '8px',
    textAlign: 'Center',
  },
};
