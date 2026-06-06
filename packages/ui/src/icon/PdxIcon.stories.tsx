import type { Meta, StoryObj } from '@storybook/react';
import PdxIcon from './PdxIcon';

const meta: Meta<typeof PdxIcon> = {
  title: 'Components/Icon',
  component: PdxIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'range', min: 12, max: 64, step: 4 },
      description: '图标尺寸',
    },
    color: { control: 'color', description: '图标颜色' },
    title: { control: 'text', description: '无障碍标题' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxIcon>;

const PlusIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

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
    icon: PlusIcon,
    size: 24,
  },
};

export const WithTitle: Story = {
  args: {
    icon: HomeIcon,
    size: 24,
    title: 'Home',
  },
};

export const CustomColor: Story = {
  args: {
    icon: SettingsIcon,
    size: 24,
    color: '#3b82f6',
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <PdxIcon icon={PlusIcon} size={16} />
      <PdxIcon icon={PlusIcon} size={24} />
      <PdxIcon icon={PlusIcon} size={32} />
      <PdxIcon icon={PlusIcon} size={48} />
    </div>
  ),
};

export const DifferentIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px' }}>
      <PdxIcon icon={PlusIcon} size={24} />
      <PdxIcon icon={ArrowRightIcon} size={24} />
      <PdxIcon icon={SearchIcon} size={24} />
      <PdxIcon icon={HomeIcon} size={24} />
      <PdxIcon icon={SettingsIcon} size={24} />
    </div>
  ),
};

export const CustomColors: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px' }}>
      <PdxIcon icon={HomeIcon} size={32} color="#ef4444" />
      <PdxIcon icon={SettingsIcon} size={32} color="#3b82f6" />
      <PdxIcon icon={SearchIcon} size={32} color="#22c55e" />
      <PdxIcon icon={ArrowRightIcon} size={32} color="#f59e0b" />
    </div>
  ),
};
