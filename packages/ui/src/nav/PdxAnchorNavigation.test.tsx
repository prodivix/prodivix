import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxAnchorNavigation from './PdxAnchorNavigation';

const items = [
  { id: 'intro', label: 'Introduction' },
  { id: 'usage', label: 'Usage' },
  { id: 'api', label: 'API' },
];

describe('PdxAnchorNavigation', () => {
  it('exposes a named landmark over a list of section links', () => {
    render(<PdxAnchorNavigation items={items} />);

    expect(
      screen.getByRole('navigation', { name: 'On this page' })
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks the reading position as a location rather than a page', () => {
    render(<PdxAnchorNavigation activeId="usage" items={items} />);

    expect(
      screen.getByRole('link', { name: 'Usage', current: 'location' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'API', current: false })
    ).toBeVisible();
  });

  it('reports the section the reader asked for', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<PdxAnchorNavigation items={items} onSelect={onSelect} />);
    await user.click(screen.getByRole('link', { name: 'API' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'api' })
    );
  });

  it('keeps the same semantics when laid out horizontally', () => {
    render(
      <PdxAnchorNavigation
        activeId="intro"
        items={items}
        orientation="Horizontal"
      />
    );

    expect(
      screen.getByRole('link', { name: 'Introduction', current: 'location' })
    ).toBeVisible();
  });
});
