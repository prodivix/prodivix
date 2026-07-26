import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxNavbar from './PdxNavbar';

const items = [
  { label: 'Overview', href: '#overview', active: true },
  { label: 'Projects', href: '#projects' },
  { label: 'Billing', disabled: true },
];

describe('PdxNavbar', () => {
  it('names its landmark by default', () => {
    render(<PdxNavbar brand="Prodivix" items={items} />);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  it('takes a caller-supplied landmark name so several bars can coexist', () => {
    render(<PdxNavbar items={items} navigationLabel="Account" />);

    expect(screen.getByRole('navigation', { name: 'Account' })).toBeVisible();
  });

  it('marks the active destination as the current page', () => {
    render(<PdxNavbar items={items} />);

    expect(
      screen.getByRole('link', { name: 'Overview', current: 'page' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Projects', current: false })
    ).toBeVisible();
  });

  it('reports the selected item and its position', async () => {
    const onItemSelect = vi.fn();
    const user = userEvent.setup();

    render(<PdxNavbar items={items} onItemSelect={onItemSelect} />);
    await user.click(screen.getByRole('link', { name: 'Projects' }));

    expect(onItemSelect).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Projects' }),
      1
    );
  });

  it('announces an unavailable item instead of skipping it silently', async () => {
    const onItemSelect = vi.fn();
    const user = userEvent.setup();

    render(<PdxNavbar items={items} onItemSelect={onItemSelect} />);
    const billing = screen.getByRole('button', { name: 'Billing' });

    expect(billing).toHaveAttribute('aria-disabled', 'true');
    expect(billing).not.toBeDisabled();

    await user.click(billing);

    expect(onItemSelect).not.toHaveBeenCalled();
  });
});
