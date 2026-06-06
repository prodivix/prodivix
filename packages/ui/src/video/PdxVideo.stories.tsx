import type { Meta, StoryObj } from '@storybook/react';
import PdxVideo from './PdxVideo';

const meta: Meta<typeof PdxVideo> = {
  title: 'Components/Video',
  component: PdxVideo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: '视频地址',
    },
    poster: {
      control: 'text',
      description: '封面图片',
    },
    autoplay: {
      control: 'boolean',
      description: '自动播放',
    },
    controls: {
      control: 'boolean',
      description: '显示控制条',
    },
    loop: {
      control: 'boolean',
      description: '循环播放',
    },
    muted: {
      control: 'boolean',
      description: '静音',
    },
    playsInline: {
      control: 'boolean',
      description: '内联播放',
    },
    preload: {
      control: 'select',
      options: ['None', 'Metadata', 'Auto'],
      description: '预加载',
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
    onPlay: { action: 'play' },
    onPause: { action: 'pause' },
    onEnded: { action: 'ended' },
    onTimeUpdate: { action: 'time update' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxVideo>;

export const Default: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    poster: 'https://www.w3schools.com/html/mov_bbb.jpg',
    controls: true,
    aspectRatio: '16:9',
  },
};

export const WithoutPoster: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: true,
    aspectRatio: '16:9',
  },
};

export const AutoPlay: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    autoplay: true,
    muted: true,
    playsInline: true,
    aspectRatio: '16:9',
  },
};

export const Loop: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    loop: true,
    controls: true,
    aspectRatio: '16:9',
  },
};

export const DifferentAspectRatio: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: true,
    aspectRatio: '4:3',
  },
};

export const SquareVideo: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: true,
    aspectRatio: '1:1',
  },
};

export const WideScreen: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: true,
    aspectRatio: '21:9',
  },
};

export const CustomSize: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: true,
    width: 640,
    aspectRatio: '16:9',
  },
};

export const NoControls: Story = {
  args: {
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    controls: false,
    autoplay: true,
    muted: true,
    playsInline: true,
    aspectRatio: '16:9',
  },
};
