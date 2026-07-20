import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from 'node:crypto';
import { createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest as scopeDigest } from '@prodivix/runtime-remote';
import type {
  RemoteExecutionRegionalInfrastructureFencePort,
  RemoteExecutionRegionalRecoveryAuthorizationPort,
  RemoteExecutionRegionalRecoveryAuthorizationScope,
  RemoteExecutionRegionalRecoveryGrantReplayStore,
  RemoteExecutionRegionalReplicationAttestationPort,
} from '@prodivix/runtime-remote';

export const REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_FORMAT =
  'prodivix.remote-regional-recovery-signed-proof' as const;
export const REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_VERSION = 1 as const;

const maximumProofBytes = 16 * 1_024;
const maximumKeysPerRole = 8;
const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export type RemoteRegionalRecoveryAuthorizationClaim = Readonly<{
  scopeDigest: string;
  principalDigest: string;
  expiresAt: number;
}>;

export type RemoteRegionalRecoveryInfrastructureFenceClaim = Readonly<{
  scopeDigest: string;
  incidentObservedAt: number;
  sourceFencedAt: number;
  expiresAt: number;
}>;

export type RemoteRegionalRecoveryReplicationAttestationClaim = Readonly<{
  scopeDigest: string;
  targetCheckpointDigest: string;
  lastReplicatedAt: number;
  expiresAt: number;
}>;

export type RemoteRegionalRecoveryUnsignedProof =
  | Readonly<{
      kind: 'operator-authorization';
      keyId: string;
      claim: RemoteRegionalRecoveryAuthorizationClaim;
    }>
  | Readonly<{
      kind: 'infrastructure-fence';
      keyId: string;
      claim: RemoteRegionalRecoveryInfrastructureFenceClaim;
    }>
  | Readonly<{
      kind: 'replication-attestation';
      keyId: string;
      claim: RemoteRegionalRecoveryReplicationAttestationClaim;
    }>;

export type CreateRemoteRegionalRecoverySignedProofPortsOptions = Readonly<{
  authorizationPublicKeys: Readonly<Record<string, string>>;
  infrastructureFencePublicKeys: Readonly<Record<string, string>>;
  replicationAttestationPublicKeys: Readonly<Record<string, string>>;
  grantReplayStore: RemoteExecutionRegionalRecoveryGrantReplayStore;
  now?: () => number;
}>;

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
};

const record = (
  value: unknown
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean =>
  JSON.stringify(Object.keys(value).sort()) ===
  JSON.stringify([...expected].sort());

const timestamp = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const validClaim = (
  kind: RemoteRegionalRecoveryUnsignedProof['kind'],
  value: unknown
): value is RemoteRegionalRecoveryUnsignedProof['claim'] => {
  const claim = record(value);
  if (!claim || typeof claim.scopeDigest !== 'string') return false;
  if (!digestPattern.test(claim.scopeDigest)) return false;
  if (kind === 'operator-authorization')
    return (
      exactKeys(claim, ['scopeDigest', 'principalDigest', 'expiresAt']) &&
      typeof claim.principalDigest === 'string' &&
      digestPattern.test(claim.principalDigest) &&
      timestamp(claim.expiresAt)
    );
  if (kind === 'infrastructure-fence')
    return (
      exactKeys(claim, [
        'scopeDigest',
        'incidentObservedAt',
        'sourceFencedAt',
        'expiresAt',
      ]) &&
      timestamp(claim.incidentObservedAt) &&
      timestamp(claim.sourceFencedAt) &&
      (claim.sourceFencedAt as number) >=
        (claim.incidentObservedAt as number) &&
      timestamp(claim.expiresAt)
    );
  return (
    exactKeys(claim, [
      'scopeDigest',
      'targetCheckpointDigest',
      'lastReplicatedAt',
      'expiresAt',
    ]) &&
    typeof claim.targetCheckpointDigest === 'string' &&
    digestPattern.test(claim.targetCheckpointDigest) &&
    timestamp(claim.lastReplicatedAt) &&
    timestamp(claim.expiresAt)
  );
};

const normalizeUnsignedProof = (
  value: RemoteRegionalRecoveryUnsignedProof
): RemoteRegionalRecoveryUnsignedProof => {
  if (
    ![
      'operator-authorization',
      'infrastructure-fence',
      'replication-attestation',
    ].includes(value.kind) ||
    !keyIdPattern.test(value.keyId) ||
    !validClaim(value.kind, value.claim)
  )
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  return Object.freeze({
    kind: value.kind,
    keyId: value.keyId,
    claim: Object.freeze({ ...value.claim }),
  }) as RemoteRegionalRecoveryUnsignedProof;
};

const signingRecord = (proof: RemoteRegionalRecoveryUnsignedProof) =>
  Object.freeze({
    format: REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_FORMAT,
    version: REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_VERSION,
    kind: proof.kind,
    keyId: proof.keyId,
    claim: proof.claim,
  });

/** Canonical bytes an isolated approval/fencing issuer signs with Ed25519. */
export const encodeRemoteRegionalRecoverySignedProofPayload = (
  value: RemoteRegionalRecoveryUnsignedProof
): Uint8Array =>
  new TextEncoder().encode(
    stableJson(signingRecord(normalizeUnsignedProof(value)))
  );

/** Combines a canonical claim with an externally produced Ed25519 signature. */
export const encodeRemoteRegionalRecoverySignedProof = (
  value: RemoteRegionalRecoveryUnsignedProof,
  signature: Uint8Array
): Uint8Array => {
  const proof = normalizeUnsignedProof(value);
  if (!(signature instanceof Uint8Array) || signature.byteLength !== 64)
    throw new TypeError('Remote regional recovery signature is invalid.');
  const serialized = stableJson({
    ...signingRecord(proof),
    signature: Buffer.from(signature).toString('base64url'),
  });
  const encoded = new TextEncoder().encode(serialized);
  if (encoded.byteLength > maximumProofBytes)
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  return encoded;
};

type ParsedProof = Readonly<{
  unsigned: RemoteRegionalRecoveryUnsignedProof;
  signature: Uint8Array;
  digest: string;
}>;

const proofDigest = (payload: Uint8Array, signature: Uint8Array): string => {
  const hash = createHash('sha256');
  hash.update(payload);
  hash.update(Buffer.from([0]));
  hash.update(signature);
  return `sha256-${hash.digest('hex')}`;
};

const parseProof = (value: Uint8Array): ParsedProof => {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength < 2 ||
    value.byteLength > maximumProofBytes
  )
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  let decoded: string;
  let parsed: unknown;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(value);
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  }
  const envelope = record(parsed);
  if (
    !envelope ||
    !exactKeys(envelope, [
      'format',
      'version',
      'kind',
      'keyId',
      'claim',
      'signature',
    ]) ||
    envelope.format !== REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_FORMAT ||
    envelope.version !== REMOTE_REGIONAL_RECOVERY_SIGNED_PROOF_VERSION ||
    (envelope.kind !== 'operator-authorization' &&
      envelope.kind !== 'infrastructure-fence' &&
      envelope.kind !== 'replication-attestation') ||
    typeof envelope.keyId !== 'string' ||
    !keyIdPattern.test(envelope.keyId) ||
    !validClaim(envelope.kind, envelope.claim) ||
    typeof envelope.signature !== 'string'
  )
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  const signature = Buffer.from(envelope.signature, 'base64url');
  if (
    signature.byteLength !== 64 ||
    signature.toString('base64url') !== envelope.signature
  )
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  const unsigned = normalizeUnsignedProof({
    kind: envelope.kind,
    keyId: envelope.keyId,
    claim: envelope.claim,
  } as RemoteRegionalRecoveryUnsignedProof);
  const payload = encodeRemoteRegionalRecoverySignedProofPayload(unsigned);
  return Object.freeze({
    unsigned,
    signature: Uint8Array.from(signature),
    digest: proofDigest(payload, signature),
  });
};

type TrustedKeySet = Readonly<{
  keys: ReadonlyMap<string, KeyObject>;
  fingerprints: ReadonlySet<string>;
}>;

const readTrustedKeys = (
  values: Readonly<Record<string, string>>,
  label: string
): TrustedKeySet => {
  const entries = Object.entries(values).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length < 1 || entries.length > maximumKeysPerRole)
    throw new TypeError(`${label} key count is invalid.`);
  const keys = new Map<string, KeyObject>();
  const fingerprints = new Set<string>();
  for (const [keyId, encoded] of entries) {
    if (!keyIdPattern.test(keyId) || typeof encoded !== 'string')
      throw new TypeError(`${label} key is invalid.`);
    let key: KeyObject;
    try {
      key = createPublicKey(encoded);
    } catch {
      throw new TypeError(`${label} key is invalid.`);
    }
    if (key.asymmetricKeyType !== 'ed25519')
      throw new TypeError(`${label} key must be Ed25519.`);
    const fingerprint = createHash('sha256')
      .update(key.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (keys.has(keyId) || fingerprints.has(fingerprint))
      throw new TypeError(`${label} key is duplicated.`);
    keys.set(keyId, key);
    fingerprints.add(fingerprint);
  }
  return Object.freeze({ keys, fingerprints });
};

const requireSeparatedRoles = (sets: readonly TrustedKeySet[]): void => {
  const fingerprints = new Set<string>();
  for (const set of sets)
    for (const fingerprint of set.fingerprints) {
      if (fingerprints.has(fingerprint))
        throw new TypeError(
          'Remote regional recovery signing roles must use distinct keys.'
        );
      fingerprints.add(fingerprint);
    }
};

const verifyProof = (
  raw: Uint8Array,
  expectedKind: RemoteRegionalRecoveryUnsignedProof['kind'],
  trusted: TrustedKeySet
): ParsedProof => {
  const proof = parseProof(raw);
  if (proof.unsigned.kind !== expectedKind)
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  const key = trusted.keys.get(proof.unsigned.keyId);
  if (
    !key ||
    !verifySignature(
      null,
      encodeRemoteRegionalRecoverySignedProofPayload(proof.unsigned),
      key,
      proof.signature
    )
  )
    throw new TypeError('Remote regional recovery signed proof is invalid.');
  return proof;
};

export const createRemoteRegionalRecoverySignedProofPorts = (
  options: CreateRemoteRegionalRecoverySignedProofPortsOptions
): Readonly<{
  authorization: RemoteExecutionRegionalRecoveryAuthorizationPort;
  infrastructureFence: RemoteExecutionRegionalInfrastructureFencePort;
  replicationAttestation: RemoteExecutionRegionalReplicationAttestationPort;
}> => {
  const authorizationKeys = readTrustedKeys(
    options.authorizationPublicKeys,
    'Remote regional recovery authorization'
  );
  const infrastructureFenceKeys = readTrustedKeys(
    options.infrastructureFencePublicKeys,
    'Remote regional recovery infrastructure fence'
  );
  const replicationAttestationKeys = readTrustedKeys(
    options.replicationAttestationPublicKeys,
    'Remote regional recovery replication attestation'
  );
  requireSeparatedRoles([
    authorizationKeys,
    infrastructureFenceKeys,
    replicationAttestationKeys,
  ]);
  const now = options.now ?? Date.now;
  const currentTime = (): number => {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError('Remote regional recovery proof time is invalid.');
    return value;
  };
  return Object.freeze({
    authorization: Object.freeze({
      async consume(
        scope: RemoteExecutionRegionalRecoveryAuthorizationScope,
        grant: Uint8Array
      ) {
        try {
          const proof = verifyProof(
            grant,
            'operator-authorization',
            authorizationKeys
          );
          const claim = proof.unsigned
            .claim as RemoteRegionalRecoveryAuthorizationClaim;
          const consumedAt = currentTime();
          if (
            claim.scopeDigest !== scopeDigest(scope) ||
            claim.expiresAt <= consumedAt
          )
            return Object.freeze({ kind: 'denied' as const });
          const consumed = await options.grantReplayStore.consume({
            grantDigest: proof.digest,
            expiresAt: claim.expiresAt,
            consumedAt,
          });
          return consumed
            ? Object.freeze({
                kind: 'authorized' as const,
                scopeDigest: claim.scopeDigest,
                grantDigest: proof.digest,
                principalDigest: claim.principalDigest,
                expiresAt: claim.expiresAt,
              })
            : Object.freeze({ kind: 'denied' as const });
        } catch {
          return Object.freeze({ kind: 'denied' as const });
        }
      },
    }),
    infrastructureFence: Object.freeze({
      async verify(
        scope: RemoteExecutionRegionalRecoveryAuthorizationScope,
        raw: Uint8Array
      ) {
        try {
          const proof = verifyProof(
            raw,
            'infrastructure-fence',
            infrastructureFenceKeys
          );
          const claim = proof.unsigned
            .claim as RemoteRegionalRecoveryInfrastructureFenceClaim;
          if (claim.scopeDigest !== scopeDigest(scope))
            return Object.freeze({ kind: 'unverified' as const });
          return Object.freeze({
            kind: 'verified' as const,
            scopeDigest: claim.scopeDigest,
            fenceDigest: proof.digest,
            incidentObservedAt: claim.incidentObservedAt,
            sourceFencedAt: claim.sourceFencedAt,
            expiresAt: claim.expiresAt,
          });
        } catch {
          return Object.freeze({ kind: 'unverified' as const });
        }
      },
    }),
    replicationAttestation: Object.freeze({
      async verify(
        {
          scope,
          targetCheckpointDigest,
        }: Readonly<{
          scope: RemoteExecutionRegionalRecoveryAuthorizationScope;
          targetCheckpointDigest: string;
        }>,
        raw: Uint8Array
      ) {
        try {
          const proof = verifyProof(
            raw,
            'replication-attestation',
            replicationAttestationKeys
          );
          const claim = proof.unsigned
            .claim as RemoteRegionalRecoveryReplicationAttestationClaim;
          if (
            claim.scopeDigest !== scopeDigest(scope) ||
            claim.targetCheckpointDigest !== targetCheckpointDigest
          )
            return Object.freeze({ kind: 'unverified' as const });
          return Object.freeze({
            kind: 'verified' as const,
            scopeDigest: claim.scopeDigest,
            targetCheckpointDigest: claim.targetCheckpointDigest,
            attestationDigest: proof.digest,
            lastReplicatedAt: claim.lastReplicatedAt,
            expiresAt: claim.expiresAt,
          });
        } catch {
          return Object.freeze({ kind: 'unverified' as const });
        }
      },
    }),
  });
};
