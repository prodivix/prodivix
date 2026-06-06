import type { Meta, StoryObj } from '@storybook/react';
import PdxIconLink from './PdxIconLink';

const meta: Meta<typeof PdxIconLink> = {
  title: 'Components/IconLink',
  component: PdxIconLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    to: { control: 'text', description: '跳转链接' },
    size: {
      control: { type: 'range', min: 12, max: 48, step: 4 },
      description: '图标尺寸',
    },
    color: { control: 'color', description: '图标颜色' },
    title: { control: 'text', description: '无障碍标题' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxIconLink>;

const HomeIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9,22 9,12 15,12 15,22" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

export const Default: Story = {
  args: {
    to: '/home',
    icon: HomeIcon,
    size: 24,
  },
};

export const WithTitle: Story = {
  args: {
    to: '/home',
    icon: HomeIcon,
    size: 24,
    title: 'Go to Home',
  },
};

export const CustomColor: Story = {
  args: {
    to: '/settings',
    icon: SettingsIcon,
    size: 24,
    color: '#3b82f6',
    title: 'Settings',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxIconLink to="/icon1" icon={HomeIcon} size={16} />
      <PdxIconLink to="/icon2" icon={HomeIcon} size={24} />
      <PdxIconLink to="/icon3" icon={HomeIcon} size={32} />
      <PdxIconLink to="/icon4" icon={HomeIcon} size={48} />
    </div>
  ),
};

export const DifferentIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px' }}>
      <PdxIconLink to="/home" icon={HomeIcon} size={32} title="Home" />
      <PdxIconLink
        to="/settings"
        icon={SettingsIcon}
        size={32}
        title="Settings"
      />
    </div>
  ),
};
