import { describe, expect, it } from 'vitest';
import { createAgentTaskRecord, digestAgentCanonicalValue } from '@prodivix/ai';
import {
  bindAdmittedAgentRuntimeProfile,
  digestAgentRuntimeAdmission,
  evaluateAgentRuntimeAdmission,
} from '#src/admission.js';
import { runtimeFixture, time } from '#src/runtime.fixture.js';

const challengeFor = (fixture = runtimeFixture()) => ({
  admissionId: 'admission.fixture',
  challengeDigest: digestAgentCanonicalValue('challenge.fixture'),
  task: fixture.task,
  workspace: fixture.workspace,
  actorAuthorizationDigest:
    fixture.binding.policy.evaluation.actorAuthorizationDigest,
  observedAt: time,
  expiresAt: '2026-10-01T00:05:00.000Z',
});

describe('ordinary authenticated Task admission composition', () => {
  it('mints a bounded exact Task grant through current policy/context/provider owners without invoking a model', async () => {
    const fixture = runtimeFixture();
    const challenge = challengeFor(fixture);
    const result = await evaluateAgentRuntimeAdmission(
      challenge,
      fixture.config
    );
    expect(result.status).toBe('admitted');
    expect(result.admissionDigest).toBe(digestAgentRuntimeAdmission(result));
    expect(result.grant).toMatchObject({
      taskId: fixture.task.spec.taskId,
      subject: fixture.task.spec.actor,
      grantId: `grant.runtime.${challenge.challengeDigest.slice(7)}`,
      issuedAt: time,
      expiresAt: challenge.expiresAt,
    });
    expect(result.task.spec).toEqual({
      ...challenge.task.spec,
      initialGrantRef: { grantId: result.grant!.grantId },
    });
    expect(result.effectivePolicy?.evaluation.effectivePolicyDigest).toBe(
      fixture.binding.policy.evaluation.effectivePolicyDigest
    );
    expect(result.effectivePolicy?.evaluation.effectivePolicyDigest).not.toBe(
      result.task.spec.policyDigest
    );
    const rebound = bindAdmittedAgentRuntimeProfile(
      result.task,
      result,
      fixture.config
    );
    expect(rebound?.grant).toEqual(result.grant);
    expect(rebound?.qualification.qualificationDigest).toBe(
      fixture.binding.qualification.qualificationDigest
    );
  });

  it('reuses frozen qualified policy identities for a new server observation and dynamic Task identity', async () => {
    const fixture = runtimeFixture();
    const challenge = {
      ...challengeFor(fixture),
      task: createAgentTaskRecord({
        ...fixture.task.spec,
        taskId: 'task.dynamic',
        idempotencyKey: 'task.dynamic',
      }),
      observedAt: '2026-10-01T00:01:00.000Z',
    };
    const result = await evaluateAgentRuntimeAdmission(
      challenge,
      fixture.config
    );
    expect(result.status).toBe('admitted');
    expect(result.task.spec.taskId).toBe('task.dynamic');
    expect(result.effectivePolicy?.evaluation.evaluatedAt).toBe(time);
  });

  it('returns bounded blocked facts for missing, ambiguous, drifted, expired, or unqualified profiles', async () => {
    const fixture = runtimeFixture();
    const challenge = challengeFor(fixture);
    const cases = [
      { challenge, config: { ...fixture.config, bindings: [] } },
      {
        challenge,
        config: {
          ...fixture.config,
          bindings: [
            fixture.binding,
            { ...fixture.binding, taskId: 'duplicate.template' },
          ],
        },
      },
      {
        challenge: {
          ...challenge,
          actorAuthorizationDigest: digestAgentCanonicalValue('other.actor'),
        },
        config: fixture.config,
      },
      {
        challenge: {
          ...challenge,
          workspace: { ...fixture.workspace, opSeq: 2 },
        },
        config: fixture.config,
      },
      { challenge: { ...challenge, expiresAt: time }, config: fixture.config },
      {
        challenge,
        config: {
          ...fixture.config,
          bindings: [
            {
              ...fixture.binding,
              qualification: {
                ...fixture.binding.qualification,
                qualificationDigest: digestAgentCanonicalValue('unproven'),
              },
            },
          ],
        },
      },
    ];
    for (const vector of cases) {
      const result = await evaluateAgentRuntimeAdmission(
        vector.challenge,
        vector.config
      );
      expect(result.status).toBe('blocked');
      expect(result.grant).toBeUndefined();
      expect(result.effectivePolicy).toBeUndefined();
      expect(result.diagnosticCodes).toHaveLength(1);
      expect(result.admissionDigest).toBe(digestAgentRuntimeAdmission(result));
    }
  });

  it('blocks Task budgets above the trusted policy/grant intersection', async () => {
    const fixture = runtimeFixture();
    const challenge = challengeFor(fixture);
    const task = createAgentTaskRecord({
      ...fixture.task.spec,
      budget: { ...fixture.task.spec.budget, maxModelInvocations: 2 },
    });
    const result = await evaluateAgentRuntimeAdmission(
      { ...challenge, task },
      fixture.config
    );
    expect(result.status).toBe('blocked');
    expect(result.diagnosticCodes).toEqual(['AI-6002']);
  });

  it('rejects a persisted admission widened beyond its configured transport grant', async () => {
    const fixture = runtimeFixture();
    const result = await evaluateAgentRuntimeAdmission(
      challengeFor(fixture),
      fixture.config
    );
    expect(result.status).toBe('admitted');
    const widened = {
      ...result,
      grant: {
        ...result.grant!,
        secretRefs: [
          {
            kind: 'environment',
            referenceId: 'OTHER_KEY',
            purpose: 'model-invocation',
          },
        ],
      },
    };
    expect(
      bindAdmittedAgentRuntimeProfile(
        result.task,
        { ...widened, admissionDigest: digestAgentRuntimeAdmission(widened) },
        fixture.config
      )
    ).toBeUndefined();
  });
});
