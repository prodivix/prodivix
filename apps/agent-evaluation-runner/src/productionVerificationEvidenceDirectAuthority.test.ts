import { readFileSync } from 'node:fs';

import {
  digestAgentCanonicalValue,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  createVerificationEvidenceManifest,
  createVerificationEvidenceStatementDigest,
  createVerificationEvidenceStatementForCandidate,
  createVerificationEvidenceVerifiedView,
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceManifest,
  encodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceCandidate,
  digestVerificationValue,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  decodeAgentEvaluationVerificationEvidenceFinalizationReceipt,
} from './evaluationVerificationEvidenceBridge';
import type {
  AgentEvaluationOwnerStateTransition,
  AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
} from './ownerState';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import { createVerificationEvidenceLifecycleFixture } from './productionVerificationEvidenceLifecycleEngine.fixture';
import type { ProductionVerificationEvidenceLifecycleDispatchInput } from './productionVerificationEvidenceLifecycleEngine';
import {
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES,
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST,
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
  createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority,
} from './productionVerificationEvidenceDirectAuthority';

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
const fixture = createVerificationEvidenceLifecycleFixture({
  plan,
  descriptor,
});
const baseUrl = 'http://127.0.0.1:8080';
const token = 'verification-owner-test-token-0123456789abcdef';
const sandboxRegistrationReceiptDigest = digestAgentCanonicalValue(
  'direct-authority-sandbox-registration'
);
const uploadCapability = 'upload-capability-'.padEnd(48, 'u');
const promotionId = 'promotion.direct.authority';
const evidenceId = 'evidence.direct.authority';

const environment = (name: string): string | undefined => {
  switch (name) {
    case PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.baseUrl:
      return baseUrl;
    case PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.token:
      return token;
    default:
      return undefined;
  }
};

const directResponse = (base: Readonly<Record<string, unknown>>): Response => {
  const body = canonicalJsonText({
    ...base,
    responseDigest: digestAgentCanonicalValue(base),
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Content-Type': 'application/json',
    },
  });
};

const healthResponse = (
  implementationDigest = PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST
): Response => {
  const body = canonicalJsonText({
    format: 'prodivix.verification-agent-evaluation-owner-health',
    version: 1,
    purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
    implementationDigest,
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Content-Type': 'application/json',
    },
  });
};

const requestFor = (
  operation:
    | 'artifact.upload'
    | 'promotion.create'
    | 'promotion.prepare'
    | 'promotion.final-commit',
  body: Readonly<Record<string, unknown>>
): AgentEvaluationOwnerAuthorityRequest => {
  const binding = {
    'promotion.create': {
      routeBinding: 'promotions',
      kind: 'promotion-create-request',
    },
    'artifact.upload': {
      routeBinding: 'promotions/{promotionId}/artifacts/{artifactId}',
      kind: 'artifact-upload-request',
    },
    'promotion.prepare': {
      routeBinding: 'promotions/{promotionId}/prepare',
      kind: 'promotion-prepare-request',
    },
    'promotion.final-commit': {
      routeBinding: 'promotions/{promotionId}/final-commit',
      kind: 'promotion-final-commit-request',
    },
  } as const;
  const selected = binding[operation];
  const payloadBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: selected.kind,
    authority: fixture.authority,
    sandboxRegistrationReceiptDigest,
    ...body,
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
    routeBinding: selected.routeBinding,
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
        : digestAgentCanonicalValue('direct-authority-owner-root'),
    stageDigest: digestAgentCanonicalValue('direct-authority-stage'),
    claimGeneration: 1,
    payload: Object.freeze({ ...payloadBase, requestDigest }),
  });
};

const dispatchFor = (
  request: AgentEvaluationOwnerAuthorityRequest
): ProductionVerificationEvidenceLifecycleDispatchInput =>
  Object.freeze({
    request,
    authority: fixture.authority,
    previousSnapshot: null,
  });

describe('production Verification Evidence direct authority', () => {
  it('probes the frozen implementation and replays callback-bound create/prepare secrets across ACK loss', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        const url = String(source);
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
        expect(headers.get('X-Prodivix-Verification-Authority-Purpose')).toBe(
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE
        );
        if (url.endsWith('/health')) {
          calls.push('health');
          expect(init?.method).toBe('GET');
          expect(init?.body).toBeUndefined();
          expect(headers.get('Idempotency-Key')).toBeNull();
          return healthResponse();
        }
        const parsed = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        expect(canonicalJsonText(parsed)).toBe(String(init?.body));
        const { requestDigest, ...requestBase } = parsed;
        expect(requestDigest).toBe(digestAgentCanonicalValue(requestBase));
        if (parsed.operation === 'promotion.create') {
          calls.push('promotion.create');
          expect(url).toBe(
            `${baseUrl}/api/internal/verification/agent-evaluation-owner/v1/workspaces/${fixture.workspaceId}/promotions`
          );
          expect(headers.get('Idempotency-Key')).toBe(
            fixture.candidate.promotion.idempotencyKey
          );
          expect(parsed.candidate).not.toHaveProperty('wireVersion');
          return directResponse({
            format: 'prodivix.verification-agent-evaluation-owner-response',
            version: 1,
            purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
            operation: parsed.operation,
            requestDigest,
            promotionId,
            evidenceId,
            uploadCapability,
          });
        }
        calls.push('promotion.prepare');
        expect(parsed.operation).toBe('promotion.prepare');
        expect(parsed.attestation).toBeNull();
        expect(headers.get('Idempotency-Key')).toBe(requestDigest);
        const statement = createVerificationEvidenceStatementForCandidate(
          Object.freeze({
            candidate: fixture.candidate,
            evidenceId,
            createdAt: '2026-08-08T00:00:03.000Z',
            artifacts: Object.freeze([]),
          }),
          Object.freeze([])
        );
        return directResponse({
          format: 'prodivix.verification-agent-evaluation-owner-response',
          version: 1,
          purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
          operation: parsed.operation,
          requestDigest,
          promotionId,
          evidenceId,
          attestationNonce: 'attestation-nonce-0123456789abcdef',
          attestationStatement: statement,
          attestationStatementDigest:
            createVerificationEvidenceStatementDigest(statement),
        });
      }
    );
    const authority =
      await createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority(
        { environment, forbiddenCanaries: () => Object.freeze([]), fetch }
      );
    const createRequest = requestFor('promotion.create', {
      cellId: fixture.cellId,
      candidate: encodeVerificationEvidenceCandidate(fixture.candidate),
      idempotencyKey: fixture.candidate.promotion.idempotencyKey,
    });
    const first = await authority.dispatch(dispatchFor(createRequest));
    const snapshotDigest = digestAgentCanonicalValue('active-snapshot');
    const reconstructed = await authority.reconstruct({
      request: createRequest,
      transition: Object.freeze({
        requestDigest: createRequest.requestDigest,
        ownerStateBundle: Object.freeze({ snapshotDigest }),
      }) as unknown as AgentEvaluationOwnerStateTransition,
      snapshot: Object.freeze({
        state: 'active',
        snapshotDigest,
      }) as unknown as AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
    });
    expect(reconstructed).toEqual(first);

    const prepared = await authority.dispatch(
      dispatchFor(
        requestFor('promotion.prepare', {
          promotionId,
          cellId: fixture.cellId,
          uploadCapability,
          idempotencyKey: 'promotion.direct.authority.prepare',
        })
      )
    );
    expect(prepared).toMatchObject({
      kind: 'promotion-prepared',
      promotionId,
      evidenceId,
      attestationNonce: 'attestation-nonce-0123456789abcdef',
    });
    expect(calls).toEqual([
      'health',
      'promotion.create',
      'promotion.create',
      'promotion.prepare',
    ]);
    await expect(authority.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
  });

  it('binds raw upload bytes, capability digest, exact headers, and bridge receipt independently', async () => {
    const artifactBytes = new TextEncoder().encode(
      '{"format":"prodivix.verification-artifact","version":1}'
    );
    const artifactDigest = `sha256-${await crypto.subtle
      .digest('SHA-256', artifactBytes)
      .then((value) => Buffer.from(value).toString('hex'))}`;
    let capturedBody: Uint8Array | undefined;
    const fetch = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        const url = String(source);
        if (url.endsWith('/health')) return healthResponse();
        const headers = new Headers(init?.headers);
        capturedBody = new Uint8Array(init?.body as ArrayBuffer).slice();
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(headers.get('Content-Length')).toBe(
          String(artifactBytes.length)
        );
        expect(headers.get('X-Prodivix-Verification-Capability')).toBe(
          uploadCapability
        );
        const requestDigest = headers.get(
          'X-Prodivix-Verification-Request-Digest'
        );
        expect(headers.get('Idempotency-Key')).toBe(requestDigest);
        return directResponse({
          format: 'prodivix.verification-agent-evaluation-owner-response',
          version: 1,
          purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
          operation: 'artifact.upload',
          requestDigest,
          promotionId,
          artifact: {
            id: 'artifact.direct.authority',
            path: 'reports/direct-authority.json',
            kind: 'replay-record',
            digest: artifactDigest,
            size: artifactBytes.length,
            mediaType: 'application/json',
            availability: 'available',
          },
        });
      }
    );
    const authority =
      await createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority(
        { environment, forbiddenCanaries: () => Object.freeze([]), fetch }
      );
    const request = requestFor('artifact.upload', {
      promotionId,
      cellId: fixture.cellId,
      uploadCapability,
      artifact: {
        id: 'artifact.direct.authority',
        stagingArtifactId: 'staging.direct.authority',
        kind: 'replay-record',
        digest: artifactDigest,
        size: artifactBytes.length,
        mediaType: 'application/json',
        bytesBase64: Buffer.from(artifactBytes).toString('base64'),
      },
      idempotencyKey: 'artifact.direct.authority.upload',
    });
    await expect(
      authority.dispatch(dispatchFor(request))
    ).resolves.toMatchObject({
      kind: 'artifact-uploaded',
      requestDigest: request.requestDigest,
      artifactId: 'artifact.direct.authority',
      artifactDigest,
    });
    expect(capturedBody).toEqual(artifactBytes);
  });

  it('binds final commit proof and current mutable view to full canonical manifests', async () => {
    const {
      candidateDigest: _candidateDigest,
      provenance,
      ...candidateWithoutDigest
    } = fixture.candidate;
    const portableProvenance = Object.freeze({
      producerId: provenance.producerId,
      providerId: provenance.providerId,
      issuedAt: provenance.issuedAt,
      ...(provenance.expiresAt ? { expiresAt: provenance.expiresAt } : {}),
    });
    const localCandidateBase = Object.freeze({
      ...candidateWithoutDigest,
      provenance: Object.freeze({
        ...portableProvenance,
        origin: 'local' as const,
      }),
    });
    const localCandidate = Object.freeze({
      ...localCandidateBase,
      candidateDigest: digestVerificationValue(localCandidateBase),
    });
    const created = createVerificationEvidenceManifest({
      candidate: localCandidate,
      evidenceId,
      createdAt: '2026-08-08T00:00:03.000Z',
      artifacts: Object.freeze([]),
    });
    if (created.status !== 'ready') {
      throw new Error(created.message);
    }
    const manifest = created.manifest;
    const materializedEvidence = Object.freeze({
      ...manifest.evidence,
      manifestDigest: manifest.manifestDigest,
    });
    const view = createVerificationEvidenceVerifiedView({
      closureEvaluationInstant: '2026-08-08T00:00:04.000Z',
      revocationRecordDigest: digestVerificationValue([]),
      records: Object.freeze([
        Object.freeze({
          evidenceId,
          manifestDigest: manifest.manifestDigest,
          materializedEvidenceDigest:
            digestVerificationValue(materializedEvidence),
          effectiveTrust: 'local-unattested' as const,
          trustStatus: 'verified' as const,
          retentionState: 'active' as const,
          revocationRecordDigests: Object.freeze([]),
          artifacts: Object.freeze([]),
        }),
      ]),
    });
    const fetch = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        const url = String(source);
        if (url.endsWith('/health')) return healthResponse();
        const parsed = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        const { requestDigest, ...requestBase } = parsed;
        expect(requestDigest).toBe(digestAgentCanonicalValue(requestBase));
        if (parsed.operation === 'promotion.final-commit') {
          expect(url.endsWith(`/${promotionId}/final-commit`)).toBe(true);
          expect(parsed.attestation).toEqual({ proof: 'signed-proof' });
          return directResponse({
            format: 'prodivix.verification-agent-evaluation-owner-response',
            version: 1,
            purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
            operation: parsed.operation,
            requestDigest,
            promotionId,
            evidenceId,
            manifest: {
              ...encodeVerificationEvidenceManifest(manifest),
              wireVersion: 1,
            },
          });
        }
        expect(parsed.operation).toBe('verified-view.resolve');
        expect(url.endsWith('/verified-view/resolve')).toBe(true);
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBeNull();
        return directResponse({
          format: 'prodivix.verification-agent-evaluation-owner-response',
          version: 1,
          purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
          operation: parsed.operation,
          requestDigest,
          evidenceIds: [evidenceId],
          view: {
            ...encodeVerificationEvidenceVerifiedView(view),
            wireVersion: 1,
          },
          manifests: [
            {
              ...encodeVerificationEvidenceManifest(manifest),
              wireVersion: 1,
            },
          ],
        });
      }
    );
    const authority =
      await createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority(
        { environment, forbiddenCanaries: () => Object.freeze([]), fetch }
      );
    const finalRequest = requestFor('promotion.final-commit', {
      promotionId,
      cellId: fixture.cellId,
      uploadCapability,
      attestation: Object.freeze({ proof: 'signed-proof' }),
      idempotencyKey: 'promotion.direct.authority.final-commit',
    });
    const finalized = await authority.dispatch(dispatchFor(finalRequest));
    expect(finalized).toMatchObject({
      kind: 'promotion-finalized',
      evidenceId,
      manifest,
    });
    expect(
      decodeAgentEvaluationVerificationEvidenceFinalizationReceipt(finalized, {
        requestDigest: finalRequest.requestDigest,
        promotionId,
        evidenceId,
        candidate: localCandidate,
      })
    ).toMatchObject({ manifest });
    const viewRequest = Object.freeze({
      ...finalRequest,
      mode: 'read' as const,
      operation: 'verified-view.resolve' as const,
      routeBinding: 'verified-view/resolve',
      requestDigest: digestAgentCanonicalValue('verified-view-request'),
    });
    const resolved = await authority.resolve({
      request: viewRequest,
      authority: fixture.authority,
      evidenceIds: Object.freeze([evidenceId]),
      snapshot: Object.freeze({}) as never,
      durableState: Object.freeze({}) as never,
    });
    expect(resolved).toMatchObject({
      kind: 'verified-view-resolved',
      requestDigest: viewRequest.requestDigest,
      verifiedEvidenceView: view,
      revokedEvidenceIds: [],
    });
    if (
      typeof resolved !== 'object' ||
      resolved === null ||
      !Object.hasOwn(resolved, 'verifiedEvidenceView')
    ) {
      throw new TypeError('Expected a verified-view resolution receipt.');
    }
    expect(
      decodeVerificationEvidenceVerifiedView(
        (resolved as { verifiedEvidenceView: unknown }).verifiedEvidenceView
      )
    ).toMatchObject({ ok: true, value: view });
  });

  it('fails closed on implementation drift and never dispatches an owner operation', async () => {
    const fetch = vi.fn(async () =>
      healthResponse(digestAgentCanonicalValue('drifted-implementation'))
    );
    await expect(
      createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority({
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        fetch,
      })
    ).rejects.toThrow('health');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
