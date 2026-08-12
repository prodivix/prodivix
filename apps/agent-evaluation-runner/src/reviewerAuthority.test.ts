import { generateKeyPairSync, sign } from 'node:crypto';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  TrustedAgentEvaluationReviewerIndependenceVerifier,
  decodeAgentEvaluationTrustedReviewerRegistry,
  type AgentEvaluationReviewerAuthority,
  type AgentEvaluationReviewerIndependenceAttestation,
  type AgentEvaluationReviewerIndependencePayload,
  type AgentEvaluationReviewerRegistryKey,
} from './reviewerAuthority';

const planDigest = digestAgentCanonicalValue('review-plan');
const owners = Object.freeze([
  'owner.anthropic',
  'owner.google',
  'owner.openai',
]);
const issuedAt = '2026-08-08T00:00:00.000Z';
const expiresAt = '2026-08-10T00:00:00.000Z';

const authority = (
  reviewerPseudonym: string,
  reviewerAuthorityId: string,
  organizationId: string
): AgentEvaluationReviewerAuthority => {
  const base = Object.freeze({
    reviewerPseudonym,
    reviewerAuthorityId,
    organizationId,
    role: 'independent-human-reviewer' as const,
  });
  return Object.freeze({
    ...base,
    reviewerAuthorityDigest: digestAgentCanonicalValue(base),
  });
};

const createFixture = () => {
  const pair = generateKeyPairSync('ed25519');
  const publicDer = pair.publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyBase64Url = publicDer.subarray(-32).toString('base64url');
  const keyBase = Object.freeze({
    authorityId: 'authority.review-board',
    keyId: 'review-board-key.v1',
    publicKeyBase64Url,
    purposes: Object.freeze([
      'independence-attestation',
      'review-artifact',
    ] as const),
  });
  const key: AgentEvaluationReviewerRegistryKey = Object.freeze({
    ...keyBase,
    keyDigest: digestAgentCanonicalValue(keyBase),
  });
  const first = authority('reviewer.alpha', 'reviewer.alpha.v1', 'org.alpha');
  const second = authority('reviewer.beta', 'reviewer.beta.v1', 'org.beta');
  const attestationFor = (
    value: AgentEvaluationReviewerAuthority,
    suffix: string
  ): AgentEvaluationReviewerIndependenceAttestation => {
    const payload: AgentEvaluationReviewerIndependencePayload = Object.freeze({
      format: 'prodivix.g4-reviewer-independence-attestation',
      version: 1,
      attestationId: `reviewer-independence.${suffix}`,
      planDigest,
      reviewerAuthorityDigest: value.reviewerAuthorityDigest,
      reviewerPseudonym: value.reviewerPseudonym,
      testedModelFamilyOwnerIds: owners,
      conflictModelFamilyOwnerIds: Object.freeze([]),
      issuerAuthorityId: key.authorityId,
      issuedAt,
      expiresAt,
    });
    const signatureBase64Url = sign(
      null,
      Buffer.from(canonicalJsonText(payload), 'utf8'),
      pair.privateKey
    ).toString('base64url');
    const base = Object.freeze({
      ...payload,
      proofKind: 'ed25519' as const,
      issuerKeyId: key.keyId,
      signatureBase64Url,
    });
    return Object.freeze({
      ...base,
      independenceAttestationDigest: digestAgentCanonicalValue(base),
    });
  };
  const attestations = Object.freeze([
    attestationFor(first, 'alpha'),
    attestationFor(second, 'beta'),
  ]);
  const base = Object.freeze({
    format: 'prodivix.g4-reviewer-authority-registry' as const,
    version: 1 as const,
    planDigest,
    reviewerAuthorities: Object.freeze([first, second]),
    trustedEd25519Keys: Object.freeze([key]),
    attestations,
  });
  return Object.freeze({
    registry: Object.freeze({
      ...base,
      registryDigest: digestAgentCanonicalValue(base),
    }),
    first,
    firstAttestation: attestations[0]!,
  });
};

describe('trusted reviewer authority registry', () => {
  it('verifies a plan-bound independent reviewer with a trusted Ed25519 issuer', async () => {
    const fixture = createFixture();
    const registry = decodeAgentEvaluationTrustedReviewerRegistry(
      fixture.registry,
      { expectedPlanDigest: planDigest }
    );
    const verifier = new TrustedAgentEvaluationReviewerIndependenceVerifier({
      registry,
      now: () => '2026-08-09T00:00:00.000Z',
    });

    await expect(
      verifier.verify({
        planDigest,
        reviewerPseudonym: fixture.first.reviewerPseudonym,
        reviewerAuthorityDigest: fixture.first.reviewerAuthorityDigest,
        independenceAttestationDigest:
          fixture.firstAttestation.independenceAttestationDigest,
        testedModelFamilyOwnerIds: owners,
      })
    ).resolves.toBe(true);
  });

  it('fails closed for owner drift, expiry, signature drift, or missing OIDC authority', async () => {
    const fixture = createFixture();
    const registry = decodeAgentEvaluationTrustedReviewerRegistry(
      fixture.registry,
      { expectedPlanDigest: planDigest }
    );
    const verifier = new TrustedAgentEvaluationReviewerIndependenceVerifier({
      registry,
      now: () => '2026-08-11T00:00:00.000Z',
    });
    const request = {
      planDigest,
      reviewerPseudonym: fixture.first.reviewerPseudonym,
      reviewerAuthorityDigest: fixture.first.reviewerAuthorityDigest,
      independenceAttestationDigest:
        fixture.firstAttestation.independenceAttestationDigest,
      testedModelFamilyOwnerIds: owners,
    };

    await expect(verifier.verify(request)).resolves.toBe(false);
    await expect(
      new TrustedAgentEvaluationReviewerIndependenceVerifier({
        registry,
        now: () => '2026-08-09T00:00:00.000Z',
      }).verify({
        ...request,
        testedModelFamilyOwnerIds: Object.freeze(['owner.openai']),
      })
    ).resolves.toBe(false);

    const oidcVerifier = { verify: vi.fn(async () => false) };
    expect(oidcVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects registry digest and exact-shape drift', () => {
    const fixture = createFixture();
    expect(() =>
      decodeAgentEvaluationTrustedReviewerRegistry(
        {
          ...fixture.registry,
          registryDigest: digestAgentCanonicalValue('bad'),
        },
        { expectedPlanDigest: planDigest }
      )
    ).toThrow();
    expect(() =>
      decodeAgentEvaluationTrustedReviewerRegistry(
        { ...fixture.registry, extra: true },
        { expectedPlanDigest: planDigest }
      )
    ).toThrow();
  });
});
