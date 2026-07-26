import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxMessage from './PdxMessage';

describe('PdxMessage', () => {
  it('announces confirmations politely and problems assertively', () => {
    const view = render(<PdxMessage text="Draft saved" type="Success" />);

    const polite = screen.getByRole('status');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(polite).toHaveAttribute('aria-atomic', 'true');

    view.rerender(<PdxMessage text="Upload failed" type="Danger" />);

    const assertive = screen.getByRole('alert');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
  });

  it('states its type in text, not only in colour', () => {
    render(<PdxMessage text="Upload failed" type="Danger" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Error');
  });

  it('drops the spoken type when the caller says the copy already carries it', () => {
    render(
      <PdxMessage text="Error: upload failed" type="Danger" typeLabel={null} />
    );

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Error: upload failed');
    expect(message.textContent).toBe('Error: upload failed');
  });

  it('does not take focus when it appears', async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <button type="button">Retry</button>
        <div />
      </>
    );

    await user.tab();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toHaveFocus();

    view.rerender(
      <>
        <button type="button">Retry</button>
        <PdxMessage text="Upload failed" type="Danger" />
      </>
    );

    expect(retry).toHaveFocus();
  });

  it('dismisses from the keyboard', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PdxMessage closable onClose={onClose} text="Draft saved" />);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Dismiss message' })
    ).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
