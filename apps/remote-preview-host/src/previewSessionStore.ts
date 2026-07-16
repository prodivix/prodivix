import { createHash, randomBytes } from 'node:crypto';
import type { ExecutionPreviewBundle } from '@prodivix/runtime-core';

export type PreviewSession = Readonly<{
  bundle: ExecutionPreviewBundle;
  expiresAt: number;
  totalBytes: number;
}>;

export type PreviewSessionGrant = Readonly<{
  capability: string;
  session: PreviewSession;
}>;

export type PreviewSessionStoreOptions = Readonly<{
  maximumSessions: number;
  maximumTotalBytes: number;
  maximumTtlMs: number;
  now?: () => number;
  createCapability?: () => string;
}>;

export class PreviewSessionCapacityError extends Error {}

const capabilityHash = (capability: string): string =>
  createHash('sha256').update(capability, 'ascii').digest('hex');

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${label} must be a positive integer.`);
  return value;
};

/** Owns bounded, ephemeral Preview materialization while retaining only capability hashes. */
export const createPreviewSessionStore = (
  options: PreviewSessionStoreOptions
) => {
  const maximumSessions = positiveInteger(
    options.maximumSessions,
    'Preview maximum sessions'
  );
  const maximumTotalBytes = positiveInteger(
    options.maximumTotalBytes,
    'Preview maximum total bytes'
  );
  const maximumTtlMs = positiveInteger(
    options.maximumTtlMs,
    'Preview maximum TTL'
  );
  const now = options.now ?? Date.now;
  const createCapability =
    options.createCapability ?? (() => randomBytes(32).toString('hex'));
  const sessions = new Map<string, PreviewSession>();
  let usedBytes = 0;

  const remove = (hash: string): void => {
    const existing = sessions.get(hash);
    if (!existing) return;
    sessions.delete(hash);
    usedBytes -= existing.totalBytes;
  };

  const purgeExpired = (at: number): void => {
    for (const [hash, session] of sessions) {
      if (session.expiresAt <= at) remove(hash);
    }
  };

  return Object.freeze({
    create(
      bundle: ExecutionPreviewBundle,
      requestedTtlMs: number
    ): PreviewSessionGrant {
      const at = now();
      purgeExpired(at);
      const ttlMs = Math.min(
        positiveInteger(requestedTtlMs, 'Preview requested TTL'),
        maximumTtlMs
      );
      const totalBytes = bundle.files.reduce(
        (total, file) => total + file.contents.byteLength,
        0
      );
      if (
        sessions.size >= maximumSessions ||
        totalBytes > maximumTotalBytes - usedBytes
      )
        throw new PreviewSessionCapacityError(
          'Preview session capacity is exhausted.'
        );
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const capability = createCapability();
        if (!/^[a-f0-9]{64}$/u.test(capability))
          throw new TypeError(
            'Preview capability generator returned an invalid value.'
          );
        const hash = capabilityHash(capability);
        if (sessions.has(hash)) continue;
        const session = Object.freeze({
          bundle,
          expiresAt: at + ttlMs,
          totalBytes,
        });
        sessions.set(hash, session);
        usedBytes += totalBytes;
        return Object.freeze({ capability, session });
      }
      throw new PreviewSessionCapacityError(
        'Preview capability allocation failed.'
      );
    },
    resolve(capability: string): PreviewSession | undefined {
      if (!/^[a-f0-9]{64}$/u.test(capability)) return undefined;
      const hash = capabilityHash(capability);
      const session = sessions.get(hash);
      if (!session) return undefined;
      if (session.expiresAt <= now()) {
        remove(hash);
        return undefined;
      }
      return session;
    },
    inspect(): Readonly<{ sessions: number; usedBytes: number }> {
      purgeExpired(now());
      return Object.freeze({ sessions: sessions.size, usedBytes });
    },
  });
};

export type PreviewSessionStore = ReturnType<typeof createPreviewSessionStore>;
