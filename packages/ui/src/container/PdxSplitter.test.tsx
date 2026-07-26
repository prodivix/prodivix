import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxSplitter, { type PdxSplitterPane } from './PdxSplitter';

const twoPanes: PdxSplitterPane[] = [
  {
    key: 'sidebar',
    label: 'Sidebar',
    content: 'Sidebar content',
    minSize: 120,
    maxSize: 400,
  },
  { key: 'editor', content: 'Editor content' },
];

describe('PdxSplitter', () => {
  it('resizes with the arrow keys and reports the size on the separator', async () => {
    const onSizesChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSplitter
        defaultSizes={[200]}
        onSizesChange={onSizesChange}
        panes={twoPanes}
      />
    );

    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    divider.focus();
    await user.keyboard('{ArrowRight}');

    expect(divider).toHaveAttribute('aria-valuenow', '216');
    expect(onSizesChange).toHaveBeenLastCalledWith([216]);

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(divider).toHaveAttribute('aria-valuenow', '184');
  });

  it('takes a larger step while shift is held', async () => {
    const user = userEvent.setup();

    render(<PdxSplitter defaultSizes={[200]} panes={twoPanes} />);
    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    divider.focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');

    expect(divider).toHaveAttribute('aria-valuenow', '264');
  });

  it('clamps at the declared bounds and exposes them to assistive tech', async () => {
    const user = userEvent.setup();

    render(<PdxSplitter defaultSizes={[200]} panes={twoPanes} />);
    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });

    expect(divider).toHaveAttribute('aria-valuemin', '120');
    expect(divider).toHaveAttribute('aria-valuemax', '400');

    divider.focus();
    await user.keyboard('{End}');
    expect(divider).toHaveAttribute('aria-valuenow', '400');

    await user.keyboard('{ArrowRight}');
    expect(divider).toHaveAttribute('aria-valuenow', '400');

    await user.keyboard('{Home}');
    expect(divider).toHaveAttribute('aria-valuenow', '120');

    await user.keyboard('{ArrowLeft}');
    expect(divider).toHaveAttribute('aria-valuenow', '120');
  });

  it('collapses and restores the leading pane with Enter', async () => {
    const user = userEvent.setup();

    render(<PdxSplitter defaultSizes={[260]} panes={twoPanes} />);
    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    divider.focus();

    await user.keyboard('{Enter}');
    expect(divider).toHaveAttribute('aria-valuenow', '120');

    await user.keyboard('{Enter}');
    expect(divider).toHaveAttribute('aria-valuenow', '260');
  });

  it('resizes along the block axis when the panes are stacked', async () => {
    const user = userEvent.setup();

    render(
      <PdxSplitter
        defaultSizes={[160]}
        orientation="Vertical"
        panes={twoPanes}
      />
    );

    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    expect(divider).toHaveAttribute('aria-orientation', 'horizontal');

    divider.focus();
    await user.keyboard('{ArrowRight}');
    expect(divider).toHaveAttribute('aria-valuenow', '160');

    await user.keyboard('{ArrowDown}');
    expect(divider).toHaveAttribute('aria-valuenow', '176');
  });

  it('describes a side by side layout with a vertical separator', () => {
    render(<PdxSplitter defaultSizes={[160]} panes={twoPanes} />);

    expect(
      screen.getByRole('separator', { name: 'Resize Sidebar' })
    ).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('follows a pointer drag and keeps the pointer captured', () => {
    const onSizesChange = vi.fn();
    render(
      <PdxSplitter
        defaultSizes={[200]}
        onSizesChange={onSizesChange}
        panes={twoPanes}
      />
    );

    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    const capture = vi.spyOn(divider, 'setPointerCapture');

    fireEvent.pointerDown(divider, {
      button: 0,
      clientX: 300,
      clientY: 0,
      pointerId: 7,
    });
    fireEvent.pointerMove(divider, {
      clientX: 360,
      clientY: 0,
      pointerId: 7,
    });

    expect(capture).toHaveBeenCalledWith(7);
    expect(divider).toHaveAttribute('aria-valuenow', '260');

    // A move belonging to another pointer must not steal the drag.
    fireEvent.pointerMove(divider, { clientX: 10, clientY: 0, pointerId: 9 });
    expect(divider).toHaveAttribute('aria-valuenow', '260');

    fireEvent.pointerUp(divider, { clientX: 360, clientY: 0, pointerId: 7 });
    fireEvent.pointerMove(divider, { clientX: 500, clientY: 0, pointerId: 7 });
    expect(divider).toHaveAttribute('aria-valuenow', '260');
  });

  it('ignores a non primary pointer button', () => {
    render(<PdxSplitter defaultSizes={[200]} panes={twoPanes} />);
    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });

    fireEvent.pointerDown(divider, {
      button: 2,
      clientX: 300,
      clientY: 0,
      pointerId: 3,
    });
    fireEvent.pointerMove(divider, {
      clientX: 360,
      clientY: 0,
      pointerId: 3,
    });

    expect(divider).toHaveAttribute('aria-valuenow', '200');
  });

  it('leaves a controlled splitter at the size the caller owns', async () => {
    const onSizesChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <PdxSplitter
        onSizesChange={onSizesChange}
        panes={twoPanes}
        sizes={[200]}
      />
    );

    const divider = screen.getByRole('separator', { name: 'Resize Sidebar' });
    divider.focus();
    await user.keyboard('{ArrowRight}');

    expect(onSizesChange).toHaveBeenLastCalledWith([216]);
    expect(divider).toHaveAttribute('aria-valuenow', '200');

    rerender(
      <PdxSplitter
        onSizesChange={onSizesChange}
        panes={twoPanes}
        sizes={[216]}
      />
    );
    expect(divider).toHaveAttribute('aria-valuenow', '216');
  });

  it('gives every pane boundary its own separator', async () => {
    const user = userEvent.setup();

    render(
      <PdxSplitter
        defaultSizes={[200, 300]}
        panes={[
          { key: 'files', label: 'Files', content: 'Files', minSize: 100 },
          { key: 'code', label: 'Code', content: 'Code', minSize: 100 },
          { key: 'preview', content: 'Preview' },
        ]}
      />
    );

    expect(screen.getAllByRole('separator')).toHaveLength(2);

    const second = screen.getByRole('separator', { name: 'Resize Code' });
    second.focus();
    await user.keyboard('{ArrowRight}');

    expect(second).toHaveAttribute('aria-valuenow', '316');
    expect(
      screen.getByRole('separator', { name: 'Resize Files' })
    ).toHaveAttribute('aria-valuenow', '200');
  });

  it('names a separator by position when the pane has no label', () => {
    render(
      <PdxSplitter
        defaultSizes={[120]}
        panes={[
          { key: 'a', content: 'A' },
          { key: 'b', content: 'B' },
        ]}
      />
    );

    expect(
      screen.getByRole('separator', { name: 'Resize pane 1' })
    ).toBeVisible();
  });

  it('renders a single pane without a separator', () => {
    render(<PdxSplitter panes={[{ key: 'only', content: 'Only pane' }]} />);

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('Only pane')).toBeVisible();
  });
});
