import { describe, expect, it, vi } from 'vitest';
import {
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
} from '@prodivix/ai';
import {
  createVerificationPlan,
  digestVerificationValue,
  normalizeVerificationPolicy,
  createVerificationRunSnapshot,
} from '@prodivix/verification';
import { runtimeApplyFixture } from '#src/apply.fixture.js';
import { createAgentRuntimeVerificationDriver } from '#src/verificationDriver.js';
import { time } from '#src/runtime.fixture.js';

const harness = () => {
  const fixture = runtimeApplyFixture();
  const policy = evaluateEffectiveAgentPolicy({
    projectPolicyRef: fixture.task.spec.policyRef,
    actorAuthorizationDigest:
      fixture.binding.policy.evaluation.actorAuthorizationDigest,
    evaluatedAt: time,
    layers: fixture.binding.policy.layers.map((layer) => {
      const policy = {
        ...layer.policy,
        networkRules: layer.policy.networkRules.map((rule) => ({
          ...rule,
          hosts: [...rule.hosts, 'verification.invalid'],
        })),
        secretRules: layer.policy.secretRules.map((rule) => ({
          ...rule,
          purposes: [...rule.purposes, 'verification-execution'],
        })),
      };
      return { ...layer, policy, policyDigest: digestAgentPolicy(policy) };
    }),
  });
  if (!policy.ok) throw new Error('Fixture policy invalid');
  const binding = {
    ...fixture.binding,
    policy: policy.value,
    grant: {
      ...fixture.binding.grant,
      secretRefs: [
        ...fixture.binding.grant.secretRefs,
        {
          kind: 'environment' as const,
          referenceId: 'DRIVER_FIXTURE_KEY',
          purpose: 'verification-execution',
        },
      ],
    },
  };
  const plan = fixture.projection.verificationPlan;
  const run = createVerificationRunSnapshot({
    runId: 'verification.driver.fixture',
    plan,
    surface: plan.cells[0]!.surface,
    scope: 'required',
    origin: 'cli',
    providerId: binding.verificationDriver.providerId,
    selectedCellIds: plan.cells.map(({ id }) => id),
    attemptIdByCellId: Object.fromEntries(
      plan.cells.map(({ id }) => [id, 'attempt.fixture'])
    ),
    createdAt: time,
  });
  const input = {
    binding,
    task: fixture.task,
    workspace: fixture.projection.projectedTargetSnapshot,
    plan,
    run,
    agentRunId: fixture.run.run.runId,
    authority: {
      leaseId: 'lease.fixture',
      holderId: 'worker.fixture',
      generation: fixture.run.run.generation,
      observedAt: time,
    },
  };
  return { input, fixture };
};

describe('ordinary actual G3 driver transport', () => {
  it('requires actual resource preflight and exact ACK while transporting only short authority and an env-resolved credential', async () => {
    const h = harness();
    const payloads: Record<string, unknown>[] = [];
    const headers: Headers[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      payloads.push(body);
      headers.push(init!.headers as Headers);
      expect(new Headers(init!.headers).get('Authorization')).toBe(
        'Bearer fixture-driver-private'
      );
      return Response.json({
        accepted: true,
        requestDigest: digestAgentCanonicalValue(body),
        providerId: h.input.binding.verificationDriver.providerId,
        ...(body.contract === 'prodivix.agent-runtime-g3-preflight'
          ? {
              adapterRegistryDigest: h.input.plan.adapterRegistryDigest,
              checkKinds: [
                ...new Set(
                  h.input.plan.cells.map(({ checkKind }) => checkKind)
                ),
              ],
              resourcesReady: true,
            }
          : {
              verificationRunId: h.input.run.runId,
              planDigest: h.input.plan.planDigest,
            }),
      });
    });
    const driver = createAgentRuntimeVerificationDriver({
      fetch,
      environment: { DRIVER_FIXTURE_KEY: 'fixture-driver-private' },
    });
    await driver.preflight(h.input);
    await driver.dispatch(h.input);
    await driver.cancel({
      ...h.input,
      authority: undefined,
      cancellationCommandId: 'cancel.fixture',
    });
    expect(payloads.map(({ contract }) => contract)).toEqual([
      'prodivix.agent-runtime-g3-preflight',
      'prodivix.agent-runtime-g3-execution',
      'prodivix.agent-runtime-g3-cancellation',
    ]);
    expect(payloads[0]!.workspace).toEqual(
      h.fixture.projection.projectedTargetSnapshot
    );
    expect(payloads[1]).toMatchObject({
      agentRunId: h.input.agentRunId,
      authority: h.input.authority,
    });
    expect(payloads[2]).toMatchObject({
      cancellationCommandId: 'cancel.fixture',
    });
    expect(payloads[2]).not.toHaveProperty('authority');
    expect(JSON.stringify(payloads)).not.toContain('fixture-driver-private');
    expect(headers.every((header) => !header.has('Authorization'))).toBe(true);
  });
  it.each(['resources', 'checks', 'digest', 'registry'] as const)(
    'rejects %s drift before authoring can be requested',
    async (kind) => {
      const h = harness();
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const body = JSON.parse(String(init!.body));
        return Response.json({
          accepted: true,
          providerId: h.input.binding.verificationDriver.providerId,
          requestDigest:
            kind === 'digest'
              ? digestAgentCanonicalValue('drift')
              : digestAgentCanonicalValue(body),
          adapterRegistryDigest:
            kind === 'registry'
              ? digestAgentCanonicalValue('drift')
              : h.input.plan.adapterRegistryDigest,
          checkKinds: kind === 'checks' ? [] : ['integration'],
          resourcesReady: kind !== 'resources',
        });
      });
      await expect(
        createAgentRuntimeVerificationDriver({
          fetch,
          environment: { DRIVER_FIXTURE_KEY: 'fixture-driver-private' },
        }).preflight(h.input)
      ).rejects.toThrow('AI-6001');
    }
  );
  it('rejects missing callback credential before contacting the driver', async () => {
    const h = harness();
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createAgentRuntimeVerificationDriver({
        fetch,
        environment: {},
      }).preflight(h.input)
    ).rejects.toThrow('AI-7001');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('admits only the required check kinds when the approved Plan also carries an optional check', async () => {
    const h = harness();
    const source = h.input.binding.verification;
    const policy = {
      ...source.policy,
      rules: [
        ...source.policy.rules,
        {
          ...source.policy.rules[0]!,
          id: 'rule.advisory.build',
          checkKinds: ['build' as const],
          requirement: 'advisory' as const,
        },
      ],
    };
    const actual = createVerificationPlan({
      ...source,
      policy,
      policyDigest: digestVerificationValue(
        normalizeVerificationPolicy(policy)
      ),
      impactSet: h.fixture.projection.impactSet,
      checks: [
        ...source.checks,
        { ...source.checks[0]!, id: 'check.advisory.build', kind: 'build' },
      ],
    });
    if (actual.status !== 'ready') throw new Error('Optional Plan failed');
    expect(
      actual.plan.cells.some(
        ({ checkKind, requirement }) =>
          checkKind === 'build' && requirement === 'advisory'
      )
    ).toBe(true);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      return Response.json({
        accepted: true,
        requestDigest: digestAgentCanonicalValue(body),
        providerId: h.input.binding.verificationDriver.providerId,
        adapterRegistryDigest: actual.plan.adapterRegistryDigest,
        checkKinds: ['integration'],
        resourcesReady: true,
      });
    });
    await expect(
      createAgentRuntimeVerificationDriver({
        fetch,
        environment: { DRIVER_FIXTURE_KEY: 'fixture-driver-private' },
      }).preflight({ ...h.input, plan: actual.plan })
    ).resolves.toBeUndefined();
  });
});
