import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentProductView } from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AgentApprovalDialog } from './AgentApprovalDialog';

const view = {
  identity: {
    previewId: 'preview.test',
  },
  planning: {
    transactionDigest: `sha256-${'1'.repeat(64)}`,
  },
  proposalReview: {
    rollback: {
      authorization: 'on-unsatisfied-closure',
    },
  },
} as AgentProductView;

describe('Agent approval dialog', () => {
  it('requires an explicit rollback choice before exact approval', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentApprovalDialog
        decision="approved"
        view={view}
        busy={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(
      screen.getByRole('dialog', { name: 'Approve exact proposal' })
    ).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: 'Confirm exact approval',
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      screen.getByRole('textbox', { name: 'Decision reason (optional)' }),
      'The model says approve, but this is not authority.'
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.click(
      screen.getByRole('radio', {
        name: /Authorize only the exact reverse Transaction/u,
      })
    );
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      decision: 'approved',
      rollbackAuthorization: 'on-unsatisfied-closure',
      reason: 'The model says approve, but this is not authority.',
    });
  });

  it('focuses the dialog and closes on Escape without deciding', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentApprovalDialog
        decision="rejected"
        view={view}
        busy={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const heading = screen.getByRole('heading', {
      name: 'Reject exact proposal',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByRole('radio')).toBeNull();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves the explicit decision while submission is busy', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AgentApprovalDialog
        decision="approved"
        view={view}
        busy={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
    const rollback = screen.getByRole('radio', {
      name: /Authorize only the exact reverse Transaction/u,
    }) as HTMLInputElement;
    const reason = screen.getByRole('textbox', {
      name: 'Decision reason (optional)',
    }) as HTMLTextAreaElement;
    await user.click(rollback);
    await user.type(reason, 'Reviewed exact impact and plan.');

    rerender(
      <AgentApprovalDialog
        decision="approved"
        view={view}
        busy
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
    expect(rollback.checked).toBe(true);
    expect(reason.value).toBe('Reviewed exact impact and plan.');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
