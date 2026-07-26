import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxStack from './PdxStack';

describe('PdxStack', () => {
  it('renders its children in order', () => {
    render(
      <PdxStack>
        <span>Blueprint</span>
        <span>NodeGraph</span>
      </PdxStack>
    );

    expect(screen.getByText('Blueprint')).toBeVisible();
    expect(screen.getByText('NodeGraph')).toBeVisible();
  });

  it('keeps the semantics of the element it is rendered as', () => {
    render(
      <PdxStack as="ul" direction="Row">
        <li>pir</li>
        <li>workspace</li>
      </PdxStack>
    );

    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('forwards click handling to the caller', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxStack onClick={onClick}>
        <button type="button">Publish</button>
      </PdxStack>
    );

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
