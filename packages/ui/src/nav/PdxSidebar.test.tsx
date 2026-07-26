import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxSidebar from './PdxSidebar';

const items = [
  { label: 'Overview', href: '#overview', active: true },
  { label: 'Projects', href: '#projects' },
  { label: 'Archive', href: '#archive', disabled: true },
];

describe('PdxSidebar', () => {
  it('names its navigation landmark after the sidebar title', () => {
    render(<PdxSidebar items={items} title="Workspace" />);

    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks the active destination as the current page', () => {
    render(<PdxSidebar items={items} title="Workspace" />);

    expect(
      screen.getByRole('link', { name: 'Overview', current: 'page' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Projects', current: false })
    ).toBeVisible();
  });

  it('reports a selection when an available item is chosen', async () => {
    const onItemSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSidebar items={items} onItemSelect={onItemSelect} title="Workspace" />
    );
    await user.click(screen.getByRole('link', { name: 'Projects' }));

    expect(onItemSelect).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Projects' })
    );
  });

  it('announces an unavailable item and refuses to select it', async () => {
    const onItemSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSidebar items={items} onItemSelect={onItemSelect} title="Workspace" />
    );
    const archive = screen.getByRole('link', { name: 'Archive' });

    expect(archive).toHaveAttribute('aria-disabled', 'true');

    await user.click(archive);

    expect(onItemSelect).not.toHaveBeenCalled();
  });

  it('keeps every item named after the rail collapses', () => {
    render(<PdxSidebar collapsed items={items} title="Workspace" />);

    expect(screen.getByRole('link', { name: 'Projects' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Overview', current: 'page' })
    ).toBeVisible();
  });

  it('lets a caller name the landmark independently of the title', () => {
    render(
      <PdxSidebar
        items={items}
        navigationLabel="Workspace sections"
        title="Workspace"
      />
    );

    expect(
      screen.getByRole('navigation', { name: 'Workspace sections' })
    ).toBeVisible();
  });
});
