import type { Meta, StoryObj } from '@storybook/react';
import PdxEmbed from './PdxEmbed';

const meta: Meta<typeof PdxEmbed> = {
  title: 'Components/Embed',
  component: PdxEmbed,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: [
        'YouTube',
        'Vimeo',
        'Twitter',
        'Instagram',
        'Facebook',
        'Custom',
      ],
      description: '嵌入类型',
    },
    url: {
      control: 'text',
      description: 'URL 地址',
    },
    title: {
      control: 'text',
      description: '标题',
    },
    allowFullScreen: {
      control: 'boolean',
      description: '允许全屏',
    },
    loading: {
      control: 'select',
      options: ['Eager', 'Lazy'],
      description: '加载方式',
    },
    width: {
      control: { type: 'number' },
      description: '宽度',
    },
    height: {
      control: { type: 'number' },
      description: '高度',
    },
    aspectRatio: {
      control: 'select',
      options: ['16:9', '4:3', '1:1', '21:9'],
      description: '宽高比',
    },
    onLoad: { action: 'loaded' },
    onError: { action: 'error' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxEmbed>;

export const YouTube: Story = {
  args: {
    type: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'YouTube video',
    allowFullScreen: true,
    aspectRatio: '16:9',
  },
};

export const Vimeo: Story = {
  args: {
    type: 'Vimeo',
    url: 'https://vimeo.com/148751763',
    title: 'Vimeo video',
    allowFullScreen: true,
    aspectRatio: '16:9',
  },
};

export const Twitter: Story = {
  args: {
    type: 'Twitter',
    url: 'https://twitter.com/Twitter/status/1234567890',
    title: 'Twitter post',
    aspectRatio: '16:9',
  },
};

export const Instagram: Story = {
  args: {
    type: 'Instagram',
    url: 'https://www.instagram.com/p/CK-123456789/',
    title: 'Instagram post',
    aspectRatio: '1:1',
  },
};

export const Facebook: Story = {
  args: {
    type: 'Facebook',
    url: 'https://www.facebook.com/facebook/videos/123456789/',
    title: 'Facebook video',
    allowFullScreen: true,
    aspectRatio: '16:9',
  },
};

export const Custom: Story = {
  args: {
    type: 'Custom',
    url: 'https://www.example.com/embed',
    title: 'Custom embed',
    aspectRatio: '16:9',
  },
};

export const DifferentAspectRatio: Story = {
  args: {
    type: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'YouTube video',
    allowFullScreen: true,
    aspectRatio: '4:3',
  },
};

export const SquareEmbed: Story = {
  args: {
    type: 'Instagram',
    url: 'https://www.instagram.com/p/CK-123456789/',
    title: 'Instagram post',
    aspectRatio: '1:1',
  },
};

export const WideScreen: Story = {
  args: {
    type: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'YouTube video',
    allowFullScreen: true,
    aspectRatio: '21:9',
  },
};

export const CustomSize: Story = {
  args: {
    type: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'YouTube video',
    allowFullScreen: true,
    width: 800,
    aspectRatio: '16:9',
  },
};
