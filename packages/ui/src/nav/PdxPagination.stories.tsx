import type { Meta, StoryObj } from '@storybook/react';
import PdxPagination from './PdxPagination';

const meta: Meta<typeof PdxPagination> = {
  title: 'Components/Pagination',
  component: PdxPagination,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxPagination>;

export const Default: Story = {
  args: {
    page: 2,
    total: 120,
    pageSize: 10,
  },
};

export const FewPages: Story = {
  args: {
    page: 1,
    total: 30,
    pageSize: 10,
  },
};
