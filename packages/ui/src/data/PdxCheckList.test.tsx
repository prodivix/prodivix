import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxCheckList from './PdxCheckList';

const items = [
  { label: 'Email notifications', value: 'email', checked: true },
  { label: 'Push notifications', value: 'push' },
];

describe('PdxCheckList', () => {
  it('treats an empty controlled value as the source of truth', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PdxCheckList items={items} onChange={onChange} value={[]} />
    );
    const email = screen.getByRole('checkbox', {
      name: 'Email notifications',
    });

    expect(email).not.toBeChecked();
    await user.click(email);
    expect(onChange).toHaveBeenCalledWith(['email']);
    expect(email).not.toBeChecked();

    rerender(
      <PdxCheckList items={items} onChange={onChange} value={['email']} />
    );
    expect(email).toBeChecked();
  });

  it('reaches every option from the keyboard and toggles with Space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PdxCheckList items={items} onChange={onChange} />);

    await user.tab();
    expect(
      screen.getByRole('checkbox', { name: 'Email notifications' })
    ).toHaveFocus();

    await user.tab();
    const push = screen.getByRole('checkbox', { name: 'Push notifications' });
    expect(push).toHaveFocus();

    await user.keyboard('[Space]');
    expect(onChange).toHaveBeenCalledWith(['email', 'push']);
    expect(push).toBeChecked();
  });

  it('refuses a disabled option and a disabled group', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PdxCheckList
        items={[...items, { disabled: true, label: 'SMS', value: 'sms' }]}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'SMS' }));
    expect(onChange).not.toHaveBeenCalled();

    rerender(<PdxCheckList disabled items={items} onChange={onChange} />);
    await user.click(
      screen.getByRole('checkbox', { name: 'Push notifications' })
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the shared empty state when there is nothing to choose from', () => {
    render(<PdxCheckList items={[]} emptyText="No channels available" />);

    expect(screen.getByText('No channels available')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
