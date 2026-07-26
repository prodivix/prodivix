import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxCollapse from './PdxCollapse';

const items = [
  { key: 'first', title: 'Connection', content: 'Connection content' },
  { key: 'second', title: 'Schedule', content: 'Schedule content' },
  {
    key: 'third',
    title: 'Locked',
    content: 'Locked content',
    disabled: true,
  },
];

describe('PdxCollapse', () => {
  it('reports expansion on the trigger and reveals the region it controls', async () => {
    const user = userEvent.setup();

    render(<PdxCollapse items={items} />);

    expect(
      screen.getByRole('button', { name: 'Connection', expanded: false })
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Connection' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Connection' }));

    expect(
      screen.getByRole('button', { name: 'Connection', expanded: true })
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Connection' })
    ).toHaveTextContent('Connection content');
  });

  it('moves between headers with arrow keys, Home and End', async () => {
    const user = userEvent.setup();

    render(<PdxCollapse items={items} />);
    screen.getByRole('button', { name: 'Connection' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('button', { name: 'Schedule' })).toHaveFocus();

    await user.keyboard('{End}');

    expect(screen.getByRole('button', { name: 'Locked' })).toHaveFocus();

    await user.keyboard('{Home}');

    expect(screen.getByRole('button', { name: 'Connection' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');

    expect(screen.getByRole('button', { name: 'Locked' })).toHaveFocus();
  });

  it('announces an unavailable section instead of dropping it from the keyboard path', async () => {
    const onExpandedKeysChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxCollapse items={items} onExpandedKeysChange={onExpandedKeysChange} />
    );
    const locked = screen.getByRole('button', { name: 'Locked' });

    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).not.toBeDisabled();

    await user.click(locked);

    expect(onExpandedKeysChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Locked' })).toBeNull();
  });

  it('keeps a single section open in accordion mode', async () => {
    const user = userEvent.setup();

    render(
      <PdxCollapse accordion defaultActiveKeys={['first']} items={items} />
    );
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(
      screen.getByRole('button', { name: 'Connection', expanded: false })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Schedule', expanded: true })
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Connection' })).toBeNull();
  });

  it('reports the expanded keys a controlled owner should store', async () => {
    const onExpandedKeysChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxCollapse items={items} onExpandedKeysChange={onExpandedKeysChange} />
    );
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(onExpandedKeysChange).toHaveBeenCalledWith(['second']);
  });
});
