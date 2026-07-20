import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  type RemoteExecutionRegionalRecoveryAuthorizationScope,
} from '@prodivix/runtime-remote';
import {
  createRemoteRegionalRecoverySignedProofPorts,
  encodeRemoteRegionalRecoverySignedProof,
  encodeRemoteRegionalRecoverySignedProofPayload,
  type RemoteRegionalRecoveryUnsignedProof,
} from './regionalRecoverySignedProof';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const keyPair = () => generateKeyPairSync('ed25519');
const pem = (key: ReturnType<typeof keyPair>['publicKey']): string =>
  key.export({ type: 'spki', format: 'pem' }).toString();

const signed = (
  proof: RemoteRegionalRecoveryUnsignedProof,
  privateKey: ReturnType<typeof keyPair>['privateKey']
): Uint8Array =>
  encodeRemoteRegionalRecoverySignedProof(
    proof,
    sign(
      null,
      encodeRemoteRegionalRecoverySignedProofPayload(proof),
      privateKey
    )
  );

const scope: RemoteExecutionRegionalRecoveryAuthorizationScope = Object.freeze({
  format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  operationId: 'operation-1',
  deploymentId: 'deployment-1',
  sourceRegionId: 'region-a',
  targetRegionId: 'region-b',
  mode: 'source-unavailable',
  expectedTrafficEpoch: 1,
  executionCount: 2,
  executionSetDigest: sha('1'),
  initiatedAt: 1_000,
  cutoverAt: 2_000,
  maximumAcceptedRpoMs: 500,
});

describe('regional recovery signed proof ports', () => {
  it('verifies separated Ed25519 roles and consumes an authorization grant once', async () => {
    const authorization = keyPair();
    const fence = keyPair();
    const replication = keyPair();
    const consumed = new Set<string>();
    const ports = createRemoteRegionalRecoverySignedProofPorts({
      authorizationPublicKeys: { authorization: pem(authorization.publicKey) },
      infrastructureFencePublicKeys: { fence: pem(fence.publicKey) },
      replicationAttestationPublicKeys: {
        replication: pem(replication.publicKey),
      },
      grantReplayStore: {
        async consume({ grantDigest }) {
          if (consumed.has(grantDigest)) return false;
          consumed.add(grantDigest);
          return true;
        },
      },
      now: () => 2_000,
    });
    const scopeDigest =
      createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(scope);
    const grant = signed(
      {
        kind: 'operator-authorization',
        keyId: 'authorization',
        claim: {
          scopeDigest,
          principalDigest: sha('2'),
          expiresAt: 2_500,
        },
      },
      authorization.privateKey
    );
    await expect(
      ports.authorization.consume(scope, grant)
    ).resolves.toMatchObject({
      kind: 'authorized',
      scopeDigest,
      principalDigest: sha('2'),
    });

    // JSON whitespace cannot change the replay identity because the digest is
    // over canonical signed bytes plus the signature, not the transport bytes.
    const prettyGrant = new TextEncoder().encode(
      JSON.stringify(JSON.parse(new TextDecoder().decode(grant)), null, 2)
    );
    await expect(
      ports.authorization.consume(scope, prettyGrant)
    ).resolves.toEqual({ kind: 'denied' });

    const fenceProof = signed(
      {
        kind: 'infrastructure-fence',
        keyId: 'fence',
        claim: {
          scopeDigest,
          incidentObservedAt: 1_500,
          sourceFencedAt: 1_900,
          expiresAt: 2_500,
        },
      },
      fence.privateKey
    );
    await expect(
      ports.infrastructureFence.verify(scope, fenceProof)
    ).resolves.toMatchObject({
      kind: 'verified',
      scopeDigest,
      incidentObservedAt: 1_500,
      sourceFencedAt: 1_900,
    });

    const targetCheckpointDigest = sha('3');
    const replicationProof = signed(
      {
        kind: 'replication-attestation',
        keyId: 'replication',
        claim: {
          scopeDigest,
          targetCheckpointDigest,
          lastReplicatedAt: 1_800,
          expiresAt: 2_500,
        },
      },
      replication.privateKey
    );
    await expect(
      ports.replicationAttestation.verify(
        { scope, targetCheckpointDigest },
        replicationProof
      )
    ).resolves.toMatchObject({
      kind: 'verified',
      targetCheckpointDigest,
      lastReplicatedAt: 1_800,
    });
  });

  it('fails closed on claim drift, wrong signing role and signature tampering', async () => {
    const authorization = keyPair();
    const fence = keyPair();
    const replication = keyPair();
    const ports = createRemoteRegionalRecoverySignedProofPorts({
      authorizationPublicKeys: { authorization: pem(authorization.publicKey) },
      infrastructureFencePublicKeys: { fence: pem(fence.publicKey) },
      replicationAttestationPublicKeys: {
        replication: pem(replication.publicKey),
      },
      grantReplayStore: { consume: async () => true },
      now: () => 2_000,
    });
    const scopeDigest =
      createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(scope);
    const wrongRole = signed(
      {
        kind: 'operator-authorization',
        keyId: 'authorization',
        claim: {
          scopeDigest,
          principalDigest: sha('2'),
          expiresAt: 2_500,
        },
      },
      authorization.privateKey
    );
    await expect(
      ports.infrastructureFence.verify(scope, wrongRole)
    ).resolves.toEqual({ kind: 'unverified' });

    const drifted = signed(
      {
        kind: 'infrastructure-fence',
        keyId: 'fence',
        claim: {
          scopeDigest: sha('9'),
          incidentObservedAt: 1_500,
          sourceFencedAt: 1_900,
          expiresAt: 2_500,
        },
      },
      fence.privateKey
    );
    await expect(
      ports.infrastructureFence.verify(scope, drifted)
    ).resolves.toEqual({ kind: 'unverified' });

    const tampered = Uint8Array.from(drifted);
    tampered[tampered.byteLength - 3] ^= 1;
    await expect(
      ports.infrastructureFence.verify(scope, tampered)
    ).resolves.toEqual({ kind: 'unverified' });
  });

  it('requires distinct public keys for authorization, fencing and replication', () => {
    const shared = keyPair();
    expect(() =>
      createRemoteRegionalRecoverySignedProofPorts({
        authorizationPublicKeys: { authorization: pem(shared.publicKey) },
        infrastructureFencePublicKeys: { fence: pem(shared.publicKey) },
        replicationAttestationPublicKeys: {
          replication: pem(keyPair().publicKey),
        },
        grantReplayStore: { consume: async () => true },
      })
    ).toThrow('signing roles must use distinct keys');
  });
});
