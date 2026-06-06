import type { Meta, StoryObj } from '@storybook/react';
import PdxColorPicker from './PdxColorPicker';

const meta: Meta<typeof PdxColorPicker> = {
  title: 'Components/ColorPicker',
  component: PdxColorPicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxColorPicker>;

export const Default: Story = {
  args: {
    label: 'Theme color',
    value: '#2f6fed',
  },
};

export const WithoutTextInput: Story = {
  args: {
    label: 'Accent',
    showTextInput: false,
    value: '#ffb007',
  },
};
