import { generateKeyPairSync, verify as verifyEd25519 } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationAttestationClaimSet,
  createVerificationEvidenceStatementDigest,
  type VerificationEvidenceStatement,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import type { AgentEvaluationControlledWorkspaceG3SandboxBinding } from './controlledWorkspaceG3CellAdapter';
import {
  PRODUCTION_G3_ATTESTATION_ALGORITHM,
  PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES,
  createEnvironmentProductionG3AttestationAuthority,
  type ProductionG3AttestationAuthority,
  type ProductionG3AttestationSignInput,
} from './productionG3AttestationAuthority';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);

const createKeyMaterial = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  return Object.freeze({
    privateKeyBase64Url: privateKeyDer.toString('base64url'),
    publicKey,
  });
};

const environmentFor = (
  privateKeyBase64Url: string | undefined,
  overrides: Readonly<Record<string, string | undefined>> = {}
): Readonly<Record<string, string | undefined>> =>
  Object.freeze({
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url]:
      privateKeyBase64Url,
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.keyId]:
      'g3-attestation-key-2026-08',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.issuer]:
      'https://attestor.prodivix.test',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.audience]:
      'prodivix-verification',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.subject]:
      'remote:prodivix-controlled-workspace',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.trust]: 'remote-attested',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.policyGeneration]: '7',
    [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.maximumLifetimeMs]: '300000',
    ...overrides,
  });

const statementFor = (
  overrides: Partial<VerificationEvidenceStatement> = {}
): VerificationEvidenceStatement =>
  Object.freeze({
    evidenceId: 'evidence:g3-production',
    candidateId: 'candidate:g3-production',
    candidateDigest: digest('candidate:g3-production'),
    evidenceCoreDigest: digest('evidence-core:g3-production'),
    projectId: 'project:g3-production',
    workspaceId: 'workspace:g3-production',
    workspaceRevision: 41,
    partitionRevisionsDigest: digest('partitions:g3-production'),
    executableSnapshotDigest: digest('executable-snapshot:g3-production'),
    policyDigest: digest('policy:g3-production'),
    planDigest: digest('verification-plan:g3-production'),
    cellId: 'cell:g3-production',
    checkId: 'check:g3-production',
    checkKind: 'e2e',
    targetId: 'target:react-vite',
    targetPolicyDigest: digest('target-policy:g3-production'),
    attemptId: 'attempt:g3-production',
    producer: Object.freeze({
      origin: 'remote' as const,
      producerId: 'producer:g3-production',
      providerId: 'provider:g3-production',
      runId: 'run:g3-production',
      jobId: 'job:g3-production',
      sessionId: 'session:g3-production',
      sandboxImageDigest: digest('sandbox-image:g3-production'),
    }),
    execution: Object.freeze({
      surface: 'preview' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'sandbox',
      browserEngine: 'chromium' as const,
      operatingSystemIdentity: 'linux-x64',
      viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
      devicePixelRatio: 1,
      colorScheme: 'light' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'UTC',
      fontSetDigest: digest('fonts:g3-production'),
      sandboxImageDigest: digest('sandbox-image:g3-production'),
    }),
    toolchainDigest: digest('toolchain:g3-production'),
    normalizationDigest: digest('normalization:g3-production'),
    controlDigest: digest('controls:g3-production'),
    inputDigest: digest('inputs:g3-production'),
    resultDigest: digest('result:g3-production'),
    sourceTraceDigest: digest('source-traces:g3-production'),
    createdAt: '2026-08-09T00:00:00.000Z',
    retention: 'release',
    artifacts: Object.freeze([]),
    ...overrides,
  });

const bindingFor = (
  authority: ProductionG3AttestationAuthority,
  statement: VerificationEvidenceStatement
): AgentEvaluationControlledWorkspaceG3SandboxBinding => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-g3-sandbox-binding' as const,
    version: 1 as const,
    bindingId: 'binding:g3-production',
    authorityInputDigest: digest('authority-input:g3-production'),
    evaluationPlanDigest: digest('evaluation-plan:g3-production'),
    repositoryCommit: 'a'.repeat(40),
    projectId: statement.projectId,
    caseId: 'case:g3-production',
    attemptId: statement.attemptId,
    generation: 1,
    planDigest: statement.planDigest as CanonicalDigest,
    registrySnapshotDigest: digest('registry:g3-production'),
    cellId: statement.cellId,
    adapter: Object.freeze({ id: 'adapter:g3-production' }),
    tool: Object.freeze({ id: 'tool:g3-production' }),
    runtimeAuthorityId: 'runtime:g3-production',
    runtimeImplementationDigest: digest('runtime:g3-production'),
    artifactSourceAuthorityDigest: digest('artifact-source:g3-production'),
    attestationAuthorityDigest: authority.attestationAuthorityDigest,
    providerKind: 'remote' as const,
    runtimeEnvironmentDigest: digest('runtime-environment:g3-production'),
    controlCapabilitySnapshotDigest: digest(
      'control-capabilities:g3-production'
    ),
    appliedControlDigest: digest('applied-control:g3-production'),
    finalWorkspaceSnapshotDigest: digest('workspace-snapshot:g3-production'),
    compilerProjectionReceiptDigest: digest('compiler-receipt:g3-production'),
    executableSnapshot: Object.freeze({
      id: 'input:g3-production',
      sourceRef: 'compiler-projection:g3-production',
      artifactDigest: digest('executable-artifact:g3-production'),
      semanticSnapshotDigest:
        statement.executableSnapshotDigest as CanonicalDigest,
      size: 1_024,
      mediaType: 'application/vnd.prodivix.executable-project-snapshot+json',
      codecSchemaDigest: digest('executable-codec:g3-production'),
    }),
    run: Object.freeze({
      runId: statement.producer.runId,
      providerId: statement.producer.providerId,
      jobId: statement.producer.jobId,
      sessionId: statement.producer.sessionId,
      parentAttemptId: statement.attemptId,
      surface: statement.execution.surface,
      frameworkTarget: statement.execution.frameworkTarget,
      runtimeZone: statement.execution.runtimeZone,
      browserEngine: statement.execution.browserEngine,
      viewport: statement.execution.viewport,
      devicePixelRatio: statement.execution.devicePixelRatio,
      colorScheme: statement.execution.colorScheme,
      motion: statement.execution.motion,
      locale: statement.execution.locale,
      timezone: statement.execution.timezone,
      fontSetDigest: statement.execution.fontSetDigest,
      operatingSystemIdentity: statement.execution.operatingSystemIdentity,
      sandboxImageDigest: statement.execution.sandboxImageDigest,
    }),
  });
  return Object.freeze({
    ...base,
    bindingDigest: digest(base),
  }) as unknown as AgentEvaluationControlledWorkspaceG3SandboxBinding;
};

const signInputFor = (
  authority: ProductionG3AttestationAuthority,
  statement: VerificationEvidenceStatement = statementFor()
): ProductionG3AttestationSignInput =>
  Object.freeze({
    binding: bindingFor(authority, statement),
    authorityDigest: digest('verification-evidence-authority:g3-production'),
    verificationAttemptGrantReceiptDigest: digest(
      'attempt-grant-receipt:g3-production'
    ),
    candidateDigest: statement.candidateDigest as CanonicalDigest,
    attestationNonce: 'attestation-nonce-g3-production-0123456789',
    attestationStatement: statement as unknown as AgentJsonValue,
    attestationStatementDigest: createVerificationEvidenceStatementDigest(
      statement
    ) as CanonicalDigest,
  });

const fixedNow = '2026-08-09T00:01:00.000Z';

describe('production G3 Ed25519 attestation authority', () => {
  it('signs the exact prepared statement as a Backend-compatible full canonical presentation', async () => {
    const key = createKeyMaterial();
    let privateKeyReads = 0;
    const environment = environmentFor(key.privateKeyBase64Url);
    const authority = createEnvironmentProductionG3AttestationAuthority({
      environment: (name) => {
        if (
          name ===
          PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url
        ) {
          privateKeyReads += 1;
        }
        return environment[name];
      },
      now: () => fixedNow,
    });
    expect(privateKeyReads).toBe(0);

    const input = signInputFor(authority);
    const presentation = await authority.signAttestation(input);
    const { algorithm, keyId, signature, ...claims } = presentation;

    expect(privateKeyReads).toBe(1);
    expect({ algorithm, keyId }).toEqual({
      algorithm: PRODUCTION_G3_ATTESTATION_ALGORITHM,
      keyId: 'g3-attestation-key-2026-08',
    });
    expect(presentation).toMatchObject({
      format: 'prodivix.verification-attestation-claims',
      version: 1,
      trust: 'remote-attested',
      issuer: 'https://attestor.prodivix.test',
      audience: 'prodivix-verification',
      subject: 'remote:prodivix-controlled-workspace',
      nonce: input.attestationNonce,
      issuedAt: fixedNow,
      notBefore: fixedNow,
      expiresAt: '2026-08-09T00:06:00.000Z',
      policyGeneration: 7,
      statementDigest: input.attestationStatementDigest,
      candidateDigest: input.candidateDigest,
      planDigest: input.binding.planDigest,
      cellId: input.binding.cellId,
      attemptId: input.binding.attemptId,
    });
    expect(claims).toEqual(
      createVerificationAttestationClaimSet({
        expected: {
          trust: 'remote-attested',
          issuer: 'https://attestor.prodivix.test',
          audience: 'prodivix-verification',
          subject: 'remote:prodivix-controlled-workspace',
          nonce: input.attestationNonce,
          policyGeneration: 7,
          verificationInstant: fixedNow,
          maximumLifetimeMs: 300_000,
          statement:
            input.attestationStatement as unknown as VerificationEvidenceStatement,
        },
        issuedAt: fixedNow,
        notBefore: fixedNow,
        expiresAt: '2026-08-09T00:06:00.000Z',
      })
    );
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/u);
    expect(
      verifyEd25519(
        null,
        Buffer.from(canonicalJsonText(claims), 'utf8'),
        key.publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
    expect(JSON.stringify(presentation)).not.toContain(key.privateKeyBase64Url);
  });

  it('rejects statement/digest and frozen sandbox swaps before reading the private key', async () => {
    const key = createKeyMaterial();
    let privateKeyReads = 0;
    const environment = environmentFor(key.privateKeyBase64Url);
    const authority = createEnvironmentProductionG3AttestationAuthority({
      environment: (name) => {
        if (
          name ===
          PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url
        ) {
          privateKeyReads += 1;
        }
        return environment[name];
      },
      now: () => fixedNow,
    });
    const original = signInputFor(authority);
    const swapped = statementFor({
      planDigest: digest('swapped-verification-plan'),
    });

    await expect(
      authority.signAttestation(
        Object.freeze({
          ...original,
          attestationStatement: swapped as unknown as AgentJsonValue,
        })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      authority.signAttestation(
        Object.freeze({
          ...original,
          attestationStatement: swapped as unknown as AgentJsonValue,
          attestationStatementDigest: createVerificationEvidenceStatementDigest(
            swapped
          ) as CanonicalDigest,
        })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      authority.signAttestation(
        Object.freeze({
          ...original,
          candidateDigest: digest('swapped-candidate'),
        })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      authority.signAttestation(
        Object.freeze({
          ...original,
          verificationAttemptGrantReceiptDigest:
            'sha256-invalid-grant-receipt' as CanonicalDigest,
        })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(privateKeyReads).toBe(0);
  });

  it('fails closed on a missing callback credential and never includes key material in output or errors', async () => {
    const key = createKeyMaterial();
    const authority = createEnvironmentProductionG3AttestationAuthority({
      environment: environmentFor(undefined),
      now: () => fixedNow,
    });
    await expect(
      authority.signAttestation(signInputFor(authority))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable,
    });

    const canaryStatement = statementFor({
      projectId: key.privateKeyBase64Url,
    });
    const canaryAuthority = createEnvironmentProductionG3AttestationAuthority({
      environment: environmentFor(key.privateKeyBase64Url),
      now: () => fixedNow,
    });
    let serializedError = '';
    try {
      await canaryAuthority.signAttestation(
        signInputFor(canaryAuthority, canaryStatement)
      );
    } catch (caught) {
      serializedError = JSON.stringify(caught);
    }
    expect(serializedError).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
    );
    expect(serializedError).not.toContain(key.privateKeyBase64Url);
  });

  it('enforces the Backend lifetime ceiling and derives the exact expiry from the injected clock', async () => {
    const key = createKeyMaterial();
    expect(() =>
      createEnvironmentProductionG3AttestationAuthority({
        environment: environmentFor(key.privateKeyBase64Url, {
          [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.maximumLifetimeMs]:
            '3600001',
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );

    const authority = createEnvironmentProductionG3AttestationAuthority({
      environment: environmentFor(key.privateKeyBase64Url, {
        [PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.maximumLifetimeMs]:
          '3600000',
      }),
      now: () => fixedNow,
    });
    await expect(
      authority.signAttestation(signInputFor(authority))
    ).resolves.toMatchObject({
      issuedAt: fixedNow,
      notBefore: fixedNow,
      expiresAt: '2026-08-09T01:01:00.000Z',
    });
  });

  it('re-signs deterministically for one injected instant while resolving and clearing the key per callback', async () => {
    const key = createKeyMaterial();
    const environment = environmentFor(key.privateKeyBase64Url);
    let privateKeyReads = 0;
    const authority = createEnvironmentProductionG3AttestationAuthority({
      environment: (name) => {
        if (
          name ===
          PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url
        ) {
          privateKeyReads += 1;
        }
        return environment[name];
      },
      now: () => fixedNow,
    });
    const input = signInputFor(authority);
    const first = await authority.signAttestation(input);
    const second = await authority.signAttestation(input);

    expect(second).toEqual(first);
    expect(second.signature).toBe(first.signature);
    expect(privateKeyReads).toBe(2);
    await expect(authority.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    await expect(authority.signAttestation(input)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable,
    });
    expect(privateKeyReads).toBe(2);
  });
});
