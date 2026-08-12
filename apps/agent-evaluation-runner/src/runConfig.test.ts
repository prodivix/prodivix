import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST,
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentCapabilityProbeResponseSpoolEncryptionProfile,
  createAgentModelEvaluationBudget,
  createAgentPricingSnapshot,
  createAgentUsageVector,
  digestAgentEvaluationCapabilityDescriptor,
  digestAgentCanonicalValue,
  planAgentModelEvaluationAttempts,
  priceAgentUsage,
  resolveAgentEvaluationCapabilityDescriptor,
  type AgentModelEvaluationBudget,
  type AgentPricingSnapshot,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_REF,
} from './capabilityProbeResponseSpoolKey';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV,
  AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_AAD_FORMAT,
  AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_NAMESPACE_ID,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AAD_FORMAT,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_ID,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ID,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_REF,
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_PLAINTEXT_BYTES,
  AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
  AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
  AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
  AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
  AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS,
  AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID,
  createAgentEvaluationProductionRunConfigDocument,
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile,
  decodeAgentEvaluationFrozenRunConfig,
  decodeAgentEvaluationRunConfigQualificationTemplate,
  requireProductionAgentEvaluationFrozenRunConfig,
  resolveAgentEvaluationProtectedMaterialFiles,
} from './runConfig';
import {
  createAgentEvaluationTestProbeProviderResourceAuthorityBundle,
  createAgentEvaluationTestQualificationAuthorityBundle,
  materializeAgentEvaluationTestProductionRunConfig,
  refreshAgentEvaluationTestMaterialCatalogDigests,
} from './runConfig.fixture';

const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);
const exampleText = readFileSync(examplePath, 'utf8');
const fixedInstant = '2026-08-08T00:00:00.000Z';
const exactCommit = '0123456789abcdef0123456789abcdef01234567';

const cloneTemplate = (): Record<string, unknown> => {
  const source = JSON.parse(exampleText) as Record<string, unknown>;
  refreshAgentEvaluationTestMaterialCatalogDigests(source);
  return source;
};

const cloneExample = (): Record<string, unknown> =>
  materializeAgentEvaluationTestProductionRunConfig(cloneTemplate());

const recordAt = (
  value: unknown,
  ...path: string[]
): Record<string, unknown> => {
  let current = value;
  for (const key of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    )
      throw new Error('bad test fixture path');
    current = (current as Record<string, unknown>)[key];
  }
  if (current === null || typeof current !== 'object' || Array.isArray(current))
    throw new Error('bad test fixture record');
  return current as Record<string, unknown>;
};

const arrayAt = (value: unknown, ...path: string[]): unknown[] => {
  let current = value;
  for (const key of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    )
      throw new Error('bad test fixture path');
    current = (current as Record<string, unknown>)[key];
  }
  if (!Array.isArray(current)) throw new Error('bad test fixture array');
  return current;
};

const decode = (input: unknown = cloneExample()) =>
  decodeAgentEvaluationFrozenRunConfig(input, {
    clock: () => fixedInstant,
    expectedRepositoryCommit: exactCommit,
  });

const expectInvalid = (callback: () => unknown): void => {
  expect(callback).toThrowError(
    expect.objectContaining({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      message: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    })
  );
};

const refreshBudgetDigest = (config: unknown): void => {
  const source = recordAt(config, 'budget');
  const { budgetDigest: _budgetDigest, ...base } = source;
  const normalized = createAgentModelEvaluationBudget(
    base as Omit<AgentModelEvaluationBudget, 'budgetDigest'>
  );
  source.budgetDigest = normalized.budgetDigest;
};

const refreshPricingAuthority = (
  config: unknown,
  providerKey: 'openaiResponses' | 'anthropicMessages' | 'geminiInteractions'
): void => {
  const provider = recordAt(config, 'providers', providerKey);
  const model = recordAt(provider, 'model');
  const pricing = recordAt(provider, 'pricing');
  const source = recordAt(pricing, 'source');
  source.sourceReceiptDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-pricing-source-observation',
    version: 1,
    sourceUri: source.sourceUri,
    observedAt: source.observedAt,
    sourceContentDigest: source.sourceContentDigest,
  });
  const snapshotSource = recordAt(pricing, 'snapshot');
  const { snapshotDigest: _snapshotDigest, ...snapshotBase } = snapshotSource;
  const snapshot = createAgentPricingSnapshot(
    snapshotBase as Omit<AgentPricingSnapshot, 'snapshotDigest'>
  );
  pricing.snapshot = snapshot;
  pricing.authorityDigest = digestAgentCanonicalValue({
    providerConfigurationId: provider.providerConfigurationId,
    modelId: model.modelId,
    immutableModelVersion: model.immutableVersion,
    modelTier: pricing.modelTier,
    source,
    snapshot,
  });
};

const refreshCompatibilityPricingAuthority = (
  config: unknown,
  role: 'hosted' | 'local'
): void => {
  const smoke = recordAt(config, 'compatibilitySmokes', role);
  const runtime = recordAt(smoke, 'runtime');
  const pricing = recordAt(runtime, 'pricing');
  const source = recordAt(pricing, 'source');
  source.sourceReceiptDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-pricing-source-observation',
    version: 1,
    sourceUri: source.sourceUri,
    observedAt: source.observedAt,
    sourceContentDigest: source.sourceContentDigest,
  });
  const snapshotSource = recordAt(pricing, 'snapshot');
  const { snapshotDigest: _snapshotDigest, ...snapshotBase } = snapshotSource;
  const snapshot = createAgentPricingSnapshot(
    snapshotBase as Omit<AgentPricingSnapshot, 'snapshotDigest'>
  );
  pricing.snapshot = snapshot;
  pricing.authorityDigest = digestAgentCanonicalValue({
    providerConfigurationId: smoke.providerConfigurationId,
    modelId: smoke.modelId,
    immutableModelVersion: smoke.immutableModelVersion,
    modelTier: pricing.modelTier,
    source,
    snapshot,
  });
};

const refreshCompatibilitySmoke = (
  config: unknown,
  role: 'hosted' | 'local'
): void => {
  const smoke = recordAt(config, 'compatibilitySmokes', role);
  const runtime = recordAt(smoke, 'runtime');
  refreshCompatibilityPricingAuthority(config, role);
  const { runtimeDigest: _runtimeDigest, ...runtimeBase } = runtime;
  const pricing = recordAt(runtime, 'pricing');
  runtime.runtimeDigest = digestAgentCanonicalValue({
    ...runtimeBase,
    pricing: {
      providerConfigurationId: smoke.providerConfigurationId,
      modelId: smoke.modelId,
      immutableModelVersion: smoke.immutableModelVersion,
      modelTier: pricing.modelTier,
      source: pricing.source,
      snapshot: pricing.snapshot,
      authorityDigest: pricing.authorityDigest,
    },
  });
  smoke.smokeProfileDigest = digestAgentCanonicalValue({
    runtimeDigest: runtime.runtimeDigest,
    smokeBehaviorProfileDigest: smoke.smokeBehaviorProfileDigest,
  });
};

describe('frozen real-model evaluation run config', () => {
  it('decodes the checked-in template directly with current canonical material roots', () => {
    const source = JSON.parse(exampleText) as {
      capabilityProbeResponseSpoolEncryption: {
        encryptionPolicyDigest: string;
      };
      nativeProviderStateVaultEncryption: {
        encryptionPolicyDigest: string;
      };
      hostedRetrievalRuntimeResourceLifecycleSpool: {
        profileDigest: string;
      };
    };
    const template =
      decodeAgentEvaluationRunConfigQualificationTemplate(source);

    expect(template).toMatchObject({
      purpose: 'template',
      repositoryCommit: exactCommit,
    });
    expect(template.nativeIdentities).toHaveLength(3);
    expect(template.planLifetimeMs).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(template.sourceConfigDigest).toBe(digestAgentCanonicalValue(source));
    expect(
      template.capabilityProbeResponseSpoolEncryption.encryptionPolicyDigest
    ).toBe(
      source.capabilityProbeResponseSpoolEncryption.encryptionPolicyDigest
    );
    expect(template).not.toHaveProperty('responseSpoolEncryption');
    expect(
      template.hostedRetrievalRuntimeResourceLifecycleSpool.profileDigest
    ).toBe(source.hostedRetrievalRuntimeResourceLifecycleSpool.profileDigest);
    expect(
      template.nativeProviderStateVaultEncryption.encryptionPolicyDigest
    ).toBe(source.nativeProviderStateVaultEncryption.encryptionPolicyDigest);
  });

  it('keeps provider resources dynamic and cross-binds the four supported production authorities', () => {
    const template =
      decodeAgentEvaluationRunConfigQualificationTemplate(cloneTemplate());
    for (const identity of template.nativeIdentities) {
      expect(identity).not.toHaveProperty(
        'capabilityProbeProviderResourceAuthorities'
      );
    }
    expect(template).not.toHaveProperty('probeProviderResourceAuthorityBundle');

    const config = decode();
    expect(
      Object.keys(config.probeProviderResourceAuthorityBundle.authorities)
    ).toEqual([
      ...AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
    ]);
    expect(
      Object.hasOwn(
        config.probeProviderResourceAuthorityBundle.authorities,
        'anthropic-messages'
      )
    ).toBe(false);
    for (const protocolFamily of AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES) {
      const identity = template.nativeIdentities.find(
        (candidate) => candidate.protocolFamily === protocolFamily
      );
      if (!identity) throw new TypeError('Provider identity is missing.');
      const authorities =
        config.probeProviderResourceAuthorityBundle.authorities[protocolFamily];
      expect(Object.keys(authorities)).toHaveLength(2);
      for (const profileId of [
        'g4-provider-hosted-retrieval-core',
        'g4-provider-hosted-retrieval-document',
      ] as const) {
        const authority = authorities[profileId];
        expect(authority).toMatchObject({
          capabilityProfileId: profileId,
          probeProgramDigest:
            identity.capabilityProbePrograms[profileId].programDigest,
          protocolFamily: identity.protocolFamily,
          providerConfigurationId: identity.providerConfigurationId,
          modelId: identity.model.modelId,
        });
        expect(
          Date.parse(authority.expiresAt) - Date.parse(authority.registeredAt)
        ).toBe(8 * 24 * 60 * 60 * 1_000);
      }
    }

    const dynamicTemplate = cloneTemplate();
    dynamicTemplate.probeProviderResourceAuthorityBundle = {};
    expectInvalid(() =>
      decodeAgentEvaluationRunConfigQualificationTemplate(dynamicTemplate)
    );

    const missingProductionBundle = cloneExample();
    delete missingProductionBundle.probeProviderResourceAuthorityBundle;
    expectInvalid(() => decode(missingProductionBundle));

    const swappedProductionBundle = cloneExample();
    recordAt(
      swappedProductionBundle,
      'probeProviderResourceAuthorityBundle'
    ).bundleDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(swappedProductionBundle));
  }, 30_000);

  it('cross-binds every frozen capability expectation into case, attempt, and required receipt coverage', () => {
    const config = decode();
    const publicFixtureByCaseId = new Map(
      G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures.map((fixture) => [
        fixture.caseId,
        fixture,
      ])
    );
    for (const evaluationCase of config.plan.concreteCases) {
      const fixture = publicFixtureByCaseId.get(evaluationCase.caseId);
      if (!fixture) {
        expect(evaluationCase.access, evaluationCase.caseId).not.toBe('public');
        expect(
          evaluationCase.capabilityDescriptorDigest,
          evaluationCase.caseId
        ).toMatch(/^sha256-[a-f0-9]{64}$/u);
        continue;
      }
      expect(
        fixture.workspaceFixture.capabilities,
        evaluationCase.caseId
      ).toHaveLength(1);
      const [expectation] = fixture.workspaceFixture.capabilities;
      expect(expectation, evaluationCase.caseId).toBeDefined();
      if (!expectation) continue;
      const expectedDigest = digestAgentEvaluationCapabilityDescriptor({
        capabilityId: expectation.capabilityId,
        supportExpectation: expectation.support,
        expectedToolIds: expectation.toolIds,
        expectedReceiptKinds: expectation.expectedReceiptKinds,
      });
      expect(expectation.descriptorDigest, evaluationCase.caseId).toBe(
        expectedDigest
      );
      expect(
        evaluationCase.capabilityDescriptorDigest,
        evaluationCase.caseId
      ).toBe(expectedDigest);
    }

    const descriptors = planAgentModelEvaluationAttempts(config.plan);
    const caseById = new Map(
      config.plan.concreteCases.map((evaluationCase) => [
        evaluationCase.caseId,
        evaluationCase,
      ])
    );
    const targetById = new Map(
      config.plan.capabilityQualificationTargets.map((target) => [
        target.targetId,
        target,
      ])
    );
    const requiredCoverageKeys = descriptors.map((descriptor) => {
      const evaluationCase = caseById.get(descriptor.caseId);
      const target = targetById.get(descriptor.targetId);
      expect(evaluationCase, descriptor.attemptId).toBeDefined();
      expect(target, descriptor.attemptId).toBeDefined();
      expect(descriptor.capabilityDescriptorDigest, descriptor.attemptId).toBe(
        evaluationCase && target
          ? resolveAgentEvaluationCapabilityDescriptor(evaluationCase, target)
              .descriptorDigest
          : undefined
      );
      return `${descriptor.attemptId}\u0000${descriptor.capabilityDescriptorDigest}`;
    });
    expect(descriptors).toHaveLength(config.plan.plannedJourneyCount);
    expect(new Set(requiredCoverageKeys)).toHaveLength(
      config.plan.plannedJourneyCount
    );
  }, 30_000);

  it('freezes the required parallel-capable domain-tool loop into both policy digests', () => {
    const source = cloneExample();
    const controlledRuntime = recordAt(source, 'controlledRuntime');
    const loop = recordAt(controlledRuntime, 'loop');

    expect(
      G4_V8_MINIMUM_EVALUATION_CORPUS.cases.some(
        ({ familyId }) => familyId === 'capability.parallel-tool'
      )
    ).toBe(true);
    expect(loop).toMatchObject({
      domainToolChoice: 'required',
      allowParallelDomainToolCalls: true,
      maximumAggregateArtifactBytes: 8_388_608,
    });
    expect(Object.keys(loop).sort()).toEqual(
      [
        'domainToolChoice',
        'allowParallelDomainToolCalls',
        'maximumTurnsPerAttempt',
        'maximumToolCallsPerAttempt',
        'maximumRepairRoundsPerAttempt',
        'maximumToolResultBytes',
        'maximumAggregateToolResultBytes',
        'maximumAggregateArtifactBytes',
        'continuationTimeoutMs',
        'loopPolicyDigest',
      ].sort()
    );
    const { loopPolicyDigest, ...loopBase } = loop;
    expect(loopPolicyDigest).toBe(digestAgentCanonicalValue(loopBase));
    const { runtimePolicyDigest, ...runtimeBase } = controlledRuntime;
    expect(runtimePolicyDigest).toBe(digestAgentCanonicalValue(runtimeBase));
  });

  it('maps the exact provider, material, policy, budget, and clock contract into a frozen plan', () => {
    let clockCalls = 0;
    const config = decodeAgentEvaluationFrozenRunConfig(cloneExample(), {
      clock: () => {
        clockCalls += 1;
        return fixedInstant;
      },
      expectedRepositoryCommit: exactCommit,
    });

    expect(clockCalls).toBe(1);
    expect(config.purpose).toBe('production');
    expect(config.sourceConfigDigest).toBe(
      digestAgentCanonicalValue(cloneExample())
    );
    expect(config.plan.repositoryCommit).toBe(exactCommit);
    expect(config.plan.plannedAt).toBe(fixedInstant);
    expect(config.plan.expiresAt).toBe('2026-08-15T00:00:00.000Z');
    expect(config.plan.providerConfigurations).toHaveLength(3);
    expect(config.plan.capabilityQualificationTargets).toHaveLength(27);
    expect(config.plan.endpointSmokeTargets).toHaveLength(5);
    expect(
      config.plan.endpointSmokeTargets.every(
        ({ protocolFamily, modelId, immutableModelVersion }) =>
          protocolFamily === 'gemini-interactions' ||
          modelId === immutableModelVersion
      )
    ).toBe(true);
    expect(config.plan.plannedJourneyCount).toBe(14_040);
    expect(config.restrictedEnvelopeLocators).toHaveLength(32);
    expect(config.materialCatalog.entries).toHaveLength(128);
    expect(recordAt(cloneExample(), 'thresholds').metricCatalogDigest).toBe(
      AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST
    );
    expect(recordAt(cloneExample(), 'policies').outputSchemaDigest).toBe(
      AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST
    );
    expect(config.plan.budget.budget.maxRepairRounds).toBeGreaterThan(0);
    expect(config.execution.retry.maximumAttempts).toBe(1);
    expect(config.controlledRuntime.loop).toMatchObject({
      domainToolChoice: 'required',
      allowParallelDomainToolCalls: true,
      maximumTurnsPerAttempt: 7,
      maximumToolCallsPerAttempt: 4,
      maximumRepairRoundsPerAttempt: 2,
      maximumAggregateArtifactBytes: 8_388_608,
    });
    expect(config.responseSpoolEncryption).toMatchObject({
      algorithm: 'AES-256-GCM',
      nonceBytes: 12,
      authenticationTagBytes: 16,
      aadFormat: 'prodivix.agent-evaluation-provider-result-spool-aad',
      aadVersion: 1,
      namespaceId: AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID,
      keyId: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
      keyVersion: 1,
      keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
      keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
      maximumPlaintextBytes:
        AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
      retention: {
        maximumAgeMs: AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS,
        disposition: 'delete-after-durable-attempt-commit-or-maximum-age',
      },
    });
    expect(
      config.plan.repetitionPolicy.cacheAndStateIsolationPolicyDigest
    ).toBe(config.responseSpoolEncryption.encryptionPolicyDigest);
    expect(config.responseSpoolEncryption.keyRefDigest).toBe(
      digestAgentCanonicalValue({
        keyId: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
        keyVersion: 1,
        keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
        keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
      })
    );
    expect(config.responseSpoolEncryption.encryptionProfileDigest).toBe(
      digestAgentCanonicalValue({
        algorithm: 'AES-256-GCM',
        nonceBytes: 12,
        authenticationTagBytes: 16,
        aadFormat: 'prodivix.agent-evaluation-provider-result-spool-aad',
        aadVersion: 1,
        maximumPlaintextBytes:
          AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
      })
    );
    expect(config.responseSpoolEncryption).not.toHaveProperty('keyValueBase64');
    expect(config.capabilityProbeResponseSpoolEncryption).toMatchObject({
      format: 'prodivix.g4-capability-probe-response-spool-encryption',
      algorithm: 'AES-256-GCM',
      nonceBytes: 12,
      authenticationTagBytes: 16,
      aadFormat: 'prodivix.agent-capability-probe-response-spool-aad',
      aadVersion: 1,
      namespaceId: 'g4-capability-probe-response-spool',
      keyId: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ID,
      keyVersion: 1,
      keyEnvironmentName:
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
      keyRef: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_REF,
      maximumPlaintextBytes: 1_048_576,
      retention: {
        maximumAgeMs: 8 * 24 * 60 * 60 * 1_000,
        disposition: 'delete-after-durable-probe-admission-or-maximum-age',
      },
    });
    expect(config.capabilityProbeResponseSpoolEncryption).not.toHaveProperty(
      'keyValueBase64'
    );
    expect(config.hostedRetrievalRuntimeResourceLifecycleSpool).toMatchObject({
      keyReference:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY,
      encryptionProfile:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE,
      retentionPolicy:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY,
      maximumMetadataBytes: 65_536,
    });
    expect(
      config.hostedRetrievalRuntimeResourceLifecycleSpool.retentionPolicy
        .maximumAgeMs
    ).toBe(8 * 24 * 60 * 60 * 1_000);
    expect(
      config.hostedRetrievalRuntimeResourceLifecycleSpool
    ).not.toHaveProperty('keyValueBase64');
    expect(
      config.capabilityProbeResponseSpoolEncryption.encryptionProfileDigest
    ).not.toBe(config.responseSpoolEncryption.encryptionProfileDigest);
    expect(
      config.capabilityProbeResponseSpoolEncryption.encryptionPolicyDigest
    ).not.toBe(config.responseSpoolEncryption.encryptionPolicyDigest);
    expect(
      config.capabilityProbeResponseSpoolEncryption.encryptionPolicyDigest
    ).not.toBe(
      config.endpointSmokeResponseSpoolEncryption.encryptionPolicyDigest
    );
    expect(config.nativeProviderStateVaultEncryption).toEqual(
      createAgentEvaluationNativeProviderStateVaultEncryptionProfile()
    );
    expect(config.nativeProviderStateVaultEncryption).toMatchObject({
      format: 'prodivix.g4-native-provider-state-vault-encryption-profile',
      algorithm: 'aes-256-gcm',
      nonceBytes: 12,
      authenticationTagBytes: 16,
      aadFormat: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AAD_FORMAT,
      maximumPlaintextBytes:
        AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_PLAINTEXT_BYTES,
      keyId: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ID,
      keyEnvironmentName: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV,
      keyRef: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_REF,
      authority: {
        authorityId: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_ID,
        storageMode: 'server-side-vault-record',
        cryptographicExpiryMode: 'per-state-data-key-destroy',
        algorithm: 'aes-256-gcm',
        maximumLifecycleAckDelayMs: 30_000,
        reconciliationMode: 'request-digest-idempotent',
      },
    });
    expect(config.nativeProviderStateVaultEncryption).not.toHaveProperty(
      'keyValueBase64'
    );
    for (const profile of [
      config.responseSpoolEncryption,
      config.capabilityProbeResponseSpoolEncryption,
    ]) {
      expect(config.nativeProviderStateVaultEncryption.keyId).not.toBe(
        profile.keyId
      );
      expect(config.nativeProviderStateVaultEncryption.keyRef).not.toBe(
        profile.keyRef
      );
      expect(config.nativeProviderStateVaultEncryption.keyRefDigest).not.toBe(
        profile.keyRefDigest
      );
      expect(
        config.nativeProviderStateVaultEncryption.encryptionProfileDigest
      ).not.toBe(profile.encryptionProfileDigest);
    }
    expect(config.endpointSmokeResponseSpoolEncryption).toMatchObject({
      format: 'prodivix.g4-endpoint-smoke-response-spool-encryption',
      algorithm: 'AES-256-GCM',
      aadFormat: AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_AAD_FORMAT,
      namespaceId: AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_NAMESPACE_ID,
      keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
      keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
      retention: {
        disposition:
          'delete-after-durable-endpoint-smoke-commit-or-maximum-age',
      },
    });
    expect(
      config.endpointSmokeResponseSpoolEncryption.encryptionProfileDigest
    ).not.toBe(config.responseSpoolEncryption.encryptionProfileDigest);
    expect(
      config.endpointSmokeResponseSpoolEncryption.encryptionPolicyDigest
    ).not.toBe(config.responseSpoolEncryption.encryptionPolicyDigest);
    expect(
      config.plan.endpointSmokeTargets.every(
        ({ responseSpoolEncryptionPolicyDigest }) =>
          responseSpoolEncryptionPolicyDigest ===
          config.endpointSmokeResponseSpoolEncryption.encryptionPolicyDigest
      )
    ).toBe(true);
    expect(
      config.plan.graderPlan.graders.find(
        ({ graderId }) => graderId === 'grader.release.domain-dry-run'
      )?.configurationDigest
    ).toBe(config.controlledRuntime.runtimePolicyDigest);
    expect(config.execution.humanReview.publicRubrics[0]).toMatchObject({
      format: 'prodivix.g4-public-human-review-rubric',
      scale: 'binary-pass-fail',
    });
    expect(config.execution.humanReview.trustRegistry.registryDigest).toBe(
      config.execution.humanReview.reviewerTrustRegistryDigest
    );
    expect(
      config.execution.humanReview.adjudicationPolicy
        .adjudicatorDecisionSignatureRequired
    ).toBe(true);
    expect(config.compatibilitySmokeRuntimes.hosted).toMatchObject({
      redirectPolicy: 'deny',
      authentication: {
        mode: 'bearer-secret-ref',
        secretEnvironmentName:
          'PRODIVIX_G4_MODEL_EVAL_HOSTED_COMPATIBLE_API_KEY',
      },
      request: { apiShape: 'chat-completions' },
    });
    const hostedSource = recordAt(
      cloneExample(),
      'compatibilitySmokes',
      'hosted'
    );
    const hostedTarget = config.plan.endpointSmokeTargets.find(
      ({ providerConfigurationId }) =>
        providerConfigurationId === 'provider.openai-compatible.hosted'
    );
    expect(hostedTarget).toMatchObject({
      modelId: hostedSource.modelId,
      immutableModelVersion: hostedSource.immutableModelVersion,
      modelLineageDigest: hostedSource.modelLineageDigest,
      inferenceConfigurationDigest: hostedSource.inferenceConfigurationDigest,
    });
    expect(hostedTarget?.modelId).toBe(
      config.compatibilitySmokeRuntimes.hosted.modelId
    );
    expect(hostedTarget?.immutableModelVersion).toBe(
      config.compatibilitySmokeRuntimes.hosted.immutableModelVersion
    );
    expect(hostedTarget?.modelLineageDigest).toBe(
      config.compatibilitySmokeRuntimes.hosted.modelLineageDigest
    );
    expect(hostedTarget?.pricingAuthorityDigest).toBe(
      config.compatibilitySmokeRuntimes.hosted.pricing.authorityDigest
    );
    expect(hostedTarget?.smokeProfileDigest).toBe(
      digestAgentCanonicalValue({
        runtimeDigest: config.compatibilitySmokeRuntimes.hosted.runtimeDigest,
        smokeBehaviorProfileDigest: hostedSource.smokeBehaviorProfileDigest,
      })
    );
    expect(Object.values(config.pricingAuthorities)).toHaveLength(5);
    expect(config.pricingAuthorities.hostedCompatibility).toBe(
      config.compatibilitySmokeRuntimes.hosted.pricing
    );
    expect(config.pricingAuthorities.localCompatibility).toBe(
      config.compatibilitySmokeRuntimes.local.pricing
    );
    for (const pricing of Object.values(config.pricingAuthorities)) {
      expect(pricing.snapshot.rates).toHaveLength(4);
      expect(
        pricing.snapshot.rates.every(
          ({ currency, unitPrice }) => currency === 'USD' && unitPrice !== '0'
        )
      ).toBe(true);
      expect(pricing.snapshot.sourceDigest).toBe(
        pricing.source.sourceContentDigest
      );
      const { authorityDigest, ...authorityBase } = pricing;
      expect(authorityDigest).toBe(digestAgentCanonicalValue(authorityBase));
      const usage = createAgentUsageVector([
        {
          unit: 'text-token-input',
          billableAmount: '100',
          confidence: 'reported',
          sourceDigest: digestAgentCanonicalValue({ usage: pricing.modelId }),
        },
      ]);
      expect(priceAgentUsage(usage, pricing.snapshot)).toEqual([
        expect.objectContaining({
          currency: 'USD',
          confidence: 'reported',
          sourceDigest: pricing.snapshot.snapshotDigest,
        }),
      ]);
    }
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.plan)).toBe(true);
    expect(Object.isFrozen(config.responseSpoolEncryption)).toBe(true);
    expect(Object.isFrozen(config.capabilityProbeResponseSpoolEncryption)).toBe(
      true
    );
    expect(
      Object.isFrozen(config.hostedRetrievalRuntimeResourceLifecycleSpool)
    ).toBe(true);
    expect(Object.isFrozen(config.nativeProviderStateVaultEncryption)).toBe(
      true
    );
    expect(Object.isFrozen(config.endpointSmokeResponseSpoolEncryption)).toBe(
      true
    );
    expect(config.frozenRunDigest).toBe(
      digestAgentCanonicalValue({
        attestation: config.attestation,
        controlledRuntime: config.controlledRuntime,
        execution: config.execution,
        planDigest: config.plan.planDigest,
        qualificationAuthorityBundleDigest:
          config.qualificationAuthorityBundle.bundleDigest,
        probeProviderResourceAuthorityBundleDigest:
          config.probeProviderResourceAuthorityBundle.bundleDigest,
        pricingAuthorityDigests: Object.freeze(
          Object.values(config.pricingAuthorities).map(
            ({ authorityDigest }) => authorityDigest
          )
        ),
        endpointSmokeResponseSpoolEncryption:
          config.endpointSmokeResponseSpoolEncryption,
        capabilityProbeResponseSpoolEncryption:
          config.capabilityProbeResponseSpoolEncryption,
        hostedRetrievalRuntimeResourceLifecycleSpool:
          config.hostedRetrievalRuntimeResourceLifecycleSpool,
        nativeProviderStateVaultEncryption:
          config.nativeProviderStateVaultEncryption,
        responseSpoolEncryption: config.responseSpoolEncryption,
        sourceConfigDigest: config.sourceConfigDigest,
      })
    );
    expect(
      Object.isFrozen(config.execution.humanReview.reviewerAuthorityIds)
    ).toBe(true);
  }, 15_000);

  it('keeps the example out of production preflight and accepts an explicitly reviewed production copy', () => {
    const template = cloneTemplate();
    const decodedTemplate = decodeAgentEvaluationRunConfigQualificationTemplate(
      template,
      {
        expectedRepositoryCommit: exactCommit,
      }
    );
    expect(decodedTemplate.purpose).toBe('template');
    expectInvalid(() =>
      decodeAgentEvaluationFrozenRunConfig(template, {
        clock: () => fixedInstant,
        expectedRepositoryCommit: exactCommit,
      })
    );

    const production = cloneExample();
    const decoded = decode(production);
    expect(
      requireProductionAgentEvaluationFrozenRunConfig(decoded, exactCommit)
        .purpose
    ).toBe('production');
    expectInvalid(() =>
      requireProductionAgentEvaluationFrozenRunConfig(
        decoded,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    );
  }, 30_000);

  it('keeps sealed qualification state out of the tracked template and rejects missing or swapped production authority roots', () => {
    const dynamicTemplate = cloneTemplate();
    dynamicTemplate.qualificationAuthorityBundle = {};
    expectInvalid(() =>
      decodeAgentEvaluationRunConfigQualificationTemplate(dynamicTemplate)
    );
    const dynamicResourceTemplate = cloneTemplate();
    dynamicResourceTemplate.probeProviderResourceAuthorityBundle = {};
    expectInvalid(() =>
      decodeAgentEvaluationRunConfigQualificationTemplate(
        dynamicResourceTemplate
      )
    );

    const missing = cloneExample();
    delete missing.qualificationAuthorityBundle;
    expectInvalid(() => decode(missing));
    const missingResourceBundle = cloneExample();
    delete missingResourceBundle.probeProviderResourceAuthorityBundle;
    expectInvalid(() => decode(missingResourceBundle));

    const swapped = cloneExample();
    recordAt(swapped, 'qualificationAuthorityBundle').bundleDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(swapped));
  });

  it('materializes one byte-stable production config whose frozen plan is independent of decode time', () => {
    const template = cloneTemplate();
    const bundle =
      createAgentEvaluationTestQualificationAuthorityBundle(template);
    const resourceBundle =
      createAgentEvaluationTestProbeProviderResourceAuthorityBundle(template);
    const first = createAgentEvaluationProductionRunConfigDocument(
      template,
      bundle,
      resourceBundle,
      fixedInstant
    );
    const second = createAgentEvaluationProductionRunConfigDocument(
      template,
      bundle,
      resourceBundle,
      fixedInstant
    );
    expect(canonicalJsonText(first)).toBe(canonicalJsonText(second));
    const firstDecoded = decodeAgentEvaluationFrozenRunConfig(first, {
      clock: () => fixedInstant,
      expectedRepositoryCommit: exactCommit,
    });
    const retryDecoded = decodeAgentEvaluationFrozenRunConfig(second, {
      clock: () => '2026-08-08T01:00:00.000Z',
      expectedRepositoryCommit: exactCommit,
    });
    expect(retryDecoded.plan.planDigest).toBe(firstDecoded.plan.planDigest);
    expect(retryDecoded.frozenRunDigest).toBe(firstDecoded.frozenRunDigest);
  }, 15_000);

  it('resolves only the fixed public holdout-directory slot into an explicit absolute allowlist', () => {
    const config = decode();
    const firstRoot = join(tmpdir(), 'prodivix-g4-holdout-a');
    const secondRoot = join(tmpdir(), 'prodivix-g4-holdout-b');
    const first = resolveAgentEvaluationProtectedMaterialFiles(config, {
      [AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV]: firstRoot,
    });
    const second = resolveAgentEvaluationProtectedMaterialFiles(config, {
      [AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV]: secondRoot,
    });

    expect(first).toHaveLength(32);
    expect(new Set(first.map(({ path }) => path)).size).toBe(32);
    expect(first.every(({ path }) => path.startsWith(firstRoot))).toBe(true);
    expect(second.every(({ path }) => path.startsWith(secondRoot))).toBe(true);
    expect(first[0]?.path).not.toBe(second[0]?.path);
    expect(config.plan.planDigest).toBe(decode().plan.planDigest);
    expect(exampleText).not.toContain(firstRoot);
    expectInvalid(() =>
      resolveAgentEvaluationProtectedMaterialFiles(config, {
        [AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV]: '../holdout',
      })
    );
  }, 20_000);

  it('rejects malformed JSON and extra root or nested keys', () => {
    expectInvalid(() =>
      decodeAgentEvaluationFrozenRunConfig('{', { clock: () => fixedInstant })
    );

    const extraRoot = cloneExample();
    recordAt(extraRoot).unexpected = true;
    expectInvalid(() => decode(extraRoot));

    const extraProvider = cloneExample();
    recordAt(extraProvider, 'providers', 'openaiResponses').apiKey =
      'reference';
    expectInvalid(() => decode(extraProvider));
  });

  it('rejects mutable model aliases, secret-looking values, and locator path escape', () => {
    const mutableModel = cloneExample();
    recordAt(
      mutableModel,
      'providers',
      'openaiResponses',
      'model'
    ).immutableVersion = 'latest';
    expectInvalid(() => decode(mutableModel));

    const nativeTransportIdentityMismatch = cloneExample();
    recordAt(
      nativeTransportIdentityMismatch,
      'providers',
      'openaiResponses',
      'model'
    ).immutableVersion = 'different-immutable-openai-model.2026-08-08';
    refreshPricingAuthority(nativeTransportIdentityMismatch, 'openaiResponses');
    expectInvalid(() => decode(nativeTransportIdentityMismatch));

    const secretValue = cloneExample();
    recordAt(secretValue, 'providers', 'anthropicMessages').secretRef =
      'sk-ant-this-is-a-secret-value';
    expectInvalid(() => decode(secretValue));

    const escaped = cloneExample();
    const locators = arrayAt(escaped, 'material', 'restrictedEnvelopeLocators');
    (locators[0] as Record<string, unknown>).relativePath = '../escape.json';
    expectInvalid(() => decode(escaped));
  });

  it('rejects mutable or credential-bearing compatibility runtime and redirect-capable endpoints', () => {
    const queryEndpoint = cloneExample();
    recordAt(
      queryEndpoint,
      'compatibilitySmokes',
      'hosted',
      'runtime'
    ).endpoint =
      'https://compatible.example.invalid/v1/chat/completions?redirect=1';
    expectInvalid(() => decode(queryEndpoint));

    const wrongSecretSlot = cloneExample();
    recordAt(
      wrongSecretSlot,
      'compatibilitySmokes',
      'local',
      'runtime',
      'authentication'
    ).secretEnvironmentName = 'PRODIVIX_ARBITRARY_SECRET';
    expectInvalid(() => decode(wrongSecretSlot));

    const mutableModel = cloneExample();
    recordAt(
      mutableModel,
      'compatibilitySmokes',
      'hosted',
      'runtime'
    ).immutableModelVersion = 'latest';
    expectInvalid(() => decode(mutableModel));

    const protocolIdentityMismatch = cloneExample();
    const hostedMismatch = recordAt(
      protocolIdentityMismatch,
      'compatibilitySmokes',
      'hosted'
    );
    hostedMismatch.immutableModelVersion =
      'different-hosted-compatible-model.2026-08-08';
    recordAt(hostedMismatch, 'runtime').immutableModelVersion =
      hostedMismatch.immutableModelVersion;
    refreshCompatibilitySmoke(protocolIdentityMismatch, 'hosted');
    expectInvalid(() => decode(protocolIdentityMismatch));

    const planRuntimeModelDrift = cloneExample();
    recordAt(planRuntimeModelDrift, 'compatibilitySmokes', 'hosted').modelId =
      'different-immutable-compatible-model.2026-08-08';
    expectInvalid(() => decode(planRuntimeModelDrift));

    const missingLineage = cloneExample();
    delete recordAt(missingLineage, 'compatibilitySmokes', 'local')
      .modelLineageDigest;
    expectInvalid(() => decode(missingLineage));

    const invalidInferenceDigest = cloneExample();
    recordAt(
      invalidInferenceDigest,
      'compatibilitySmokes',
      'local'
    ).inferenceConfigurationDigest = 'runtime-inferred';
    expectInvalid(() => decode(invalidInferenceDigest));

    const runtimeDigestDrift = cloneExample();
    recordAt(
      runtimeDigestDrift,
      'compatibilitySmokes',
      'hosted',
      'runtime'
    ).runtimeDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(runtimeDigestDrift));
  });

  it('rejects every malformed, unbound, unbounded, or secret-bearing response-spool profile', () => {
    const malformed = cloneExample();
    recordAt(malformed).responseSpoolEncryption = 'AES-256-GCM';
    expectInvalid(() => decode(malformed));

    const extra = cloneExample();
    recordAt(extra, 'responseSpoolEncryption').nonceBytes = 12;
    recordAt(extra, 'responseSpoolEncryption').unexpected = true;
    expectInvalid(() => decode(extra));

    const wrongAlgorithm = cloneExample();
    recordAt(wrongAlgorithm, 'responseSpoolEncryption').algorithm =
      'AES-256-CBC';
    expectInvalid(() => decode(wrongAlgorithm));

    const wrongNonceSize = cloneExample();
    recordAt(wrongNonceSize, 'responseSpoolEncryption').nonceBytes = 16;
    expectInvalid(() => decode(wrongNonceSize));

    const wrongEnvironment = cloneExample();
    recordAt(wrongEnvironment, 'responseSpoolEncryption').keyEnvironmentName =
      'PRODIVIX_G4_MODEL_EVAL_ARBITRARY_KEY_BASE64';
    expectInvalid(() => decode(wrongEnvironment));

    const wrongReference = cloneExample();
    recordAt(wrongReference, 'responseSpoolEncryption').keyRef =
      'secret.g4-model-eval.arbitrary.v1';
    expectInvalid(() => decode(wrongReference));

    const wrongKeyId = cloneExample();
    recordAt(wrongKeyId, 'responseSpoolEncryption').keyId =
      'key.g4-model-eval.result-spool.v2';
    expectInvalid(() => decode(wrongKeyId));

    const wrongKeyVersion = cloneExample();
    recordAt(wrongKeyVersion, 'responseSpoolEncryption').keyVersion = 2;
    expectInvalid(() => decode(wrongKeyVersion));

    for (const digestField of [
      'namespaceDigest',
      'keyRefDigest',
      'encryptionProfileDigest',
      'encryptionPolicyDigest',
    ]) {
      const digestDrift = cloneExample();
      recordAt(digestDrift, 'responseSpoolEncryption')[digestField] =
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expectInvalid(() => decode(digestDrift));
    }

    const secretValue = cloneExample();
    recordAt(secretValue, 'responseSpoolEncryption').keyValueBase64 =
      'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
    expectInvalid(() => decode(secretValue));

    for (const plaintextBytes of [0, 16_777_215, 16_777_217]) {
      const ceilingDrift = cloneExample();
      recordAt(ceilingDrift, 'responseSpoolEncryption').maximumPlaintextBytes =
        plaintextBytes;
      expectInvalid(() => decode(ceilingDrift));
    }

    const retentionAgeDrift = cloneExample();
    recordAt(
      retentionAgeDrift,
      'responseSpoolEncryption',
      'retention'
    ).maximumAgeMs = AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS + 1;
    expectInvalid(() => decode(retentionAgeDrift));

    const retentionDispositionDrift = cloneExample();
    recordAt(
      retentionDispositionDrift,
      'responseSpoolEncryption',
      'retention'
    ).disposition = 'retain-indefinitely';
    expectInvalid(() => decode(retentionDispositionDrift));

    const retentionDigestDrift = cloneExample();
    recordAt(
      retentionDigestDrift,
      'responseSpoolEncryption',
      'retention'
    ).retentionPolicyDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(retentionDigestDrift));

    const releasePlanBindingDrift = cloneExample();
    recordAt(
      releasePlanBindingDrift,
      'policies'
    ).cacheAndStateIsolationPolicyDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(releasePlanBindingDrift));

    expect(exampleText).not.toContain('keyValueBase64');
  }, 15_000);

  it('requires the canonical probe-specific spool policy and rejects attempt-policy reuse', () => {
    const missing = cloneExample();
    delete recordAt(missing).capabilityProbeResponseSpoolEncryption;
    expectInvalid(() => decode(missing));

    const reusedAttemptProfile = cloneExample();
    recordAt(reusedAttemptProfile).capabilityProbeResponseSpoolEncryption =
      structuredClone(recordAt(reusedAttemptProfile).responseSpoolEncryption);
    expectInvalid(() => decode(reusedAttemptProfile));

    const reusedAttemptKey = cloneExample();
    recordAt(reusedAttemptKey).capabilityProbeResponseSpoolEncryption =
      createAgentCapabilityProbeResponseSpoolEncryptionProfile({
        keyId: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
        keyVersion: 1,
        keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
        keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
      });
    expectInvalid(() => decode(reusedAttemptKey));

    const wrongAad = cloneExample();
    recordAt(wrongAad, 'capabilityProbeResponseSpoolEncryption').aadFormat =
      'prodivix.agent-evaluation-provider-result-spool-aad';
    expectInvalid(() => decode(wrongAad));

    const wrongNamespace = cloneExample();
    recordAt(
      wrongNamespace,
      'capabilityProbeResponseSpoolEncryption'
    ).namespaceId = AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID;
    expectInvalid(() => decode(wrongNamespace));

    const wrongMaximumPlaintextBytes = cloneExample();
    recordAt(
      wrongMaximumPlaintextBytes,
      'capabilityProbeResponseSpoolEncryption'
    ).maximumPlaintextBytes =
      AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES;
    expectInvalid(() => decode(wrongMaximumPlaintextBytes));

    const wrongRetention = cloneExample();
    recordAt(
      wrongRetention,
      'capabilityProbeResponseSpoolEncryption',
      'retention'
    ).disposition = 'delete-after-durable-attempt-commit-or-maximum-age';
    expectInvalid(() => decode(wrongRetention));

    for (const digestField of [
      'namespaceDigest',
      'keyRefDigest',
      'encryptionProfileDigest',
      'encryptionPolicyDigest',
    ]) {
      const drifted = cloneExample();
      recordAt(drifted, 'capabilityProbeResponseSpoolEncryption')[digestField] =
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expectInvalid(() => decode(drifted));
    }

    const secretValue = cloneExample();
    recordAt(
      secretValue,
      'capabilityProbeResponseSpoolEncryption'
    ).keyValueBase64 = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
    expectInvalid(() => decode(secretValue));
  }, 15_000);

  it('requires the canonical independent native Provider state-vault authority and profile', () => {
    const missing = cloneExample();
    delete recordAt(missing).nativeProviderStateVaultEncryption;
    expectInvalid(() => decode(missing));

    for (const [field, reused] of [
      ['keyId', AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID],
      ['keyEnvironmentName', AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV],
      ['keyRef', AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF],
      [
        'keyRefDigest',
        recordAt(cloneExample(), 'responseSpoolEncryption').keyRefDigest,
      ],
      [
        'encryptionProfileDigest',
        recordAt(cloneExample(), 'capabilityProbeResponseSpoolEncryption')
          .encryptionProfileDigest,
      ],
    ] as const) {
      const reusedIdentity = cloneExample();
      recordAt(reusedIdentity, 'nativeProviderStateVaultEncryption')[field] =
        reused;
      expectInvalid(() => decode(reusedIdentity));
    }

    const swappedAuthority = cloneExample();
    recordAt(
      swappedAuthority,
      'nativeProviderStateVaultEncryption',
      'authority'
    ).authorityDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(swappedAuthority));

    for (const [path, field] of [
      [[], 'encryptionPolicyDigest'],
      [['retention'], 'retentionPolicyDigest'],
      [['deletionReceiptPolicy'], 'deletionReceiptPolicyDigest'],
    ] as const) {
      const drifted = cloneExample();
      recordAt(drifted, 'nativeProviderStateVaultEncryption', ...path)[field] =
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expectInvalid(() => decode(drifted));
    }

    const secretValue = cloneExample();
    recordAt(secretValue, 'nativeProviderStateVaultEncryption').keyValueBase64 =
      'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
    expectInvalid(() => decode(secretValue));
  }, 20_000);

  it('rejects endpoint-smoke spool reuse, AAD drift, and policy substitution', () => {
    const missing = cloneExample();
    delete recordAt(missing).endpointSmokeResponseSpoolEncryption;
    expectInvalid(() => decode(missing));

    const reusedAttemptProfile = cloneExample();
    recordAt(reusedAttemptProfile).endpointSmokeResponseSpoolEncryption =
      structuredClone(recordAt(reusedAttemptProfile).responseSpoolEncryption);
    expectInvalid(() => decode(reusedAttemptProfile));

    const wrongAad = cloneExample();
    recordAt(wrongAad, 'endpointSmokeResponseSpoolEncryption').aadFormat =
      'prodivix.agent-evaluation-provider-result-spool-aad';
    expectInvalid(() => decode(wrongAad));

    const wrongNamespace = cloneExample();
    recordAt(
      wrongNamespace,
      'endpointSmokeResponseSpoolEncryption'
    ).namespaceId = AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID;
    expectInvalid(() => decode(wrongNamespace));

    for (const digestField of [
      'namespaceDigest',
      'keyRefDigest',
      'encryptionProfileDigest',
      'encryptionPolicyDigest',
    ]) {
      const drifted = cloneExample();
      recordAt(drifted, 'endpointSmokeResponseSpoolEncryption')[digestField] =
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expectInvalid(() => decode(drifted));
    }

    const retentionDrift = cloneExample();
    recordAt(
      retentionDrift,
      'endpointSmokeResponseSpoolEncryption',
      'retention'
    ).disposition = 'delete-after-durable-attempt-commit-or-maximum-age';
    expectInvalid(() => decode(retentionDrift));

    const secretValue = cloneExample();
    recordAt(
      secretValue,
      'endpointSmokeResponseSpoolEncryption'
    ).keyValueBase64 = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
    expectInvalid(() => decode(secretValue));
  }, 15_000);

  it('rejects incomplete, unauditable, stale, or digest-drifted pricing authority', () => {
    const missingRate = cloneExample();
    arrayAt(
      missingRate,
      'providers',
      'openaiResponses',
      'pricing',
      'snapshot',
      'rates'
    ).pop();
    expectInvalid(() => decode(missingRate));

    const zeroRate = cloneExample();
    const zeroRates = arrayAt(
      zeroRate,
      'providers',
      'geminiInteractions',
      'pricing',
      'snapshot',
      'rates'
    );
    (zeroRates[0] as Record<string, unknown>).unitPrice = '0';
    expectInvalid(() => decode(zeroRate));

    const sourceQuery = cloneExample();
    recordAt(
      sourceQuery,
      'providers',
      'anthropicMessages',
      'pricing',
      'source'
    ).sourceUri = 'https://pricing.example.invalid/anthropic?api_key=public';
    expectInvalid(() => decode(sourceQuery));

    const futureObservation = cloneExample();
    recordAt(
      futureObservation,
      'providers',
      'openaiResponses',
      'pricing',
      'source'
    ).observedAt = '2026-08-08T00:00:00.001Z';
    refreshPricingAuthority(futureObservation, 'openaiResponses');
    expectInvalid(() => decode(futureObservation));

    const authorityDrift = cloneExample();
    recordAt(
      authorityDrift,
      'providers',
      'geminiInteractions',
      'pricing'
    ).authorityDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(authorityDrift));

    const missingCompatibilityPricing = cloneExample();
    delete recordAt(
      missingCompatibilityPricing,
      'compatibilitySmokes',
      'hosted',
      'runtime'
    ).pricing;
    expectInvalid(() => decode(missingCompatibilityPricing));

    const compatibilityProviderDrift = cloneExample();
    recordAt(
      compatibilityProviderDrift,
      'compatibilitySmokes',
      'hosted',
      'runtime',
      'pricing',
      'snapshot'
    ).providerConfigurationId = 'provider.openai-compatible.substituted';
    expectInvalid(() => decode(compatibilityProviderDrift));

    const compatibilityRegionDrift = cloneExample();
    recordAt(
      compatibilityRegionDrift,
      'compatibilitySmokes',
      'local',
      'runtime',
      'pricing',
      'snapshot'
    ).region = 'substituted-runner';
    expectInvalid(() => decode(compatibilityRegionDrift));

    const compatibilityMissingRate = cloneExample();
    arrayAt(
      compatibilityMissingRate,
      'compatibilitySmokes',
      'hosted',
      'runtime',
      'pricing',
      'snapshot',
      'rates'
    ).pop();
    expectInvalid(() => decode(compatibilityMissingRate));

    const compatibilityFutureObservation = cloneExample();
    recordAt(
      compatibilityFutureObservation,
      'compatibilitySmokes',
      'hosted',
      'runtime',
      'pricing',
      'source'
    ).observedAt = '2026-08-08T00:00:00.001Z';
    refreshCompatibilitySmoke(compatibilityFutureObservation, 'hosted');
    expectInvalid(() => decode(compatibilityFutureObservation));

    const compatibilityAuthorityDrift = cloneExample();
    recordAt(
      compatibilityAuthorityDrift,
      'compatibilitySmokes',
      'local',
      'runtime',
      'pricing'
    ).authorityDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(compatibilityAuthorityDrift));
  }, 20_000);

  it('rejects duplicate restricted cases and every material digest drift', () => {
    const outputSchemaDrift = cloneExample();
    recordAt(outputSchemaDrift, 'policies').outputSchemaDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(outputSchemaDrift));

    const duplicated = cloneExample();
    const locators = arrayAt(
      duplicated,
      'material',
      'restrictedEnvelopeLocators'
    );
    locators[1] = structuredClone(locators[0]);
    expectInvalid(() => decode(duplicated));

    for (const key of [
      'caseSetDigest',
      'publicMaterialSetDigest',
      'restrictedMaterialManifestDigest',
      'catalogDigest',
    ]) {
      const drifted = cloneExample();
      recordAt(drifted, 'material', 'catalogDigests')[key] =
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expectInvalid(() => decode(drifted));
    }
  });

  it('freezes an independent hosted lifecycle spool key, profile, and eight-day retention policy', () => {
    const missing = cloneExample();
    delete recordAt(missing).hostedRetrievalRuntimeResourceLifecycleSpool;
    expectInvalid(() => decode(missing));

    const attemptKeyAlias = cloneExample();
    const lifecycle = recordAt(
      attemptKeyAlias,
      'hostedRetrievalRuntimeResourceLifecycleSpool'
    );
    lifecycle.keyReference = Object.freeze({
      keyId: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
      keyVersion: 1,
      keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
      keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
    });
    expectInvalid(() => decode(attemptKeyAlias));

    const profileDigestDrift = cloneExample();
    recordAt(
      profileDigestDrift,
      'hostedRetrievalRuntimeResourceLifecycleSpool'
    ).profileDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(profileDigestDrift));

    for (const maximumAgeMs of [
      8 * 24 * 60 * 60 * 1_000 - 1,
      8 * 24 * 60 * 60 * 1_000 + 1,
    ]) {
      const retentionDrift = cloneExample();
      recordAt(
        retentionDrift,
        'hostedRetrievalRuntimeResourceLifecycleSpool',
        'retentionPolicy'
      ).maximumAgeMs = maximumAgeMs;
      expectInvalid(() => decode(retentionDrift));
    }
  });

  it('rejects controlled-runtime, blind rubric, trust-root, and adjudication drift', () => {
    const runtimeDrift = cloneExample();
    recordAt(runtimeDrift, 'controlledRuntime').runtimeImplementationDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(runtimeDrift));

    const automaticDomainToolChoice = cloneExample();
    recordAt(
      automaticDomainToolChoice,
      'controlledRuntime',
      'loop'
    ).domainToolChoice = 'auto';
    expectInvalid(() => decode(automaticDomainToolChoice));

    const parallelDomainToolsDisabled = cloneExample();
    recordAt(
      parallelDomainToolsDisabled,
      'controlledRuntime',
      'loop'
    ).allowParallelDomainToolCalls = false;
    expectInvalid(() => decode(parallelDomainToolsDisabled));

    const nonCanonicalTurnDenominator = cloneExample();
    const nonCanonicalRuntime = recordAt(
      nonCanonicalTurnDenominator,
      'controlledRuntime'
    );
    const nonCanonicalLoop = recordAt(nonCanonicalRuntime, 'loop');
    nonCanonicalLoop.maximumTurnsPerAttempt = 8;
    const { loopPolicyDigest: _loopPolicyDigest, ...nonCanonicalLoopBase } =
      nonCanonicalLoop;
    nonCanonicalLoop.loopPolicyDigest =
      digestAgentCanonicalValue(nonCanonicalLoopBase);
    const {
      runtimePolicyDigest: _runtimePolicyDigest,
      ...nonCanonicalRuntimeBase
    } = nonCanonicalRuntime;
    nonCanonicalRuntime.runtimePolicyDigest = digestAgentCanonicalValue(
      nonCanonicalRuntimeBase
    );
    expectInvalid(() => decode(nonCanonicalTurnDenominator));

    const loopPolicyDigestDrift = cloneExample();
    recordAt(
      loopPolicyDigestDrift,
      'controlledRuntime',
      'loop'
    ).loopPolicyDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(loopPolicyDigestDrift));

    const artifactAggregateAboveCeiling = cloneExample();
    recordAt(
      artifactAggregateAboveCeiling,
      'controlledRuntime',
      'loop'
    ).maximumAggregateArtifactBytes = 8_388_609;
    expectInvalid(() => decode(artifactAggregateAboveCeiling));

    const rubricDrift = cloneExample();
    const [rubric] = arrayAt(
      rubricDrift,
      'execution',
      'humanReview',
      'publicRubrics'
    );
    const criteria = arrayAt(rubric, 'criteria');
    (criteria[0] as Record<string, unknown>).description =
      'case-specific hidden target';
    expectInvalid(() => decode(rubricDrift));

    const trustRootDrift = cloneExample();
    recordAt(
      trustRootDrift,
      'execution',
      'humanReview'
    ).reviewerTrustRegistryDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(trustRootDrift));

    const adjudicatorDrift = cloneExample();
    recordAt(
      adjudicatorDrift,
      'execution',
      'humanReview',
      'adjudicationPolicy'
    ).adjudicatorKeyId = 'key.untrusted.v1';
    expectInvalid(() => decode(adjudicatorDrift));

    const randomizedPolicyDrift = cloneExample();
    recordAt(
      randomizedPolicyDrift,
      'execution',
      'humanReview'
    ).randomizedPresentationPolicyDigest =
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectInvalid(() => decode(randomizedPolicyDrift));
  }, 15_000);

  it('rejects a drifted, unbounded, or matrix-insufficient budget', () => {
    const digestDrift = cloneExample();
    recordAt(digestDrift, 'budget', 'budget').maxRepairRounds = 1;
    expectInvalid(() => decode(digestDrift));

    const repairInsufficient = cloneExample();
    recordAt(repairInsufficient, 'budget', 'budget').maxRepairRounds = 1;
    refreshBudgetDigest(repairInsufficient);
    expectInvalid(() => decode(repairInsufficient));

    const invocationInsufficient = cloneExample();
    recordAt(invocationInsufficient, 'budget', 'budget').maxModelInvocations =
      98_279;
    refreshBudgetDigest(invocationInsufficient);
    expectInvalid(() => decode(invocationInsufficient));

    const toolInsufficient = cloneExample();
    recordAt(toolInsufficient, 'budget', 'budget').maxToolCalls = 56_159;
    refreshBudgetDigest(toolInsufficient);
    expectInvalid(() => decode(toolInsufficient));

    const retriedBillingLineage = cloneExample();
    const retry = recordAt(retriedBillingLineage, 'execution', 'retry');
    retry.maximumAttempts = 2;
    retry.policyDigest = digestAgentCanonicalValue({
      format: 'prodivix.agent-evaluation-attempt-retry-policy',
      version: 1,
      maximumAttempts: 2,
      retryableStatuses: retry.retryableStatuses,
    });
    expectInvalid(() => decode(retriedBillingLineage));

    const tooManyShards = cloneExample();
    recordAt(tooManyShards, 'budget').maxShards = 65;
    refreshBudgetDigest(tooManyShards);
    expectInvalid(() => decode(tooManyShards));

    const missingMediaDimension = cloneExample();
    const usageLimits = arrayAt(
      missingMediaDimension,
      'budget',
      'budget',
      'usageLimits'
    );
    const imageIndex = usageLimits.findIndex(
      (entry) => (entry as Record<string, unknown>).unit === 'image-pixel'
    );
    usageLimits.splice(imageIndex, 1);
    refreshBudgetDigest(missingMediaDimension);
    expectInvalid(() => decode(missingMediaDimension));
  }, 30_000);
});
