import type { Meta, StoryObj } from '@storybook/react';
import PdxSection from './PdxSection';

const meta: Meta<typeof PdxSection> = {
  title: 'Components/Section',
  component: PdxSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '区块尺寸',
    },
    backgroundColor: {
      control: 'select',
      options: ['Default', 'Light', 'Dark', 'Primary', 'Secondary'],
      description: '背景颜色',
    },
    padding: {
      control: 'select',
      options: ['None', 'Small', 'Medium', 'Large'],
      description: '内边距',
    },
    textAlign: {
      control: 'select',
      options: ['Left', 'Center', 'Right'],
      description: '文本对齐',
    },
    fullWidth: {
      control: 'boolean',
      description: '是否全宽',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxSection>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h2>Default Section</h2>
        <p>This is a default section with medium size and padding.</p>
      </div>
    ),
    size: 'Medium',
    backgroundColor: 'Default',
    padding: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div>
      <PdxSection size="Small" backgroundColor="Light" padding="Small">
        <h2>Small Section</h2>
        <p>Minimum height: 200px</p>
      </PdxSection>
      <PdxSection size="Medium" backgroundColor="Default" padding="Medium">
        <h2>Medium Section</h2>
        <p>Minimum height: 400px</p>
      </PdxSection>
      <PdxSection size="Large" backgroundColor="Light" padding="Large">
        <h2>Large Section</h2>
        <p>Minimum height: 600px</p>
      </PdxSection>
    </div>
  ),
};

export const BackgroundColors: Story = {
  render: () => (
    <div>
      <PdxSection backgroundColor="Default" padding="Medium">
        <h2>Default Background</h2>
        <p>Default background color</p>
      </PdxSection>
      <PdxSection backgroundColor="Light" padding="Medium">
        <h2>Light Background</h2>
        <p>Light background color</p>
      </PdxSection>
      <PdxSection backgroundColor="Dark" padding="Medium">
        <h2>Dark Background</h2>
        <p>Dark background color</p>
      </PdxSection>
      <PdxSection backgroundColor="Primary" padding="Medium">
        <h2>Primary Background</h2>
        <p>Primary background color</p>
      </PdxSection>
      <PdxSection backgroundColor="Secondary" padding="Medium">
        <h2>Secondary Background</h2>
        <p>Secondary background color</p>
      </PdxSection>
    </div>
  ),
};

export const PaddingOptions: Story = {
  render: () => (
    <div>
      <PdxSection backgroundColor="Light" padding="None">
        <h2>No Padding</h2>
        <p>Section with no padding</p>
      </PdxSection>
      <PdxSection backgroundColor="Default" padding="Small">
        <h2>Small Padding</h2>
        <p>Section with small padding (16px)</p>
      </PdxSection>
      <PdxSection backgroundColor="Light" padding="Medium">
        <h2>Medium Padding</h2>
        <p>Section with medium padding (32px)</p>
      </PdxSection>
      <PdxSection backgroundColor="Default" padding="Large">
        <h2>Large Padding</h2>
        <p>Section with large padding (64px)</p>
      </PdxSection>
    </div>
  ),
};

export const TextAlignment: Story = {
  render: () => (
    <div>
      <PdxSection backgroundColor="Light" padding="Medium" textAlign="Left">
        <h2>Left Aligned</h2>
        <p>This section has left aligned text</p>
      </PdxSection>
      <PdxSection backgroundColor="Default" padding="Medium" textAlign="Center">
        <h2>Center Aligned</h2>
        <p>This section has center aligned text</p>
      </PdxSection>
      <PdxSection backgroundColor="Light" padding="Medium" textAlign="Right">
        <h2>Right Aligned</h2>
        <p>This section has right aligned text</p>
      </PdxSection>
    </div>
  ),
};

export const FullWidth: Story = {
  args: {
    children: (
      <div>
        <h2>Full Width Section</h2>
        <p>This section spans the full viewport width</p>
      </div>
    ),
    backgroundColor: 'Primary',
    padding: 'Large',
    textAlign: 'Center',
    fullWidth: true,
  },
};

export const HeroSection: Story = {
  args: {
    children: (
      <div>
        <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>
          Welcome to Our Platform
        </h1>
        <p style={{ fontSize: '20px', marginBottom: '24px' }}>
          Build amazing things with our components
        </p>
        <button
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Get Started
        </button>
      </div>
    ),
    size: 'Large',
    backgroundColor: 'Primary',
    padding: 'Large',
    textAlign: 'Center',
  },
};
