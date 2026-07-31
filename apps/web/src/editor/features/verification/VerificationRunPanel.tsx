import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  CircleDashed,
  CircleSlash2,
  LoaderCircle,
  Play,
  Square,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import {
  applyVerificationRunEvent,
  createVerificationRunEvent,
  createVerificationRunSnapshot,
  isVerificationRunTerminal,
} from '@prodivix/verification';
import type {
  VerificationPlan,
  VerificationPlanCell,
  VerificationRunScope,
  VerificationRunSnapshot,
  VerificationSurface,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useAuthStore } from '@/auth/useAuthStore';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  createVerificationRunClient,
  type VerificationRunClient,
} from './verificationRunClient';

export type VerificationRunRequest = Readonly<{
  scenarioId: string;
  mode: 'run' | 'debug';
}>;

const surfaceOrder = Object.freeze([
  'preview',
  'export',
  'ci',
] satisfies readonly VerificationSurface[]);

const cellsForSurface = (
  plan: VerificationPlan,
  requestedScenarioId?: string
): Readonly<{
  surface: VerificationSurface;
  cells: readonly VerificationPlanCell[];
}> | null => {
  for (const surface of surfaceOrder) {
    const cells = plan.cells.filter(
      (cell) =>
        cell.surface === surface &&
        (!requestedScenarioId || cell.scenarioId === requestedScenarioId)
    );
    if (cells.length) return Object.freeze({ surface, cells });
  }
  return null;
};

export const selectVerificationRunCellIds = (
  plan: VerificationPlan,
  scope: VerificationRunScope,
  requestedScenarioId?: string
): Readonly<{
  surface: VerificationSurface;
  cellIds: readonly string[];
}> | null => {
  const selectionSurface = cellsForSurface(plan, requestedScenarioId);
  if (!selectionSurface) return null;
  const surfaceCells = plan.cells.filter(
    (cell) => cell.surface === selectionSurface.surface
  );
  const byId = new Map(surfaceCells.map((cell) => [cell.id, cell] as const));
  const selected = new Set(
    (scope === 'required'
      ? selectionSurface.cells.filter((cell) => cell.requirement === 'required')
      : scope === 'cell'
        ? selectionSurface.cells.slice(0, 1)
        : selectionSurface.cells
    ).map((cell) => cell.id)
  );
  const includeDependencies = (cellId: string): void => {
    const cell = byId.get(cellId);
    cell?.dependencyCellIds.forEach((dependencyId) => {
      if (selected.has(dependencyId)) return;
      selected.add(dependencyId);
      includeDependencies(dependencyId);
    });
  };
  [...selected].forEach(includeDependencies);
  const cellIds = surfaceCells
    .filter((cell) => selected.has(cell.id))
    .map((cell) => cell.id);
  return cellIds.length
    ? Object.freeze({
        surface: selectionSurface.surface,
        cellIds: Object.freeze(cellIds),
      })
    : null;
};

const runEventInstant = (snapshot: VerificationRunSnapshot): string => {
  const now = Date.now();
  const minimum = Date.parse(snapshot.updatedAt) + 1;
  return new Date(Math.max(now, minimum)).toISOString();
};

const applyEvent = (
  snapshot: VerificationRunSnapshot,
  event: ReturnType<typeof createVerificationRunEvent>
): VerificationRunSnapshot => {
  const result = applyVerificationRunEvent(snapshot, event);
  if (result.status !== 'applied') throw new TypeError(result.message);
  return result.snapshot;
};

const runStatusIcon = (status: string) => {
  if (status === 'passed' || status === 'completed') {
    return <CheckCircle2 size={13} aria-hidden="true" />;
  }
  if (status === 'failed' || status === 'interrupted') {
    return <XCircle size={13} aria-hidden="true" />;
  }
  if (
    status === 'blocked' ||
    status === 'unsupported' ||
    status === 'not-applicable'
  ) {
    return <TriangleAlert size={13} aria-hidden="true" />;
  }
  if (status === 'cancelled') {
    return <CircleSlash2 size={13} aria-hidden="true" />;
  }
  if (status === 'running' || status === 'cancelling') {
    return (
      <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
    );
  }
  return <CircleDashed size={13} aria-hidden="true" />;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'Verification run failed.';

export function VerificationRunPanel({
  workspace,
  plan,
  request,
  onOpenScenario,
}: Readonly<{
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
  request?: VerificationRunRequest;
  onOpenScenario?(scenarioId: string): void;
}>) {
  const { t } = useTranslation('editor');
  const token = useAuthStore((state) => state.token);
  const snapshot = useEditorStore(
    (state) => state.verificationRunByWorkspaceId[workspace.id]
  );
  const setRun = useEditorStore((state) => state.setVerificationRun);
  const client = useMemo<VerificationRunClient | undefined>(
    () =>
      token && !isLocalProjectId(workspace.id)
        ? createVerificationRunClient({ accessToken: token })
        : undefined,
    [token, workspace.id]
  );
  const [loading, setLoading] = useState(Boolean(client));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const current =
    snapshot?.planDigest === plan.planDigest &&
    snapshot.workspaceRevision === plan.targetRevision
      ? snapshot
      : undefined;

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    void client
      .listRuns({
        workspaceId: workspace.id,
        workspaceRevision: plan.targetRevision,
        planDigest: plan.planDigest,
        limit: 1,
        signal: controller.signal,
      })
      .then((runs) => {
        if (active && runs[0]) setRun(workspace.id, runs[0]);
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setMessage(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, plan.planDigest, plan.targetRevision, setRun, workspace.id]);

  const start = async (scope: VerificationRunScope) => {
    if (pending || plan.status !== 'ready') return;
    const selected = selectVerificationRunCellIds(
      plan,
      scope,
      request?.scenarioId
    );
    if (!selected) {
      setMessage(t('resourceManager.verification.runs.noMatchingCells'));
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const runId = `run-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      let next = createVerificationRunSnapshot({
        runId,
        plan,
        surface: selected.surface,
        scope,
        providerId: 'web-scheduler',
        origin: 'web',
        selectedCellIds: selected.cellIds,
        attemptIdByCellId: Object.freeze(
          Object.fromEntries(
            selected.cellIds.map((cellId, index) => [
              cellId,
              `attempt-${runId}-${String(index + 1)}`,
            ])
          )
        ),
        createdAt,
      });
      if (client) next = await client.createRun({ snapshot: next });
      if (next.status === 'queued') {
        const started = createVerificationRunEvent({
          eventId: `${next.runId}:start`,
          runId: next.runId,
          cursor: next.cursor + 1,
          occurredAt: runEventInstant(next),
          kind: 'run-started',
        });
        next = client
          ? await client.appendEvent({
              workspaceId: workspace.id,
              runId: next.runId,
              event: started,
            })
          : applyEvent(next, started);
      }
      setRun(workspace.id, next);
      setMessage(t('resourceManager.verification.runs.started'));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    if (!current || pending || isVerificationRunTerminal(current)) return;
    setPending(true);
    setMessage(undefined);
    try {
      const requested = createVerificationRunEvent({
        eventId: `${current.runId}:cancel:${String(current.cursor + 1)}`,
        runId: current.runId,
        cursor: current.cursor + 1,
        occurredAt: runEventInstant(current),
        kind: 'run-cancel-requested',
        reason: 'User explicitly cancelled the Verification run.',
      });
      let next = client
        ? await client.appendEvent({
            workspaceId: workspace.id,
            runId: current.runId,
            event: requested,
          })
        : applyEvent(current, requested);
      if (next.cells.every((cell) => cell.status !== 'running')) {
        const completed = createVerificationRunEvent({
          eventId: `${next.runId}:cancel-complete:${String(next.cursor + 1)}`,
          runId: next.runId,
          cursor: next.cursor + 1,
          occurredAt: runEventInstant(next),
          kind: 'run-completed',
        });
        next = client
          ? await client.appendEvent({
              workspaceId: workspace.id,
              runId: next.runId,
              event: completed,
            })
          : applyEvent(next, completed);
      }
      setRun(workspace.id, next);
      setMessage(t('resourceManager.verification.runs.cancelled'));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-(--text-primary)">
          {t('resourceManager.verification.runs.title')}
        </h3>
        {request ? (
          <span className="rounded-full border border-black/10 px-2 py-1 text-xs text-(--text-secondary)">
            {request.mode} · {request.scenarioId}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {(
            [
              ['impacted', 'runImpacted'],
              ['required', 'runRequired'],
              ['all', 'runAll'],
            ] as const
          ).map(([scope, key]) => (
            <button
              key={scope}
              type="button"
              disabled={pending || plan.status !== 'ready'}
              onClick={() => void start(scope)}
              className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
            >
              {pending ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {t(`resourceManager.verification.runs.${key}`)}
            </button>
          ))}
          {current && !isVerificationRunTerminal(current) ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void cancel()}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 disabled:opacity-40"
            >
              <Square size={12} />
              {t('resourceManager.verification.runs.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p
          role="status"
          className="mt-3 inline-flex items-center gap-2 text-xs text-(--text-muted)"
        >
          <LoaderCircle size={13} className="animate-spin" />
          {t('resourceManager.verification.runs.loading')}
        </p>
      ) : current ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-1"
              aria-label={t('resourceManager.verification.runs.statusLabel', {
                status: current.status,
              })}
            >
              {runStatusIcon(current.status)}
              {current.status}
            </span>
            <span className="text-(--text-muted)">
              {current.surface} · {current.scope} · cursor {current.cursor}
            </span>
            <code
              className="min-w-0 flex-1 truncate text-right text-(--text-muted)"
              title={current.snapshotDigest}
            >
              {current.runId}
            </code>
          </div>
          <ul className="mt-3 grid gap-1">
            {current.cells.map((cell) => {
              const planCell = plan.cells.find(({ id }) => id === cell.cellId);
              return (
                <li
                  key={cell.cellId}
                  className="flex items-center gap-2 rounded-lg bg-black/3 px-3 py-2 text-xs"
                >
                  <span
                    className="text-(--text-muted)"
                    aria-label={t(
                      'resourceManager.verification.runs.cellStatusLabel',
                      { cell: cell.cellId, status: cell.status }
                    )}
                  >
                    {runStatusIcon(cell.status)}
                  </span>
                  <code className="min-w-0 flex-1 truncate">{cell.cellId}</code>
                  {planCell?.scenarioId && onOpenScenario ? (
                    <button
                      type="button"
                      onClick={() => onOpenScenario(planCell.scenarioId!)}
                      className="max-w-56 truncate underline decoration-black/20 underline-offset-2"
                    >
                      {planCell.scenarioId}
                    </button>
                  ) : null}
                  <span className="font-medium">{cell.status}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-xs text-(--text-muted)">
          {t('resourceManager.verification.runs.empty')}
        </p>
      )}
      {message ? (
        <p role="status" className="mt-3 text-xs text-(--text-secondary)">
          {message}
        </p>
      ) : null}
    </article>
  );
}
