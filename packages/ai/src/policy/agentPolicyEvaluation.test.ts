import { describe, expect, it } from 'vitest';
import { digestAgentPolicy } from '../domain/agentPolicyCodec';
import {
  TEST_DATA_POLICY,
  TEST_MODEL,
  TEST_PROFILE,
  TEST_PROVIDER,
  TEST_INSTANT,
  createV1EffectivePolicy,
  createV1Policy,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import {
  evaluateAgentProviderAdmission,
  evaluateEffectiveAgentPolicy,
  type AgentPolicyLayer,
} from './agentPolicyEvaluation';

describe('G4 V1 effective AgentPolicy', () => {
  it('takes the strict intersection and creates an order-independent digest', () => {
    const effective = createV1EffectivePolicy((policy, kind) =>
      kind === 'grant'
        ? {
            ...policy,
            contextRules: {
              ...policy.contextRules,
              maxItems: 16,
              maxBytes: 32_768,
              maximumSensitivity: 'public',
            },
            budgetCeiling: {
              ...policy.budgetCeiling,
              usageLimits: [
                { unit: 'image', maximum: '2' },
                { unit: 'text-token-input', maximum: '1000' },
                { unit: 'text-token-output', maximum: '500' },
              ],
              costLimits: [{ currency: 'USD', maximum: '1.5' }],
              maxModelInvocations: 2,
            },
            privacy: {
              ...policy.privacy,
              maximumSensitivity: 'public',
            },
          }
        : policy
    );

    expect(effective.contextRules).toMatchObject({
      maxItems: 16,
      maxBytes: 32_768,
      maximumSensitivity: 'public',
      requireSourceTrace: true,
    });
    expect(effective.budgetCeiling).toMatchObject({
      maxModelInvocations: 2,
      usageLimits: [
        { unit: 'image', maximum: '2' },
        { unit: 'text-token-input', maximum: '1000' },
        { unit: 'text-token-output', maximum: '500' },
      ],
      costLimits: [{ currency: 'USD', maximum: '1.5' }],
    });
    expect(effective.privacy.maximumSensitivity).toBe('public');

    const reversed = evaluateEffectiveAgentPolicy({
      projectPolicyRef: { documentId: 'policy.project' },
      layers: [...effective.layers].reverse(),
      actorAuthorizationDigest: effective.evaluation.actorAuthorizationDigest,
      evaluatedAt: TEST_INSTANT,
    });
    expect(reversed).toMatchObject({ ok: true });
    if (reversed.ok) {
      expect(reversed.value.evaluation.effectivePolicyDigest).toBe(
        effective.evaluation.effectivePolicyDigest
      );
    }
  });

  it('fails closed on missing authority layers and digest drift', () => {
    const project = createV1Policy('policy.project');
    const layers: AgentPolicyLayer[] = [
      {
        kind: 'project',
        issuer: 'issuer.project',
        policy: project,
        policyDigest: testDigest('not-the-policy'),
      },
    ];
    const result = evaluateEffectiveAgentPolicy({
      projectPolicyRef: { documentId: project.id },
      layers,
      actorAuthorizationDigest: testDigest('actor'),
      evaluatedAt: TEST_INSTANT,
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.issues.map(({ path }) => path)).toEqual(
        expect.arrayContaining(['/layers', '/layers/0/policyDigest'])
      );
    }
    expect(digestAgentPolicy(project)).not.toBe(layers[0]!.policyDigest);
  });

  it('admits only a provider/model/data slice allowed by every layer', () => {
    const effective = createV1EffectivePolicy();
    expect(
      evaluateAgentProviderAdmission(effective, {
        provider: TEST_PROVIDER,
        model: TEST_MODEL,
        capabilityProfile: TEST_PROFILE,
        supportTier: 'admission-only',
        sensitivity: 'internal',
        dataPolicy: TEST_DATA_POLICY,
      })
    ).toEqual({
      allowed: true,
      policyDigest: effective.evaluation.effectivePolicyDigest,
    });

    const residencyMismatch = createV1EffectivePolicy((policy, kind) =>
      kind === 'organization'
        ? {
            ...policy,
            privacy: { ...policy.privacy, allowedRegions: ['eu-west-1'] },
          }
        : policy
    );
    const denied = evaluateAgentProviderAdmission(residencyMismatch, {
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      capabilityProfile: TEST_PROFILE,
      supportTier: 'admission-only',
      sensitivity: 'internal',
      dataPolicy: TEST_DATA_POLICY,
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.issues).toContainEqual(
        expect.objectContaining({
          code: 'AI-6011',
          path: '/provider/region',
        })
      );
    }
  });

  it('rejects drifted effective views and provider-slice identities', () => {
    const effective = createV1EffectivePolicy();
    const widened = evaluateAgentProviderAdmission(
      {
        ...effective,
        privacy: {
          ...effective.privacy,
          maximumSensitivity: 'restricted',
        },
      },
      {
        provider: TEST_PROVIDER,
        model: TEST_MODEL,
        capabilityProfile: TEST_PROFILE,
        supportTier: 'admission-only',
        sensitivity: 'internal',
        dataPolicy: TEST_DATA_POLICY,
      }
    );
    expect(widened).toMatchObject({
      allowed: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '/effectivePolicy' }),
      ]),
    });

    const driftedSlice = evaluateAgentProviderAdmission(effective, {
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      capabilityProfile: TEST_PROFILE,
      supportTier: 'admission-only',
      sensitivity: 'internal',
      dataPolicy: { ...TEST_DATA_POLICY, retentionDays: 1 },
    });
    expect(driftedSlice).toMatchObject({
      allowed: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '/providerSlice' }),
      ]),
    });
  });
});
