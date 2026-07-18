import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Route, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID } from '@prodivix/server-runtime';
import { createWorkspaceServerRuntimeAuthConfigurationPlan } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { buildWorkspaceAuthServerRuntimeModel } from './workspaceAuthServerRuntime';

const WORKSPACE_OWNER_PERMISSION_ID = 'workspace.owner';

const createId = (prefix: string): string => {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
};

export function AuthServerRuntimeResourcePage() {
  const { t } = useTranslation('editor');
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const model = useMemo(
    () => (workspace ? buildWorkspaceAuthServerRuntimeModel(workspace) : null),
    [workspace]
  );
  const permissionIds =
    model?.configuration.status === 'ready'
      ? model.configuration.permissionIds
      : [];
  const ownerPermissionDeclared = permissionIds.includes(
    WORKSPACE_OWNER_PERMISSION_ID
  );
  const providerEnabled = model?.configuration.status === 'ready';
  const providerSupported =
    providerEnabled &&
    model.configuration.providerId ===
      PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID;

  const persistConfiguration = async (nextPermissionIds: readonly string[]) => {
    const editor = useEditorStore.getState();
    const currentWorkspace = editor.workspace;
    if (!currentWorkspace) return;
    const plan = createWorkspaceServerRuntimeAuthConfigurationPlan({
      workspace: currentWorkspace,
      providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
      permissionIds: nextPermissionIds,
      documentId: createId('server-runtime-auth-config'),
      operationId: createId('server-runtime-auth-update'),
      issuedAt: new Date().toISOString(),
    });
    if (plan.status === 'unchanged') {
      setMessage(t('resourceManager.auth.feedback.unchanged'));
      return;
    }
    if (plan.status === 'rejected') {
      setMessage(plan.message);
      return;
    }
    setSaving(true);
    setMessage('');
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: plan.operation,
      readonly: editor.workspaceReadonly,
      workspace: currentWorkspace,
    });
    setSaving(false);
    setMessage(
      outcome.status === 'applied'
        ? t('resourceManager.auth.feedback.saved')
        : outcome.message
    );
  };

  const toggleWorkspaceOwner = () => {
    const next = ownerPermissionDeclared
      ? permissionIds.filter(
          (permissionId) => permissionId !== WORKSPACE_OWNER_PERMISSION_ID
        )
      : [...permissionIds, WORKSPACE_OWNER_PERMISSION_ID];
    void persistConfiguration(next);
  };

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
          <ShieldCheck size={14} />
          {t('resourceManager.auth.header.badge')}
        </p>
        <h2 className="mt-2 text-base font-medium text-(--text-primary)">
          {t('resourceManager.auth.header.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-(--text-secondary)">
          {t('resourceManager.auth.header.description')}
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="grid content-start gap-4">
          <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
                  <KeyRound size={14} />
                  {t('resourceManager.auth.provider.badge')}
                </p>
                <h3 className="mt-2 text-sm font-medium text-(--text-primary)">
                  {t('resourceManager.auth.provider.productSession')}
                </h3>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  {t('resourceManager.auth.provider.description')}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  providerSupported
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-black/10 bg-black/[0.02] text-(--text-secondary)'
                }`}
              >
                {providerSupported
                  ? t('resourceManager.auth.status.enabled')
                  : t('resourceManager.auth.status.disabled')}
              </span>
            </div>
            {model?.configuration.status === 'invalid' ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                <span>
                  {model.configuration.path}: {model.configuration.message}
                </span>
              </div>
            ) : null}
            {!providerSupported ? (
              <button
                type="button"
                disabled={
                  workspaceReadonly ||
                  saving ||
                  model?.configuration.status === 'invalid'
                }
                onClick={() => void persistConfiguration(permissionIds)}
                className="mt-4 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? t('resourceManager.auth.actions.saving')
                  : t('resourceManager.auth.actions.enable')}
              </button>
            ) : null}
          </article>

          <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
            <p className="text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
              {t('resourceManager.auth.permissions.badge')}
            </p>
            <label className="mt-3 flex items-start gap-3 rounded-xl border border-black/8 p-3">
              <input
                type="checkbox"
                checked={ownerPermissionDeclared}
                disabled={!providerSupported || workspaceReadonly || saving}
                onChange={toggleWorkspaceOwner}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-(--text-primary)">
                  {WORKSPACE_OWNER_PERMISSION_ID}
                </span>
                <span className="mt-1 block text-xs text-(--text-secondary)">
                  {t('resourceManager.auth.permissions.workspaceOwner')}
                </span>
              </span>
            </label>
            <p className="mt-3 text-xs text-(--text-muted)">
              {t('resourceManager.auth.permissions.referenceOnly')}
            </p>
          </article>
        </div>

        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
              <Route size={14} />
              {t('resourceManager.auth.bindings.badge')}
            </p>
            <span className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-(--text-secondary)">
              {model?.bindings.length ?? 0}
            </span>
          </div>
          <div className="mt-4 grid gap-2">
            {model?.bindings.length ? (
              model.bindings.map((binding) => (
                <div
                  key={binding.key}
                  className="rounded-xl border border-black/8 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-(--text-primary)">
                        {binding.routeNodeId} · {binding.slot}
                      </p>
                      <p className="mt-1 truncate text-xs text-(--text-secondary)">
                        {binding.documentPath}#{binding.exportName}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        binding.issueCodes.length
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {binding.issueCodes.length
                        ? t('resourceManager.auth.status.blocked')
                        : t('resourceManager.auth.status.ready')}
                    </span>
                  </div>
                  {binding.permissionId ? (
                    <p className="mt-2 text-[11px] text-(--text-muted)">
                      {t('resourceManager.auth.bindings.permission', {
                        permissionId: binding.permissionId,
                      })}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-black/10 p-4 text-sm text-(--text-secondary)">
                {t('resourceManager.auth.bindings.empty')}
              </p>
            )}
          </div>
        </article>
      </div>

      {message ? (
        <p className="rounded-xl border border-black/8 bg-(--bg-canvas) px-4 py-3 text-sm text-(--text-secondary)">
          {message}
        </p>
      ) : null}
    </section>
  );
}
