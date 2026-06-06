import type { Meta, StoryObj } from '@storybook/react';
import PdxTree, { type PdxTreeNode } from './PdxTree';

const data: PdxTreeNode[] = [
  {
    id: 'root',
    label: 'Workspace',
    children: [
      {
        id: 'design',
        label: 'Design',
        children: [
          { id: 'wireframes', label: 'Wireframes' },
          { id: 'mockups', label: 'Mockups' },
        ],
      },
      {
        id: 'docs',
        label: 'Docs',
        children: [
          { id: 'guides', label: 'Guides' },
          { id: 'specs', label: 'Specs' },
        ],
      },
    ],
  },
];

const meta: Meta<typeof PdxTree> = {
  title: 'Components/Tree',
  component: PdxTree,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxTree>;

export const Default: Story = {
  args: {
    data,
    defaultExpandedKeys: ['root', 'design'],
    selectedKey: 'wireframes',
  },
};
