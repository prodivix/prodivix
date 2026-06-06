import type { Meta, StoryObj } from '@storybook/react';
import PdxIframe from './PdxIframe';

const meta: Meta<typeof PdxIframe> = {
  title: 'Components/Iframe',
  component: PdxIframe,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: 'iframe 地址',
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
type Story = StoryObj<typeof PdxIframe>;

export const Default: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    aspectRatio: '16:9',
  },
};

export const YouTube: Story = {
  args: {
    src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    title: 'YouTube video',
    allowFullScreen: true,
    aspectRatio: '16:9',
  },
};

export const GoogleMaps: Story = {
  args: {
    src: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3151.835434509374!2d144.9537353153167!3d-37.816279742021665!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6ad642af0f11fd81%3A0xf577d6a32f7f1f81!2sMelbourne%20VIC%2C%20Australia!5e0!3m2!1sen!2sus!4v1635959481000!5m2!1sen!2sus',
    title: 'Google Maps',
    aspectRatio: '16:9',
  },
};

export const DifferentAspectRatio: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    aspectRatio: '4:3',
  },
};

export const SquareIframe: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    aspectRatio: '1:1',
  },
};

export const WideScreen: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    aspectRatio: '21:9',
  },
};

export const CustomSize: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    width: 800,
    aspectRatio: '16:9',
  },
};

export const WithSandbox: Story = {
  args: {
    src: 'https://www.example.com',
    title: 'Example website',
    sandbox: 'allow-same-origin allow-scripts',
    aspectRatio: '16:9',
  },
};
