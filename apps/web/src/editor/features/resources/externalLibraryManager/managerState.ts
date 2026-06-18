import type { LibraryMode, PersistedLibrary } from './types';
import { normalizeLibraryIds } from './libraryScope';

export type NpmMetadata = {
  description: string | null;
  license: string | null;
  updatedAt: number;
};

export const PRE_RELEASE_PATTERN = /(alpha|beta|rc|next|canary|dev|broken)/i;
export const METADATA_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const normalizePersistedLibraries = (
  value: unknown
): PersistedLibrary[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PersistedLibrary | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id =
        typeof record.id === 'string'
          ? normalizeLibraryIds([record.id])[0]
          : '';
      if (!id) return null;
      return {
        id,
        scope:
          record.scope === 'component' ||
          record.scope === 'icon' ||
          record.scope === 'utility'
            ? record.scope
            : 'utility',
        version:
          typeof record.version === 'string' && record.version.trim().length > 0
            ? record.version.trim()
            : 'latest',
        status:
          record.status === 'loading' ||
          record.status === 'success' ||
          record.status === 'warning' ||
          record.status === 'error'
            ? record.status
            : 'idle',
      };
    })
    .filter((item): item is PersistedLibrary => Boolean(item));
};

export const normalizeMetadataCache = (
  value: unknown
): Record<string, NpmMetadata> => {
  if (!value || typeof value !== 'object') return {};
  const next: Record<string, NpmMetadata> = {};
  Object.entries(value).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.updatedAt !== 'number' ||
      !Number.isFinite(record.updatedAt)
    ) {
      return;
    }
    next[key] = {
      description:
        typeof record.description === 'string' &&
        record.description.trim().length > 0
          ? record.description.trim()
          : null,
      license:
        typeof record.license === 'string' && record.license.trim().length > 0
          ? record.license.trim()
          : null,
      updatedAt: record.updatedAt,
    };
  });
  return next;
};

export const normalizeLicenseText = (license: unknown): string | null => {
  if (typeof license === 'string' && license.trim().length > 0) {
    return license.trim();
  }
  if (
    license &&
    typeof license === 'object' &&
    'type' in (license as Record<string, unknown>)
  ) {
    const type = (license as Record<string, unknown>).type;
    if (typeof type === 'string' && type.trim().length > 0) {
      return type.trim();
    }
  }
  return null;
};

export const pickVersionByMode = (versions: string[], mode: LibraryMode) => {
  if (versions.length === 0) return 'latest';
  if (mode === 'dev') {
    return (
      versions.find((version) => PRE_RELEASE_PATTERN.test(version)) ??
      versions[0]
    );
  }
  return (
    versions.find((version) => !PRE_RELEASE_PATTERN.test(version)) ??
    versions[0]
  );
};
