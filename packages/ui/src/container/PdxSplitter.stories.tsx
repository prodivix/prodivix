import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import PdxSplitter from './PdxSplitter';

const meta: Meta<typeof PdxSplitter> = {
  title: 'Components/Splitter',
  component: PdxSplitter,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['Horizontal', 'Vertical'],
      description: '窗格排布轴向',
    },
    keyboardStep: {
      control: 'number',
      description: '方向键每次移动的像素数，按住 Shift 放大步长',
    },
    onSizesChange: { action: 'sizes changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxSplitter>;

const surface = (label: string) => (
  <div
    style={{
      height: '100%',
      padding: 'var(--spacing-md)',
      color: 'var(--text-secondary)',
      fontSize: 'var(--font-size-sm)',
    }}
  >
    {label}
  </div>
);

const frame = (children: ReactNode) => (
  <div
    style={{
      height: '320px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-canvas)',
      overflow: 'hidden',
    }}
  >
    {children}
  </div>
);

export const Default: Story = {
  render: (args) => frame(<PdxSplitter {...args} />),
  args: {
    defaultSizes: [240],
    panes: [
      {
        key: 'sidebar',
        label: 'Sidebar',
        content: surface('Sidebar — drag or focus the divider and press ←/→'),
        minSize: 140,
        maxSize: 420,
      },
      { key: 'editor', content: surface('Editor'), minSize: 200 },
    ],
  },
};

export const Stacked: Story = {
  render: (args) => frame(<PdxSplitter {...args} />),
  args: {
    orientation: 'Vertical',
    defaultSizes: [180],
    panes: [
      {
        key: 'canvas',
        label: 'Canvas',
        content: surface('Canvas — press ↑/↓ on the divider'),
        minSize: 80,
      },
      { key: 'console', content: surface('Console'), minSize: 80 },
    ],
  },
};

export const ThreePanes: Story = {
  render: (args) => frame(<PdxSplitter {...args} />),
  args: {
    defaultSizes: [200, 320],
    panes: [
      {
        key: 'files',
        label: 'Files',
        content: surface('Files'),
        minSize: 140,
      },
      {
        key: 'code',
        label: 'Code',
        content: surface('Code'),
        minSize: 200,
      },
      { key: 'preview', content: surface('Preview'), minSize: 160 },
    ],
  },
};

export const EditorLayout: Story = {
  render: () =>
    frame(
      <PdxSplitter
        defaultSizes={[220]}
        panes={[
          {
            key: 'explorer',
            label: 'Explorer',
            content: surface('Explorer'),
            minSize: 160,
            maxSize: 380,
          },
          {
            key: 'workspace',
            content: (
              <PdxSplitter
                defaultSizes={[200]}
                orientation="Vertical"
                panes={[
                  {
                    key: 'canvas',
                    label: 'Canvas',
                    content: surface('Canvas'),
                    minSize: 100,
                  },
                  {
                    key: 'issues',
                    content: surface('Issues'),
                    minSize: 60,
                  },
                ]}
                style={{ height: '100%' }}
              />
            ),
          },
        ]}
      />
    ),
};
