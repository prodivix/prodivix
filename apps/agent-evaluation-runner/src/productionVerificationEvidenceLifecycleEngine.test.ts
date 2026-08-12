import { readFileSync } from 'node:fs';
import {
  digestAgentCanonicalValue,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  createVerificationEvidenceStatementDigest,
  createVerificationEvidenceStatementForCandidate,
  encodeVerificationEvidenceCandidate,
  digestVerificationValue,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
} from './evaluationVerificationEvidenceBridge';
import {
  createAgentEvaluationOwnerStateIdentity,
  type AgentEvaluationOwnerStateTransition,
  type AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
} from './ownerState';
import type { AgentEvaluationOwnerStateIngressClient } from './ownerStateIngressClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import { createVerificationEvidenceLifecycleFixture } from './productionVerificationEvidenceLifecycleEngine.fixture';
import {
  createProductionAgentEvaluationVerificationEvidenceLifecycleEngine,
  type ProductionVerificationEvidenceLifecycleAuthority,
} from './productionVerificationEvidenceLifecycleEngine';
import type { OwnerStateExecutionContext } from './productionWorkspaceVerificationOwnerAuthorityPorts';

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
const sandboxRegistrationReceiptDigest = digestAgentCanonicalValue(
  'lifecycle-sandbox-registration'
);
const uploadCapability = 'upload-capability-'.padEnd(48, 'u');
const attestationNonce = 'attestation-nonce-'.padEnd(32, 'n');
const promotionId = 'promotion.lifecycle.test';
const evidenceId = 'evidence.lifecycle.test';
const stageDigest = digestAgentCanonicalValue('lifecycle-stage');

const ingress: AgentEvaluationOwnerStateIngressClient = Object.freeze({
  async uploadArtifact() {
    throw new Error('Lifecycle engine does not upload CAS artifacts.');
  },
  async commitTransition() {
    throw new Error('Lifecycle engine does not commit its own transition.');
  },
});

const requestFor = (
  fixture: ReturnType<typeof createVerificationEvidenceLifecycleFixture>,
  operation:
    | 'promotion.create'
    | 'promotion.prepare'
    | 'promotion.final-commit'
    | 'promotion.finalize'
): AgentEvaluationOwnerAuthorityRequest => {
  const operationShape = {
    'promotion.create': {
      routeBinding: 'promotions',
      kind: 'promotion-create-request',
      body: Object.freeze({
        cellId: fixture.cellId,
        candidate: encodeVerificationEvidenceCandidate(fixture.candidate),
        idempotencyKey: fixture.candidate.promotion.idempotencyKey,
      }),
    },
    'promotion.prepare': {
      routeBinding: 'promotions/{promotionId}/prepare',
      kind: 'promotion-prepare-request',
      body: Object.freeze({
        promotionId,
        cellId: fixture.cellId,
        uploadCapability,
        idempotencyKey: 'promotion.lifecycle.test.0001.prepare',
      }),
    },
    'promotion.final-commit': {
      routeBinding: 'promotions/{promotionId}/final-commit',
      kind: 'promotion-final-commit-request',
      body: Object.freeze({
        promotionId,
        cellId: fixture.cellId,
        uploadCapability,
        attestation: Object.freeze({ proof: 'callback-bound-proof' }),
        idempotencyKey: 'promotion.lifecycle.test.0001.final-commit',
      }),
    },
    'promotion.finalize': {
      routeBinding: 'promotions/{promotionId}/finalize',
      kind: 'promotion-finalize-request',
      body: Object.freeze({
        promotionId,
        cellId: fixture.cellId,
        uploadCapability,
        attestation: Object.freeze({ proof: 'legacy-proof' }),
        idempotencyKey: 'promotion.lifecycle.test.0001.finalize',
      }),
    },
  } as const;
  const shape = operationShape[operation];
  const payloadBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: shape.kind,
    authority: fixture.authority,
    sandboxRegistrationReceiptDigest,
    ...shape.body,
  });
  const requestDigest = digestAgentCanonicalValue(payloadBase);
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: 1,
    serviceKind: 'verification-evidence',
    mode: 'execute',
    namespaceId: fixture.namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    operation,
    routeBinding: shape.routeBinding,
    requestDigest,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    generation: fixture.generation,
    controlledWorkspaceGrantDigest:
      fixture.authority.controlledWorkspaceGrantDigest,
    authorityDigest: fixture.authority.authorityDigest,
    sandboxRegistrationReceiptDigest,
    ownerStateRevision: operation === 'promotion.create' ? 0 : 1,
    ownerStateBundle: null,
    ownerStateRootDigest:
      operation === 'promotion.create'
        ? null
        : digestAgentCanonicalValue('previous-owner-root'),
    stageDigest,
    claimGeneration: 1,
    payload: Object.freeze({ ...payloadBase, requestDigest }),
  });
};

const contextFor = (
  fixture: ReturnType<typeof createVerificationEvidenceLifecycleFixture>,
  request: AgentEvaluationOwnerAuthorityRequest,
  previousSnapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot | null
): OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot> => {
  const identity = Object.freeze({
    serviceKind: 'verification-evidence' as const,
    namespaceId: fixture.namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    generation: fixture.generation,
    grantOrAuthorityDigest: fixture.authority.authorityDigest,
  });
  const revision = previousSnapshot?.revision ?? 0;
  return Object.freeze({
    request,
    identity,
    prior: Object.freeze({
      ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
      revision,
      bundle: null,
      rootDigest:
        revision === 0
          ? null
          : digestAgentCanonicalValue('previous-owner-root'),
    }),
    ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
    nextRevision: revision + 1,
    stageDigest,
    ingress,
    previousBundle: null,
    previousSnapshot,
  });
};

const receipt = <T extends Record<string, unknown>>(base: T) =>
  Object.freeze({ ...base, receiptDigest: digestAgentCanonicalValue(base) });

describe('production Verification Evidence lifecycle engine', () => {
  it('persists create and prepared states without raw secrets and reconstructs prepare ACK loss with execute=0', async () => {
    const fixture = createVerificationEvidenceLifecycleFixture({
      plan,
      descriptor,
    });
    const dispatch = vi.fn(
      async (
        input: Parameters<
          ProductionVerificationEvidenceLifecycleAuthority['dispatch']
        >[0]
      ) => {
        if (input.request.operation === 'promotion.create') {
          return receipt({
            format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
            version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
            kind: 'promotion-created',
            requestDigest: input.request.requestDigest,
            promotionId,
            evidenceId,
            uploadCapability,
          });
        }
        const attestationStatement =
          createVerificationEvidenceStatementForCandidate(
            Object.freeze({
              candidate: fixture.candidate,
              evidenceId,
              createdAt: '2026-08-08T00:00:03.000Z',
              artifacts: Object.freeze([]),
            }),
            Object.freeze([])
          );
        return receipt({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepared',
          requestDigest: input.request.requestDigest,
          promotionId,
          evidenceId,
          attestationNonce,
          attestationStatement,
          attestationStatementDigest:
            createVerificationEvidenceStatementDigest(attestationStatement),
        });
      }
    );
    const reconstruct = vi.fn(
      async (
        input: Parameters<
          ProductionVerificationEvidenceLifecycleAuthority['reconstruct']
        >[0]
      ) => {
        const statement = input.snapshot.attestationStatement;
        return receipt({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepared',
          requestDigest: input.request.requestDigest,
          promotionId,
          evidenceId,
          attestationNonce,
          attestationStatement: statement,
          attestationStatementDigest: createVerificationEvidenceStatementDigest(
            statement as Parameters<
              typeof createVerificationEvidenceStatementDigest
            >[0]
          ),
        });
      }
    );
    const lifecycle: ProductionVerificationEvidenceLifecycleAuthority =
      Object.freeze({
        dispatch,
        reconstruct,
        async close() {
          return Object.freeze({
            status: 'clean' as const,
            residualResourceIds: Object.freeze([]) as readonly [],
            residualCanaryIds: Object.freeze([]) as readonly [],
          });
        },
      });
    const engine =
      createProductionAgentEvaluationVerificationEvidenceLifecycleEngine({
        readAuthority: Object.freeze({
          async read() {
            throw new Error('Read is outside this lifecycle test.');
          },
        }),
        lifecycleAuthority: lifecycle,
      });

    const createRequest = requestFor(fixture, 'promotion.create');
    const created = await engine.execute(
      contextFor(fixture, createRequest, null)
    );
    expect(created.snapshot).toMatchObject({
      state: 'active',
      promotionId,
      evidenceId,
      attestationNonceDigest: null,
      attestationStatement: null,
    });
    expect(
      canonicalJsonText({
        publicResult: created.publicResult,
        snapshot: created.snapshot,
      })
    ).not.toContain(uploadCapability);

    const prepareRequest = requestFor(fixture, 'promotion.prepare');
    const prepared = await engine.execute(
      contextFor(fixture, prepareRequest, created.snapshot)
    );
    expect(prepared.snapshot).toMatchObject({
      state: 'prepared',
      promotionId,
      evidenceId,
      attestationNonceDigest: digestAgentCanonicalValue(attestationNonce),
    });
    const persisted = canonicalJsonText({
      publicResult: prepared.publicResult,
      snapshot: prepared.snapshot,
    });
    expect(persisted).not.toContain(uploadCapability);
    expect(persisted).not.toContain(attestationNonce);

    const response = await engine.reconstructResponse({
      request: prepareRequest,
      transition: Object.freeze({
        publicResult: prepared.publicResult,
      }) as unknown as AgentEvaluationOwnerStateTransition,
      snapshot: prepared.snapshot,
    });
    expect(response).toMatchObject({
      kind: 'promotion-prepared',
      attestationNonce,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(reconstruct).toHaveBeenCalledOnce();
    await expect(engine.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
  });

  it('requires every candidate artifact upload before prepare and rejects legacy finalize before dispatch', async () => {
    const artifactDigest = digestVerificationValue('artifact-content');
    const fixture = createVerificationEvidenceLifecycleFixture({
      plan,
      descriptor,
      candidateArtifacts: Object.freeze([
        Object.freeze({
          id: 'artifact:lifecycle',
          path: 'reports/lifecycle.json',
          stagingArtifactId: 'staging:lifecycle',
          kind: 'replay-record' as const,
          expectedDigest: artifactDigest,
          expectedSize: 16,
          expectedMediaType: 'application/json',
        }),
      ]),
    });
    const dispatch = vi.fn(
      async (
        input: Parameters<
          ProductionVerificationEvidenceLifecycleAuthority['dispatch']
        >[0]
      ) =>
        receipt({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-created',
          requestDigest: input.request.requestDigest,
          promotionId,
          evidenceId,
          uploadCapability,
        })
    );
    const engine =
      createProductionAgentEvaluationVerificationEvidenceLifecycleEngine({
        readAuthority: Object.freeze({
          async read() {
            throw new Error('Read is outside this lifecycle test.');
          },
        }),
        lifecycleAuthority: Object.freeze({
          dispatch,
          async reconstruct() {
            throw new Error('Reconstruction is outside this lifecycle test.');
          },
          async close() {
            return Object.freeze({
              status: 'clean' as const,
              residualResourceIds: Object.freeze([]) as readonly [],
              residualCanaryIds: Object.freeze([]) as readonly [],
            });
          },
        }),
      });
    const created = await engine.execute(
      contextFor(fixture, requestFor(fixture, 'promotion.create'), null)
    );

    await expect(
      engine.execute(
        contextFor(
          fixture,
          requestFor(fixture, 'promotion.prepare'),
          created.snapshot
        )
      )
    ).rejects.toThrow('prepare-artifact-set');
    await expect(
      engine.execute(
        contextFor(
          fixture,
          requestFor(fixture, 'promotion.finalize'),
          created.snapshot
        )
      )
    ).rejects.toThrow('request-payload');
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
