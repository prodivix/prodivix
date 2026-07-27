import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';

// The page remembers its locale/namespace selection, and this jsdom build ships
// no Storage implementation.
const sessionStorageStub = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
};

const dispatchWorkspaceVfsAuthoringIntent = vi.hoisted(() => vi.fn());

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation: vi.fn(),
  dispatchWorkspaceVfsAuthoringIntent,
}));

import { I18nResourcePage } from './I18nResourcePage';

const workspace = (): WorkspaceSnapshot => ({
  id: 'project-i18n',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: { id: 'root', kind: 'dir', name: '/', parentId: null, children: [] },
  },
  docsById: {},
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const renderPage = (workspaceReadonly: boolean) => {
  act(() =>
    useEditorStore.setState({ workspace: workspace(), workspaceReadonly })
  );
  return render(
    <MemoryRouter initialEntries={['/editor/project/project-i18n/resources']}>
      <Routes>
        <Route
          path="/editor/project/:projectId/resources"
          element={<I18nResourcePage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('I18nResourcePage persistence feedback', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: sessionStorageStub(),
    });
  });

  afterEach(() => {
    dispatchWorkspaceVfsAuthoringIntent.mockReset();
    window.localStorage.clear();
  });

  it('reports a rejected Workspace commit instead of silently reverting the edit', async () => {
    dispatchWorkspaceVfsAuthoringIntent.mockResolvedValue({
      status: 'rejected',
      message: 'Workspace revision drifted.',
    });
    renderPage(false);

    fireEvent.change(screen.getByLabelText('translation-appName-en'), {
      target: { value: 'Renamed' },
    });

    await waitFor(() =>
      expect(
        screen.getByText('resourceManager.i18n.persistFailed')
      ).toBeTruthy()
    );
  });

  it('announces a read-only Workspace and stops translation editing', () => {
    renderPage(true);

    expect(
      screen.getByText('resourceManager.i18n.readonlyNotice')
    ).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>('translation-appName-en').readOnly
    ).toBe(true);
    expect(dispatchWorkspaceVfsAuthoringIntent).not.toHaveBeenCalled();
  });
});
