import { useMemo, useState } from 'react';
import type { AgentTaskMode, AgentTaskRecord } from '@prodivix/ai';
import {
  selectWorkspaceAgentPolicyDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createAgentTaskComposerFact,
  type AgentTaskComposerTarget,
  type AgentTaskEntryKind,
} from './agentTaskComposerModel';
import { createAgentTask } from './agentProductClient';

type AgentTaskComposerProps = Readonly<{
  token: string;
  projectId: string;
  workspace: WorkspaceSnapshot;
  actorId: string;
  initialTarget: AgentTaskComposerTarget;
  onCreated: (task: AgentTaskRecord) => void;
}>;

const taskModes: readonly AgentTaskMode[] = [
  'explain',
  'plan',
  'propose',
  'apply',
];
const targetKinds: readonly AgentTaskEntryKind[] = [
  'component',
  'route',
  'issue',
  'workspace',
];

export function AgentTaskComposer({
  token,
  projectId,
  workspace,
  actorId,
  initialTarget,
  onCreated,
}: AgentTaskComposerProps) {
  const [mode, setMode] = useState<AgentTaskMode>('explain');
  const [intent, setIntent] = useState('');
  const [targetKind, setTargetKind] = useState<AgentTaskEntryKind>(
    initialTarget.kind
  );
  const [targetId, setTargetId] = useState(initialTarget.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const policy = useMemo(
    () => selectWorkspaceAgentPolicyDocument(workspace),
    [workspace]
  );

  return (
    <section
      aria-labelledby="agent-task-composer-title"
      className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
    >
      <h2
        id="agent-task-composer-title"
        className="m-0 text-base font-semibold"
      >
        Task composer
      </h2>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          void (async () => {
            try {
              const composed = createAgentTaskComposerFact({
                projectId,
                workspace,
                actorId,
                mode,
                intent,
                target: { kind: targetKind, id: targetId },
              });
              const task = await createAgentTask({
                token,
                projectId,
                workspaceId: workspace.id,
                wire: composed.wire,
              });
              onCreated(task);
              setIntent('');
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Could not create Agent Task.'
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="grid gap-1 text-sm">
          Mode
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.currentTarget.value as AgentTaskMode)
            }
            className="rounded-lg border border-(--border-default) bg-(--bg-canvas) px-2 py-2"
          >
            {taskModes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Intent
          <textarea
            required
            value={intent}
            maxLength={16384}
            onChange={(event) => setIntent(event.currentTarget.value)}
            className="min-h-28 rounded-lg border border-(--border-default) bg-(--bg-canvas) p-2"
            placeholder="Describe the outcome and constraints. Apply mode still requires a separate exact approval."
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <label className="grid gap-1 text-sm">
            Target kind
            <select
              value={targetKind}
              onChange={(event) =>
                setTargetKind(event.currentTarget.value as AgentTaskEntryKind)
              }
              className="rounded-lg border border-(--border-default) bg-(--bg-canvas) px-2 py-2"
            >
              {targetKinds.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Exact target
            <input
              required
              value={targetId}
              onChange={(event) => setTargetId(event.currentTarget.value)}
              className="rounded-lg border border-(--border-default) bg-(--bg-canvas) px-2 py-2"
            />
          </label>
        </div>

        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3 text-xs text-(--text-secondary)">
          {policy?.status === 'valid' ? (
            <>
              <div>
                Policy: <strong>{policy.decodedContent.name}</strong> · revision{' '}
                {workspace.workspaceRev}
              </div>
              <div>
                Budget:{' '}
                {policy.decodedContent.budgetCeiling.maxModelInvocations} model
                calls, {policy.decodedContent.budgetCeiling.maxToolCalls} tool
                calls, {policy.decodedContent.budgetCeiling.maxRepairRounds}{' '}
                repair rounds
              </div>
              <div>
                Verification:{' '}
                {policy.decodedContent.verificationRules.requiredCheckKinds.join(
                  ', '
                ) || 'policy-defined at execution'}
              </div>
            </>
          ) : (
            'Task creation is blocked until this Workspace has one valid AgentPolicy.'
          )}
        </div>
        {mode === 'apply' ? (
          <p className="m-0 text-xs font-medium text-(--text-warning)">
            Apply creates no write authority. A human must later review the
            exact semantic diff, Impact, Plan, permissions, risk, and rollback
            choice.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm text-(--text-danger)">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || policy?.status !== 'valid'}
          className="justify-self-start rounded-lg bg-(--accent-primary) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Creating Task…' : 'Create target-scoped Task'}
        </button>
      </form>
    </section>
  );
}
