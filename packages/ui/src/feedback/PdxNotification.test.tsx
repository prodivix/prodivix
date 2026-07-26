import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxNotification from './PdxNotification';

describe('PdxNotification', () => {
  it('announces itself through a live region without taking focus', async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <button type="button">Continue</button>
        <div />
      </>
    );

    await user.tab();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toHaveFocus();

    view.rerender(
      <>
        <button type="button">Continue</button>
        <PdxNotification
          description="Version 2.4.0 is available."
          title="Update ready"
        />
      </>
    );

    const notification = screen.getByRole('status');
    expect(notification).toHaveAttribute('aria-live', 'polite');
    expect(notification).toHaveAttribute('aria-atomic', 'true');
    expect(notification).toHaveTextContent('Version 2.4.0 is available.');
    expect(continueButton).toHaveFocus();
  });

  it('interrupts for a problem and states the type in text', () => {
    render(<PdxNotification title="Deploy failed" type="Danger" />);

    const notification = screen.getByRole('alert');
    expect(notification).toHaveAttribute('aria-live', 'assertive');
    expect(notification).toHaveTextContent('Error');
  });

  it('keeps its actions and dismissal reachable by keyboard', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PdxNotification
        actions={<button type="button">Install</button>}
        closable
        onClose={onClose}
        title="Update ready"
      />
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Dismiss notification' })
    ).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
