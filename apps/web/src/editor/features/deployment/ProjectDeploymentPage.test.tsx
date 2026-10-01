import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditorWorkspace,
  resetEditorStore,
} from '@/test-utils/editorStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { createProjectPublicationExpected } from '@/editor/editorApi';
import ProjectDeploymentPage from './ProjectDeploymentPage';

const host = vi.hoisted(() => ({
  token: 'session' as string | null,
  getProject: vi.fn(),
  getWorkspace: vi.fn(),
  publishProject: vi.fn(),
  t: (key: string) => key,
}));
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ token: host.token }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: host.t }) }));
vi.mock('@/editor/editorApi', async (original) => ({
  ...(await original<object>()),
  editorApi: {
    getProject: host.getProject,
    getWorkspace: host.getWorkspace,
    publishProject: host.publishProject,
  },
}));

const workspace = createEditorWorkspace();
const project = {
  id: workspace.id,
  name: 'Publication journey',
  resourceType: 'project' as const,
  isPublic: false,
  starsCount: 0,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const openPage = (projectId = workspace.id) =>
  render(
    <MemoryRouter initialEntries={[`/editor/project/${projectId}/deployment`]}>
      <Routes>
        <Route
          path="/editor/project/:projectId/deployment"
          element={<ProjectDeploymentPage />}
        />
      </Routes>
    </MemoryRouter>
  );

describe('Project Community publication journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host.token = 'session';
    host.getProject.mockResolvedValue({ project });
    host.getWorkspace.mockResolvedValue({ workspace, settings: {} });
    host.publishProject.mockResolvedValue({
      project: { ...project, isPublic: true },
    });
    resetEditorStore({ workspace });
  });

  it('publishes the exact saved document revisions and opens the confirmed public projection', async () => {
    const saved = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'page-home': { ...workspace.docsById['page-home']!, contentRev: 7 },
      },
    };
    host.getWorkspace.mockResolvedValue({ workspace: saved, settings: {} });
    openPage();
    const button = await screen.findByRole('button', {
      name: 'deployment.publish',
    });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    );
    await userEvent.click(button);
    expect(host.publishProject).toHaveBeenCalledWith(
      'session',
      workspace.id,
      createProjectPublicationExpected(saved)
    );
    expect(
      (
        await screen.findByRole('link', { name: 'deployment.viewCommunity' })
      ).getAttribute('href')
    ).toBe(`/community/${workspace.id}`);
    expect(screen.getByRole('status').textContent).toBe('deployment.published');
    expect(useEditorStore.getState().projectsById[workspace.id]?.isPublic).toBe(
      true
    );
    expect(
      screen
        .getByRole('link', { name: 'deployment.openExport' })
        .getAttribute('href')
    ).toBe(`/editor/project/${workspace.id}/export`);
    expect(screen.getByText('pnpm run build')).toBeTruthy();
  });

  it.each(['local', 'signed-out', 'readonly'] as const)(
    'blocks Community publication for %s while retaining code export',
    async (state) => {
      if (state === 'signed-out') host.token = null;
      if (state === 'readonly')
        resetEditorStore({ workspace, workspaceReadonly: true });
      openPage(state === 'local' ? 'local-offline' : workspace.id);
      await waitFor(() =>
        expect(
          (
            screen.getByRole('button', {
              name: 'deployment.publish',
            }) as HTMLButtonElement
          ).disabled
        ).toBe(true)
      );
      expect(host.publishProject).not.toHaveBeenCalled();
      expect(
        screen.getByRole('link', { name: 'deployment.openExport' })
      ).toBeTruthy();
      if (state !== 'readonly')
        expect(host.getWorkspace).not.toHaveBeenCalled();
    }
  );

  it('keeps a failed publication private and refreshes the saved revision before retry', async () => {
    host.publishProject.mockRejectedValueOnce(
      new Error('Workspace changed; refresh the saved revision.')
    );
    openPage();
    const button = screen.getByRole('button', { name: 'deployment.publish' });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    );
    await userEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Workspace changed'
    );
    expect(screen.getByRole('status').textContent).toBe(
      'deployment.unpublished'
    );
    expect(
      screen.queryByRole('link', { name: 'deployment.viewCommunity' })
    ).toBeNull();
    const next = { ...workspace, opSeq: 2, workspaceRev: 2 };
    host.getWorkspace.mockResolvedValueOnce({ workspace: next, settings: {} });
    await userEvent.click(
      screen.getByRole('button', { name: 'deployment.refresh' })
    );
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    );
    await userEvent.click(button);
    expect(host.publishProject).toHaveBeenLastCalledWith(
      'session',
      workspace.id,
      createProjectPublicationExpected(next)
    );
    expect(
      await screen.findByRole('link', { name: 'deployment.viewCommunity' })
    ).toBeTruthy();
  });

  it('rejects a mismatched publication acknowledgement and ignores an unmounted response', async () => {
    host.publishProject.mockResolvedValueOnce({
      project: { ...project, id: 'other-project', isPublic: true },
    });
    const page = openPage();
    const button = screen.getByRole('button', { name: 'deployment.publish' });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    );
    await userEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'did not confirm'
    );
    expect(
      useEditorStore.getState().projectsById[workspace.id]?.isPublic
    ).not.toBe(true);
    let settle!: (result: unknown) => void;
    host.publishProject.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    await userEvent.click(button);
    page.unmount();
    await act(async () => settle({ project: { ...project, isPublic: true } }));
    expect(
      useEditorStore.getState().projectsById[workspace.id]?.isPublic
    ).not.toBe(true);
  });
});
