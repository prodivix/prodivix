import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentTaskRecord,
  decodeAgentControlFact,
  decodeAgentPolicy,
  decodeAgentRepairTaskRequest,
  decodeAgentVerificationFact,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  digestAgentTaskAdmission,
  encodeAgentControlFact,
  evaluateEffectiveAgentPolicy,
  type AgentCapabilityGrant,
  type AgentProductView,
} from '@prodivix/ai';
import { submitAgentRepairTask } from './agentProductClient';

const fixture = () => {
  const vector = JSON.parse(
    readFileSync(
      resolve(
        '../backend/internal/platform/agentcontract/testdata/agent-repair-task-vector.json'
      ),
      'utf8'
    )
  );
  const parentTask = decodeAgentControlFact(vector.parentTask);
  const parentRun = decodeAgentControlFact(vector.parentRun);
  const closure = decodeAgentVerificationFact(vector.closureReceipt);
  const request = decodeAgentRepairTaskRequest(vector.request);
  const policy = decodeAgentPolicy(vector.policy);
  if (
    !parentTask.ok ||
    parentTask.value.factType !== 'task-record' ||
    !parentRun.ok ||
    parentRun.value.factType !== 'run-snapshot' ||
    !closure.ok ||
    closure.value.factType !== 'verification-closure-receipt' ||
    !request.ok ||
    !policy.ok
  )
    throw new Error('Public repair vector is invalid.');
  const parent = parentTask.value.value;
  const run = parentRun.value.value;
  const receipt = closure.value.value;
  const view = {
    identity: {
      projectId: parent.spec.projectId,
      workspaceId: parent.spec.workspaceId,
      taskId: parent.spec.taskId,
      taskDigest: parent.taskDigest,
      runId: run.run.runId,
      runSnapshotDigest: run.snapshotDigest,
      generation: run.run.generation,
      attempt: run.run.attempt,
      cursor: run.cursor,
    },
    task: parent.spec,
    run: run.run,
    cleanupState: run.cleanupState,
    budgetLedger: run.budgetLedger,
    verificationClosures: [receipt],
    verificationBindings: [
      { bindingId: receipt.bindingId, mutationKind: 'commit' },
    ],
    availableActions: ['repair'],
  } as unknown as AgentProductView;
  const requested = request.value.requestedTask;
  const task = createAgentTaskRecord(
    {
      ...requested.spec,
      initialGrantRef: { grantId: 'grant.repair.admitted' },
    },
    { lineage: requested.lineage }
  );
  const effective = evaluateEffectiveAgentPolicy({
    projectPolicyRef: task.spec.policyRef,
    actorAuthorizationDigest: digestAgentCanonicalValue('actor.repair'),
    evaluatedAt: task.spec.createdAt,
    layers: (['platform', 'project', 'actor', 'grant'] as const).map(
      (kind) => ({
        kind,
        issuer: `issuer.${kind}`,
        policy: policy.value,
        policyDigest: digestAgentPolicy(policy.value),
      })
    ),
  });
  if (!effective.ok) throw new Error('Public policy fixture is invalid.');
  const grant: AgentCapabilityGrant = {
    grantId: task.spec.initialGrantRef.grantId,
    subject: task.spec.actor,
    taskId: task.spec.taskId,
    workspaceId: task.spec.workspaceId,
    baseRevision: task.spec.baseRevision,
    targetScope: task.spec.targetScope,
    capabilities: ['read', 'execute', 'propose', 'commit', 'rollback'],
    toolIds: [],
    runtimeZones: ['server', 'native'],
    secretRefs: [],
    limits: { budget: task.spec.budget, maxUses: 2 },
    policyRef: task.spec.policyRef,
    policyDigest: task.spec.policyDigest,
    issuedAt: task.spec.createdAt,
    expiresAt: new Date(Date.parse(task.spec.createdAt) + 60_000).toISOString(),
    maxUses: 2,
  };
  const admission = {
    admissionId: 'admission.repair',
    challengeDigest: digestAgentCanonicalValue('challenge.repair'),
    task,
    grant,
    effectivePolicy: effective.value,
    status: 'admitted' as const,
    diagnosticCodes: [],
  };
  const challenge = {
    admissionId: admission.admissionId,
    challengeDigest: admission.challengeDigest,
    status: 'pending',
  };
  const response = { request: vector.request, ...challenge };
  const admitted = {
    ...admission,
    admissionDigest: digestAgentTaskAdmission(admission),
    task: encodeAgentControlFact({ factType: 'task-record', value: task }),
  };
  return {
    input: {
      token: 'session',
      projectId: parent.spec.projectId,
      workspaceId: parent.spec.workspaceId,
      actorId: parent.spec.actor.principalId,
      view,
      requestId: request.value.requestId,
    },
    response,
    admitted,
    task,
    requested,
  };
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());
describe('real browser repair admission client', () => {
  it('creates the bounded child through existing admission and Task owners without an approval request', async () => {
    const { input, response, admitted, task, requested } = fixture();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const path = String(url);
        calls.push(path);
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer session'
        );
        if (path.endsWith('/repair-task-requests')) {
          expect(JSON.parse(String(init?.body))).toEqual({
            requestId: input.requestId,
            expectedParentSnapshotDigest: input.view.identity.runSnapshotDigest,
            expectedClosureDigest:
              input.view.verificationClosures[0].closureDigest,
          });
          return json(response);
        }
        if (path.includes('/task-admissions/')) return json(admitted);
        expect(path.endsWith('/tasks')).toBe(true);
        expect(JSON.parse(String(init?.body))).toEqual({
          task: admitted.task,
          admissionId: admitted.admissionId,
          admissionDigest: admitted.admissionDigest,
        });
        return json({ task: admitted.task, replayed: false });
      })
    );
    expect(await submitAgentRepairTask(input)).toEqual(task);
    expect(task.spec.budget).toEqual(requested.spec.budget);
    expect(task.spec.budget.maxRepairRounds).toBeLessThan(
      input.view.task.budget.maxRepairRounds
    );
    expect(calls).toHaveLength(3);
    expect(
      calls.some(
        (path) =>
          path.endsWith('/approvals') || path.endsWith('/task-admissions')
      )
    ).toBe(false);
  });

  it('fails closed on malformed repair material and blocked admission without creating a Task', async () => {
    const { input, response, admitted } = fixture();
    for (const malformed of [true, false]) {
      const calls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown) => {
          const path = String(url);
          calls.push(path);
          return json(
            path.endsWith('/repair-task-requests')
              ? malformed
                ? { ...response, approval: true }
                : response
              : {
                  admissionId: admitted.admissionId,
                  challengeDigest: admitted.challengeDigest,
                  status: 'blocked',
                  diagnosticCodes: ['AI-6010'],
                }
          );
        })
      );
      await expect(submitAgentRepairTask(input)).rejects.toThrow(
        /malformed|AI-6010/u
      );
      expect(calls.some((path) => path.endsWith('/tasks'))).toBe(false);
    }
  });

  it('rejects a foreign parent before transport and retains cancellation through the repair request', async () => {
    const { input } = fixture();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      submitAgentRepairTask({ ...input, actorId: 'other' })
    ).rejects.toThrow(/authenticated failed Task/u);
    expect(fetcher).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = submitAgentRepairTask({
      ...input,
      signal: controller.signal,
    });
    controller.abort(new Error('Repair stopped'));
    await expect(pending).rejects.toThrow(/Repair stopped/u);
    expect(signal?.aborted).toBe(true);
  });
});
