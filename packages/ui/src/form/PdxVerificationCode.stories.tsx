import type { Meta, StoryObj } from '@storybook/react';
import PdxVerificationCode from './PdxVerificationCode';

const meta: Meta<typeof PdxVerificationCode> = {
  title: 'Components/VerificationCode',
  component: PdxVerificationCode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PdxVerificationCode>;

export const Default: Story = {
  args: {
    label: 'Verification code',
    length: 6,
  },
};

export const WithSeparator: Story = {
  args: {
    label: 'Code',
    length: 4,
    separator: '-',
  },
};

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PdxVerificationCode label="Default" length={6} />
      <PdxVerificationCode
        label="Error"
        length={6}
        state="Error"
        message="Invalid code"
      />
      <PdxVerificationCode
        label="Warning"
        length={6}
        state="Warning"
        message="Expiring soon"
      />
      <PdxVerificationCode
        label="Success"
        length={6}
        state="Success"
        message="Verified"
      />
    </div>
  ),
};
