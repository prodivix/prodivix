import type { Meta, StoryObj } from '@storybook/react';
import PdxImage from './PdxImage';

const meta: Meta<typeof PdxImage> = {
  title: 'Components/Image',
  component: PdxImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large', 'Original'],
      description: '图片尺寸',
    },
    fit: {
      control: 'select',
      options: ['Cover', 'Contain', 'Fill', 'None', 'ScaleDown'],
      description: '图片填充方式',
    },
    shape: {
      control: 'select',
      options: ['Square', 'Rounded', 'Circle'],
      description: '图片形状',
    },
    loading: {
      control: 'select',
      options: ['Eager', 'Lazy'],
      description: '加载方式',
    },
    onLoad: { action: 'loaded' },
    onError: { action: 'error' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxImage>;

export const Default: Story = {
  args: {
    src: 'https://via.placeholder.com/300',
    alt: 'Placeholder image',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxImage src="https://via.placeholder.com/64" alt="Small" size="Small" />
      <PdxImage
        src="https://via.placeholder.com/128"
        alt="Medium"
        size="Medium"
      />
      <PdxImage
        src="https://via.placeholder.com/256"
        alt="Large"
        size="Large"
      />
    </div>
  ),
};

export const Shapes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxImage
        src="https://via.placeholder.com/128"
        alt="Square"
        size="Medium"
        shape="Square"
      />
      <PdxImage
        src="https://via.placeholder.com/128"
        alt="Rounded"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/128"
        alt="Circle"
        size="Medium"
        shape="Circle"
      />
    </div>
  ),
};

export const FitOptions: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
      }}
    >
      <div>
        <p style={{ marginBottom: '8px', fontSize: '14px' }}>Cover</p>
        <PdxImage
          src="https://via.placeholder.com/300x200/4a90e2/ffffff?text=Cover"
          alt="Cover"
          size="Medium"
          fit="Cover"
        />
      </div>
      <div>
        <p style={{ marginBottom: '8px', fontSize: '14px' }}>Contain</p>
        <PdxImage
          src="https://via.placeholder.com/300x200/4a90e2/ffffff?text=Contain"
          alt="Contain"
          size="Medium"
          fit="Contain"
        />
      </div>
      <div>
        <p style={{ marginBottom: '8px', fontSize: '14px' }}>Fill</p>
        <PdxImage
          src="https://via.placeholder.com/300x200/4a90e2/ffffff?text=Fill"
          alt="Fill"
          size="Medium"
          fit="Fill"
        />
      </div>
      <div>
        <p style={{ marginBottom: '8px', fontSize: '14px' }}>None</p>
        <PdxImage
          src="https://via.placeholder.com/300x200/4a90e2/ffffff?text=None"
          alt="None"
          size="Medium"
          fit="None"
        />
      </div>
    </div>
  ),
};

export const OriginalSize: Story = {
  args: {
    src: 'https://via.placeholder.com/400x300/4a90e2/ffffff?text=Original+Size',
    alt: 'Original size image',
    size: 'Original',
  },
};

export const LazyLoading: Story = {
  args: {
    src: 'https://via.placeholder.com/300',
    alt: 'Lazy loaded image',
    loading: 'Lazy',
  },
};

export const WithCustomStyle: Story = {
  args: {
    src: 'https://via.placeholder.com/300',
    alt: 'Custom styled image',
    size: 'Medium',
    style: { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  },
};

export const Gallery: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '12px',
      }}
    >
      <PdxImage
        src="https://via.placeholder.com/150/ff6b6b/ffffff?text=1"
        alt="Image 1"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/150/4ecdc4/ffffff?text=2"
        alt="Image 2"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/150/45b7d1/ffffff?text=3"
        alt="Image 3"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/150/96ceb4/ffffff?text=4"
        alt="Image 4"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/150/ffeaa7/ffffff?text=5"
        alt="Image 5"
        size="Medium"
        shape="Rounded"
      />
      <PdxImage
        src="https://via.placeholder.com/150/dfe6e9/333333?text=6"
        alt="Image 6"
        size="Medium"
        shape="Rounded"
      />
    </div>
  ),
};
