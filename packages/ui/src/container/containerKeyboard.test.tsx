import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxCard from './PdxCard';
import PdxTable from '../data/PdxTable';
import PdxDataGrid from '../data/PdxDataGrid';

describe('nested container controls', () => {
  it.each(['{Enter}', ' '] as const)(
    'keeps %s on a Card child button',
    async (key) => {
      const user = userEvent.setup();
      const onCard = vi.fn();
      const onChild = vi.fn();
      render(
        <PdxCard clickable onClick={onCard}>
          <button onClick={onChild}>Edit</button>
          <span>Card title</span>
        </PdxCard>
      );
      screen.getByRole('button', { name: 'Edit' }).focus();
      await user.keyboard(key);
      expect(onChild).toHaveBeenCalledOnce();
      expect(onCard).not.toHaveBeenCalled();
      await user.click(screen.getByText('Card title'));
      expect(onCard).toHaveBeenCalledOnce();
    }
  );

  it('retains direct Card Enter and Space activation', async () => {
    const user = userEvent.setup();
    const onCard = vi.fn();
    render(
      <PdxCard clickable onClick={onCard}>
        Card
      </PdxCard>
    );
    screen.getByRole('button', { name: 'Card' }).focus();
    await user.keyboard('{Enter} ');
    expect(onCard).toHaveBeenCalledTimes(2);
  });

  it.each(['table', 'grid'] as const)(
    'does not select a %s row from a child action',
    async (kind) => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      const onSelectionChange = vi.fn();
      const props = {
        columns: [
          {
            key: 'name',
            title: 'Name',
            render: () => <button onClick={onAction}>Edit row</button>,
          },
        ],
        data: [{ name: 'First' }],
        rowKey: 'name' as const,
        selectionMode: 'Single' as const,
        onSelectionChange,
      };
      render(
        kind === 'table' ? <PdxTable {...props} /> : <PdxDataGrid {...props} />
      );
      screen.getByRole('button', { name: 'Edit row' }).focus();
      await user.keyboard('{Enter} ');
      expect(onAction).toHaveBeenCalledTimes(2);
      expect(onSelectionChange).not.toHaveBeenCalled();
      screen.getByRole('row', { name: 'Edit row' }).focus();
      await user.keyboard('{Enter}');
      expect(onSelectionChange).toHaveBeenCalledWith(['First']);
    }
  );
});
