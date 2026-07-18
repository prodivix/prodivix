import { createHash, randomBytes } from 'node:crypto';
import {
  classifyBinaryAssetDelivery,
  createBinaryAssetMaterialization,
  readBinaryAssetScanAttestation,
  type BinaryAssetBlobReference,
  type BinaryAssetDeliveryClass,
  type BinaryAssetImageMetadata,
  type BinaryAssetScanAttestation,
} from '@prodivix/assets';

export type AssetDeliveryDisposition = 'inline' | 'attachment';

export type AssetDeliverySession = Readonly<{
  reference: BinaryAssetBlobReference;
  contents: Uint8Array;
  scan: BinaryAssetScanAttestation;
  deliveryClass: BinaryAssetDeliveryClass;
  disposition: AssetDeliveryDisposition;
  recipeDigest: string | null;
  metadata: BinaryAssetImageMetadata | null;
  expiresAt: number;
}>;

export type AssetDeliverySessionGrant = Readonly<{
  capability: string;
  session: AssetDeliverySession;
}>;

export type AssetDeliverySessionStoreOptions = Readonly<{
  maximumSessions: number;
  maximumTotalBytes: number;
  maximumTtlMs: number;
  now?: () => number;
  createCapability?: () => string;
}>;

export class AssetDeliveryCapacityError extends Error {
  constructor() {
    super('Asset delivery session capacity is exhausted.');
    this.name = 'AssetDeliveryCapacityError';
  }
}

const capabilityHash = (capability: string): string =>
  createHash('sha256').update(capability, 'ascii').digest('hex');

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
};

/** Owns bounded ephemeral bytes while retaining only hashes of bearer capabilities. */
export const createAssetDeliverySessionStore = (
  options: AssetDeliverySessionStoreOptions
) => {
  const maximumSessions = positiveInteger(
    options.maximumSessions,
    'Asset delivery maximum sessions'
  );
  const maximumTotalBytes = positiveInteger(
    options.maximumTotalBytes,
    'Asset delivery maximum total bytes'
  );
  const maximumTtlMs = positiveInteger(
    options.maximumTtlMs,
    'Asset delivery maximum TTL'
  );
  const now = options.now ?? Date.now;
  const createCapability =
    options.createCapability ?? (() => randomBytes(32).toString('hex'));
  const sessions = new Map<string, AssetDeliverySession>();
  let usedBytes = 0;

  const remove = (hash: string): void => {
    const existing = sessions.get(hash);
    if (!existing) return;
    sessions.delete(hash);
    usedBytes -= existing.contents.byteLength;
  };

  const purgeExpired = (at: number): void => {
    for (const [hash, session] of sessions) {
      if (session.expiresAt <= at) remove(hash);
    }
  };

  return Object.freeze({
    create(
      input: Omit<
        AssetDeliverySession,
        'contents' | 'expiresAt' | 'deliveryClass'
      > &
        Readonly<{ contents: Uint8Array }>,
      requestedTtlMs: number
    ): AssetDeliverySessionGrant {
      const at = now();
      purgeExpired(at);
      const ttlMs = Math.min(
        positiveInteger(requestedTtlMs, 'Asset delivery requested TTL'),
        maximumTtlMs
      );
      const materialization = createBinaryAssetMaterialization({
        assetDocumentId: 'asset-delivery-session',
        reference: input.reference,
        contents: input.contents,
      });
      const scan = readBinaryAssetScanAttestation(input.scan);
      if (
        scan.verdict !== 'clean' ||
        scan.subjectDigest !== materialization.reference.digest
      ) {
        throw new TypeError('Asset delivery scan attestation is invalid.');
      }
      const deliveryClass = classifyBinaryAssetDelivery(
        materialization.reference.mediaType
      );
      if (input.disposition === 'inline' && deliveryClass !== 'static') {
        throw new TypeError('Only static media can be delivered inline.');
      }
      if (
        sessions.size >= maximumSessions ||
        materialization.contents.byteLength > maximumTotalBytes - usedBytes
      ) {
        throw new AssetDeliveryCapacityError();
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const capability = createCapability();
        if (!/^[a-f0-9]{64}$/u.test(capability)) {
          throw new TypeError(
            'Asset delivery capability generator is invalid.'
          );
        }
        const hash = capabilityHash(capability);
        if (sessions.has(hash)) continue;
        const session = Object.freeze({
          reference: materialization.reference,
          contents: new Uint8Array(materialization.contents),
          scan,
          deliveryClass,
          disposition: input.disposition,
          recipeDigest: input.recipeDigest,
          metadata: input.metadata,
          expiresAt: at + ttlMs,
        });
        sessions.set(hash, session);
        usedBytes += session.contents.byteLength;
        return Object.freeze({ capability, session });
      }
      throw new AssetDeliveryCapacityError();
    },
    resolve(capability: string): AssetDeliverySession | undefined {
      if (!/^[a-f0-9]{64}$/u.test(capability)) return undefined;
      const hash = capabilityHash(capability);
      const session = sessions.get(hash);
      if (!session) return undefined;
      if (session.expiresAt <= now()) {
        remove(hash);
        return undefined;
      }
      return Object.freeze({
        ...session,
        contents: new Uint8Array(session.contents),
      });
    },
    revokeAll(): Readonly<{ sessionsRevoked: number; bytesRevoked: number }> {
      const sessionsRevoked = sessions.size;
      const bytesRevoked = usedBytes;
      sessions.clear();
      usedBytes = 0;
      return Object.freeze({ sessionsRevoked, bytesRevoked });
    },
    inspect(): Readonly<{ sessions: number; usedBytes: number }> {
      purgeExpired(now());
      return Object.freeze({ sessions: sessions.size, usedBytes });
    },
  });
};

export type AssetDeliverySessionStore = ReturnType<
  typeof createAssetDeliverySessionStore
>;
