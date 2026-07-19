import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PdxButton, PdxInput, PdxSelect } from '@prodivix/ui';
import {
  editorApi,
  type WorkspaceExecutionRole,
  type WorkspaceExecutionRoleGrant,
} from '@/editor/editorApi';
import { SettingsRow } from './SettingsShared';

type WorkspaceCollaborationSettingsProps = Readonly<{
  token?: string | null;
  workspaceId?: string;
}>;

export const WorkspaceCollaborationSettings = ({
  token,
  workspaceId,
}: WorkspaceCollaborationSettingsProps) => {
  const { t } = useTranslation('editor');
  const [roles, setRoles] = useState<readonly WorkspaceExecutionRoleGrant[]>(
    []
  );
  const [principalEmail, setPrincipalEmail] = useState('');
  const [role, setRole] = useState<WorkspaceExecutionRole>('viewer');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'ready'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const loadError = t(
    'settings.project.rows.workspaceRoles.errors.load',
    'Only the Workspace owner can manage collaborators.'
  );

  const loadRoles = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !workspaceId) {
        setRoles([]);
        setStatus('idle');
        return;
      }
      setStatus('loading');
      setError(null);
      try {
        const next = await editorApi.listWorkspaceExecutionRoles(
          token,
          workspaceId,
          signal ? { signal } : undefined
        );
        if (signal?.aborted) return;
        setRoles(next);
        setStatus('ready');
      } catch {
        if (signal?.aborted) return;
        setRoles([]);
        setError(loadError);
        setStatus('ready');
      }
    },
    [loadError, token, workspaceId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRoles(controller.signal);
    return () => controller.abort();
  }, [loadRoles]);

  const saveRole = async () => {
    if (!token || !workspaceId || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      await editorApi.putWorkspaceExecutionRole(
        token,
        workspaceId,
        principalEmail,
        role
      );
      setPrincipalEmail('');
      await loadRoles();
    } catch {
      setError(
        t(
          'settings.project.rows.workspaceRoles.errors.save',
          'The collaborator could not be saved. Confirm the account email and your owner access.'
        )
      );
      setStatus('ready');
    }
  };

  const revokeRole = async (principalId: string) => {
    if (!token || !workspaceId || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      await editorApi.deleteWorkspaceExecutionRole(
        token,
        workspaceId,
        principalId
      );
      await loadRoles();
    } catch {
      setError(
        t(
          'settings.project.rows.workspaceRoles.errors.revoke',
          'The collaborator could not be removed.'
        )
      );
      setStatus('ready');
    }
  };

  const validEmail =
    principalEmail.trim().includes('@') && principalEmail.trim().length <= 320;
  const unavailable = !token || !workspaceId;

  return (
    <>
      <SettingsRow
        label={t(
          'settings.project.rows.workspaceRoles.add.label',
          'Workspace collaborator'
        )}
        description={t(
          'settings.project.rows.workspaceRoles.add.description',
          'Viewer can run reads. Editor can also create isolated, reviewable source proposals. Neither role receives owner, Environment, or Secret access.'
        )}
        control={
          <div className="flex w-full max-w-[520px] flex-wrap items-center gap-2">
            <PdxInput
              aria-label={t(
                'settings.project.rows.workspaceRoles.add.email',
                'Collaborator account email'
              )}
              disabled={unavailable || status === 'saving'}
              placeholder={t(
                'settings.project.rows.workspaceRoles.add.emailPlaceholder',
                'collaborator@example.com'
              )}
              size="Small"
              value={principalEmail}
              onValueChange={setPrincipalEmail}
            />
            <PdxSelect
              aria-label={t(
                'settings.project.rows.workspaceRoles.add.role',
                'Execution role'
              )}
              disabled={unavailable || status === 'saving'}
              options={[
                {
                  label: t(
                    'settings.project.rows.workspaceRoles.roles.viewer',
                    'Viewer'
                  ),
                  value: 'viewer',
                },
                {
                  label: t(
                    'settings.project.rows.workspaceRoles.roles.editor',
                    'Editor'
                  ),
                  value: 'editor',
                },
              ]}
              size="Small"
              value={role}
              onValueChange={(value) =>
                setRole(value as WorkspaceExecutionRole)
              }
            />
            <PdxButton
              data-testid="workspace-collaborator-save"
              disabled={unavailable || !validEmail || status === 'saving'}
              loading={status === 'saving'}
              loadingText={t(
                'settings.project.rows.workspaceRoles.actions.saving',
                'Saving…'
              )}
              onClick={() => void saveRole()}
              size="Small"
              text={t(
                'settings.project.rows.workspaceRoles.actions.save',
                'Grant role'
              )}
              type="button"
              variant="Primary"
            />
          </div>
        }
      />
      <SettingsRow
        label={t(
          'settings.project.rows.workspaceRoles.current.label',
          'Current collaborators'
        )}
        description={
          unavailable
            ? t(
                'settings.project.rows.workspaceRoles.current.unavailable',
                'Open an authenticated cloud Workspace to manage roles.'
              )
            : t(
                'settings.project.rows.workspaceRoles.current.description',
                'Role changes affect new execution grants. Existing grants remain bounded by their short expiry.'
              )
        }
        control={
          <div
            className="grid w-full max-w-[560px] gap-2"
            data-testid="workspace-collaborator-list"
          >
            {status === 'loading' ? (
              <span className="text-[12px] text-(--text-muted)">
                {t(
                  'settings.project.rows.workspaceRoles.current.loading',
                  'Loading collaborators…'
                )}
              </span>
            ) : null}
            {!unavailable && status !== 'loading' && roles.length === 0 ? (
              <span className="text-[12px] text-(--text-muted)">
                {t(
                  'settings.project.rows.workspaceRoles.current.empty',
                  'No collaborators have an execution role.'
                )}
              </span>
            ) : null}
            {roles.map((grant) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] px-3 py-2 in-data-[theme='dark']:border-[rgba(255,255,255,0.1)]"
                data-testid={`workspace-collaborator-${grant.principalId}`}
                key={grant.principalId}
              >
                <span className="min-w-0 text-[12px]">
                  <strong className="block truncate text-(--text-primary)">
                    {grant.principalName || grant.principalEmail}
                  </strong>
                  <span className="block truncate text-(--text-muted)">
                    {grant.principalEmail} ·{' '}
                    {t(
                      `settings.project.rows.workspaceRoles.roles.${grant.role}`,
                      grant.role
                    )}
                  </span>
                </span>
                <PdxButton
                  disabled={status === 'saving'}
                  onClick={() => void revokeRole(grant.principalId)}
                  size="Small"
                  text={t(
                    'settings.project.rows.workspaceRoles.actions.remove',
                    'Remove'
                  )}
                  tone="Danger"
                  type="button"
                  variant="Ghost"
                />
              </div>
            ))}
            {error ? (
              <span className="text-[12px] text-(--danger-color)" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        }
      />
    </>
  );
};
