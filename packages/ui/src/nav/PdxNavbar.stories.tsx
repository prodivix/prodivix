import type { Meta, StoryObj } from '@storybook/react';
import PdxNavbar from './PdxNavbar';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxNavbar> = {
  title: 'Components/Navbar',
  component: PdxNavbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxNavbar>;

export const Default: Story = {
  args: {
    brand: 'Pdx UI',
    items: [
      { label: 'Home', href: '#', active: true },
      { label: 'Docs', href: '#' },
      { label: 'Pricing', href: '#' },
    ],
    actions: <PdxButton text="Sign in" size="Small" category="Secondary" />,
  },
};

export const Transparent: Story = {
  args: {
    brand: 'Pdx UI',
    items: [
      { label: 'Work', href: '#', active: true },
      { label: 'About', href: '#' },
    ],
    variant: 'Transparent',
  },
};
