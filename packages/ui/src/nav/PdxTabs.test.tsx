import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxTabs from './PdxTabs';

const items = [
  { key: 'overview', label: 'Overview', content: 'Overview content' },
  {
    key: 'disabled',
    label: 'Disabled',
    content: 'Disabled content',
    disabled: true,
  },
  { key: 'details', label: 'Details', content: 'Details content' },
];

describe('PdxTabs', () => {
  it('moves and activates focus with arrow keys while skipping disabled tabs', async () => {
    const onActiveKeyChange = vi.fn();
    const user = userEvent.setup();

    render(<PdxTabs items={items} onActiveKeyChange={onActiveKeyChange} />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Details content');
    expect(onActiveKeyChange).toHaveBeenCalledWith('details');
  });

  it('jumps to the first and last enabled tab with Home and End', async () => {
    const user = userEvent.setup();

    render(<PdxTabs items={items} />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{End}');

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();

    await user.keyboard('{Home}');

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps only one tab in the tab order so Tab reaches the panel next', async () => {
    const user = userEvent.setup();

    render(<PdxTabs items={items} />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.tab();

    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveFocus();
  });

  it('separates focus from selection in manual activation mode', async () => {
    const user = userEvent.setup();

    render(<PdxTabs activationMode="Manual" items={items} />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Overview content');

    await user.keyboard('{Enter}');

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Details content');
  });

  it('names each panel after the tab that controls it', () => {
    render(<PdxTabs defaultActiveKey="details" items={items} />);

    expect(screen.getByRole('tabpanel', { name: 'Details' })).toBeVisible();
  });

  it('follows the vertical axis when the tablist is vertical', async () => {
    const user = userEvent.setup();

    render(<PdxTabs items={items} orientation="Vertical" />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
  });
});
