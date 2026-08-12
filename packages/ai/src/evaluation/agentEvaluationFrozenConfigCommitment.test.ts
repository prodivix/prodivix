import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_EVALUATION_HOLDOUT_EXECUTOR_PRINCIPAL_ID,
  createAgentEvaluationProductionRunConfigArtifactBinding,
  createAgentEvaluationFrozenConfigCommitment,
  createAgentEvaluationFrozenConfigCommitmentBase,
  createAgentEvaluationFrozenConfigCommitmentSigningPayload,
  createAgentEvaluationFrozenConfigProtectedEnvelope,
  digestAgentEvaluationEncryptedHoldoutCorpus,
  isAgentEvaluationFrozenConfigCommitment,
  isAgentEvaluationFrozenConfigCommitmentSigningPayload,
  type AgentEvaluationFrozenConfigCommitment,
  type AgentEvaluationFrozenConfigProtectedEnvelope,
} from './agentEvaluationFrozenConfigCommitment';

const digest = (label: string) => digestAgentCanonicalValue({ label });

const runConfigArtifactBinding = () =>
  createAgentEvaluationProductionRunConfigArtifactBinding({
    sourcePlanArtifactName: 'g4-plan-1234567-2',
    sourcePlanArtifactDigest: `sha256:${'a'.repeat(64)}`,
    sourcePlanWorkflowRunId: '1234567',
    sourcePlanWorkflowRunAttempt: 2,
    runConfigFileName: 'production-run-config.json',
    runConfigByteLength: 4_096,
    runConfigCanonicalBytesDigest: digest('source-config'),
    sourceConfigDigest: digest('source-config'),
    frozenRunDigest: digest('frozen-run'),
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  });

const protectedEnvelope = (
  caseId: string,
  relativePath: string
): AgentEvaluationFrozenConfigProtectedEnvelope =>
  createAgentEvaluationFrozenConfigProtectedEnvelope({
    caseId,
    fixtureRef: `holdout://${caseId}`,
    caseDigest: digest(`${caseId}.case`),
    access: 'protected-holdout',
    capabilityDescriptorDigest: digest(`${caseId}.capability`),
    caseDefinitionDigest: digest(`${caseId}.definition`),
    expectedAuthorityDigest: digest(`${caseId}.authority`),
    gradingPolicyDigest: digest(`${caseId}.grading`),
    resolverRef: `resolver.${caseId}`,
    relativePath,
    encryptedMaterialDigest: digest(`${caseId}.encrypted`),
    encryptionPolicyDigest: digest(`${caseId}.encryption-policy`),
  });

const commitment = (): AgentEvaluationFrozenConfigCommitment => {
  const base = createAgentEvaluationFrozenConfigCommitmentBase({
    runConfigArtifactBinding: runConfigArtifactBinding(),
    sourceConfigDigest: digest('source-config'),
    frozenRunDigest: digest('frozen-run'),
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    protectedHoldoutManifestDigest: digestAgentCanonicalValue(
      [
        protectedEnvelope('case.a', 'case-a.json'),
        protectedEnvelope('case.b', 'nested/case-b.json'),
      ].map(({ caseId, locatorDigest }) => ({ caseId, locatorDigest }))
    ),
    restrictedMaterialManifestDigest: digestAgentCanonicalValue(
      [
        protectedEnvelope('case.a', 'case-a.json'),
        protectedEnvelope('case.b', 'nested/case-b.json'),
      ].map(({ caseId, locatorDigest }) => ({ caseId, locatorDigest }))
    ),
    protectedEnvelopeAllowlist: [
      protectedEnvelope('case.b', 'nested/case-b.json'),
      protectedEnvelope('case.a', 'case-a.json'),
    ],
    committedAt: '2026-08-08T00:00:00.000Z',
    workflowName: 'g4-real-model-evaluation',
    workflowRunId: '1234567',
    jobId: 'full_shards',
    environmentDigest: digest('environment'),
    authorityId: 'authority.prodivix.g4-model-evaluation',
    keyId: 'key.prodivix.g4-model-evaluation.v1',
    algorithm: 'Ed25519',
  });
  return createAgentEvaluationFrozenConfigCommitment({
    payload: createAgentEvaluationFrozenConfigCommitmentSigningPayload(base),
    signatureBase64Url: 'A'.repeat(86),
  });
};

describe('agent evaluation frozen config commitment', () => {
  it('creates the exact sorted Go authority schema and both holdout digests', () => {
    const value = commitment();

    expect(AGENT_EVALUATION_HOLDOUT_EXECUTOR_PRINCIPAL_ID).toBe(
      'authority.prodivix.g4-holdout-sealer.v1'
    );
    expect(
      value.protectedEnvelopeAllowlist.map(({ caseId }) => caseId)
    ).toEqual(['case.a', 'case.b']);
    expect(value.protectedHoldoutManifestDigest).toBe(
      value.restrictedMaterialManifestDigest
    );
    expect(value.accessPolicyDigest).toBe(
      'sha256-e87716400973f9fa6454de7cafea9be6b42e9423a708cec73178320226657f0d'
    );
    expect(digestAgentEvaluationEncryptedHoldoutCorpus(value)).toBe(
      'sha256-19cb27917bfa7497cd4c1164eac066ad0848f264c418c7ee3ff670db2a1bf7e0'
    );
    expect(isAgentEvaluationFrozenConfigCommitment(value)).toBe(true);
    expect(JSON.parse(canonicalJsonText(value))).toEqual(value);
  });

  it('rejects digest, ordering, shape, and signature representation drift', () => {
    const value = commitment();
    const driftedLocator = {
      ...value,
      protectedEnvelopeAllowlist: value.protectedEnvelopeAllowlist.map(
        (entry, index) =>
          index === 0
            ? { ...entry, locatorDigest: digest('drifted-locator') }
            : entry
      ),
    };
    expect(isAgentEvaluationFrozenConfigCommitment(driftedLocator)).toBe(false);

    const reversed = {
      ...value,
      protectedEnvelopeAllowlist: [
        ...value.protectedEnvelopeAllowlist,
      ].reverse(),
    };
    expect(isAgentEvaluationFrozenConfigCommitment(reversed)).toBe(false);

    expect(
      isAgentEvaluationFrozenConfigCommitment({ ...value, extra: true })
    ).toBe(false);
    expect(
      isAgentEvaluationFrozenConfigCommitment({
        ...value,
        signatureBase64Url: `${'A'.repeat(85)}B`,
      })
    ).toBe(false);
    expect(
      isAgentEvaluationFrozenConfigCommitment({
        ...value,
        accessPolicyDigest: digest('drifted-access-policy'),
      })
    ).toBe(false);
    const driftedArtifactBase = {
      ...value.runConfigArtifactBinding,
      sourcePlanArtifactDigest: `sha256:${'b'.repeat(64)}`,
    };
    const driftedArtifactBinding = {
      ...driftedArtifactBase,
      bindingDigest: digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(driftedArtifactBase).filter(
            ([key]) => key !== 'bindingDigest'
          )
        )
      ),
    };
    expect(
      isAgentEvaluationFrozenConfigCommitment({
        ...value,
        runConfigArtifactBinding: driftedArtifactBinding,
      })
    ).toBe(false);
  });

  it('binds the commitment digest to the exact source workflow artifact', () => {
    const value = commitment();
    const { signatureBase64Url: _signature, ...payload } = value;
    expect('workflowRunAttempt' in value).toBe(false);
    expect(isAgentEvaluationFrozenConfigCommitmentSigningPayload(payload)).toBe(
      true
    );
    expect(
      isAgentEvaluationFrozenConfigCommitmentSigningPayload({
        ...payload,
        workflowRunId: 'different-run',
      })
    ).toBe(false);
    expect(
      isAgentEvaluationFrozenConfigCommitmentSigningPayload({
        ...payload,
        workflowRunAttempt: 2,
      })
    ).toBe(false);
    expect(
      isAgentEvaluationFrozenConfigCommitmentSigningPayload({
        ...payload,
        runConfigArtifactBinding: {
          ...payload.runConfigArtifactBinding,
          sourcePlanWorkflowRunAttempt: 3,
        },
      })
    ).toBe(false);
  });

  it('fails creation when the protected locator or manifest has drifted', () => {
    const envelope = protectedEnvelope('case.a', 'case-a.json');
    expect(() =>
      createAgentEvaluationFrozenConfigProtectedEnvelope({
        ...envelope,
        locatorDigest: digest('drifted-locator'),
      })
    ).toThrow(/locator digest drifted/u);

    expect(() =>
      createAgentEvaluationFrozenConfigCommitmentBase({
        runConfigArtifactBinding: runConfigArtifactBinding(),
        sourceConfigDigest: digest('source-config'),
        frozenRunDigest: digest('frozen-run'),
        planDigest: digest('plan'),
        repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
        protectedHoldoutManifestDigest: digest('wrong-manifest'),
        restrictedMaterialManifestDigest: digest('wrong-manifest'),
        protectedEnvelopeAllowlist: [envelope],
        committedAt: '2026-08-08T00:00:00.000Z',
        workflowName: 'g4-real-model-evaluation',
        workflowRunId: '1234567',
        jobId: 'full_shards',
        environmentDigest: digest('environment'),
        authorityId: 'authority.prodivix.g4-model-evaluation',
        keyId: 'key.prodivix.g4-model-evaluation.v1',
        algorithm: 'Ed25519',
      })
    ).toThrow(/commitment base is invalid/u);
  });
});
