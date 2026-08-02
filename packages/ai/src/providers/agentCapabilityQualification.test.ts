import { describe, expect, it } from 'vitest';
import {
  TEST_ADAPTER,
  TEST_DATA_POLICY,
  TEST_EXPIRY,
  TEST_INSTANT,
  TEST_MODEL,
  TEST_PROFILE,
  TEST_PROVIDER,
  createV1EffectivePolicy,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import { createAgentModelLineage } from './agentProviderIdentity';
import {
  InMemoryAgentCapabilityQualificationRepository,
  createAgentQualificationSliceDigest,
  createDeterministicCapabilityProbeAdapter,
  qualifyAgentProviderCapability,
  runAgentCapabilityProbe,
} from './agentCapabilityQualification';

describe('G4 V1 provider capability qualification', () => {
  it('uses an active probe and never promotes admission without exact evaluation', async () => {
    const policy = createV1EffectivePolicy();
    const adapter = createDeterministicCapabilityProbeAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
    });
    const probe = await runAgentCapabilityProbe({
      probeId: 'probe.core.1',
      adapter,
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(probe).toMatchObject({ ok: true, receipt: { status: 'supported' } });
    if (!probe.ok) return;

    const admissionOnly = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probe: probe.receipt,
      policy,
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(admissionOnly).toMatchObject({
      ok: true,
      qualification: { supportTier: 'admission-only' },
    });
    if (!admissionOnly.ok) return;

    const slice = createAgentQualificationSliceDigest({
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      capabilityProfileDigest: TEST_PROFILE.profileDigest,
      policyProfileDigest: policy.evaluation.effectivePolicyDigest,
    });
    const evaluated = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probe: probe.receipt,
      policy,
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
      evaluation: {
        manifestRef: 'evaluation.manifest.test',
        manifestDigest: testDigest('evaluation-manifest'),
        qualificationSliceDigest: slice,
        evaluatedAt: TEST_INSTANT,
        expiresAt: TEST_EXPIRY,
      },
    });
    expect(evaluated).toMatchObject({
      ok: true,
      qualification: { supportTier: 'release-evaluated' },
    });
  });

  it('rejects declared/probed mismatch and mutable lineage freshness drift', async () => {
    const unsupportedAdapter = createDeterministicCapabilityProbeAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [],
    });
    const unsupported = await runAgentCapabilityProbe({
      probeId: 'probe.unsupported',
      adapter: unsupportedAdapter,
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(unsupported).toMatchObject({
      ok: true,
      receipt: { status: 'unsupported' },
    });
    if (!unsupported.ok) return;

    const rejected = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probe: unsupported.receipt,
      policy: createV1EffectivePolicy(),
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) {
      expect(rejected.issues).toContainEqual(
        expect.objectContaining({ code: 'AI-6010', path: '/probe' })
      );
    }

    const mutableModel = createAgentModelLineage({
      modelId: TEST_MODEL.modelId,
      modelFamilyId: TEST_MODEL.modelFamilyId,
      modelFamilyOwnerId: TEST_MODEL.modelFamilyOwnerId,
    });
    const supported = await runAgentCapabilityProbe({
      probeId: 'probe.mutable',
      adapter: createDeterministicCapabilityProbeAdapter({
        identity: TEST_ADAPTER,
        declaredProfileDigests: [TEST_PROFILE.profileDigest],
        supportedProfileDigests: [TEST_PROFILE.profileDigest],
      }),
      provider: TEST_PROVIDER,
      model: mutableModel,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: '2026-08-03T00:00:00.000Z',
    });
    if (!supported.ok) return;
    const staleAlias = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: mutableModel,
      profile: TEST_PROFILE,
      probe: supported.receipt,
      policy: createV1EffectivePolicy(),
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: '2026-08-03T00:00:00.000Z',
    });
    expect(staleAlias).toMatchObject({ ok: false });
    if (!staleAlias.ok) {
      expect(staleAlias.issues).toContainEqual(
        expect.objectContaining({ path: '/model/immutableVersion' })
      );
    }
  });

  it('rejects a tampered active-probe receipt before qualification', async () => {
    const adapter = createDeterministicCapabilityProbeAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
    });
    const probe = await runAgentCapabilityProbe({
      probeId: 'probe.tampered',
      adapter,
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    if (!probe.ok) return;
    const result = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probe: {
        ...probe.receipt,
        probedCapabilityDigest: testDigest('tampered-probe'),
      },
      policy: createV1EffectivePolicy(),
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-6010' }),
      ]),
    });
  });

  it('stores and retrieves only the exact provider/model/profile/policy key', async () => {
    const policy = createV1EffectivePolicy();
    const probe = await runAgentCapabilityProbe({
      probeId: 'probe.repository',
      adapter: createDeterministicCapabilityProbeAdapter({
        identity: TEST_ADAPTER,
        declaredProfileDigests: [TEST_PROFILE.profileDigest],
        supportedProfileDigests: [TEST_PROFILE.profileDigest],
      }),
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    if (!probe.ok) return;
    const result = qualifyAgentProviderCapability({
      provider: TEST_PROVIDER,
      providerDataPolicy: TEST_DATA_POLICY,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probe: probe.receipt,
      policy,
      sensitivity: 'internal',
      evaluatedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    if (!result.ok) return;
    const repository = new InMemoryAgentCapabilityQualificationRepository();
    repository.put(result.qualification);
    expect(
      repository.find({
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        capabilityProfileDigest: TEST_PROFILE.profileDigest,
        policyProfileDigest: policy.evaluation.effectivePolicyDigest,
        at: '2026-08-01T06:00:00.000Z',
      })
    ).toMatchObject({ status: 'found' });
    expect(
      repository.find({
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        capabilityProfileDigest: testDigest('different-profile'),
        policyProfileDigest: policy.evaluation.effectivePolicyDigest,
        at: '2026-08-01T06:00:00.000Z',
      })
    ).toEqual({ status: 'missing' });
    expect(
      repository.find({
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        capabilityProfileDigest: TEST_PROFILE.profileDigest,
        policyProfileDigest: policy.evaluation.effectivePolicyDigest,
        at: TEST_EXPIRY,
      })
    ).toMatchObject({ status: 'expired' });
  });

  it('fails closed on drifted probe slices and probe transport failures', async () => {
    const adapter = createDeterministicCapabilityProbeAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
    });
    const drifted = await runAgentCapabilityProbe({
      probeId: 'probe.drifted-profile',
      adapter,
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: {
        ...TEST_PROFILE,
        hardLimits: { ...TEST_PROFILE.hardLimits, maxInputBytes: 1 },
      },
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(drifted).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '/probeSlice' }),
      ]),
    });

    const failed = await runAgentCapabilityProbe({
      probeId: 'probe.transport-failure',
      adapter: {
        ...adapter,
        probe: () => {
          throw new Error('probe unavailable');
        },
      },
      provider: TEST_PROVIDER,
      model: TEST_MODEL,
      profile: TEST_PROFILE,
      probedAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(failed).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: '/observation' })],
    });
  });
});
