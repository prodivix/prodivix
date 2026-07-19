import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const listWorkspaceExecutionRoles = vi.hoisted(() => vi.fn());
const putWorkspaceExecutionRole = vi.hoisted(() => vi.fn());
const deleteWorkspaceExecutionRole = vi.hoisted(() => vi.fn());

vi.mock('@/editor/editorApi', () => ({
  editorApi: {
    listWorkspaceExecutionRoles,
    putWorkspaceExecutionRole,
    deleteWorkspaceExecutionRole,
  },
}));

import { WorkspaceCollaborationSettings } from './WorkspaceCollaborationSettings';

describe('WorkspaceCollaborationSettings', () => {
  beforeEach(() => {
    listWorkspaceExecutionRoles.mockReset();
    putWorkspaceExecutionRole.mockReset();
    deleteWorkspaceExecutionRole.mockReset();
  });

  it('loads, grants, and revokes canonical Workspace roles', async () => {
    listWorkspaceExecutionRoles
      .mockResolvedValueOnce([
        {
          principalId: 'editor-1',
          principalEmail: 'editor@example.test',
          principalName: 'Editor',
          role: 'editor',
          grantedAt: '2026-07-20T01:02:03Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          principalId: 'editor-1',
          principalEmail: 'editor@example.test',
          principalName: 'Editor',
          role: 'editor',
          grantedAt: '2026-07-20T01:02:03Z',
        },
      ])
      .mockResolvedValue([]);
    putWorkspaceExecutionRole.mockResolvedValue(undefined);
    deleteWorkspaceExecutionRole.mockResolvedValue(undefined);

    render(
      <WorkspaceCollaborationSettings
        token="token-1"
        workspaceId="workspace-1"
      />
    );

    expect(
      (await screen.findByTestId('workspace-collaborator-editor-1')).textContent
    ).toContain('editor@example.test');
    expect(listWorkspaceExecutionRoles).toHaveBeenCalledWith(
      'token-1',
      'workspace-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    fireEvent.change(
      screen.getByLabelText('settings.project.rows.workspaceRoles.add.email'),
      { target: { value: 'viewer@example.test' } }
    );
    fireEvent.click(screen.getByTestId('workspace-collaborator-save'));
    await waitFor(() =>
      expect(putWorkspaceExecutionRole).toHaveBeenCalledWith(
        'token-1',
        'workspace-1',
        'viewer@example.test',
        'viewer'
      )
    );

    fireEvent.click(
      screen
        .getByTestId('workspace-collaborator-editor-1')
        .querySelector('button')!
    );
    await waitFor(() =>
      expect(deleteWorkspaceExecutionRole).toHaveBeenCalledWith(
        'token-1',
        'workspace-1',
        'editor-1'
      )
    );
  });

  it('stays disabled without an authenticated cloud Workspace', () => {
    render(<WorkspaceCollaborationSettings />);

    expect(
      (screen.getByTestId('workspace-collaborator-save') as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(listWorkspaceExecutionRoles).not.toHaveBeenCalled();
  });
});
