import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentApprovalDecision,
  AgentProductView,
  AgentRunUserCommandKind,
  AgentTaskRecord,
  AgentTaskOutput,
} from '@prodivix/ai';
import { useParams, useSearchParams } from 'react-router';
import { useAuthStore } from '@/auth/useAuthStore';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { isAbortError } from '@/infra/api';
import { AgentApprovalDialog } from './AgentApprovalDialog';
import { AgentRunView } from './AgentRunView';
import { AgentTaskComposer } from './AgentTaskComposer';
import {
  downloadAgentAudit,
  findAgentTaskRun,
  loadAgentProduct,
  loadAgentTaskOutputs,
  submitAgentApproval,
  submitAgentRunCommand,
  submitAgentRepairTask,
} from './agentProductClient';
import type {
  AgentTaskComposerTarget,
  AgentTaskEntryKind,
} from './agentTaskComposerModel';

const entryKinds = new Set<AgentTaskEntryKind>([
  'component',
  'route',
  'issue',
  'workspace',
]);

export function AgentWorkspacePage() {
  const { projectId } = useParams();
  const [search, setSearch] = useSearchParams();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const workspace = useEditorStore(selectWorkspace);
  const [view, setView] = useState<AgentProductView | null>(null);
  const [outputs, setOutputs] = useState<readonly AgentTaskOutput[]>([]);
  const [createdTask, setCreatedTask] = useState<AgentTaskRecord | null>(null);
  const [runInput, setRunInput] = useState(search.get('runId') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<
    AgentApprovalDecision['decision'] | null
  >(null);
  const runHeadingRef = useRef<HTMLHeadingElement>(null);
  const approvalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const runId = search.get('runId')?.trim() ?? '';
  const taskId = search.get('taskId')?.trim() ?? '';

  useEffect(() => {
    setRunInput(runId);
  }, [runId]);

  useEffect(() => {
    setCreatedTask(null);
  }, [projectId, workspace?.id]);

  const initialTarget = useMemo<AgentTaskComposerTarget>(() => {
    const requestedKind = search.get('targetKind') as AgentTaskEntryKind | null;
    const kind =
      requestedKind && entryKinds.has(requestedKind)
        ? requestedKind
        : 'workspace';
    return Object.freeze({
      kind,
      id: search.get('targetId')?.trim() || workspace?.id || 'workspace',
    });
  }, [search, workspace?.id]);

  const reload = useCallback(
    async (focus = false) => {
      if (!token || !projectId || !workspace || !runId) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setBusy(true);
      try {
        const next = await loadAgentProduct({
          token,
          projectId,
          workspaceId: workspace.id,
          runId,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        const nextOutputs = await loadAgentTaskOutputs({
          token,
          projectId,
          workspaceId: workspace.id,
          view: next,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        setView(next);
        setOutputs(nextOutputs);
        setError(null);
        setAnnouncement(
          `Recovered durable Run ${next.identity.runId} in phase ${next.run.phase}.`
        );
        if (focus) queueMicrotask(() => runHeadingRef.current?.focus());
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setError(
          cause instanceof Error ? cause.message : 'Could not load Agent Run.'
        );
      } finally {
        if (requestRef.current === controller) setBusy(false);
      }
    },
    [projectId, runId, token, workspace]
  );

  useEffect(() => {
    setView(null);
    setOutputs([]);
    if (!runId) {
      return;
    }
    void reload(false);
    return () => requestRef.current?.abort();
  }, [reload, runId]);

  useEffect(() => {
    if (!view || busy || view.run.phase === 'terminal') return;
    const timer = setTimeout(() => void reload(false), 2_000);
    return () => clearTimeout(timer);
  }, [view, busy, reload]);

  useEffect(() => {
    if (!taskId || runId || !token || !projectId || !workspace) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const discover = async () => {
      try {
        const discovered = await findAgentTaskRun({
          token,
          projectId,
          workspaceId: workspace.id,
          taskId,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (discovered) {
          setRunInput(discovered);
          setSearch(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('runId', discovered);
              return next;
            },
            { replace: true }
          );
          return;
        }
        setAnnouncement(
          'Task accepted. Waiting for the runtime worker to create its durable Run.'
        );
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not discover the Task Run.'
        );
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void discover(), 2_000);
    };
    void discover();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [taskId, runId, token, projectId, workspace?.id, setSearch]);

  useEffect(() => {
    const reconnect = () => void reload(true);
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [reload]);

  const runAction = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setAnnouncement(message);
      await reload(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agent action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const closeDecision = useCallback(() => {
    setDecision(null);
    queueMicrotask(() => approvalTriggerRef.current?.focus());
  }, []);

  if (!projectId || !workspace) {
    return (
      <main className="p-5">
        <h1 className="text-lg font-semibold">Agent workspace</h1>
        <p role="alert">
          Open a loaded project Workspace before using Agent Tasks.
        </p>
      </main>
    );
  }
  if (!token || !user) {
    return (
      <main className="p-5">
        <h1 className="text-lg font-semibold">Agent workspace</h1>
        <p role="alert">Sign in to create, inspect, or decide Agent Tasks.</p>
      </main>
    );
  }

  return (
    <main className="grid gap-4 p-5 text-(--text-primary)">
      <header>
        <h1 className="m-0 text-xl font-semibold">Verified Agent workspace</h1>
        <p className="mt-1 mb-0 text-sm text-(--text-secondary)">
          Task, Run, exact proposal review, human decision, Verification,
          repair, and audit are projected from durable facts.
        </p>
      </header>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <AgentTaskComposer
        key={`${initialTarget.kind}:${initialTarget.id}`}
        token={token}
        projectId={projectId}
        workspace={workspace}
        actorId={user.id}
        initialTarget={initialTarget}
        onCreated={(task) => {
          setCreatedTask(task);
          const next = new URLSearchParams(search);
          next.set('taskId', task.spec.taskId);
          next.delete('runId');
          setSearch(next);
          setAnnouncement(`Created Task ${task.spec.taskId}.`);
        }}
      />

      {createdTask ? (
        <section className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
          <h2 className="m-0 text-base font-semibold">Task created</h2>
          <p className="mt-2 mb-0 text-sm">
            <code>{createdTask.spec.taskId}</code> was accepted. Its durable Run
            opens automatically when the worker starts it. It carries no
            implicit approval.
          </p>
        </section>
      ) : null}

      <section
        aria-labelledby="agent-open-run-title"
        className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
      >
        <h2 id="agent-open-run-title" className="m-0 text-base font-semibold">
          Open durable Run
        </h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const nextRunId = runInput.trim();
            if (!nextRunId) return;
            const next = new URLSearchParams(search);
            next.set('runId', nextRunId);
            setSearch(next);
          }}
        >
          <label className="grid min-w-64 flex-1 gap-1 text-sm">
            Run ID
            <input
              required
              value={runInput}
              onChange={(event) => setRunInput(event.currentTarget.value)}
              className="rounded-lg border border-(--border-default) bg-(--bg-canvas) px-2 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
          >
            Inspect Run
          </button>
        </form>
      </section>

      {error ? (
        <section
          role="alert"
          className="rounded-xl border border-(--text-danger) p-4"
        >
          <h2 className="m-0 text-base font-semibold">Run connection failed</h2>
          <p className="mt-2 mb-0 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void reload(true)}
            className="mt-3 rounded-lg border border-(--border-default) px-3 py-2 text-sm"
          >
            Retry and restore durable state
          </button>
        </section>
      ) : null}

      {view ? (
        <AgentRunView
          ref={runHeadingRef}
          view={view}
          outputs={outputs}
          busy={busy}
          onReload={() => void reload(true)}
          onCommand={(kind: AgentRunUserCommandKind) =>
            void runAction(
              () =>
                submitAgentRunCommand({
                  token,
                  projectId,
                  workspaceId: workspace.id,
                  view,
                  actorId: user.id,
                  kind,
                  reason:
                    kind === 'cancel'
                      ? 'Requested from the authenticated Agent product surface.'
                      : 'Requested after inspecting residual or reconciliation state.',
                }),
              `${kind} intent was durably recorded.`
            )
          }
          onOpenApproval={(nextDecision) => {
            approvalTriggerRef.current =
              document.activeElement as HTMLButtonElement;
            setDecision(nextDecision);
          }}
          onAudit={() =>
            void runAction(async () => {
              const bytes = await downloadAgentAudit({
                token,
                projectId,
                workspaceId: workspace.id,
                runId: view.identity.runId,
              });
              const url = URL.createObjectURL(
                new Blob([bytes as BlobPart], { type: 'application/json' })
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = `agent-audit-${view.identity.runId}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }, 'Audit JSON exported.')
          }
          onRepair={() => {
            requestRef.current?.abort();
            const controller = new AbortController();
            requestRef.current = controller;
            setBusy(true);
            setError(null);
            void submitAgentRepairTask({
              token,
              projectId,
              workspaceId: workspace.id,
              view,
              actorId: user.id,
              signal: controller.signal,
            })
              .then((task) => {
                controller.signal.throwIfAborted();
                setCreatedTask(task);
                setSearch((current) => {
                  const next = new URLSearchParams(current);
                  next.set('taskId', task.spec.taskId);
                  next.delete('runId');
                  return next;
                });
                setAnnouncement(
                  `Created bounded repair Task ${task.spec.taskId}. Review its new proposal before approving any change.`
                );
              })
              .catch((cause: unknown) => {
                if (controller.signal.aborted || isAbortError(cause)) return;
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Could not create the bounded repair Task.'
                );
              })
              .finally(() => {
                if (requestRef.current === controller) setBusy(false);
              });
          }}
        />
      ) : null}

      {view ? (
        <AgentApprovalDialog
          decision={decision}
          view={view}
          busy={busy}
          onClose={closeDecision}
          onSubmit={async (approval) => {
            const succeeded = await runAction(
              () =>
                submitAgentApproval({
                  token,
                  projectId,
                  workspaceId: workspace.id,
                  view,
                  actorId: user.id,
                  ...approval,
                }),
              `${approval.decision} decision was durably recorded.`
            );
            if (succeeded) closeDecision();
          }}
        />
      ) : null}
    </main>
  );
}

export default AgentWorkspacePage;
