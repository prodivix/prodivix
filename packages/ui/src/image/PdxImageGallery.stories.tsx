import type { Meta, StoryObj } from '@storybook/react';
import PdxImageGallery from './PdxImageGallery';

const sampleImages = [
  {
    src: 'https://picsum.photos/400/300?random=1',
    alt: 'Image 1',
    caption: 'Beautiful landscape',
  },
  {
    src: 'https://picsum.photos/400/300?random=2',
    alt: 'Image 2',
    caption: 'City view',
  },
  {
    src: 'https://picsum.photos/400/300?random=3',
    alt: 'Image 3',
    caption: 'Nature scene',
  },
  {
    src: 'https://picsum.photos/400/300?random=4',
    alt: 'Image 4',
    caption: 'Abstract art',
  },
  {
    src: 'https://picsum.photos/400/300?random=5',
    alt: 'Image 5',
    caption: 'Architecture',
  },
  {
    src: 'https://picsum.photos/400/300?random=6',
    alt: 'Image 6',
    caption: 'Portrait',
  },
];

const meta: Meta<typeof PdxImageGallery> = {
  title: 'Components/ImageGallery',
  component: PdxImageGallery,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    layout: {
      control: 'select',
      options: ['Grid', 'List', 'Masonry'],
      description: '布局方式',
    },
    columns: {
      control: { type: 'number', min: 1, max: 6 },
      description: '列数',
    },
    gap: {
      control: 'select',
      options: ['None', 'Small', 'Medium', 'Large'],
      description: '间距',
    },
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '图片尺寸',
    },
    shape: {
      control: 'select',
      options: ['Square', 'Rounded', 'Circle'],
      description: '图片形状',
    },
    fit: {
      control: 'select',
      options: ['Cover', 'Contain', 'Fill', 'None', 'ScaleDown'],
      description: '图片填充方式',
    },
    showCaptions: {
      control: 'boolean',
      description: '显示标题',
    },
    selectable: {
      control: 'boolean',
      description: '可选择',
    },
    maxSelection: {
      control: { type: 'number', min: 1 },
      description: '最大选择数',
    },
    onImageClick: { action: 'image clicked' },
    onSelectionChange: { action: 'selection changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxImageGallery>;

export const Default: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
    fit: 'Cover',
  },
};

export const GridLayout: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
  },
};

export const ListLayout: Story = {
  args: {
    images: sampleImages,
    layout: 'List',
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
  },
};

export const WithCaptions: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
    showCaptions: true,
  },
};

export const Selectable: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
    selectable: true,
  },
};

export const WithMaxSelection: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Rounded',
    selectable: true,
    maxSelection: 3,
  },
};

export const DifferentSizes: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Small',
    shape: 'Rounded',
  },
};

export const DifferentShapes: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 3,
    gap: 'Medium',
    size: 'Medium',
    shape: 'Circle',
  },
};

export const CustomColumns: Story = {
  args: {
    images: sampleImages,
    layout: 'Grid',
    columns: 4,
    gap: 'Small',
    size: 'Medium',
    shape: 'Rounded',
  },
};
