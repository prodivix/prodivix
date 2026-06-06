import type { Meta, StoryObj } from '@storybook/react';
import PdxTreeSelect, { type PdxTreeSelectOption } from './PdxTreeSelect';

const options: PdxTreeSelectOption[] = [
  {
    id: 'design',
    label: 'Design',
    children: [
      { id: 'wireframes', label: 'Wireframes' },
      { id: 'mockups', label: 'Mockups' },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      { id: 'frontend', label: 'Frontend' },
      { id: 'backend', label: 'Backend' },
    ],
  },
];

const meta: Meta<typeof PdxTreeSelect> = {
  title: 'Components/TreeSelect',
  component: PdxTreeSelect,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    options,
  },
};

export default meta;

type Story = StoryObj<typeof PdxTreeSelect>;

export const Default: Story = {
  args: {
    label: 'Category',
    placeholder: 'Select category',
  },
};

export const Prefilled: Story = {
  args: {
    label: 'Category',
    value: 'frontend',
  },
};
