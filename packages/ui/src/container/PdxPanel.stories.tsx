import type { Meta, StoryObj } from '@storybook/react';
import PdxPanel from './PdxPanel';

const meta: Meta<typeof PdxPanel> = {
  title: 'Components/Panel',
  component: PdxPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '面板尺寸',
    },
    variant: {
      control: 'select',
      options: ['Default', 'Bordered', 'Filled'],
      description: '面板样式',
    },
    padding: {
      control: 'select',
      options: ['None', 'Small', 'Medium', 'Large'],
      description: '内边距',
    },
    collapsible: {
      control: 'boolean',
      description: '是否可折叠',
    },
    collapsed: {
      control: 'boolean',
      description: '是否折叠',
    },
    onToggle: { action: 'toggled' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxPanel>;

export const Default: Story = {
  args: {
    children: <p>This is a default panel with medium size and padding.</p>,
    size: 'Medium',
    variant: 'Default',
  },
};

export const WithTitle: Story = {
  args: {
    title: 'Panel Title',
    children: <p>This panel has a title header.</p>,
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
      <PdxPanel size="Small" padding="Small" title="Small Panel">
        <p>Minimum height: 80px</p>
      </PdxPanel>
      <PdxPanel size="Medium" padding="Medium" title="Medium Panel">
        <p>Minimum height: 150px</p>
      </PdxPanel>
      <PdxPanel size="Large" padding="Large" title="Large Panel">
        <p>Minimum height: 250px</p>
      </PdxPanel>
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
      }}
    >
      <PdxPanel variant="Default" title="Default" padding="Medium">
        <p>Default border style</p>
      </PdxPanel>
      <PdxPanel variant="Bordered" title="Bordered" padding="Medium">
        <p>Thicker border style</p>
      </PdxPanel>
      <PdxPanel variant="Filled" title="Filled" padding="Medium">
        <p>Filled background style</p>
      </PdxPanel>
    </div>
  ),
};

export const PaddingOptions: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
      }}
    >
      <PdxPanel padding="None" title="No Padding">
        <p>Panel with no padding</p>
      </PdxPanel>
      <PdxPanel padding="Small" title="Small Padding">
        <p>Panel with small padding (12px)</p>
      </PdxPanel>
      <PdxPanel padding="Medium" title="Medium Padding">
        <p>Panel with medium padding (16px)</p>
      </PdxPanel>
      <PdxPanel padding="Large" title="Large Padding">
        <p>Panel with large padding (24px)</p>
      </PdxPanel>
    </div>
  ),
};

export const Collapsible: Story = {
  args: {
    title: 'Collapsible Panel',
    children: (
      <div>
        <p>This panel can be collapsed and expanded.</p>
        <p>Click the header to toggle visibility.</p>
      </div>
    ),
    collapsible: true,
    collapsed: false,
  },
};

export const Collapsed: Story = {
  args: {
    title: 'Collapsed Panel',
    children: (
      <div>
        <p>This content is hidden by default.</p>
        <p>Click the header to expand.</p>
      </div>
    ),
    collapsible: true,
    collapsed: true,
  },
};

export const InfoPanel: Story = {
  args: {
    title: 'Information',
    variant: 'Filled',
    children: (
      <div>
        <p>
          <strong>Important Notice:</strong>
        </p>
        <p>
          Please read this information carefully before proceeding with your
          action.
        </p>
        <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
          <li>Item one</li>
          <li>Item two</li>
          <li>Item three</li>
        </ul>
      </div>
    ),
    padding: 'Medium',
  },
};

export const SettingsPanel: Story = {
  args: {
    title: 'Settings',
    collapsible: true,
    children: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Option 1
          </label>
          <input type="checkbox" defaultChecked />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Option 2
          </label>
          <input type="checkbox" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Text Input
          </label>
          <input
            type="text"
            placeholder="Enter value..."
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>
      </div>
    ),
    padding: 'Medium',
  },
};

export const MultiplePanels: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '500px',
      }}
    >
      <PdxPanel title="Panel 1" collapsible>
        <p>Content for panel 1</p>
      </PdxPanel>
      <PdxPanel title="Panel 2" collapsible collapsed>
        <p>Content for panel 2</p>
      </PdxPanel>
      <PdxPanel title="Panel 3" collapsible>
        <p>Content for panel 3</p>
      </PdxPanel>
    </div>
  ),
};
