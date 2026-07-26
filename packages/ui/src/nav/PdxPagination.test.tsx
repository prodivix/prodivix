import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxPagination from './PdxPagination';

describe('PdxPagination', () => {
  it('exposes a named navigation landmark', () => {
    render(<PdxPagination page={1} total={50} />);

    expect(
      screen.getByRole('navigation', { name: 'Pagination' })
    ).toBeVisible();
  });

  it('marks the page the reader is on', () => {
    render(<PdxPagination page={3} total={50} />);

    expect(
      screen.getByRole('button', { name: 'Go to page 3', current: 'page' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Go to page 4', current: false })
    ).toBeVisible();
  });

  it('announces the first-page edge and refuses to page past it', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(<PdxPagination onPageChange={onPageChange} page={1} total={50} />);
    const previous = screen.getByRole('button', { name: 'Previous page' });

    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).not.toBeDisabled();

    await user.click(previous);

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('keeps the edge button focusable so arriving at the last page does not lose focus', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PdxPagination onPageChange={onPageChange} page={4} total={50} />
    );

    const next = screen.getByRole('button', { name: 'Next page' });
    next.focus();
    await user.click(next);

    expect(onPageChange).toHaveBeenCalledWith(5);

    rerender(<PdxPagination onPageChange={onPageChange} page={5} total={50} />);

    const edge = screen.getByRole('button', { name: 'Next page' });

    expect(edge).toHaveFocus();
    expect(edge).toHaveAttribute('aria-disabled', 'true');
  });

  it('reports the requested page and ignores a request for the current one', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(<PdxPagination onPageChange={onPageChange} page={2} total={50} />);
    await user.click(screen.getByRole('button', { name: 'Go to page 4' }));

    expect(onPageChange).toHaveBeenCalledWith(4);

    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));

    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it('announces every control as unavailable while the whole control is disabled', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxPagination disabled onPageChange={onPageChange} page={3} total={50} />
    );

    expect(
      screen.getByRole('button', { name: 'Go to page 4' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Go to page 4' }));

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('presents the page numbers as a list so their count is announced', () => {
    render(<PdxPagination maxButtons={5} page={1} total={100} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});
