import type { Meta, StoryObj } from '@storybook/react';
import PdxParagraph from './PdxParagraph';

const meta: Meta<typeof PdxParagraph> = {
  title: 'Components/Paragraph',
  component: PdxParagraph,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '段落尺寸',
    },
    weight: {
      control: 'select',
      options: ['Light', 'Normal', 'Medium', 'SemiBold'],
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
      options: ['p', 'div', 'span'],
      description: '渲染的 HTML 元素',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxParagraph>;

export const Default: Story = {
  args: {
    children: 'This is a default paragraph with medium size and normal weight.',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxParagraph size="Small">
        Small paragraph text (14px) - This is a small paragraph with compact
        text size.
      </PdxParagraph>
      <PdxParagraph size="Medium">
        Medium paragraph text (16px) - This is a medium paragraph with standard
        text size.
      </PdxParagraph>
      <PdxParagraph size="Large">
        Large paragraph text (18px) - This is a large paragraph with bigger text
        size.
      </PdxParagraph>
    </div>
  ),
};

export const Weights: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxParagraph weight="Light">
        Light weight paragraph - This paragraph has a light font weight for a
        subtle appearance.
      </PdxParagraph>
      <PdxParagraph weight="Normal">
        Normal weight paragraph - This paragraph has a normal font weight for
        standard readability.
      </PdxParagraph>
      <PdxParagraph weight="Medium">
        Medium weight paragraph - This paragraph has a medium font weight for
        slightly more emphasis.
      </PdxParagraph>
      <PdxParagraph weight="SemiBold">
        SemiBold weight paragraph - This paragraph has a semi-bold font weight
        for stronger emphasis.
      </PdxParagraph>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxParagraph color="Default">
        Default color paragraph - This is the default text color for paragraphs.
      </PdxParagraph>
      <PdxParagraph color="Muted">
        Muted color paragraph - This paragraph has a muted color for less
        emphasis.
      </PdxParagraph>
      <PdxParagraph color="Primary">
        Primary color paragraph - This paragraph uses the primary color for
        emphasis.
      </PdxParagraph>
      <PdxParagraph color="Secondary">
        Secondary color paragraph - This paragraph uses the secondary color.
      </PdxParagraph>
      <PdxParagraph color="Danger">
        Danger color paragraph - This paragraph uses the danger color for
        warnings.
      </PdxParagraph>
      <PdxParagraph color="Warning">
        Warning color paragraph - This paragraph uses the warning color for
        alerts.
      </PdxParagraph>
      <PdxParagraph color="Success">
        Success color paragraph - This paragraph uses the success color for
        positive messages.
      </PdxParagraph>
    </div>
  ),
};

export const Alignments: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '400px',
      }}
    >
      <PdxParagraph align="Left">
        Left aligned paragraph - This paragraph is aligned to the left side of
        the container.
      </PdxParagraph>
      <PdxParagraph align="Center">
        Center aligned paragraph - This paragraph is centered in the container.
      </PdxParagraph>
      <PdxParagraph align="Right">
        Right aligned paragraph - This paragraph is aligned to the right side of
        the container.
      </PdxParagraph>
    </div>
  ),
};

export const LongText: Story = {
  args: {
    children:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    size: 'Medium',
  },
};

export const Combined: Story = {
  args: {
    children:
      'This is a large, semi-bold, primary colored paragraph with center alignment.',
    size: 'Large',
    weight: 'SemiBold',
    color: 'Primary',
    align: 'Center',
  },
};
