import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
} from 'node:crypto';
import {
  readRemoteExecutionSecretEnvelope,
  remoteExecutionSecretEnvelopeAssociatedData,
  type RemoteExecutionSecretEnvelope,
  type RemoteExecutionSecretEnvelopeIdentity,
} from '@prodivix/runtime-remote';
import {
  readIsolatedServerFunctionSecretMaterial,
  type IsolatedServerFunctionSecretMaterial,
} from '@prodivix/server-runtime';

const keyDerivationSalt = Buffer.from(
  'prodivix.remote-execution-secret-envelope.key.v1',
  'utf8'
);
const authenticationTagBytes = 16;
const maximumEnvelopeTtlMs = 60_000;

export type RemoteWorkerSecretRecipient = Readonly<{
  publicKey: string;
  open(
    envelope: RemoteExecutionSecretEnvelope,
    expected: Omit<
      RemoteExecutionSecretEnvelopeIdentity,
      'recipientPublicKey'
    > &
      Readonly<{ fields: readonly string[]; now?: number }>
  ): IsolatedServerFunctionSecretMaterial;
}>;

const publicKeyJwk = (publicKey: KeyObject): string => {
  const jwk = publicKey.export({ format: 'jwk' });
  if (
    jwk.kty !== 'OKP' ||
    jwk.crv !== 'X25519' ||
    typeof jwk.x !== 'string' ||
    Buffer.from(jwk.x, 'base64url').byteLength !== 32
  )
    throw new TypeError('Remote worker ephemeral public key is invalid.');
  return jwk.x;
};

const sameReference = (
  left: Readonly<{ artifactId: string; exportName: string }>,
  right: Readonly<{ artifactId: string; exportName: string }>
): boolean =>
  left.artifactId === right.artifactId && left.exportName === right.exportName;

/** Creates a per-resolution recipient. Its private key never leaves this closure. */
export const createRemoteWorkerSecretRecipient =
  (): RemoteWorkerSecretRecipient => {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    const recipientPublicKey = publicKeyJwk(publicKey);
    let consumed = false;
    return Object.freeze({
      publicKey: recipientPublicKey,
      open(envelopeValue, expected) {
        if (consumed)
          throw new TypeError(
            'Remote worker Secret recipient was already consumed.'
          );
        consumed = true;
        const envelope = readRemoteExecutionSecretEnvelope(envelopeValue);
        const now = expected.now ?? Date.now();
        if (
          !envelope ||
          envelope.recipientPublicKey !== recipientPublicKey ||
          envelope.executionId !== expected.executionId ||
          envelope.workerId !== expected.workerId ||
          envelope.workerAttempt !== expected.workerAttempt ||
          envelope.workspaceId !== expected.workspaceId ||
          envelope.snapshotId !== expected.snapshotId ||
          !sameReference(envelope.functionRef, expected.functionRef) ||
          envelope.invocationId !== expected.invocationId ||
          envelope.expiresAt <= now ||
          envelope.expiresAt > now + maximumEnvelopeTtlMs
        )
          throw new TypeError(
            'Remote worker Secret envelope identity is invalid.'
          );
        const ephemeralPublicKey = createPublicKey({
          format: 'jwk',
          key: {
            kty: 'OKP',
            crv: 'X25519',
            x: envelope.ephemeralPublicKey,
          },
        });
        const shared = diffieHellman({
          privateKey,
          publicKey: ephemeralPublicKey,
        });
        const aad = Buffer.from(
          remoteExecutionSecretEnvelopeAssociatedData(envelope),
          'utf8'
        );
        const derived = Buffer.from(
          hkdfSync('sha256', shared, keyDerivationSalt, aad, 32)
        );
        try {
          const sealed = Buffer.from(envelope.ciphertext, 'base64url');
          if (sealed.byteLength <= authenticationTagBytes)
            throw new TypeError('Remote worker Secret ciphertext is invalid.');
          const decipher = createDecipheriv(
            'aes-256-gcm',
            derived,
            Buffer.from(envelope.nonce, 'base64url'),
            { authTagLength: authenticationTagBytes }
          );
          decipher.setAAD(aad);
          decipher.setAuthTag(sealed.subarray(-authenticationTagBytes));
          const plaintext = Buffer.concat([
            decipher.update(sealed.subarray(0, -authenticationTagBytes)),
            decipher.final(),
          ]);
          try {
            const material = readIsolatedServerFunctionSecretMaterial(
              JSON.parse(plaintext.toString('utf8')) as unknown
            );
            const expectedFields = [...expected.fields].sort();
            if (
              !material ||
              JSON.stringify(Object.keys(material.fields)) !==
                JSON.stringify(expectedFields)
            )
              throw new TypeError('Remote worker Secret material is invalid.');
            return material;
          } finally {
            plaintext.fill(0);
          }
        } finally {
          shared.fill(0);
          derived.fill(0);
        }
      },
    });
  };
