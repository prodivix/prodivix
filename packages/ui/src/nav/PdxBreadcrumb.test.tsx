import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdxBreadcrumb from './PdxBreadcrumb';

const items = [
  { label: 'Home', href: '#home' },
  { label: 'Library', href: '#library' },
  { label: 'Data', href: '#data' },
];

describe('PdxBreadcrumb', () => {
  it('exposes a named navigation landmark wrapping an ordered trail', () => {
    render(<PdxBreadcrumb items={items} />);

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks the last crumb as the current page and leaves the rest plain', () => {
    render(<PdxBreadcrumb items={items} />);

    expect(
      screen.getByRole('link', { name: 'Data', current: 'page' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Library', current: false })
    ).toBeVisible();
  });

  it('still marks the current crumb when it carries no link', () => {
    render(
      <PdxBreadcrumb
        items={[{ label: 'Home', href: '#home' }, { label: 'Data' }]}
      />
    );

    expect(screen.queryByRole('link', { name: 'Data' })).toBeNull();
    expect(screen.getByText('Data')).toHaveAttribute('aria-current', 'page');
  });

  it('accepts a caller-supplied landmark name for a second trail on the page', () => {
    render(<PdxBreadcrumb items={items} navigationLabel="Asset path" />);

    expect(
      screen.getByRole('navigation', { name: 'Asset path' })
    ).toBeVisible();
  });
});
