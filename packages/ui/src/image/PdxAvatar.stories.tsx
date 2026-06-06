import type { Meta, StoryObj } from '@storybook/react';
import PdxAvatar from './PdxAvatar';

const meta: Meta<typeof PdxAvatar> = {
  title: 'Components/Avatar',
  component: PdxAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: '头像图片地址',
    },
    alt: {
      control: 'text',
      description: '替代文本',
    },
    size: {
      control: 'select',
      options: ['ExtraSmall', 'Small', 'Medium', 'Large', 'ExtraLarge'],
      description: '头像尺寸',
    },
    shape: {
      control: 'select',
      options: ['Square', 'Rounded', 'Circle'],
      description: '头像形状',
    },
    fallback: {
      control: 'text',
      description: '备用图片地址',
    },
    initials: {
      control: 'text',
      description: '首字母',
    },
    status: {
      control: 'select',
      options: ['Online', 'Offline', 'Busy', 'Away'],
      description: '状态指示器',
    },
    onError: { action: 'error' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxAvatar>;

export const Default: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?img=1',
    alt: 'User avatar',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?img=2',
    alt: 'User avatar',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxAvatar {...args} size="ExtraSmall" />
      <PdxAvatar {...args} size="Small" />
      <PdxAvatar {...args} size="Medium" />
      <PdxAvatar {...args} size="Large" />
      <PdxAvatar {...args} size="ExtraLarge" />
    </div>
  ),
};

export const Shapes: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?img=3',
    alt: 'User avatar',
    size: 'Large',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxAvatar {...args} shape="Square" />
      <PdxAvatar {...args} shape="Rounded" />
      <PdxAvatar {...args} shape="Circle" />
    </div>
  ),
};

export const WithStatus: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?img=4',
    alt: 'User avatar',
    size: 'Large',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxAvatar {...args} status="Online" />
      <PdxAvatar {...args} status="Offline" />
      <PdxAvatar {...args} status="Busy" />
      <PdxAvatar {...args} status="Away" />
    </div>
  ),
};

export const WithInitials: Story = {
  args: {
    alt: 'John Doe',
    size: 'Large',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxAvatar {...args} initials="JD" />
      <PdxAvatar {...args} initials="AB" />
      <PdxAvatar {...args} initials="XY" />
    </div>
  ),
};

export const WithFallback: Story = {
  args: {
    src: 'https://invalid-url.com/image.jpg',
    alt: 'User avatar',
    fallback: 'https://i.pravatar.cc/150?img=5',
    size: 'Large',
  },
};

export const Placeholder: Story = {
  args: {
    alt: 'Unknown User',
    size: 'Large',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxAvatar {...args} alt="Alice" />
      <PdxAvatar {...args} alt="Bob" />
      <PdxAvatar {...args} alt="Charlie" />
    </div>
  ),
};
