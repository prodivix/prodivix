import {
  createCipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto';
import {
  remoteExecutionSecretEnvelopeAssociatedData,
  REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
  REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
  type RemoteExecutionSecretEnvelope,
} from '@prodivix/runtime-remote';
import { ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT } from '@prodivix/server-runtime';
import { describe, expect, it } from 'vitest';
import { createRemoteWorkerSecretRecipient } from './remoteWorkerSecretRecipient';

const salt = Buffer.from(
  'prodivix.remote-execution-secret-envelope.key.v1',
  'utf8'
);

const seal = (
  recipientPublicKey: string,
  material: Readonly<Record<string, string>>
): RemoteExecutionSecretEnvelope => {
  const ephemeral = generateKeyPairSync('x25519');
  const ephemeralJwk = ephemeral.publicKey.export({ format: 'jwk' });
  const recipient = createPublicKey({
    format: 'jwk',
    key: { kty: 'OKP', crv: 'X25519', x: recipientPublicKey },
  });
  const envelope = {
    format: REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
    algorithm: REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
    executionId: 'execution-secret',
    workerId: 'worker-secret',
    workerAttempt: 2,
    workspaceId: 'workspace-secret',
    snapshotId: 'snapshot-secret',
    functionRef: { artifactId: 'code-secret', exportName: 'useSecret' },
    invocationId: 'invocation-secret',
    recipientPublicKey,
    ephemeralPublicKey: ephemeralJwk.x!,
    expiresAt: 20_000,
  };
  const aad = Buffer.from(
    remoteExecutionSecretEnvelopeAssociatedData(envelope),
    'utf8'
  );
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }),
      salt,
      aad,
      32
    )
  );
  const nonce = Buffer.alloc(12, 0x4a);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: material,
      })
    ),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Object.freeze({
    ...envelope,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  });
};

describe('remote Worker Secret recipient', () => {
  it('opens one exact identity-bound envelope and rejects replay', () => {
    const recipient = createRemoteWorkerSecretRecipient();
    const canary = 'worker-secret-material-canary';
    const envelope = seal(recipient.publicKey, { signingKey: canary });
    expect(JSON.stringify(envelope)).not.toContain(canary);
    const material = recipient.open(envelope, {
      executionId: 'execution-secret',
      workerId: 'worker-secret',
      workerAttempt: 2,
      workspaceId: 'workspace-secret',
      snapshotId: 'snapshot-secret',
      functionRef: { artifactId: 'code-secret', exportName: 'useSecret' },
      invocationId: 'invocation-secret',
      fields: ['signingKey'],
      now: 10_000,
    });
    expect(material.fields).toEqual({ signingKey: canary });
    expect(() =>
      recipient.open(envelope, {
        executionId: 'execution-secret',
        workerId: 'worker-secret',
        workerAttempt: 2,
        workspaceId: 'workspace-secret',
        snapshotId: 'snapshot-secret',
        functionRef: { artifactId: 'code-secret', exportName: 'useSecret' },
        invocationId: 'invocation-secret',
        fields: ['signingKey'],
        now: 10_000,
      })
    ).toThrow(/already consumed/u);
  });

  it('fails closed when immutable execution identity drifts', () => {
    const recipient = createRemoteWorkerSecretRecipient();
    const envelope = seal(recipient.publicKey, { signingKey: 'material' });
    expect(() =>
      recipient.open(envelope, {
        executionId: 'execution-secret',
        workerId: 'worker-secret',
        workerAttempt: 3,
        workspaceId: 'workspace-secret',
        snapshotId: 'snapshot-secret',
        functionRef: { artifactId: 'code-secret', exportName: 'useSecret' },
        invocationId: 'invocation-secret',
        fields: ['signingKey'],
        now: 10_000,
      })
    ).toThrow(/identity is invalid/u);
  });
});
