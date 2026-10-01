import { afterEach, describe, expect, it, vi } from 'vitest';
import { createV4Task } from '../__tests__/agentV4Fixtures';
import {
  createV1EffectivePolicy,
  TEST_EXPIRY,
  TEST_INSTANT,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import { createAgentTaskRecord } from '../control/agentTask';
import { encodeAgentControlFact } from '../control/agentControlCodec';
import type { AgentCapabilityGrant } from '../domain/agent.types';
import {
  decodeAgentTaskAdmission,
  decodeAgentTaskAdmissionChallenge,
  digestAgentTaskAdmission,
  isAgentCapabilityGrant,
  type AgentTaskAdmissionResult,
} from './agentTaskAdmission';
import { resolveAgentTaskAdmission } from './agentTaskAdmissionClient';

const fixture = () => {
  const effectivePolicy = createV1EffectivePolicy();
  const requestedTask = createAgentTaskRecord({
    ...createV4Task().spec,
    policyRef: effectivePolicy.evaluation.projectPolicyRef,
    policyDigest: effectivePolicy.evaluation.projectPolicyDigest,
    budget: effectivePolicy.budgetCeiling,
  });
  const task = createAgentTaskRecord(
    {
      ...requestedTask.spec,
      initialGrantRef: { grantId: 'grant.runtime.admission' },
    },
    { lineage: requestedTask.lineage }
  );
  const grant: AgentCapabilityGrant = {
    grantId: task.spec.initialGrantRef.grantId,
    subject: task.spec.actor,
    taskId: task.spec.taskId,
    workspaceId: task.spec.workspaceId,
    baseRevision: task.spec.baseRevision,
    targetScope: task.spec.targetScope,
    capabilities: ['read', 'execute'],
    toolIds: [],
    runtimeZones: ['server', 'native'],
    secretRefs: [
      {
        kind: 'provider',
        referenceId: 'secret.provider',
        purpose: 'model-invocation',
      },
    ],
    limits: { budget: task.spec.budget, maxUses: 1 },
    policyRef: task.spec.policyRef,
    policyDigest: task.spec.policyDigest,
    issuedAt: TEST_INSTANT,
    expiresAt: TEST_EXPIRY,
    maxUses: 1,
  };
  const base = {
    admissionId: 'admission.test',
    challengeDigest: testDigest('challenge'),
    task,
    grant,
    effectivePolicy,
    status: 'admitted' as const,
    diagnosticCodes: [],
  };
  const result: AgentTaskAdmissionResult = {
    ...base,
    admissionDigest: digestAgentTaskAdmission(base),
  };
  const wire = (value = result) => ({
    ...value,
    task: encodeAgentControlFact({
      factType: 'task-record',
      value: value.task,
    }),
  });
  const challenge = {
    admissionId: result.admissionId,
    challengeDigest: result.challengeDigest,
    status: 'pending' as const,
  };
  return { requestedTask, result, wire, challenge };
};

afterEach(() => vi.useRealTimers());

describe('Task admission public owner', () => {
  it('admits an exact grant replacement and strips validated transport metadata', () => {
    const { requestedTask, result, wire } = fixture();
    expect(isAgentCapabilityGrant(result.grant)).toBe(true);
    const decoded = decodeAgentTaskAdmission(
      {
        ...wire(),
        actorAuthorizationDigest:
          result.effectivePolicy!.evaluation.actorAuthorizationDigest,
        observedAt: TEST_INSTANT,
        expiresAt: TEST_EXPIRY,
      },
      { requestedTask }
    );
    expect(decoded).toEqual({ ok: true, value: result });
  });

  it('accepts bounded pending and expired challenge states without fabricating Task facts', () => {
    const { challenge } = fixture();
    expect(decodeAgentTaskAdmissionChallenge(challenge)).toEqual({
      ok: true,
      value: challenge,
    });
    expect(
      decodeAgentTaskAdmission({ ...challenge, diagnosticCodes: [] }).ok
    ).toBe(true);
    expect(
      decodeAgentTaskAdmission({
        ...challenge,
        status: 'blocked',
        diagnosticCodes: ['AI-7001'],
      }).ok
    ).toBe(true);
    expect(
      decodeAgentTaskAdmission({ ...challenge, diagnosticCodes: [], grant: {} })
        .ok
    ).toBe(false);
    expect(
      decodeAgentTaskAdmission({
        ...challenge,
        status: 'blocked',
        diagnosticCodes: [],
      }).ok
    ).toBe(false);
  });

  it('verifies blocked worker result digest with the unchanged requested Task', () => {
    const { requestedTask, challenge } = fixture();
    const base = {
      ...challenge,
      task: requestedTask,
      status: 'blocked' as const,
      diagnosticCodes: ['AI-6010'],
    };
    const result = { ...base, admissionDigest: digestAgentTaskAdmission(base) };
    const decoded = decodeAgentTaskAdmission(
      {
        ...result,
        task: encodeAgentControlFact({
          factType: 'task-record',
          value: requestedTask,
        }),
      },
      { requestedTask }
    );
    expect(decoded).toEqual({ ok: true, value: result });
  });

  it.each([
    'intent',
    'mode',
    'createdAt',
    'idempotencyKey',
    'baseRevision',
    'targetScope',
    'budget',
    'policyDigest',
  ] as const)(
    'rejects changed immutable %s even with a newly computed result digest',
    (field) => {
      const { requestedTask, result, wire } = fixture();
      const replacements = {
        intent: {
          intent: 'A different request.',
          intentDigest: testDigest('A different request.'),
        },
        mode: { mode: 'plan' as const },
        createdAt: { createdAt: TEST_INSTANT },
        idempotencyKey: { idempotencyKey: 'changed.key' },
        baseRevision: {
          baseRevision: { ...result.task.spec.baseRevision, workspaceRev: 43 },
        },
        targetScope: {
          targetScope: {
            targets: [{ kind: 'workspace' as const, id: 'other.workspace' }],
          },
        },
        budget: { budget: { ...result.task.spec.budget, maxToolCalls: 1 } },
        policyDigest: { policyDigest: testDigest('changed.policy') },
      };
      const task = createAgentTaskRecord({
        ...result.task.spec,
        ...replacements[field],
      });
      const changed = { ...result, task };
      expect(
        decodeAgentTaskAdmission(
          wire({
            ...changed,
            admissionDigest: digestAgentTaskAdmission(changed),
          }),
          { requestedTask }
        )
      ).toMatchObject({ ok: false });
    }
  );

  it('rejects lineage replacement, raw current Tasks, unknown keys, unsafe JSON and digest drift', () => {
    const { requestedTask, result, wire } = fixture();
    const task = createAgentTaskRecord(result.task.spec, {
      lineage: { reason: 'intent-changed', parentTaskId: 'parent.task' },
    });
    const changed = { ...result, task };
    for (const value of [
      wire({ ...changed, admissionDigest: digestAgentTaskAdmission(changed) }),
      result,
      { ...wire(), approval: true },
      { ...wire(), admissionDigest: testDigest('tampered') },
      { ...wire(), diagnosticCodes: ['raw-secret-message'] },
      JSON.parse('{"__proto__":{}}'),
    ])
      expect(decodeAgentTaskAdmission(value, { requestedTask }).ok).toBe(false);
  });

  it.each([
    'unknown',
    'widened',
    'scope',
    'principal',
    'revision',
    'expiry',
    'budget',
    'count',
    'run',
    'policy',
  ] as const)(
    'rejects %s grant drift even with a valid result digest',
    (kind) => {
      const { requestedTask, result, wire } = fixture();
      const grant = result.grant!;
      const changes = {
        unknown: { ...grant, apiKey: 'never-browser' },
        widened: { ...grant, capabilities: ['read', 'execute', 'all'] },
        scope: {
          ...grant,
          targetScope: { targets: [{ kind: 'workspace', id: 'other' }] },
        },
        principal: {
          ...grant,
          subject: { kind: 'user', principalId: 'other' },
        },
        revision: {
          ...grant,
          baseRevision: { ...grant.baseRevision, opSeq: 0 },
        },
        expiry: { ...grant, expiresAt: TEST_INSTANT },
        budget: {
          ...grant,
          limits: {
            ...grant.limits,
            budget: { ...grant.limits.budget, maxToolCalls: 500 },
          },
        },
        count: { ...grant, maxUses: 0 },
        run: { ...grant, runId: 'preexisting.run' },
        policy: { ...grant, policyDigest: testDigest('other.policy') },
      };
      const changed = {
        ...result,
        grant: changes[kind] as AgentCapabilityGrant,
      };
      expect(
        decodeAgentTaskAdmission(
          wire({
            ...changed,
            admissionDigest: digestAgentTaskAdmission(changed),
          }),
          { requestedTask }
        ).ok
      ).toBe(false);
    }
  );

  it('rejects policy derived intersections and actor authorization drift', () => {
    const { requestedTask, result, wire } = fixture();
    const effectivePolicy = {
      ...result.effectivePolicy!,
      budgetCeiling: {
        ...result.effectivePolicy!.budgetCeiling,
        maxModelInvocations: 100,
      },
    };
    const changed = { ...result, effectivePolicy };
    expect(
      decodeAgentTaskAdmission(
        wire({
          ...changed,
          admissionDigest: digestAgentTaskAdmission(changed),
        }),
        { requestedTask }
      ).ok
    ).toBe(false);
    expect(
      decodeAgentTaskAdmission(
        { ...wire(), actorAuthorizationDigest: testDigest('different.actor') },
        { requestedTask }
      ).ok
    ).toBe(false);
  });
});

describe('bounded Task admission journey', () => {
  it('loads a replayed terminal challenge and polls pending until exact admission', async () => {
    vi.useFakeTimers();
    const { requestedTask, result, wire, challenge } = fixture();
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ...challenge, diagnosticCodes: [] })
      .mockResolvedValueOnce(wire());
    const promise = resolveAgentTaskAdmission({
      requestedTask,
      transport: {
        create: async () => ({ ...challenge, status: 'admitted' }),
        load,
      },
      pollIntervalMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await promise).toEqual(result);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('surfaces blocked codes and refuses changed challenge identities', async () => {
    const { requestedTask, challenge } = fixture();
    await expect(
      resolveAgentTaskAdmission({
        requestedTask,
        transport: {
          create: async () => challenge,
          load: async () => ({
            ...challenge,
            status: 'blocked',
            diagnosticCodes: ['AI-6010'],
          }),
        },
      })
    ).rejects.toThrow(/AI-6010/u);
    await expect(
      resolveAgentTaskAdmission({
        requestedTask,
        transport: {
          create: async () => challenge,
          load: async () => ({
            ...challenge,
            challengeDigest: testDigest('another'),
            diagnosticCodes: [],
          }),
        },
      })
    ).rejects.toThrow(/identity changed/u);
  });

  it('cancels pending work and enforces the deadline even when a transport never resolves', async () => {
    vi.useFakeTimers();
    const { requestedTask, challenge } = fixture();
    const caller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const cancelled = resolveAgentTaskAdmission({
      requestedTask,
      signal: caller.signal,
      transport: {
        create: async () => challenge,
        load: async (_id, signal) => {
          observedSignal = signal;
          return new Promise(() => {});
        },
      },
    });
    const cancelledAssertion = expect(cancelled).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await cancelledAssertion;
    expect(observedSignal?.aborted).toBe(true);
    const timedOut = resolveAgentTaskAdmission({
      requestedTask,
      maximumElapsedMs: 20,
      transport: { create: async () => new Promise(() => {}), load: vi.fn() },
    });
    const timeoutAssertion = expect(timedOut).rejects.toThrow(/timed out/u);
    await vi.advanceTimersByTimeAsync(20);
    await timeoutAssertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
