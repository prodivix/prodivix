import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import EditorBar from '@/editor/EditorBar/EditorBar';
import { EditorShortcutProvider } from '@/editor/shortcuts';
import { resetSettingsStore } from '@/test-utils/editorStore';

let params: { projectId?: string } = { projectId: 'project-123' };

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => params,
}));

vi.mock('@prodivix/ui', () => ({
  PdxIcon: ({ icon }: { icon?: ReactNode }) => <span>{icon}</span>,
  PdxIconLink: ({ to, title }: { to: string; title?: string }) => (
    <a href={to} title={title}>
      {title}
    </a>
  ),
  PdxButton: ({ text, onClick }: { text: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {text}
    </button>
  ),
  PdxModal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <div role="dialog">
        {title && <h3>{title}</h3>}
        <div>{children}</div>
        {footer && <div>{footer}</div>}
      </div>
    ) : null,
}));

const renderEditorBar = () =>
  render(
    <EditorShortcutProvider>
      <EditorBar />
    </EditorShortcutProvider>
  );

describe('EditorBar Escape behavior', () => {
  beforeEach(() => {
    params = { projectId: 'project-123' };
    resetSettingsStore();
  });

  it('opens exit modal on Escape from any in-project route', () => {
    renderEditorBar();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByText('bar.exitTitle')).toBeTruthy();
  });

  it('does not open exit modal on Escape outside a project', () => {
    params = {};
    renderEditorBar();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByText('bar.exitTitle')).toBeNull();
  });
});
