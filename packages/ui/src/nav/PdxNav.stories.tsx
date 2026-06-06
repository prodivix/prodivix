import type { Meta, StoryObj } from '@storybook/react';
import PdxNav from './PdxNav';
import PdxButton from '../button/PdxButton';
import PdxLink from '../link/PdxLink';
import PdxIcon from '../icon/PdxIcon';

const meta: Meta<typeof PdxNav> = {
  title: 'Components/Nav',
  component: PdxNav,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'select',
      options: [2, 3],
      description: '布局列数',
    },
    canHide: {
      control: 'boolean',
      description: '是否可收起',
    },
    isFloat: {
      control: 'boolean',
      description: '是否浮动',
    },
    backgroundStyle: {
      control: 'select',
      options: ['Transparent', 'Solid', 'Blurred'],
      description: '背景样式',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdxNav>;

const MenuIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

export const Default: Story = {
  render: () => (
    <PdxNav>
      <PdxNav.Left>
        <PdxLink to="/" text="Logo" />
      </PdxNav.Left>
      <PdxNav.Center>
        <PdxLink to="/products" text="Products" />
        <PdxLink to="/about" text="About" />
        <PdxLink to="/contact" text="Contact" />
      </PdxNav.Center>
      <PdxNav.Right>
        <PdxIcon icon={SearchIcon} />
        <PdxButton text="Sign Up" size="Small" />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const TwoColumns: Story = {
  render: () => (
    <PdxNav columns={2}>
      <PdxNav.Left>
        <PdxLink to="/" text="Logo" />
      </PdxNav.Left>
      <PdxNav.Right>
        <PdxLink to="/login" text="Login" />
        <PdxButton text="Get Started" size="Small" />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const ThreeColumns: Story = {
  render: () => (
    <PdxNav columns={3}>
      <PdxNav.Left>
        <PdxLink to="/" text="Logo" />
      </PdxNav.Left>
      <PdxNav.Center>
        <PdxLink to="/nav1" text="Nav Item 1" />
        <PdxLink to="/nav2" text="Nav Item 2" />
        <PdxLink to="/nav3" text="Nav Item 3" />
      </PdxNav.Center>
      <PdxNav.Right>
        <PdxIcon icon={SearchIcon} />
        <PdxButton text="Action" size="Small" />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const WithHeading: Story = {
  render: () => (
    <PdxNav>
      <PdxNav.Left>
        <PdxNav.Heading heading="My App" />
      </PdxNav.Left>
      <PdxNav.Center>
        <PdxLink to="/page1" text="Page 1" />
        <PdxLink to="/page2" text="Page 2" />
      </PdxNav.Center>
      <PdxNav.Right>
        <PdxButton
          text="Menu"
          size="Small"
          icon={<PdxIcon icon={MenuIcon} />}
          iconPosition="Left"
        />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const TransparentBackground: Story = {
  render: () => (
    <div
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <PdxNav backgroundStyle="Transparent">
        <PdxNav.Left>
          <PdxLink to="/" text="Logo" style={{ color: 'white' }} />
        </PdxNav.Left>
        <PdxNav.Center>
          <PdxLink to="/products" text="Products" style={{ color: 'white' }} />
          <PdxLink to="/about" text="About" style={{ color: 'white' }} />
        </PdxNav.Center>
        <PdxNav.Right>
          <PdxButton text="Sign Up" size="Small" category="Primary" />
        </PdxNav.Right>
      </PdxNav>
    </div>
  ),
};

export const BlurredBackground: Story = {
  render: () => (
    <PdxNav backgroundStyle="Blurred">
      <PdxNav.Left>
        <PdxLink to="/" text="Logo" />
      </PdxNav.Left>
      <PdxNav.Center>
        <PdxLink to="/nav1" text="Navigation 1" />
        <PdxLink to="/nav2" text="Navigation 2" />
        <PdxLink to="/nav3" text="Navigation 3" />
      </PdxNav.Center>
      <PdxNav.Right>
        <PdxButton text="Action" size="Small" />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const Float: Story = {
  render: () => (
    <div style={{ height: '200px', position: 'relative' }}>
      <PdxNav isFloat={true}>
        <PdxNav.Left>
          <PdxLink to="/" text="Floating Nav" />
        </PdxNav.Left>
        <PdxNav.Right>
          <PdxLink to="/about" text="About" />
        </PdxNav.Right>
      </PdxNav>
    </div>
  ),
};

export const CanHide: Story = {
  render: () => (
    <PdxNav canHide={true}>
      <PdxNav.Left>
        <PdxLink to="/" text="Collapsible Nav" />
      </PdxNav.Left>
      <PdxNav.Center>
        <PdxLink to="/item1" text="Item 1" />
        <PdxLink to="/item2" text="Item 2" />
        <PdxLink to="/item3" text="Item 3" />
      </PdxNav.Center>
      <PdxNav.Right>
        <PdxButton text="Menu" size="Small" />
      </PdxNav.Right>
    </PdxNav>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h3 style={{ marginBottom: '8px' }}>Solid Background</h3>
        <PdxNav backgroundStyle="Solid">
          <PdxNav.Left>
            <PdxLink to="/" text="Logo" />
          </PdxNav.Left>
          <PdxNav.Center>
            <PdxLink to="/nav" text="Nav" />
          </PdxNav.Center>
          <PdxNav.Right>
            <PdxButton text="Action" size="Small" />
          </PdxNav.Right>
        </PdxNav>
      </div>
      <div>
        <h3 style={{ marginBottom: '8px' }}>Blurred Background</h3>
        <PdxNav backgroundStyle="Blurred">
          <PdxNav.Left>
            <PdxLink to="/" text="Logo" />
          </PdxNav.Left>
          <PdxNav.Center>
            <PdxLink to="/nav" text="Nav" />
          </PdxNav.Center>
          <PdxNav.Right>
            <PdxButton text="Action" size="Small" />
          </PdxNav.Right>
        </PdxNav>
      </div>
    </div>
  ),
};
