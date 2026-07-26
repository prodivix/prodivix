import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useState } from 'react';
import PdxModal from './PdxModal';
import PdxButton from '../button/PdxButton';

const meta: Meta<typeof PdxModal> = {
  title: 'Components/Modal',
  component: PdxModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PdxModal>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirm action',
    children: 'Are you sure you want to continue?',
    footer: (
      <>
        <PdxButton text="Cancel" size="Small" variant="Secondary" />
        <PdxButton text="Confirm" size="Small" variant="Primary" />
      </>
    ),
  },
};

function InteractiveModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PdxButton
        onClick={() => setOpen(true)}
        text="Open modal"
        variant="Primary"
      />
      <PdxModal
        description="Review the changes before continuing."
        footer={
          <PdxButton
            onClick={() => setOpen(false)}
            text="Done"
            variant="Primary"
          />
        }
        onOpenChange={setOpen}
        open={open}
        title="Review changes"
      >
        The dialog traps focus while open and restores it when closed.
      </PdxModal>
    </>
  );
}

function CloseReasonModal() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('not closed yet');

  return (
    <>
      <PdxButton
        onClick={() => setOpen(true)}
        text="Open modal"
        variant="Primary"
      />
      <p>Last close reason: {reason}</p>
      <PdxModal
        description="Escape, the scrim and the close button are three different answers."
        footer={
          <PdxButton
            onClick={() => {
              setOpen(false);
              setReason('Programmatic');
            }}
            text="Save"
            variant="Primary"
          />
        }
        onClose={setReason}
        onOpenChange={setOpen}
        open={open}
        title="Unsaved changes"
      >
        Dismiss this dialog in different ways and watch the reason change.
      </PdxModal>
    </>
  );
}

/**
 * A dismissal is not one event. `onClose` names which one it was so a caller
 * can treat "cancel" and "close" differently.
 */
export const CloseReason: Story = {
  render: () => <CloseReasonModal />,
};

export const Interactive: Story = {
  render: () => <InteractiveModal />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: 'Open modal' });
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(
        page.getByRole('dialog', { name: 'Review changes' })
      ).toBeVisible();
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(page.queryByRole('dialog', { name: 'Review changes' })).toBeNull();
    });
    await expect(trigger).toHaveFocus();
  },
};
