import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  createVerificationAttestationClaimSet,
  createVerificationEvidenceStatementDigest,
  type VerificationEvidenceCandidate,
} from '@prodivix/verification';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import type { DriverPromotion, DriverAttestation } from '#src/g3/ports.js';

const resolveDriverSigningKey = (
  config: G3DriverConfiguration,
  environment: NodeJS.ProcessEnv
) => {
  const value = environment[config.attestation.privateKeyEnvironmentVariable];
  if (!value || value.length > 16384 || !/^[A-Za-z0-9_-]+$/u.test(value))
    throw new Error('G3 signing credential is unavailable.');
  const der = Buffer.from(value, 'base64url');
  try {
    if (der.toString('base64url') !== value) throw new Error();
    const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return { key, der };
  } catch {
    der.fill(0);
    throw new Error('G3 signing credential is unavailable.');
  }
};

/** Missing or malformed signing authority blocks preflight before authoring writes. */
export const assertDriverSigningCredential = (
  config: G3DriverConfiguration,
  environment: NodeJS.ProcessEnv = process.env
): void => {
  const resolved = resolveDriverSigningKey(config, environment);
  resolved.der.fill(0);
};

/** A Backend challenge is signed only after binding it to this actual candidate. */
export const signDriverAttestation = (
  config: G3DriverConfiguration,
  promotion: DriverPromotion,
  candidate: VerificationEvidenceCandidate,
  environment: NodeJS.ProcessEnv = process.env
): DriverAttestation => {
  const statement = promotion.attestationStatement;
  if (
    !statement ||
    !promotion.attestationNonce ||
    !promotion.attestationStatementDigest ||
    createVerificationEvidenceStatementDigest(statement) !==
      promotion.attestationStatementDigest ||
    statement.candidateDigest !== candidate.candidateDigest ||
    statement.planDigest !== candidate.planDigest ||
    statement.cellId !== candidate.cellId ||
    statement.attemptId !== candidate.attemptId ||
    statement.projectId !== candidate.projectId ||
    statement.workspaceId !== candidate.workspaceId
  )
    throw new Error('G3 attestation challenge drifted.');
  const issuedAt = new Date().toISOString();
  const claims = createVerificationAttestationClaimSet({
    expected: {
      trust: 'remote-attested',
      issuer: config.attestation.issuer,
      audience: config.attestation.audience,
      subject: config.attestation.subject,
      nonce: promotion.attestationNonce,
      policyGeneration: config.attestation.policyGeneration,
      verificationInstant: issuedAt,
      maximumLifetimeMs: 60000,
      statement,
    },
    issuedAt,
    notBefore: issuedAt,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  let der: Buffer | undefined;
  let message: Buffer | undefined;
  let signature: Buffer | undefined;
  try {
    const resolved = resolveDriverSigningKey(config, environment);
    der = resolved.der;
    const key = resolved.key;
    message = Buffer.from(canonicalJsonText(claims), 'utf8');
    signature = sign(null, message, key);
    if (
      signature.length !== 64 ||
      !verify(
        null,
        message,
        createPublicKey(
          key as unknown as Parameters<typeof createPublicKey>[0]
        ),
        signature
      )
    )
      throw new Error();
    return {
      ...claims,
      algorithm: 'Ed25519',
      keyId: config.attestation.keyId,
      signature: signature.toString('base64url'),
    };
  } catch {
    throw new Error('G3 signing credential is unavailable.');
  } finally {
    der?.fill(0);
    message?.fill(0);
    signature?.fill(0);
  }
};
