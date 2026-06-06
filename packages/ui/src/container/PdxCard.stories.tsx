import type { Meta, StoryObj } from '@storybook/react';
import PdxCard from './PdxCard';

const meta: Meta<typeof PdxCard> = {
  title: 'Components/Card',
  component: PdxCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '卡片尺寸',
    },
    variant: {
      control: 'select',
      options: ['Default', 'Bordered', 'Elevated', 'Flat'],
      description: '卡片样式',
    },
    padding: {
      control: 'select',
      options: ['None', 'Small', 'Medium', 'Large'],
      description: '内边距',
    },
    hoverable: {
      control: 'boolean',
      description: '是否可悬停',
    },
    clickable: {
      control: 'boolean',
      description: '是否可点击',
    },
    onClick: { action: 'clicked' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxCard>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h3>Card Title</h3>
        <p>This is a default card with medium size and padding.</p>
      </div>
    ),
    size: 'Medium',
    variant: 'Default',
  },
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '400px',
      }}
    >
      <PdxCard size="Small" padding="Small">
        <h4>Small Card</h4>
        <p>Minimum height: 100px</p>
      </PdxCard>
      <PdxCard size="Medium" padding="Medium">
        <h4>Medium Card</h4>
        <p>Minimum height: 200px</p>
      </PdxCard>
      <PdxCard size="Large" padding="Large">
        <h4>Large Card</h4>
        <p>Minimum height: 300px</p>
      </PdxCard>
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}
    >
      <PdxCard variant="Default" padding="Medium">
        <h4>Default</h4>
        <p>Default border</p>
      </PdxCard>
      <PdxCard variant="Bordered" padding="Medium">
        <h4>Bordered</h4>
        <p>Thicker border</p>
      </PdxCard>
      <PdxCard variant="Elevated" padding="Medium">
        <h4>Elevated</h4>
        <p>With shadow</p>
      </PdxCard>
      <PdxCard variant="Flat" padding="Medium">
        <h4>Flat</h4>
        <p>No border</p>
      </PdxCard>
    </div>
  ),
};

export const PaddingOptions: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}
    >
      <PdxCard padding="None">
        <h4>No Padding</h4>
        <p>Card with no padding</p>
      </PdxCard>
      <PdxCard padding="Small">
        <h4>Small Padding</h4>
        <p>Card with small padding (12px)</p>
      </PdxCard>
      <PdxCard padding="Medium">
        <h4>Medium Padding</h4>
        <p>Card with medium padding (20px)</p>
      </PdxCard>
      <PdxCard padding="Large">
        <h4>Large Padding</h4>
        <p>Card with large padding (28px)</p>
      </PdxCard>
    </div>
  ),
};

export const Hoverable: Story = {
  args: {
    children: (
      <div>
        <h3>Hoverable Card</h3>
        <p>Hover over this card to see the effect</p>
      </div>
    ),
    variant: 'Elevated',
    hoverable: true,
  },
};

export const Clickable: Story = {
  args: {
    children: (
      <div>
        <h3>Clickable Card</h3>
        <p>Click this card to trigger an action</p>
      </div>
    ),
    variant: 'Default',
    clickable: true,
  },
};

export const ProductCard: Story = {
  args: {
    children: (
      <div>
        <div
          style={{
            height: '150px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            marginBottom: '12px',
          }}
        ></div>
        <h4>Product Name</h4>
        <p style={{ color: '#666', marginBottom: '8px' }}>
          Product description goes here
        </p>
        <p style={{ fontWeight: 'bold', fontSize: '18px' }}>$99.99</p>
      </div>
    ),
    variant: 'Elevated',
    padding: 'Medium',
    hoverable: true,
    clickable: true,
  },
};

export const UserCard: Story = {
  args: {
    children: (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#e0e0e0',
            flexShrink: 0,
          }}
        ></div>
        <div>
          <h4 style={{ margin: '0 0 4px 0' }}>John Doe</h4>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            Software Developer
          </p>
        </div>
      </div>
    ),
    variant: 'Bordered',
    padding: 'Medium',
  },
};

export const StatsCard: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}
    >
      <PdxCard variant="Elevated" padding="Medium">
        <h4 style={{ margin: '0 0 8px 0', color: '#666' }}>Total Users</h4>
        <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>1,234</p>
      </PdxCard>
      <PdxCard variant="Elevated" padding="Medium">
        <h4 style={{ margin: '0 0 8px 0', color: '#666' }}>Revenue</h4>
        <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>
          $45.6K
        </p>
      </PdxCard>
      <PdxCard variant="Elevated" padding="Medium">
        <h4 style={{ margin: '0 0 8px 0', color: '#666' }}>Orders</h4>
        <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>567</p>
      </PdxCard>
    </div>
  ),
};
