import { generateKeyPairSync, verify as verifyEd25519 } from 'node:crypto';
import {
  createAgentModelEvaluationAuthorityPayload,
  createAgentModelEvaluationEvidenceArchiveAttestationPayload,
  createAgentEvaluationProductionRunConfigArtifactBinding,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES,
  EnvironmentAgentEvaluationAttestationSigner,
  EnvironmentAgentEvaluationAuthoritySigner,
  createEnvironmentAgentEvaluationAuthoritySigner,
  loadAgentEvaluationAttestationSignerConfiguration,
} from './attestationSigner';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const createKeyMaterial = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    privateKey,
    publicKey,
    privateKeyBase64Url: privateKeyDer.toString('base64url'),
    publicKeyBase64Url: publicKeyDer.subarray(-32).toString('base64url'),
  });
};

const payload = (keyId: string) => {
  const digest = (label: string): string => digestAgentCanonicalValue(label);
  return createAgentModelEvaluationAuthorityPayload({
    authorityId: 'g4-evaluation-authority',
    keyId,
    evidenceSetDigest: digest('evidence'),
    planDigest: digest('plan'),
    capabilityProbeAdmissionSetDigest: digest('capability-probe-admissions'),
    capabilityProbeReferenceReceiptSetDigest: digest(
      'capability-probe-reference-receipts'
    ),
    runtimeFactSourceOwnerRegistrationSetDigest: digest(
      'runtime-fact-source-owner-registrations'
    ),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: digest(
      'hosted-retrieval-runtime-resource-lifecycle-journals'
    ),
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      digest('hosted-retrieval-runtime-resource-lifecycle-budget-closures'),
    optionalCapabilityFactSourceSetDigest: digest(
      'optional-capability-fact-sources'
    ),
    optionalCapabilityFactAuthoritySetDigest: digest(
      'optional-capability-fact-authorities'
    ),
    endpointSmokeDispatchIntentSetDigest: digest('smoke-dispatch-intents'),
    endpointSmokeTransportReceiptSetDigest: digest('smoke-transports'),
    endpointSmokeResultSpoolReceiptSetDigest: digest('smoke-spools'),
    endpointSmokeResultSpoolDispositionReceiptSetDigest: digest(
      'smoke-spool-dispositions'
    ),
    endpointSmokeValidationFailureReceiptSetDigest: digest(
      'smoke-validation-failures'
    ),
    endpointSmokeSetDigest: digest('smoke'),
    preDispatchFailureReceiptSetDigest: digest('pre-dispatch-failures'),
    transportDispatchIntentSetDigest: digest('dispatch-intents'),
    transportReceiptSetDigest: digest('transport-receipts'),
    providerResultSpoolReceiptSetDigest: digest('spool-receipts'),
    providerResultSpoolDispositionReceiptSetDigest: digest(
      'spool-disposition-receipts'
    ),
    invocationTurnReceiptSetDigest: digest('invocation-turn-receipts'),
    invocationTurnSetReceiptSetDigest: digest('invocation-turn-set-receipts'),
    resultSubmissionReceiptSetDigest: digest('result-submission-receipts'),
    attemptAuthorityOwnerReceiptSetDigest: digest(
      'attempt-authority-owner-receipts'
    ),
    controlledRuntimeReceiptSetDigest: digest('controlled-runtime-receipts'),
    capabilityExecutionReceiptSetDigest: digest(
      'capability-execution-receipts'
    ),
    capabilitySpecificReceiptSetDigest: digest('capability-specific-receipts'),
    providerCapabilityObservationReceiptSetDigest: digest(
      'provider-capability-observation-receipts'
    ),
    verificationAttemptGrantReceiptSetDigest: digest(
      'verification-attempt-grant-receipts'
    ),
    validatedHumanReviewArtifactSetDigest: digest(
      'validated-human-review-artifacts'
    ),
    validatedHumanMetricObservationSetDigest: digest(
      'validated-human-metric-observations'
    ),
    reviewRasterScanReceiptSetDigest: digest('review-raster-scans'),
    reviewCandidateRefSetDigest: digest('review-candidate-refs'),
    blindReviewMappingSetDigest: digest('blind-review-mappings'),
    sourceReceiptSetDigest: digest('source'),
    executionReceiptSetDigest: digest('execution'),
    holdoutExecutionReceiptDigest: digest('holdout'),
    secretCanarySetDigest: digest('secret-canary'),
    protectedHoldoutCanarySetDigest: digest('holdout-canary'),
    workflowName: 'g4-real-model-evaluation',
    workflowRunId: '1234567',
    workflowRunAttempt: 1,
    jobId: 'finalize',
    environmentDigest: digest('environment'),
    repositoryCommit: 'a'.repeat(40),
    issuedAt: '2026-08-08T01:02:03.000Z',
  });
};

const archivePayload = (keyId: string) => {
  const authority = payload(keyId);
  const sourceConfigDigest = digestAgentCanonicalValue('source-config');
  const frozenRunDigest = digestAgentCanonicalValue('frozen-run');
  return createAgentModelEvaluationEvidenceArchiveAttestationPayload({
    authorityId: authority.authorityId,
    keyId,
    exportLeaseId: 'export-lease.g4-evaluation',
    exportLeaseDigest: digestAgentCanonicalValue('export-lease'),
    runConfigArtifactBinding:
      createAgentEvaluationProductionRunConfigArtifactBinding({
        sourcePlanArtifactName: 'g4-plan-1234567-1',
        sourcePlanArtifactDigest: `sha256:${'1'.repeat(64)}`,
        sourcePlanWorkflowRunId: '1234567',
        sourcePlanWorkflowRunAttempt: 1,
        runConfigFileName: 'production-run-config.json',
        runConfigByteLength: 1_024,
        runConfigCanonicalBytesDigest: sourceConfigDigest,
        sourceConfigDigest,
        frozenRunDigest,
        planDigest: authority.planDigest,
        repositoryCommit: authority.repositoryCommit,
      }),
    sourceConfigDigest,
    frozenRunDigest,
    planDigest: authority.planDigest,
    repositoryCommit: authority.repositoryCommit,
    evidenceSetDigest: authority.evidenceSetDigest,
    bundleDigest: digestAgentCanonicalValue('bundle'),
    authorityPayloadDigest: digestAgentCanonicalValue(authority),
    authorityAttestationDigest: digestAgentCanonicalValue(
      'authority-attestation'
    ),
    authorityRoots: Object.freeze({
      capabilityProbeAdmissionSetDigest:
        authority.capabilityProbeAdmissionSetDigest,
      capabilityProbeReferenceReceiptSetDigest:
        authority.capabilityProbeReferenceReceiptSetDigest,
      runtimeFactSourceOwnerRegistrationSetDigest:
        authority.runtimeFactSourceOwnerRegistrationSetDigest,
      capabilityProbeProviderResourceCleanupSetDigest:
        digestAgentCanonicalValue(
          'capability-probe-provider-resource-cleanups'
        ),
      hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
        authority.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
      hostedRetrievalRuntimeResourceCleanupSetDigest: digestAgentCanonicalValue(
        'hosted-retrieval-runtime-resource-cleanups'
      ),
      capabilityEffectProviderRuntimeJournalSetDigest:
        digestAgentCanonicalValue(
          'capability-effect-provider-runtime-journals'
        ),
      optionalCapabilityFactSourceSetDigest:
        authority.optionalCapabilityFactSourceSetDigest,
      optionalCapabilityFactAuthoritySetDigest:
        authority.optionalCapabilityFactAuthoritySetDigest,
      endpointSmokeSetDigest: authority.endpointSmokeSetDigest,
      endpointSmokeDispatchIntentSetDigest:
        authority.endpointSmokeDispatchIntentSetDigest,
      endpointSmokeTransportReceiptSetDigest:
        authority.endpointSmokeTransportReceiptSetDigest,
      endpointSmokeResultSpoolReceiptSetDigest:
        authority.endpointSmokeResultSpoolReceiptSetDigest,
      endpointSmokeResultSpoolDispositionReceiptSetDigest:
        authority.endpointSmokeResultSpoolDispositionReceiptSetDigest,
      endpointSmokeValidationFailureReceiptSetDigest:
        authority.endpointSmokeValidationFailureReceiptSetDigest,
      preDispatchFailureReceiptSetDigest:
        authority.preDispatchFailureReceiptSetDigest,
      transportDispatchIntentSetDigest:
        authority.transportDispatchIntentSetDigest,
      transportReceiptSetDigest: authority.transportReceiptSetDigest,
      providerResultSpoolReceiptSetDigest:
        authority.providerResultSpoolReceiptSetDigest,
      providerResultSpoolDispositionReceiptSetDigest:
        authority.providerResultSpoolDispositionReceiptSetDigest,
      invocationTurnReceiptSetDigest: authority.invocationTurnReceiptSetDigest,
      invocationTurnSetReceiptSetDigest:
        authority.invocationTurnSetReceiptSetDigest,
      resultSubmissionReceiptSetDigest:
        authority.resultSubmissionReceiptSetDigest,
      attemptAuthorityOwnerReceiptSetDigest:
        authority.attemptAuthorityOwnerReceiptSetDigest,
      controlledRuntimeReceiptSetDigest:
        authority.controlledRuntimeReceiptSetDigest,
      capabilityExecutionReceiptSetDigest:
        authority.capabilityExecutionReceiptSetDigest,
      capabilitySpecificReceiptSetDigest:
        authority.capabilitySpecificReceiptSetDigest,
      providerCapabilityObservationReceiptSetDigest:
        authority.providerCapabilityObservationReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        authority.verificationAttemptGrantReceiptSetDigest,
      validatedHumanReviewArtifactSetDigest:
        authority.validatedHumanReviewArtifactSetDigest,
      validatedHumanMetricObservationSetDigest:
        authority.validatedHumanMetricObservationSetDigest,
      reviewRasterScanReceiptSetDigest:
        authority.reviewRasterScanReceiptSetDigest,
      reviewCandidateRefSetDigest: authority.reviewCandidateRefSetDigest,
      blindReviewMappingSetDigest: authority.blindReviewMappingSetDigest,
      sourceReceiptSetDigest: authority.sourceReceiptSetDigest,
      executionReceiptSetDigest: authority.executionReceiptSetDigest,
      holdoutExecutionReceiptDigest: authority.holdoutExecutionReceiptDigest,
      secretCanarySetDigest: authority.secretCanarySetDigest,
      protectedHoldoutCanarySetDigest:
        authority.protectedHoldoutCanarySetDigest,
    }),
    evaluationManifestDigest: digestAgentCanonicalValue('manifest'),
    indexDigest: digestAgentCanonicalValue('index'),
    evidenceIndexArtifactDigest: digestAgentCanonicalValue('raw-index'),
    evidenceIndexArtifactSize: 1_024,
    shardSetDigest: digestAgentCanonicalValue('shard-set'),
    totalShardBytes: 2_048,
    totalRecordCount: 32,
    issuedAt: authority.issuedAt,
  });
};

describe('environment authority attestation signer', () => {
  it('signs canonical authority bytes with the configured Ed25519 key', () => {
    const key = createKeyMaterial();
    const keyId = 'g4-key-2026-08';
    const environment = {
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId]: keyId,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey]:
        key.publicKeyBase64Url,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
        key.privateKeyBase64Url,
    };
    const configuration =
      loadAgentEvaluationAttestationSignerConfiguration(environment);
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      configuration,
      environment
    );
    const authorityPayload = payload(keyId);
    const attestation = signer.sign(authorityPayload);

    expect(attestation).toMatchObject({
      algorithm: 'ed25519',
      keyId,
      repositoryCommit: 'a'.repeat(40),
    });
    expect(attestation.signature).toMatch(/^[A-Za-z0-9_-]{86}$/u);
    expect(
      verifyEd25519(
        null,
        Buffer.from(canonicalJsonText(authorityPayload), 'utf8'),
        key.publicKey,
        Buffer.from(attestation.signature, 'base64url')
      )
    ).toBe(true);
    expect(JSON.stringify(attestation)).not.toContain(key.privateKeyBase64Url);
  });

  it('rejects a configured public key that differs from the private key', () => {
    const key = createKeyMaterial();
    const other = createKeyMaterial();
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      { keyId: 'g4-key', publicKeyBase64Url: other.publicKeyBase64Url },
      {
        [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
          key.privateKeyBase64Url,
      }
    );
    expect(() => signer.sign(payload('g4-key'))).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });

  it('rejects payload key-id drift before reading private material', () => {
    const key = createKeyMaterial();
    let privateReads = 0;
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      { keyId: 'trusted-key', publicKeyBase64Url: key.publicKeyBase64Url },
      (name) => {
        if (
          name === AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey
        ) {
          privateReads += 1;
          return key.privateKeyBase64Url;
        }
        return undefined;
      }
    );
    expect(() => signer.sign(payload('different-key'))).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
    expect(privateReads).toBe(0);
  });

  it.each([
    undefined,
    'not-base64url',
    `${createKeyMaterial().privateKeyBase64Url}=`,
  ])('rejects unavailable or non-canonical private PKCS8 material', (value) => {
    const key = createKeyMaterial();
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      { keyId: 'g4-key', publicKeyBase64Url: key.publicKeyBase64Url },
      {
        [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]: value,
      }
    );
    expect(() => signer.sign(payload('g4-key'))).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable,
      })
    );
  });

  it('surfaces only a fixed error when key parsing fails', () => {
    const key = createKeyMaterial();
    const secret = 'A'.repeat(64);
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      { keyId: 'g4-key', publicKeyBase64Url: key.publicKeyBase64Url },
      {
        [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]: secret,
      }
    );
    let serialized = '';
    try {
      signer.sign(payload('g4-key'));
    } catch (caught) {
      serialized = JSON.stringify(caught);
    }
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
    );
  });

  it('implements the coordinator signer port with exact identity and message binding', async () => {
    const key = createKeyMaterial();
    const keyId = 'g4-key';
    const authorityPayload = payload(keyId);
    const signer = new EnvironmentAgentEvaluationAuthoritySigner(
      {
        authorityId: authorityPayload.authorityId,
        keyId,
        publicKeyBase64Url: key.publicKeyBase64Url,
        workflowName: authorityPayload.workflowName,
        workflowRunId: authorityPayload.workflowRunId,
        workflowRunAttempt: authorityPayload.workflowRunAttempt,
        jobId: authorityPayload.jobId,
        environmentDigest: authorityPayload.environmentDigest,
      },
      {
        [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
          key.privateKeyBase64Url,
      }
    );
    const message = Buffer.from(canonicalJsonText(authorityPayload), 'utf8');
    const signature = await signer.sign({ payload: authorityPayload, message });
    expect(
      signer.verify({
        publicKeyBase64Url: key.publicKeyBase64Url,
        signatureBase64Url: signature,
        message,
      })
    ).toBe(true);
    await expect(
      signer.sign({
        payload: authorityPayload,
        message: Buffer.from('different'),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
  });

  it('signs the exact canonical archive-attestation payload with the same trusted identity', async () => {
    const key = createKeyMaterial();
    const keyId = 'g4-key';
    const semanticPayload = payload(keyId);
    const signer = new EnvironmentAgentEvaluationAuthoritySigner(
      {
        authorityId: semanticPayload.authorityId,
        keyId,
        publicKeyBase64Url: key.publicKeyBase64Url,
        workflowName: semanticPayload.workflowName,
        workflowRunId: semanticPayload.workflowRunId,
        workflowRunAttempt: semanticPayload.workflowRunAttempt,
        jobId: semanticPayload.jobId,
        environmentDigest: semanticPayload.environmentDigest,
      },
      {
        [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
          key.privateKeyBase64Url,
      }
    );
    const archive = archivePayload(keyId);
    const message = Buffer.from(canonicalJsonText(archive), 'utf8');
    const signature = await signer.signArchive({ payload: archive, message });
    expect(
      verifyEd25519(
        null,
        message,
        key.publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
    await expect(
      signer.signArchive({
        payload: archive,
        message: Buffer.from('different'),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
  });

  it('sanitizes an environment-reader failure before it crosses the signer boundary', () => {
    const key = createKeyMaterial();
    const secret = 'private-reader-secret-value';
    const signer = new EnvironmentAgentEvaluationAttestationSigner(
      { keyId: 'g4-key', publicKeyBase64Url: key.publicKeyBase64Url },
      () => {
        throw new Error(secret);
      }
    );
    let serialized = '';
    try {
      signer.sign(payload('g4-key'));
    } catch (caught) {
      serialized = JSON.stringify(caught);
    }
    expect(serialized).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
    );
    expect(serialized).not.toContain(secret);
  });

  it('loads exact external workflow provenance and cross-binds frozen config', () => {
    const key = createKeyMaterial();
    const authorityPayload = payload('g4-key');
    const privateReads: string[] = [];
    const values: Record<string, string> = {
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId]:
        authorityPayload.authorityId,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId]:
        authorityPayload.keyId,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey]:
        key.publicKeyBase64Url,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
        key.privateKeyBase64Url,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName]:
        authorityPayload.workflowName,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId]:
        authorityPayload.workflowRunId,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt]: '1',
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId]:
        authorityPayload.jobId,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest]:
        authorityPayload.environmentDigest,
    };
    const signer = createEnvironmentAgentEvaluationAuthoritySigner({
      expectedAttestation: {
        authorityId: authorityPayload.authorityId,
        keyId: authorityPayload.keyId,
        algorithm: 'Ed25519',
        privateKeyEnvironmentName:
          AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey,
        privateKeyRef: 'secret.g4-model-eval.attestation.ed25519.v1',
      },
      environment: (name) => {
        if (
          name === AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey
        ) {
          privateReads.push(name);
        }
        return values[name];
      },
    });
    expect(signer.identity()).toMatchObject({
      authorityId: authorityPayload.authorityId,
      keyId: authorityPayload.keyId,
      workflowName: 'g4-real-model-evaluation',
      jobId: 'finalize',
    });
    expect(privateReads).toEqual([]);
  });

  it('rejects external authority drift from the frozen run config', () => {
    const key = createKeyMaterial();
    expect(() =>
      createEnvironmentAgentEvaluationAuthoritySigner({
        expectedAttestation: {
          authorityId: 'expected-authority',
          keyId: 'g4-key',
          algorithm: 'Ed25519',
          privateKeyEnvironmentName:
            AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey,
          privateKeyRef: 'secret.g4-model-eval.attestation.ed25519.v1',
        },
        environment: {
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId]:
            'different-authority',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId]: 'g4-key',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey]:
            key.publicKeyBase64Url,
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName]:
            'g4-real-model-evaluation',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId]: '1',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt]:
            '1',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId]: 'finalize',
          [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest]:
            digestAgentCanonicalValue('environment'),
        },
      })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });
});
