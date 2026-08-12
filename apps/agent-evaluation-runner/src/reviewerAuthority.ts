import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentEvaluationHumanReviewArtifactAuthority,
  AgentEvaluationHumanReviewArtifactPayload,
  AgentEvaluationHumanReviewImport,
  AgentEvaluationReviewerIndependenceVerifier,
} from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export const AGENT_EVALUATION_REVIEWER_REGISTRY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_REVIEWER_REGISTRY_PATH' as const;

const registryFormat = 'prodivix.g4-reviewer-authority-registry' as const;
const attestationFormat =
  'prodivix.g4-reviewer-independence-attestation' as const;
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');

export type AgentEvaluationReviewerAuthority = Readonly<{
  reviewerPseudonym: string;
  reviewerAuthorityId: string;
  organizationId: string;
  role: 'independent-human-reviewer';
  reviewerAuthorityDigest: string;
}>;

export type AgentEvaluationReviewerRegistryKey = Readonly<{
  authorityId: string;
  keyId: string;
  publicKeyBase64Url: string;
  purposes: readonly ('independence-attestation' | 'review-artifact')[];
  keyDigest: string;
}>;

export type AgentEvaluationReviewerIndependencePayload = Readonly<{
  format: typeof attestationFormat;
  version: 1;
  attestationId: string;
  planDigest: string;
  reviewerAuthorityDigest: string;
  reviewerPseudonym: string;
  testedModelFamilyOwnerIds: readonly string[];
  conflictModelFamilyOwnerIds: readonly string[];
  issuerAuthorityId: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type AgentEvaluationReviewerIndependenceAttestation =
  AgentEvaluationReviewerIndependencePayload &
    (
      | Readonly<{
          proofKind: 'ed25519';
          issuerKeyId: string;
          signatureBase64Url: string;
          independenceAttestationDigest: string;
        }>
      | Readonly<{
          proofKind: 'oidc';
          oidcIssuer: string;
          oidcSubject: string;
          oidcWorkflowRef: string;
          oidcEvidenceDigest: string;
          independenceAttestationDigest: string;
        }>
    );

export type AgentEvaluationTrustedReviewerRegistry = Readonly<{
  format: typeof registryFormat;
  version: 1;
  planDigest: string;
  reviewerAuthorities: readonly AgentEvaluationReviewerAuthority[];
  trustedEd25519Keys: readonly AgentEvaluationReviewerRegistryKey[];
  attestations: readonly AgentEvaluationReviewerIndependenceAttestation[];
  registryDigest: string;
}>;

export interface AgentEvaluationReviewerOidcVerifier {
  verify(
    input: Readonly<{
      payload: AgentEvaluationReviewerIndependencePayload;
      issuer: string;
      subject: string;
      workflowRef: string;
      evidenceDigest: string;
    }>
  ): boolean | Promise<boolean>;
}

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!isPlainObject(value)) return invalid();
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return invalid();
  }
  return value;
};

const identity = (value: unknown): string =>
  isAgentControlIdentity(value) ? value : invalid();

const digest = (value: unknown): string =>
  isAgentCanonicalDigest(value) ? value : invalid();

const instant = (value: unknown): string =>
  isAgentControlInstant(value) ? value : invalid();

const canonicalBase64Url = (
  value: unknown,
  bytes: number,
  pattern: RegExp
): string => {
  if (typeof value !== 'string' || !pattern.test(value)) return invalid();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    return invalid();
  }
  try {
    if (
      decoded.byteLength !== bytes ||
      decoded.toString('base64url') !== value
    ) {
      return invalid();
    }
    return value;
  } finally {
    decoded.fill(0);
  }
};

const identities = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return invalid();
  const result = value.map(identity).sort(compareUnicodeCodePoints);
  if (
    new Set(result).size !== result.length ||
    !sameCanonicalJson(result, value)
  ) {
    return invalid();
  }
  return Object.freeze(result);
};

const parseAuthority = (value: unknown): AgentEvaluationReviewerAuthority => {
  const record = exact(value, [
    'reviewerPseudonym',
    'reviewerAuthorityId',
    'organizationId',
    'role',
    'reviewerAuthorityDigest',
  ]);
  if (record.role !== 'independent-human-reviewer') return invalid();
  const base = Object.freeze({
    reviewerPseudonym: identity(record.reviewerPseudonym),
    reviewerAuthorityId: identity(record.reviewerAuthorityId),
    organizationId: identity(record.organizationId),
    role: 'independent-human-reviewer' as const,
  });
  const authority = Object.freeze({
    ...base,
    reviewerAuthorityDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(value, authority)) return invalid();
  return authority;
};

const parseKey = (value: unknown): AgentEvaluationReviewerRegistryKey => {
  const record = exact(value, [
    'authorityId',
    'keyId',
    'publicKeyBase64Url',
    'purposes',
    'keyDigest',
  ]);
  if (!Array.isArray(record.purposes)) return invalid();
  const purposes = Object.freeze(
    record.purposes.map(String).sort(compareUnicodeCodePoints)
  ) as AgentEvaluationReviewerRegistryKey['purposes'];
  if (
    purposes.length === 0 ||
    new Set(purposes).size !== purposes.length ||
    purposes.some(
      (purpose) =>
        purpose !== 'independence-attestation' && purpose !== 'review-artifact'
    ) ||
    !sameCanonicalJson(purposes, record.purposes)
  ) {
    return invalid();
  }
  const base = Object.freeze({
    authorityId: identity(record.authorityId),
    keyId: identity(record.keyId),
    publicKeyBase64Url: canonicalBase64Url(
      record.publicKeyBase64Url,
      32,
      /^[A-Za-z0-9_-]{43}$/u
    ),
    purposes,
  });
  const key = Object.freeze({
    ...base,
    keyDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(value, key)) return invalid();
  return key;
};

const payloadFrom = (
  record: Record<string, unknown>
): AgentEvaluationReviewerIndependencePayload =>
  Object.freeze({
    format: attestationFormat,
    version: 1,
    attestationId: identity(record.attestationId),
    planDigest: digest(record.planDigest),
    reviewerAuthorityDigest: digest(record.reviewerAuthorityDigest),
    reviewerPseudonym: identity(record.reviewerPseudonym),
    testedModelFamilyOwnerIds: identities(record.testedModelFamilyOwnerIds),
    conflictModelFamilyOwnerIds: identities(record.conflictModelFamilyOwnerIds),
    issuerAuthorityId: identity(record.issuerAuthorityId),
    issuedAt: instant(record.issuedAt),
    expiresAt: instant(record.expiresAt),
  });

const parseAttestation = (
  value: unknown
): AgentEvaluationReviewerIndependenceAttestation => {
  const common = [
    'format',
    'version',
    'attestationId',
    'planDigest',
    'reviewerAuthorityDigest',
    'reviewerPseudonym',
    'testedModelFamilyOwnerIds',
    'conflictModelFamilyOwnerIds',
    'issuerAuthorityId',
    'issuedAt',
    'expiresAt',
    'proofKind',
    'independenceAttestationDigest',
  ] as const;
  const probe = exact(value, common, [
    'issuerKeyId',
    'signatureBase64Url',
    'oidcIssuer',
    'oidcSubject',
    'oidcWorkflowRef',
    'oidcEvidenceDigest',
  ]);
  if (probe.format !== attestationFormat || probe.version !== 1)
    return invalid();
  const payload = payloadFrom(probe);
  if (Date.parse(payload.expiresAt) <= Date.parse(payload.issuedAt))
    return invalid();
  const proof =
    probe.proofKind === 'ed25519'
      ? (() => {
          exact(value, [...common, 'issuerKeyId', 'signatureBase64Url']);
          return Object.freeze({
            proofKind: 'ed25519' as const,
            issuerKeyId: identity(probe.issuerKeyId),
            signatureBase64Url: canonicalBase64Url(
              probe.signatureBase64Url,
              64,
              /^[A-Za-z0-9_-]{86}$/u
            ),
          });
        })()
      : probe.proofKind === 'oidc'
        ? (() => {
            exact(value, [
              ...common,
              'oidcIssuer',
              'oidcSubject',
              'oidcWorkflowRef',
              'oidcEvidenceDigest',
            ]);
            const issuer = String(probe.oidcIssuer);
            let issuerUrl: URL;
            try {
              issuerUrl = new URL(issuer);
            } catch {
              return invalid();
            }
            if (
              issuerUrl.protocol !== 'https:' ||
              issuerUrl.href !== issuer ||
              issuerUrl.username ||
              issuerUrl.password ||
              issuerUrl.search ||
              issuerUrl.hash
            ) {
              return invalid();
            }
            return Object.freeze({
              proofKind: 'oidc' as const,
              oidcIssuer: issuer,
              oidcSubject: identity(probe.oidcSubject),
              oidcWorkflowRef: identity(probe.oidcWorkflowRef),
              oidcEvidenceDigest: digest(probe.oidcEvidenceDigest),
            });
          })()
        : invalid();
  const base = Object.freeze({ ...payload, ...proof });
  const attestation = Object.freeze({
    ...base,
    independenceAttestationDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(value, attestation)) return invalid();
  return attestation;
};

export const decodeAgentEvaluationTrustedReviewerRegistry = (
  value: unknown,
  input: Readonly<{ expectedPlanDigest: string }>
): AgentEvaluationTrustedReviewerRegistry => {
  try {
    const record = exact(value, [
      'format',
      'version',
      'planDigest',
      'reviewerAuthorities',
      'trustedEd25519Keys',
      'attestations',
      'registryDigest',
    ]);
    if (
      record.format !== registryFormat ||
      record.version !== 1 ||
      digest(record.planDigest) !== input.expectedPlanDigest ||
      !Array.isArray(record.reviewerAuthorities) ||
      !Array.isArray(record.trustedEd25519Keys) ||
      !Array.isArray(record.attestations)
    ) {
      return invalid();
    }
    const reviewerAuthorities = Object.freeze(
      record.reviewerAuthorities
        .map(parseAuthority)
        .sort((left, right) =>
          compareUnicodeCodePoints(
            left.reviewerPseudonym,
            right.reviewerPseudonym
          )
        )
    );
    const trustedEd25519Keys = Object.freeze(
      record.trustedEd25519Keys
        .map(parseKey)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.keyId, right.keyId)
        )
    );
    const attestations = Object.freeze(
      record.attestations
        .map(parseAttestation)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.attestationId, right.attestationId)
        )
    );
    if (
      reviewerAuthorities.length < 2 ||
      new Set(
        reviewerAuthorities.map(({ reviewerPseudonym }) => reviewerPseudonym)
      ).size !== reviewerAuthorities.length ||
      new Set(
        reviewerAuthorities.map(
          ({ reviewerAuthorityDigest }) => reviewerAuthorityDigest
        )
      ).size !== reviewerAuthorities.length ||
      new Set(trustedEd25519Keys.map(({ keyId }) => keyId)).size !==
        trustedEd25519Keys.length ||
      new Set(attestations.map(({ attestationId }) => attestationId)).size !==
        attestations.length
    ) {
      return invalid();
    }
    const base = Object.freeze({
      format: registryFormat,
      version: 1 as const,
      planDigest: input.expectedPlanDigest,
      reviewerAuthorities,
      trustedEd25519Keys,
      attestations,
    });
    const registry = Object.freeze({
      ...base,
      registryDigest: digestAgentCanonicalValue(base),
    });
    if (!sameCanonicalJson(value, registry)) return invalid();
    return registry;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  }
};

const verifyEd25519 = (
  key: AgentEvaluationReviewerRegistryKey,
  payload:
    | AgentEvaluationReviewerIndependencePayload
    | AgentEvaluationHumanReviewArtifactPayload,
  signatureBase64Url: string
): boolean => {
  let publicBytes: Buffer | undefined;
  let signature: Buffer | undefined;
  try {
    publicBytes = Buffer.from(key.publicKeyBase64Url, 'base64url');
    signature = Buffer.from(signatureBase64Url, 'base64url');
    const publicKey = createPublicKey({
      format: 'der',
      type: 'spki',
      key: Buffer.concat([ed25519SpkiPrefix, publicBytes]),
    });
    return verifySignature(
      null,
      Buffer.from(canonicalJsonText(payload), 'utf8'),
      publicKey,
      signature
    );
  } catch {
    return false;
  } finally {
    publicBytes?.fill(0);
    signature?.fill(0);
  }
};

/**
 * Server-side producer helper. The signing key stays behind the callback and
 * only the canonical review payload bytes cross that boundary.
 */
export const createSignedAgentEvaluationHumanReviewImport = async (input: {
  payload: AgentEvaluationHumanReviewArtifactPayload;
  authority: Readonly<
    Omit<
      AgentEvaluationHumanReviewArtifactAuthority,
      'payloadDigest' | 'signatureBase64Url'
    >
  >;
  sign: (message: Uint8Array) => string | Promise<string>;
}): Promise<AgentEvaluationHumanReviewImport> => {
  if (
    input.payload.format !==
      'prodivix.g4-model-evaluation-human-review-import' ||
    input.payload.version !== 1 ||
    !isAgentCanonicalDigest(input.payload.planDigest) ||
    !/^[0-9a-f]{40}$/u.test(input.payload.repositoryCommit) ||
    !isAgentControlInstant(input.payload.reviewedAt) ||
    !isAgentControlIdentity(input.authority.authorityId) ||
    !isAgentControlIdentity(input.authority.keyId) ||
    input.authority.workflowName !== 'g4-real-model-human-review' ||
    !isAgentControlIdentity(input.authority.workflowRunId) ||
    !Number.isSafeInteger(input.authority.workflowRunAttempt) ||
    input.authority.workflowRunAttempt < 1 ||
    !isAgentControlInstant(input.authority.signedAt) ||
    Date.parse(input.authority.signedAt) < Date.parse(input.payload.reviewedAt)
  ) {
    return invalid();
  }
  const payload = Object.freeze({ ...input.payload });
  const payloadDigest = digestAgentCanonicalValue(payload);
  const message = new TextEncoder().encode(canonicalJsonText(payload));
  const signatureBase64Url = canonicalBase64Url(
    await input.sign(message),
    64,
    /^[A-Za-z0-9_-]{86}$/u
  );
  message.fill(0);
  const artifactAuthority = Object.freeze({
    ...input.authority,
    payloadDigest,
    signatureBase64Url,
  });
  const base = Object.freeze({ ...payload, artifactAuthority });
  return Object.freeze({
    ...base,
    artifactDigest: digestAgentCanonicalValue(base),
  });
};

export class TrustedAgentEvaluationReviewerIndependenceVerifier implements AgentEvaluationReviewerIndependenceVerifier {
  readonly #registry: AgentEvaluationTrustedReviewerRegistry;
  readonly #now: () => string;
  readonly #oidcVerifier?: AgentEvaluationReviewerOidcVerifier;

  constructor(input: {
    registry: AgentEvaluationTrustedReviewerRegistry;
    now: () => string;
    oidcVerifier?: AgentEvaluationReviewerOidcVerifier;
  }) {
    this.#registry = input.registry;
    this.#now = input.now;
    this.#oidcVerifier = input.oidcVerifier;
  }

  verifyArtifact(input: {
    payload: AgentEvaluationHumanReviewArtifactPayload;
    authority: AgentEvaluationHumanReviewArtifactAuthority;
  }): boolean {
    try {
      const now = this.#now();
      const key = this.#registry.trustedEd25519Keys.find(
        (entry) =>
          entry.authorityId === input.authority.authorityId &&
          entry.keyId === input.authority.keyId &&
          entry.purposes.includes('review-artifact')
      );
      return Boolean(
        key &&
        input.payload.planDigest === this.#registry.planDigest &&
        input.authority.workflowName === 'g4-real-model-human-review' &&
        input.authority.payloadDigest ===
          digestAgentCanonicalValue(input.payload) &&
        isAgentControlInstant(input.payload.reviewedAt) &&
        isAgentControlInstant(input.authority.signedAt) &&
        isAgentControlInstant(now) &&
        Date.parse(input.authority.signedAt) >=
          Date.parse(input.payload.reviewedAt) &&
        Date.parse(input.authority.signedAt) <= Date.parse(now) &&
        verifyEd25519(key, input.payload, input.authority.signatureBase64Url)
      );
    } catch {
      return false;
    }
  }

  async verify(input: {
    planDigest: string;
    reviewerPseudonym: string;
    reviewerAuthorityDigest: string;
    independenceAttestationDigest: string;
    testedModelFamilyOwnerIds: readonly string[];
  }): Promise<boolean> {
    try {
      if (input.planDigest !== this.#registry.planDigest) return false;
      const authority = this.#registry.reviewerAuthorities.find(
        (entry) => entry.reviewerPseudonym === input.reviewerPseudonym
      );
      const attestation = this.#registry.attestations.find(
        (entry) =>
          entry.independenceAttestationDigest ===
          input.independenceAttestationDigest
      );
      const testedOwners = [...input.testedModelFamilyOwnerIds].sort(
        compareUnicodeCodePoints
      );
      const now = this.#now();
      if (
        !authority ||
        !attestation ||
        authority.reviewerAuthorityDigest !== input.reviewerAuthorityDigest ||
        attestation.planDigest !== input.planDigest ||
        attestation.reviewerPseudonym !== input.reviewerPseudonym ||
        attestation.reviewerAuthorityDigest !== input.reviewerAuthorityDigest ||
        !sameCanonicalJson(
          attestation.testedModelFamilyOwnerIds,
          testedOwners
        ) ||
        attestation.conflictModelFamilyOwnerIds.length !== 0 ||
        !isAgentControlInstant(now) ||
        Date.parse(now) < Date.parse(attestation.issuedAt) ||
        Date.parse(now) >= Date.parse(attestation.expiresAt)
      ) {
        return false;
      }
      const { independenceAttestationDigest: _digest, ...base } = attestation;
      const payload: AgentEvaluationReviewerIndependencePayload = Object.freeze(
        {
          format: base.format,
          version: base.version,
          attestationId: base.attestationId,
          planDigest: base.planDigest,
          reviewerAuthorityDigest: base.reviewerAuthorityDigest,
          reviewerPseudonym: base.reviewerPseudonym,
          testedModelFamilyOwnerIds: base.testedModelFamilyOwnerIds,
          conflictModelFamilyOwnerIds: base.conflictModelFamilyOwnerIds,
          issuerAuthorityId: base.issuerAuthorityId,
          issuedAt: base.issuedAt,
          expiresAt: base.expiresAt,
        }
      );
      if (attestation.proofKind === 'ed25519') {
        const key = this.#registry.trustedEd25519Keys.find(
          (entry) =>
            entry.keyId === attestation.issuerKeyId &&
            entry.authorityId === attestation.issuerAuthorityId &&
            entry.purposes.includes('independence-attestation')
        );
        return Boolean(
          key && verifyEd25519(key, payload, attestation.signatureBase64Url)
        );
      }
      return Boolean(
        this.#oidcVerifier &&
        (await this.#oidcVerifier.verify({
          payload,
          issuer: attestation.oidcIssuer,
          subject: attestation.oidcSubject,
          workflowRef: attestation.oidcWorkflowRef,
          evidenceDigest: attestation.oidcEvidenceDigest,
        }))
      );
    } catch {
      return false;
    }
  }
}
