import { describe, expect, it } from 'vitest';
import { createV4Task, V4_TIME, v4Digest } from '../__tests__/agentV4Fixtures';
import type { AgentTaskSpec } from '../domain/agent.types';
import {
  createAgentTaskRecord,
  isAgentTaskRecord,
  resolveAgentTaskCreate,
} from './agentTask';

describe('AgentTask immutable create contract', () => {
  it('canonicalizes the immutable request and strongly replays the same create', () => {
    const task = createV4Task('explain', 'idempotent');
    const replay = resolveAgentTaskCreate(
      task,
      createV4Task('explain', 'idempotent')
    );

    expect(replay).toMatchObject({ accepted: true, replayed: true });
    expect(Object.isFrozen(task)).toBe(true);
    expect(Object.isFrozen(task.spec.targetScope.targets)).toBe(true);
    expect(task.spec.verificationRequirement.requiredCheckKinds).toEqual([
      'browser-e2e',
      'unit',
    ]);
    const nonCanonicalWireRecord = {
      ...task,
      spec: {
        ...task.spec,
        budget: {
          ...task.spec.budget,
          usageLimits: [...task.spec.budget.usageLimits].reverse(),
        },
      },
    };
    expect(isAgentTaskRecord(nonCanonicalWireRecord)).toBe(false);
  });

  it('rejects idempotency reuse with changed immutable input', () => {
    const existing = createV4Task('explain', 'conflict');
    const intent = 'A different immutable request.';
    const requested = createAgentTaskRecord(
      Object.freeze({
        ...existing.spec,
        taskId: 'task.g4-v4.conflict-replacement',
        intent,
        intentDigest: v4Digest(intent),
      })
    );

    const result = resolveAgentTaskCreate(existing, requested);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.issues[0]?.path).toBe('/idempotencyKey');
    }
  });

  it('fails closed for Secret material, glob targets, and intent digest drift', () => {
    const base = createV4Task('plan', 'negative').spec;
    const canary = 'v4-secret-canary';
    const secretIntent = `Inspect ${canary}`;
    expect(() =>
      createAgentTaskRecord(
        {
          ...base,
          intent: secretIntent,
          intentDigest: v4Digest(secretIntent),
        },
        { secretCanaries: [canary] }
      )
    ).toThrow(/Secret/u);
    const credentialIntent = 'Inspect Bearer credential-material';
    expect(() =>
      createAgentTaskRecord({
        ...base,
        intent: credentialIntent,
        intentDigest: v4Digest(credentialIntent),
      })
    ).toThrow(/Secret/u);
    expect(() =>
      createAgentTaskRecord({
        ...base,
        targetScope: { targets: [{ kind: 'document', id: 'pages/*' }] },
      })
    ).toThrow(/target/u);
    expect(() =>
      createAgentTaskRecord({ ...base, intentDigest: v4Digest('drift') })
    ).toThrow(/digest/u);
    expect(() =>
      createAgentTaskRecord({
        ...base,
        createdAt: '2026-08-01T08:00:00Z',
      })
    ).toThrow(/identity/u);
  });

  it('requires a new parent-bound lineage when intent or scope changes', () => {
    const parent = createV4Task('plan', 'parent');
    const changedIntent = 'Plan a narrower Catalog change.';
    const childSpec: AgentTaskSpec = Object.freeze({
      ...parent.spec,
      taskId: 'task.g4-v4.child',
      intent: changedIntent,
      intentDigest: v4Digest(changedIntent),
      createdAt: V4_TIME.run,
      idempotencyKey: 'idempotency.task.child',
    });
    const child = createAgentTaskRecord(childSpec, {
      lineage: {
        parentTaskId: parent.spec.taskId,
        reason: 'intent-changed',
      },
    });

    expect(child.lineage.parentTaskId).toBe(parent.spec.taskId);
    expect(() =>
      createAgentTaskRecord(childSpec, {
        lineage: { reason: 'intent-changed' },
      })
    ).toThrow(/lineage/u);
  });
});
