import { readFileSync } from 'node:fs';
import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  digestAgentCanonicalValue,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationEvidenceStatementDigest,
  createVerificationEvidenceStatementForCandidate,
  digestVerificationValue,
  type VerificationEvidenceCandidate,
} from '@prodivix/verification';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
  createEnvironmentAgentEvaluationVerificationEvidenceBridge,
} from './evaluationVerificationEvidenceBridge';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer } from './verificationAttemptGrantClient';
import { AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS } from './authorityTransportDeadline';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  facts: {
    plan: { value: AgentModelEvaluationPlan };
    attempt: { value: { descriptor: AgentModelEvaluationAttemptDescriptor } };
  };
};

const plan = vector.facts.plan.value;
const descriptor = vector.facts.attempt.value.descriptor;
const namespaceId = 'evaluation-test';
const generation = 1;
const projectId = 'project-evaluation-test';
const workspaceId = 'workspace-evaluation-test';
const workspaceRevision = 7;
const verificationPlanDigest = digestAgentCanonicalValue('verification-plan');
const cellId = 'cell-evaluation-test';

const grantReceipt = (): AgentEvaluationVerificationAttemptGrantReceipt => {
  const issuanceBindingDigest = digestAgentCanonicalValue({
    namespaceId,
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation,
    workspaceId,
    workspaceRevision,
    projectId,
    verificationPlanDigest,
    cellId,
  });
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId,
    projectId,
    workspaceRevision,
    partitionRevisionsDigest: digestAgentCanonicalValue('partitions'),
    policyRevision: 1,
    policyDigest: digestAgentCanonicalValue('policy'),
    policyEvaluationInstant: '2026-08-08T00:00:00.000Z',
    impactDigest: digestAgentCanonicalValue('impact'),
    planDigest: verificationPlanDigest,
    cellId,
    checkId: 'check-evaluation-test',
    checkKind: 'integration',
    targetId: 'target-evaluation-test',
    attemptId: descriptor.attemptId,
    runId: 'verification-run-evaluation-test',
    providerId: 'verification-provider-evaluation-test',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'remote-attested' as const,
    retentionRequest: Object.freeze({
      successful: 'release' as const,
      failed: 'session' as const,
      protectReleaseEvidence: true,
    }),
    maximumClosureEvidenceRecords: 32,
    issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:10:00.000Z',
  });
  const grantDigest = digestAgentCanonicalValue(grantBase);
  const receiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
    version: 1 as const,
    namespaceId,
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation,
    verificationPlanDigest,
    cellId,
    requestDigest: digestAgentCanonicalValue('request'),
    issuanceBindingDigest,
    grant: Object.freeze({
      grantId: `attempt-grant-${grantDigest.slice(7)}`,
      grantDigest,
      workspaceId,
      projectId,
      workspaceRevision,
      partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
      policyRevision: grantBase.policyRevision,
      policyDigest: grantBase.policyDigest,
      policyEvaluationInstant: grantBase.policyEvaluationInstant,
      impactDigest: grantBase.impactDigest,
      verificationPlanDigest,
      cellId,
      checkId: grantBase.checkId,
      checkKind: grantBase.checkKind,
      targetId: grantBase.targetId,
      attemptId: grantBase.attemptId,
      runId: grantBase.runId,
      providerId: grantBase.providerId,
      producerId: grantBase.producerId,
      trustCeiling: grantBase.trustCeiling,
      retentionRequest: grantBase.retentionRequest,
      maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
      issuedBy: grantBase.issuedBy,
      issuedAt: grantBase.issuedAt,
      expiresAt: grantBase.expiresAt,
    }),
  });
  return Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
};

const authority = () =>
  createAgentEvaluationVerificationEvidenceBridgeAuthority({
    namespaceId,
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    descriptor,
    generation,
    controlledWorkspaceGrantDigest: digestAgentCanonicalValue(
      'controlled-workspace-grant'
    ),
    projectId,
    workspaceId,
    workspaceRevision,
    verificationPlanDigest,
    sandboxPolicyDigest: digestAgentCanonicalValue('sandbox-policy'),
    adapterRegistryDigest: digestAgentCanonicalValue('adapter-registry'),
    baseSnapshotDigest: digestAgentCanonicalValue('base-snapshot'),
    finalSnapshotDigest: digestAgentCanonicalValue('final-snapshot'),
    verificationAttemptGrantReceipts: Object.freeze([grantReceipt()]),
  });

const candidate = (): VerificationEvidenceCandidate => {
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest: verificationPlanDigest,
        cellId,
      }),
      label: 'G4 controlled Workspace verification cell',
    }),
  ]);
  const resultBase = Object.freeze({
    outcome: 'passed' as const,
    summary: Object.freeze({ status: 'verified' }),
    diagnosticCodes: Object.freeze([]),
    appliedExemptionIds: Object.freeze([]),
  });
  const candidateBase = Object.freeze({
    candidateId: 'candidate:evaluation-test',
    projectId,
    workspaceId,
    workspaceRevision,
    partitionRevisions: Object.freeze({
      workspaceRev: workspaceRevision,
      routeRev: 1,
      opSeq: 1,
      documentRevisions: Object.freeze({}),
    }),
    executableSnapshotDigest: digestVerificationValue('executable-snapshot'),
    policyRevision: 1,
    policyDigest: digestVerificationValue('verification-policy'),
    impactDigest: digestVerificationValue('verification-impact'),
    planDigest: verificationPlanDigest,
    policyEvaluationInstant: '2026-08-08T00:00:00.000Z',
    cellId,
    checkId: 'check-evaluation-test',
    checkKind: 'integration' as const,
    targetId: 'target-evaluation-test',
    attemptId: descriptor.attemptId,
    run: Object.freeze({
      runId: 'verification-run-evaluation-test',
      providerId: 'verification-provider-evaluation-test',
      surface: 'preview' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
      devicePixelRatio: 1,
      colorScheme: 'light' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: digestVerificationValue('verification-fonts'),
    }),
    timing: Object.freeze({
      startedAt: '2026-08-08T00:00:01.000Z',
      completedAt: '2026-08-08T00:00:02.000Z',
      durationMs: 1_000,
    }),
    result: Object.freeze({
      ...resultBase,
      normalizedResultDigest: digestVerificationValue(resultBase),
    }),
    provenance: Object.freeze({
      origin: 'remote' as const,
      producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
      providerId: 'verification-provider-evaluation-test',
      issuedAt: '2026-08-08T00:00:02.000Z',
      expiresAt: '2026-08-08T00:10:00.000Z',
    }),
    toolchain: Object.freeze({
      packageName: '@prodivix/verification-adapters',
      packageVersion: '0.0.0',
      buildDigest: digestVerificationValue('adapter-build'),
      toolchainDigest: digestVerificationValue('adapter-toolchain'),
      schemaDigest: digestVerificationValue('adapter-schema'),
    }),
    normalization: Object.freeze({
      packageName: '@prodivix/verification',
      packageVersion: '0.0.0',
      buildDigest: digestVerificationValue('normalization-build'),
      toolchainDigest: digestVerificationValue('normalization-toolchain'),
      schemaDigest: digestVerificationValue('normalization-schema'),
    }),
    controls: Object.freeze({
      profileDigest: digestVerificationValue('control-profile'),
      appliedDigest: digestVerificationValue('applied-controls'),
    }),
    inputs: Object.freeze({
      executableSnapshotDigest: digestVerificationValue('executable-snapshot'),
      fixtureSetDigests: Object.freeze([
        digestVerificationValue('fixture-set'),
      ]),
      baselineSetDigest: digestVerificationValue('baseline-set'),
      inputDigest: digestVerificationValue('verification-input'),
    }),
    artifacts: Object.freeze([]),
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: digestVerificationValue('dependency-lock'),
    redaction: Object.freeze({
      policyId: 'redaction:evaluation-test',
      scannerSetDigest: digestVerificationValue('redaction-scanners'),
      droppedFieldCounts: Object.freeze({}),
      targetPolicy: Object.freeze({
        authority: 'verification-policy' as const,
        policyDigest: digestVerificationValue('verification-policy'),
        semanticTargetId: 'target-evaluation-test',
        capture: 'masked' as const,
      }),
      safe: true as const,
    }),
    requestedRetention: 'release' as const,
    promotion: Object.freeze({
      idempotencyKey: 'promotion:evaluation-test',
      deadline: '2026-08-08T00:10:00.000Z',
    }),
  }) satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>;
  return Object.freeze({
    ...candidateBase,
    candidateDigest: digestVerificationValue(candidateBase),
  });
};

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    plan.repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]:
    'evaluation-service-test-token-with-thirty-two-bytes',
});

const delayedFetchResponse = (
  delayMs: number,
  response: Response,
  signal: AbortSignal | null | undefined
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs, response);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error('delayed verification authority request aborted'));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });

describe('evaluation Verification Evidence service bridge', () => {
  it('sends the full frozen authority to the server-only sandbox CAS route and validates its ACK', async () => {
    const idempotencyKey = 'sandbox-registration.test.0001';
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    let capturedAuthorization: string | null = null;
    let capturedRequest:
      | (Record<string, unknown> & {
          authority: { verificationAttemptGrantReceipts: readonly unknown[] };
          requestDigest: string;
        })
      | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method;
      capturedAuthorization = new Headers(init?.headers).get('authorization');
      const request = JSON.parse(String(init?.body)) as NonNullable<
        typeof capturedRequest
      >;
      capturedRequest = request;
      const receiptBase = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'sandbox-registration' as const,
        requestDigest: request.requestDigest,
        idempotencyKey,
        registrationId: 'sandbox-registration.test',
        registrationDigest: digestAgentCanonicalValue('registration'),
      });
      return new Response(
        JSON.stringify({
          ...receiptBase,
          receiptDigest: digestAgentCanonicalValue(receiptBase),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });
    const bridge = createEnvironmentAgentEvaluationVerificationEvidenceBridge({
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      environment,
      fetch: fetchMock,
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });

    await expect(
      bridge.registerSandbox({ authority: authority(), idempotencyKey })
    ).resolves.toMatchObject({
      kind: 'sandbox-registration',
      registrationId: 'sandbox-registration.test',
    });
    expect(capturedUrl).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/${plan.planDigest}/${plan.repositoryCommit}/verification-evidence/sandboxes/${encodeURIComponent(descriptor.attemptId)}`
    );
    expect(capturedMethod).toBe('PUT');
    expect(capturedAuthorization).toBe(
      `Bearer ${environment[AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]}`
    );
    expect(capturedRequest).toMatchObject({
      kind: 'sandbox-registration-request',
      idempotencyKey,
      authority: {
        namespaceId,
        evaluationPlanDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        descriptor,
        generation,
        projectId,
        workspaceId,
        workspaceRevision,
        verificationPlanDigest,
      },
    });
    expect(
      capturedRequest?.authority.verificationAttemptGrantReceipts
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('recovers the exact canonical per-cell grant receipts before dispatch', async () => {
    const receipt = grantReceipt();
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.method).toBe('GET');
      return new Response(JSON.stringify({ facts: [receipt] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const issuer =
      createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer({
        evaluationPlanDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        environment,
        fetch: fetchMock,
        operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
      });

    await expect(
      issuer.list({
        descriptor,
        generation,
        verificationPlanDigest,
      })
    ).resolves.toEqual([receipt]);
  });

  it('freezes the attestation challenge only after prepare and sends its proof only to final-commit', async () => {
    const promotionId = 'promotion.evaluation-test';
    const evidenceId = 'evidence.evaluation-test';
    const uploadCapability = 'upload-capability-'.padEnd(48, 'u');
    const attestationNonce = 'attestation-nonce-'.padEnd(32, 'n');
    const attestationStatement =
      createVerificationEvidenceStatementForCandidate(
        Object.freeze({
          candidate: candidate(),
          evidenceId,
          createdAt: '2026-08-08T00:00:03.000Z',
          artifacts: Object.freeze([]),
        }),
        Object.freeze([])
      );
    const attestation = Object.freeze({
      format: 'prodivix.verification-attestation-proof',
      proof: 'signed-after-prepare',
    });
    const requests: Array<
      Readonly<{ url: string; body: Record<string, unknown> }>
    > = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(Object.freeze({ url: String(url), body }));
      if (body.kind === 'promotion-create-request') {
        const base = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-created' as const,
          requestDigest: body.requestDigest,
          promotionId,
          evidenceId,
          uploadCapability,
        });
        return new Response(
          JSON.stringify({
            ...base,
            receiptDigest: digestAgentCanonicalValue(base),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (body.kind === 'promotion-prepare-request') {
        const base = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepared' as const,
          requestDigest: body.requestDigest,
          promotionId,
          evidenceId,
          attestationNonce,
          attestationStatement,
          attestationStatementDigest:
            createVerificationEvidenceStatementDigest(attestationStatement),
        });
        return new Response(
          JSON.stringify({
            ...base,
            receiptDigest: digestAgentCanonicalValue(base),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      expect(body.kind).toBe('promotion-final-commit-request');
      expect(body.attestation).toEqual(attestation);
      const base = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-finalized' as const,
        requestDigest: body.requestDigest,
        promotionId,
        evidenceId,
        manifest: Object.freeze({}),
      });
      return new Response(
        JSON.stringify({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const bridge = createEnvironmentAgentEvaluationVerificationEvidenceBridge({
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      environment,
      fetch: fetchMock,
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });
    const registrationBase = Object.freeze({
      format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
      version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
      kind: 'sandbox-registration' as const,
      requestDigest: digestAgentCanonicalValue('sandbox-registration-request'),
      idempotencyKey: 'sandbox-registration.sequence.0001',
      registrationId: 'sandbox-registration.sequence',
      registrationDigest: digestAgentCanonicalValue('sandbox-registration'),
    });
    const sign = vi.fn(async () => attestation);

    await expect(
      bridge.promoteCell({
        authority: authority(),
        registration: Object.freeze({
          ...registrationBase,
          receiptDigest: digestAgentCanonicalValue(registrationBase),
        }),
        cellId,
        candidate: candidate(),
        stagedArtifacts: Object.freeze([]),
        artifactSource: Object.freeze({
          async read() {
            throw new Error('No artifact read is expected.');
          },
        }),
        attestationAuthority: Object.freeze({ sign }),
        idempotencyKey: 'promotion.sequence.test.0001',
      })
    ).rejects.toMatchObject({ code: 'G4_RUNNER_RESPONSE_INVALID' });

    expect(requests.map(({ body }) => body.kind)).toEqual([
      'promotion-create-request',
      'promotion-prepare-request',
      'promotion-final-commit-request',
    ]);
    expect(requests[0]!.body).not.toHaveProperty('attestationNonce');
    expect(requests[0]!.body).not.toHaveProperty('attestation');
    expect(
      requests[1]!.url.endsWith(`/promotions/${promotionId}/prepare`)
    ).toBe(true);
    expect(
      requests[2]!.url.endsWith(`/promotions/${promotionId}/final-commit`)
    ).toBe(true);
    expect(sign).toHaveBeenCalledOnce();
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        attestationNonce,
        attestationStatement,
        attestationStatementDigest:
          createVerificationEvidenceStatementDigest(attestationStatement),
      })
    );
  });

  it('rejects the legacy create response when it attempts to precompute a challenge', async () => {
    const attestationStatement = Object.freeze({ legacy: true });
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        requestDigest: CanonicalDigest;
      };
      const base = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-created' as const,
        requestDigest: request.requestDigest,
        promotionId: 'promotion.legacy-create',
        evidenceId: 'evidence.legacy-create',
        uploadCapability: 'upload-capability-'.padEnd(48, 'u'),
        attestationNonce: 'legacy-attestation-nonce'.padEnd(32, 'n'),
        attestationStatement,
        attestationStatementDigest:
          digestVerificationValue(attestationStatement),
      });
      return new Response(
        JSON.stringify({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const bridge = createEnvironmentAgentEvaluationVerificationEvidenceBridge({
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      environment,
      fetch: fetchMock,
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });
    const registrationBase = Object.freeze({
      format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
      version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
      kind: 'sandbox-registration' as const,
      requestDigest: digestAgentCanonicalValue('legacy-registration-request'),
      idempotencyKey: 'sandbox-registration.legacy.0001',
      registrationId: 'sandbox-registration.legacy',
      registrationDigest: digestAgentCanonicalValue('legacy-registration'),
    });
    const sign = vi.fn();

    await expect(
      bridge.promoteCell({
        authority: authority(),
        registration: Object.freeze({
          ...registrationBase,
          receiptDigest: digestAgentCanonicalValue(registrationBase),
        }),
        cellId,
        candidate: candidate(),
        stagedArtifacts: Object.freeze([]),
        artifactSource: Object.freeze({
          async read() {
            throw new Error('No artifact read is expected.');
          },
        }),
        attestationAuthority: Object.freeze({ sign }),
        idempotencyKey: 'promotion.legacy.test.0001',
      })
    ).rejects.toMatchObject({ code: 'G4_RUNNER_RESPONSE_INVALID' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sign).not.toHaveBeenCalled();
  });

  it('uses 125 seconds for verification writes and 30 seconds for receipt reads', async () => {
    vi.useFakeTimers();
    try {
      let delayMs = 31_000;
      const fetchMock: typeof fetch = async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as {
          requestDigest: string;
          idempotencyKey: string;
        };
        const base = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'sandbox-registration' as const,
          requestDigest: request.requestDigest,
          idempotencyKey: request.idempotencyKey,
          registrationId: 'sandbox-registration.delayed',
          registrationDigest: digestAgentCanonicalValue('delayed-registration'),
        });
        return delayedFetchResponse(
          delayMs,
          new Response(
            JSON.stringify({
              ...base,
              receiptDigest: digestAgentCanonicalValue(base),
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
          init?.signal
        );
      };
      const bridge = createEnvironmentAgentEvaluationVerificationEvidenceBridge(
        {
          evaluationPlanDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          environment,
          fetch: fetchMock,
          operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
        }
      );
      const registrationInput = Object.freeze({
        authority: authority(),
        idempotencyKey: 'sandbox-registration.delayed.0001',
      });

      const beyondThirtySeconds = bridge.registerSandbox(registrationInput);
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(beyondThirtySeconds).resolves.toMatchObject({
        registrationId: 'sandbox-registration.delayed',
      });

      delayMs = 125_001;
      const beyondOperationDeadline = bridge.registerSandbox(registrationInput);
      const operationDeadlineRejection = expect(
        beyondOperationDeadline
      ).rejects.toMatchObject({ code: 'G4_RUNNER_ABORTED' });
      await vi.advanceTimersByTimeAsync(125_000);
      await operationDeadlineRejection;

      const receipt = grantReceipt();
      const issuer =
        createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer({
          evaluationPlanDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          environment,
          operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
          fetch: async (_url, init) =>
            delayedFetchResponse(
              30_001,
              new Response(JSON.stringify({ facts: [receipt] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
              init?.signal
            ),
        });
      const delayedRead = issuer.list({
        descriptor,
        generation,
        verificationPlanDigest,
      });
      const shortDeadlineRejection = expect(delayedRead).rejects.toMatchObject({
        code: 'G4_RUNNER_ABORTED',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await shortDeadlineRejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a drifted registration ACK before it can authorize promotion', async () => {
    const bridge = createEnvironmentAgentEvaluationVerificationEvidenceBridge({
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      environment,
      fetch: async () =>
        new Response(
          JSON.stringify({
            format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
            version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
            kind: 'sandbox-registration',
            requestDigest: digestAgentCanonicalValue('drifted'),
            idempotencyKey: 'sandbox-registration.test.0002',
            registrationId: 'sandbox-registration.test',
            registrationDigest: digestAgentCanonicalValue('registration'),
            receiptDigest: digestAgentCanonicalValue('receipt'),
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        ),
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });

    await expect(
      bridge.registerSandbox({
        authority: authority(),
        idempotencyKey: 'sandbox-registration.test.0002',
      })
    ).rejects.toMatchObject({ code: 'G4_RUNNER_RESPONSE_INVALID' });
  });
});
