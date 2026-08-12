import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  digestAgentCanonicalValue,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationEvidenceManifest,
  createVerificationEvidenceStatementDigest,
  createVerificationEvidenceStatementForCandidate,
  createVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceManifest,
  digestVerificationValue,
} from '@prodivix/verification';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
} from './evaluationVerificationEvidenceBridge';
import type { ProductionVerificationEvidenceDirectAuthority } from './productionVerificationEvidenceDirectAuthority';
import { createVerificationEvidenceLifecycleFixture } from './productionVerificationEvidenceLifecycleEngine.fixture';
import { createProductionVerificationEvidenceDirectBridge } from './productionVerificationEvidenceDirectBridge';

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
const promotionId = 'promotion.production-direct-bridge';
const evidenceId = 'evidence.production-direct-bridge';
const uploadCapability = 'production-direct-capability-'.padEnd(48, 'u');

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);

const receipt = <T extends Readonly<Record<string, unknown>>>(base: T) =>
  Object.freeze({ ...base, receiptDigest: digest(base) });

const localCandidate = (() => {
  const {
    candidateDigest: _candidateDigest,
    provenance,
    ...candidateWithoutDigest
  } = fixture.candidate;
  const base = Object.freeze({
    ...candidateWithoutDigest,
    provenance: Object.freeze({
      origin: 'local' as const,
      producerId: provenance.producerId,
      providerId: provenance.providerId,
      issuedAt: provenance.issuedAt,
      ...(provenance.expiresAt ? { expiresAt: provenance.expiresAt } : {}),
    }),
  });
  return Object.freeze({
    ...base,
    candidateDigest: digestVerificationValue(base),
  });
})();

const createdManifest = createVerificationEvidenceManifest({
  candidate: localCandidate,
  evidenceId,
  createdAt: '2026-08-08T00:00:03.000Z',
  artifacts: Object.freeze([]),
});
if (createdManifest.status !== 'ready') {
  throw new TypeError(createdManifest.message);
}
const manifest = createdManifest.manifest;
const materializedEvidence = Object.freeze({
  ...manifest.evidence,
  manifestDigest: manifest.manifestDigest,
});
const verifiedView = createVerificationEvidenceVerifiedView({
  closureEvaluationInstant: '2026-08-08T00:00:04.000Z',
  revocationRecordDigest: digestVerificationValue([]),
  records: Object.freeze([
    Object.freeze({
      evidenceId,
      manifestDigest: manifest.manifestDigest,
      materializedEvidenceDigest: digestVerificationValue(materializedEvidence),
      effectiveTrust: 'local-unattested' as const,
      trustStatus: 'verified' as const,
      retentionState: 'active' as const,
      revocationRecordDigests: Object.freeze([]),
      artifacts: Object.freeze([]),
    }),
  ]),
});

const directHarness = () => {
  const calls: string[] = [];
  const close = vi.fn(async () =>
    Object.freeze({
      status: 'clean' as const,
      residualResourceIds: Object.freeze([]) as readonly [],
      residualCanaryIds: Object.freeze([]) as readonly [],
    })
  );
  const dispatch = vi.fn(
    async (
      input: Parameters<
        ProductionVerificationEvidenceDirectAuthority['dispatch']
      >[0]
    ) => {
      calls.push(input.request.operation);
      switch (input.request.operation) {
        case 'promotion.create':
          return receipt({
            format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
            version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
            kind: 'promotion-created' as const,
            requestDigest: input.request.requestDigest,
            promotionId,
            evidenceId,
            uploadCapability,
          });
        case 'promotion.prepare': {
          const statement = createVerificationEvidenceStatementForCandidate(
            Object.freeze({
              candidate: localCandidate,
              evidenceId,
              createdAt: '2026-08-08T00:00:03.000Z',
              artifacts: Object.freeze([]),
            }),
            Object.freeze([])
          );
          return receipt({
            format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
            version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
            kind: 'promotion-prepared' as const,
            requestDigest: input.request.requestDigest,
            promotionId,
            evidenceId,
            attestationNonce: 'production-direct-nonce-0123456789abcdef',
            attestationStatement: statement,
            attestationStatementDigest:
              createVerificationEvidenceStatementDigest(statement),
          });
        }
        case 'promotion.final-commit':
          return receipt({
            format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
            version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
            kind: 'promotion-finalized' as const,
            requestDigest: input.request.requestDigest,
            promotionId,
            evidenceId,
            manifest: encodeVerificationEvidenceManifest(manifest),
          });
        default:
          throw new TypeError(
            `Unexpected dispatch ${input.request.operation}.`
          );
      }
    }
  );
  const resolveDirect = vi.fn(
    async (
      input: Parameters<
        ProductionVerificationEvidenceDirectAuthority['resolveDirect']
      >[0]
    ) => {
      calls.push('verified-view.resolve');
      return receipt({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'verified-view-resolved' as const,
        requestDigest: input.request.requestDigest,
        verifiedEvidenceView: verifiedView,
        revokedEvidenceIds: Object.freeze([]),
      });
    }
  );
  const authority = Object.freeze({
    dispatch,
    reconstruct: vi.fn(),
    resolve: vi.fn(),
    resolveDirect,
    close,
  }) as unknown as ProductionVerificationEvidenceDirectAuthority;
  return Object.freeze({ authority, calls, dispatch, resolveDirect, close });
};

describe('production Verification Evidence direct bridge', () => {
  it('runs server-bound create, prepare, sign and final-commit and replays ACK-loss through the direct authority', async () => {
    const direct = directHarness();
    const bridge = createProductionVerificationEvidenceDirectBridge({
      authority: direct.authority,
      forbiddenCanaries: () => Object.freeze([]),
    });
    const registration = await bridge.registerSandbox({
      authority: fixture.authority,
      idempotencyKey: 'sandbox.production-direct-bridge',
    });
    const sign = vi.fn(async () => Object.freeze({ proof: 'signed-proof' }));
    const promotionInput = Object.freeze({
      authority: fixture.authority,
      registration,
      cellId: fixture.cellId,
      candidate: localCandidate,
      stagedArtifacts: Object.freeze([]),
      artifactSource: Object.freeze({
        async read(): Promise<never> {
          throw new TypeError('The fixture has no staged artifacts.');
        },
      }),
      attestationAuthority: Object.freeze({ sign }),
      idempotencyKey: 'promotion.production-direct-bridge',
    });
    const first = await bridge.promoteCell(promotionInput);
    const replayed = await bridge.promoteCell(promotionInput);
    expect(replayed).toEqual(first);
    expect(first).toMatchObject({
      evidence: { id: evidenceId },
      manifest,
    });
    expect(first.authorityReceiptDigests).toHaveLength(4);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(direct.calls).toEqual([
      'promotion.create',
      'promotion.prepare',
      'promotion.final-commit',
      'promotion.create',
      'promotion.prepare',
      'promotion.final-commit',
    ]);

    await expect(
      bridge.resolveVerifiedView({
        authority: fixture.authority,
        registration,
        evidenceIds: Object.freeze([evidenceId]),
        idempotencyKey: 'verified-view.production-direct-bridge',
      })
    ).resolves.toMatchObject({
      verifiedEvidenceView: verifiedView,
      revokedEvidenceIds: [],
    });
    await expect(bridge.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    expect(direct.close).toHaveBeenCalledOnce();
  }, 60_000);

  it('rejects a swapped local registration before the direct authority observes a mutation', async () => {
    const direct = directHarness();
    const bridge = createProductionVerificationEvidenceDirectBridge({
      authority: direct.authority,
      forbiddenCanaries: () => Object.freeze([]),
    });
    const registration = await bridge.registerSandbox({
      authority: fixture.authority,
      idempotencyKey: 'sandbox.production-direct-bridge',
    });
    await expect(
      bridge.promoteCell({
        authority: fixture.authority,
        registration: Object.freeze({
          ...registration,
          registrationDigest: digest('swapped-registration'),
        }),
        cellId: fixture.cellId,
        candidate: localCandidate,
        stagedArtifacts: Object.freeze([]),
        artifactSource: Object.freeze({ read: vi.fn() }),
        attestationAuthority: Object.freeze({ sign: vi.fn() }),
        idempotencyKey: 'promotion.production-direct-bridge',
      })
    ).rejects.toThrow('registration');
    expect(direct.dispatch).not.toHaveBeenCalled();
  });
});
