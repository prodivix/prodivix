import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultAgentPolicy,
  createAgentTaskRecord,
  decodeAgentControlFact,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  digestAgentTaskAdmission,
  encodeAgentControlFact,
  evaluateEffectiveAgentPolicy,
  type AgentCapabilityGrant,
  type AgentTaskRecord,
} from '@prodivix/ai';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { createAgentTask } from './agentProductClient';
import { createAgentTaskComposerFact } from './agentTaskComposerModel';
import { AgentTaskComposer } from './AgentTaskComposer';

const workspace = (): WorkspaceSnapshot => {
  const value = createEditorWorkspace();
  const root = value.treeById.root;
  if (root.kind !== 'dir') throw new Error('Expected directory');
  return {
    ...value,
    treeById: {
      ...value.treeById,
      root: { ...root, children: [...(root.children ?? []), 'policy-node'] },
      'policy-node': {
        id: 'policy-node',
        kind: 'doc',
        name: 'agent-policy.json',
        parentId: 'root',
        docId: 'policy.agent',
      },
    },
    docsById: {
      ...value.docsById,
      'policy.agent': {
        id: 'policy.agent',
        type: 'agent-policy',
        path: '/agent-policy.json',
        contentRev: 1,
        metaRev: 1,
        content: createDefaultAgentPolicy('policy.agent', 'Project policy'),
      },
    },
  };
};
const fixture = () => {
  const source = workspace();
  const composed = createAgentTaskComposerFact({
    projectId: 'project.test',
    workspace: source,
    actorId: 'user.test',
    mode: 'explain',
    intent: 'Inspect this Workspace.',
    target: { kind: 'workspace', id: source.id },
    identity: 'fixture',
  });
  return {
    source,
    composed,
    input: {
      token: 'session',
      projectId: 'project.test',
      workspaceId: source.id,
      wire: composed.wire,
    },
  };
};
const admitted = (requested: AgentTaskRecord) => {
  const policy = createDefaultAgentPolicy(
    requested.spec.policyRef.documentId,
    'Project policy'
  );
  const effective = evaluateEffectiveAgentPolicy({
    projectPolicyRef: requested.spec.policyRef,
    actorAuthorizationDigest: digestAgentCanonicalValue('actor'),
    evaluatedAt: requested.spec.createdAt,
    layers: (['platform', 'project', 'actor', 'grant'] as const).map(
      (kind) => ({
        kind,
        issuer: `issuer.${kind}`,
        policy,
        policyDigest: digestAgentPolicy(policy),
      })
    ),
  });
  if (!effective.ok) throw new Error('Invalid effective policy fixture');
  const task = createAgentTaskRecord(
    { ...requested.spec, initialGrantRef: { grantId: 'grant.admitted' } },
    { lineage: requested.lineage }
  );
  const grant: AgentCapabilityGrant = {
    grantId: 'grant.admitted',
    subject: task.spec.actor,
    taskId: task.spec.taskId,
    workspaceId: task.spec.workspaceId,
    baseRevision: task.spec.baseRevision,
    targetScope: task.spec.targetScope,
    capabilities: ['read', 'execute'],
    toolIds: [],
    runtimeZones: ['server', 'native'],
    secretRefs: [],
    limits: { budget: task.spec.budget, maxUses: 1 },
    policyRef: task.spec.policyRef,
    policyDigest: task.spec.policyDigest,
    issuedAt: task.spec.createdAt,
    expiresAt: new Date(Date.parse(task.spec.createdAt) + 60_000).toISOString(),
    maxUses: 1,
  };
  const result = {
    admissionId: 'admission.fixture',
    challengeDigest: digestAgentCanonicalValue('challenge'),
    task,
    grant,
    effectivePolicy: effective.value,
    status: 'admitted' as const,
    diagnosticCodes: [],
  };
  return {
    ...result,
    admissionDigest: digestAgentTaskAdmission(result),
    task: encodeAgentControlFact({ factType: 'task-record', value: task }),
  };
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
type Call = { url: string; init?: RequestInit };
const installServer = (
  input: {
    blocked?: boolean;
    mutate?: (value: ReturnType<typeof admitted>) => unknown;
    wrongCreate?: boolean;
    pending?: number;
  } = {}
) => {
  let wire: ReturnType<typeof admitted>;
  const calls: Call[] = [];
  let polls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      calls.push({ url: path, init });
      if (path.endsWith('/task-admissions')) {
        const body = JSON.parse(String(init?.body));
        expect(Object.keys(body)).toEqual(['task']);
        const task = decodeAgentControlFact(body.task);
        if (!task.ok || task.value.factType !== 'task-record')
          throw new Error('Invalid Task fixture request');
        wire = admitted(task.value.value);
        return json({
          admissionId: wire.admissionId,
          challengeDigest: wire.challengeDigest,
          status: 'pending',
        });
      }
      if (path.includes('/task-admissions/')) {
        polls += 1;
        if (input.blocked)
          return json({
            admissionId: wire.admissionId,
            challengeDigest: wire.challengeDigest,
            status: 'blocked',
            diagnosticCodes: ['AI-6010'],
          });
        if (polls <= (input.pending ?? 0))
          return json({
            admissionId: wire.admissionId,
            challengeDigest: wire.challengeDigest,
            status: 'pending',
            diagnosticCodes: [],
          });
        return json(input.mutate ? input.mutate(wire) : wire);
      }
      if (path.endsWith('/tasks')) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          task: wire.task,
          admissionId: wire.admissionId,
          admissionDigest: wire.admissionDigest,
        });
        if (input.wrongCreate) {
          const decoded = decodeAgentControlFact(wire.task);
          if (!decoded.ok || decoded.value.factType !== 'task-record')
            throw new Error('Invalid Task fixture');
          const task = createAgentTaskRecord({
            ...decoded.value.value.spec,
            mode: 'plan',
          });
          return json({
            task: encodeAgentControlFact({
              factType: 'task-record',
              value: task,
            }),
          });
        }
        return json({ task: wire.task, replayed: false });
      }
      throw new Error(`Unexpected request ${path}`);
    })
  );
  return calls;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Task admission browser adapter', () => {
  it('polls once and posts only the exact admitted Task and digest with current authentication', async () => {
    vi.useFakeTimers();
    const { input } = fixture();
    const calls = installServer({ pending: 1 });
    const promise = createAgentTask(input);
    await vi.advanceTimersByTimeAsync(250);
    expect((await promise).spec.initialGrantRef.grantId).toBe('grant.admitted');
    expect(
      calls.map(({ url }) => new URL(url, 'https://test.local').pathname)
    ).toEqual([
      '/api/projects/project.test/workspaces/workspace-test/agent/task-admissions',
      '/api/projects/project.test/workspaces/workspace-test/agent/task-admissions/admission.fixture',
      '/api/projects/project.test/workspaces/workspace-test/agent/task-admissions/admission.fixture',
      '/api/projects/project.test/workspaces/workspace-test/agent/tasks',
    ]);
    for (const { init } of calls)
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer session'
      );
  });

  it.each(['digest', 'task', 'unknown', 'grant'] as const)(
    'refuses malformed %s admission before creating a Task',
    async (kind) => {
      const calls = installServer({
        mutate: (value) => {
          if (kind === 'digest')
            return {
              ...value,
              admissionDigest: digestAgentCanonicalValue('different'),
            };
          if (kind === 'unknown') return { ...value, approval: true };
          if (kind === 'grant')
            return {
              ...value,
              grant: {
                ...value.grant,
                subject: { kind: 'user', principalId: 'other' },
              },
            };
          return {
            ...value,
            task: {
              ...value.task,
              value: {
                ...value.task.value,
                taskDigest: digestAgentCanonicalValue('tampered'),
              },
            },
          };
        },
      });
      await expect(createAgentTask(fixture().input)).rejects.toThrow(
        /strict validation/u
      );
      expect(calls.some(({ url }) => url.endsWith('/tasks'))).toBe(false);
    }
  );

  it('refuses an unrelated project before transport and mismatched created Task afterwards', async () => {
    const calls = installServer({ wrongCreate: true });
    const { input } = fixture();
    await expect(
      createAgentTask({ ...input, projectId: 'other' })
    ).rejects.toThrow(/current project/u);
    expect(calls).toHaveLength(0);
    await expect(createAgentTask(input)).rejects.toThrow(/strict validation/u);
  });
});

describe('Task composer admission behavior', () => {
  const props = () => {
    const { source } = fixture();
    return {
      token: 'session',
      projectId: 'project.test',
      workspace: source,
      actorId: 'user.test',
      initialTarget: { kind: 'workspace' as const, id: source.id },
      onCreated: vi.fn(),
    };
  };
  const submit = async () => {
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Intent' }),
      'Inspect this Workspace.'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create target-scoped Task' })
    );
  };
  it('creates the admitted Task through the real client from one user action', async () => {
    const calls = installServer();
    const input = props();
    render(<AgentTaskComposer {...input} />);
    await submit();
    await waitFor(() => expect(input.onCreated).toHaveBeenCalledOnce());
    expect(input.onCreated.mock.calls[0][0].spec.initialGrantRef.grantId).toBe(
      'grant.admitted'
    );
    expect(calls.filter(({ url }) => url.endsWith('/tasks'))).toHaveLength(1);
  });

  it('shows blocked diagnostic codes and allows a retry without creating a Task', async () => {
    const calls = installServer({ blocked: true });
    render(<AgentTaskComposer {...props()} />);
    await submit();
    expect((await screen.findByRole('alert')).textContent).toContain('AI-6010');
    expect(
      (
        screen.getByRole('button', {
          name: 'Create target-scoped Task',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(calls.some(({ url }) => url.endsWith('/tasks'))).toBe(false);
  });

  it.each(['cancel', 'project', 'unmount'] as const)(
    'aborts %s during admission and ignores a late response',
    async (kind) => {
      const input = props();
      let resolve!: (value: Response) => void;
      let signal!: AbortSignal;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: unknown, init?: RequestInit) => {
          signal = init!.signal!;
          return new Promise<Response>((done) => {
            resolve = done;
          });
        })
      );
      const mounted = render(<AgentTaskComposer {...input} />);
      await submit();
      await waitFor(() => expect(signal).toBeDefined());
      if (kind === 'cancel')
        await userEvent.click(
          screen.getByRole('button', { name: 'Cancel creation' })
        );
      else if (kind === 'project')
        mounted.rerender(
          <AgentTaskComposer {...input} projectId="next-project" />
        );
      else mounted.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () =>
        resolve(
          json({
            admissionId: 'late',
            challengeDigest: digestAgentCanonicalValue('late'),
            status: 'pending',
          })
        )
      );
      expect(input.onCreated).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
      if (kind !== 'unmount')
        await waitFor(() =>
          expect(
            (
              screen.getByRole('button', {
                name: 'Create target-scoped Task',
              }) as HTMLButtonElement
            ).disabled
          ).toBe(false)
        );
    }
  );
});
