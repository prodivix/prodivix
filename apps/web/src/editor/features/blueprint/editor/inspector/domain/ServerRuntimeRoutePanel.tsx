import {
  createWorkspaceServerRuntimeCandidateKey,
  type WorkspaceServerRuntimeAuthoringCandidate,
  type WorkspaceServerRuntimeRouteSlot,
} from '@prodivix/workspace';
import { useInspectorContext } from '../InspectorContext';

const slots = Object.freeze([
  { slot: 'guard' as const, label: 'Guard' },
  { slot: 'loader' as const, label: 'Loader' },
  { slot: 'action' as const, label: 'Action' },
]);

export const formatServerRuntimeAuthPolicy = (
  candidate: WorkspaceServerRuntimeAuthoringCandidate
): string =>
  candidate.definition.auth.kind === 'permission'
    ? `permission:${candidate.definition.auth.permissionId}`
    : candidate.definition.auth.kind;

export const formatServerRuntimeCandidateLabel = (
  candidate: WorkspaceServerRuntimeAuthoringCandidate
): string =>
  `${candidate.documentPath}#${candidate.reference.exportName} · ${formatServerRuntimeAuthPolicy(candidate)} · ${candidate.definition.runtimeZone}/${candidate.definition.effect} · ${candidate.definition.adapterId}`;

const currentCandidateKey = (
  runtimeRefs: ReadonlyArray<{
    kind: WorkspaceServerRuntimeRouteSlot;
    artifactId: string;
    exportName?: string;
  }>,
  slot: WorkspaceServerRuntimeRouteSlot
): string | undefined => {
  const reference = runtimeRefs.find(({ kind }) => kind === slot);
  return reference?.exportName
    ? createWorkspaceServerRuntimeCandidateKey({
        artifactId: reference.artifactId,
        exportName: reference.exportName,
      })
    : undefined;
};

export function ServerRuntimeRoutePanel() {
  const {
    t,
    activeRouteDetails,
    serverRuntimeCandidates,
    serverRuntimeIssues,
    serverRuntimeWriteAvailable,
    setServerRuntimeBinding,
    createWorkspaceOwnerGuard,
    openServerRuntimeArtifact,
  } = useInspectorContext();
  if (!activeRouteDetails) return null;

  return (
    <section className="rounded-md border border-(--border-default) px-3 py-2.5">
      <div className="text-[11px] font-medium text-(--text-primary)">
        {t('inspector.serverRuntime.title', {
          defaultValue: 'Auth & Server Runtime',
        })}
      </div>
      <div className="mt-0.5 text-[10px] leading-4 text-(--text-muted)">
        {t('inspector.serverRuntime.description', {
          defaultValue:
            'Bind canonical Server Functions to the active route without copying source or authority material.',
        })}
      </div>
      <div className="mt-1 truncate text-[10px] text-(--text-secondary)">
        {activeRouteDetails.path}
      </div>

      {serverRuntimeIssues.length ? (
        <div className="mt-2 grid gap-1" role="alert">
          {serverRuntimeIssues.map((issue) => (
            <div
              key={`${issue.code}:${issue.slot}:${issue.artifactId}`}
              className="rounded bg-(--bg-raised) px-2 py-1 text-[10px] text-(--text-secondary)"
            >
              [{issue.code}] {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 grid gap-2">
        {slots.map(({ slot, label }) => {
          const currentRef = activeRouteDetails.runtimeRefs.find(
            ({ kind }) => kind === slot
          );
          const key = currentCandidateKey(activeRouteDetails.runtimeRefs, slot);
          const currentCandidate = key
            ? serverRuntimeCandidates.find((candidate) => candidate.key === key)
            : undefined;
          const candidates = serverRuntimeCandidates.filter(
            (candidate) => candidate.slot === slot
          );
          const unavailableValue =
            currentRef && !currentCandidate ? `unavailable:${slot}` : '';
          return (
            <div key={slot} className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`server-runtime-${slot}`}
                  className="text-[10px] font-medium text-(--text-secondary)"
                >
                  {label}
                </label>
                {currentRef ? (
                  <button
                    type="button"
                    className="text-[10px] text-(--text-muted) hover:text-(--text-primary)"
                    onClick={() =>
                      openServerRuntimeArtifact(currentRef.artifactId)
                    }
                  >
                    {t('inspector.serverRuntime.openCode', {
                      defaultValue: 'Edit code',
                    })}
                  </button>
                ) : null}
              </div>
              <select
                id={`server-runtime-${slot}`}
                aria-label={`${label} Server Function`}
                className="min-w-0 rounded-md border border-(--border-default) bg-(--bg-canvas) px-2 py-1.5 text-[10px] text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-50"
                value={currentCandidate?.key ?? unavailableValue}
                disabled={!serverRuntimeWriteAvailable}
                onChange={(event) =>
                  setServerRuntimeBinding(slot, event.target.value || undefined)
                }
              >
                <option value="">
                  {t('inspector.serverRuntime.unbound', {
                    defaultValue: 'Not bound',
                  })}
                </option>
                {unavailableValue ? (
                  <option value={unavailableValue} disabled>
                    {t('inspector.serverRuntime.unavailable', {
                      defaultValue: 'Invalid or unavailable binding',
                    })}
                  </option>
                ) : null}
                {candidates.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {formatServerRuntimeCandidateLabel(candidate)}
                  </option>
                ))}
              </select>
              {currentCandidate ? (
                <div className="text-[9px] leading-3.5 break-all text-(--text-muted)">
                  {formatServerRuntimeAuthPolicy(currentCandidate)} ·{' '}
                  {currentCandidate.definition.adapterId}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="rounded-md border border-(--border-default) px-2 py-1.5 text-[10px] text-(--text-secondary) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!serverRuntimeWriteAvailable}
          onClick={() => createWorkspaceOwnerGuard('remote-live')}
        >
          {t('inspector.serverRuntime.createRemoteOwner', {
            defaultValue: 'Create Remote owner guard',
          })}
        </button>
        <button
          type="button"
          className="rounded-md border border-(--border-default) px-2 py-1.5 text-[10px] text-(--text-secondary) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!serverRuntimeWriteAvailable}
          onClick={() => createWorkspaceOwnerGuard('isolated-production')}
        >
          {t('inspector.serverRuntime.createIsolatedOwner', {
            defaultValue: 'Create isolated owner guard',
          })}
        </button>
      </div>
      {!serverRuntimeWriteAvailable ? (
        <div className="mt-2 text-[9px] leading-3.5 text-(--text-muted)">
          {t('inspector.serverRuntime.readonly', {
            defaultValue:
              'This route is read-only or owned by a mounted Route module.',
          })}
        </div>
      ) : null}
    </section>
  );
}
