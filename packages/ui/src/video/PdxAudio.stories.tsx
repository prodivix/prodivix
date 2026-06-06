import type { Meta, StoryObj } from '@storybook/react';
import PdxAudio from './PdxAudio';

const meta: Meta<typeof PdxAudio> = {
  title: 'Components/Audio',
  component: PdxAudio,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: '音频地址',
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
    preload: {
      control: 'select',
      options: ['None', 'Metadata', 'Auto'],
      description: '预加载',
    },
    onPlay: { action: 'play' },
    onPause: { action: 'pause' },
    onEnded: { action: 'ended' },
    onTimeUpdate: { action: 'time update' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxAudio>;

export const Default: Story = {
  args: {
    src: 'https://www.w3schools.com/html/horse.mp3',
    controls: true,
  },
};

export const AutoPlay: Story = {
  args: {
    src: 'https://www.w3schools.com/html/horse.mp3',
    autoplay: true,
    muted: true,
    controls: true,
  },
};

export const Loop: Story = {
  args: {
    src: 'https://www.w3schools.com/html/horse.mp3',
    loop: true,
    controls: true,
  },
};

export const NoControls: Story = {
  args: {
    src: 'https://www.w3schools.com/html/horse.mp3',
    controls: false,
    autoplay: true,
    muted: true,
  },
};

export const WithPreload: Story = {
  args: {
    src: 'https://www.w3schools.com/html/horse.mp3',
    controls: true,
    preload: 'Auto',
  },
};
