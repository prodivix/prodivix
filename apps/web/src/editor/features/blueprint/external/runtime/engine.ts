import { loadExternalEsmModule } from './loader';
import { enrichCanonicalPropOptionsFromDts } from './dtsPropOptions';
import {
  applyManifestToCanonicalComponents,
  applyManifestToGroups,
} from './manifest';
import {
  registerExternalGroups,
  registerExternalRuntimeComponents,
} from './registry';
import { scanExternalModulePaths } from './scanner';
import type {
  ExternalLibraryDiagnostic,
  ExternalLibraryProfile,
} from './types';

const inFlightEnsures = new Map<string, Promise<ExternalLibraryDiagnostic[]>>();

export const ensureExternalLibrary = async (
  profile: ExternalLibraryProfile,
  options: { signal?: AbortSignal } = {}
): Promise<ExternalLibraryDiagnostic[]> => {
  if (options.signal?.aborted) return [];
  const descriptor = profile.descriptor();
  const cacheKey = descriptor.libraryId;
  const current = inFlightEnsures.get(cacheKey);
  if (current) return current;

  const promise = (async () => {
    const diagnostics: ExternalLibraryDiagnostic[] = [];
    try {
      const module = await loadExternalEsmModule(descriptor, diagnostics);
      if (!module) return diagnostics;

      const discoveredPaths = scanExternalModulePaths(module, {
        includePaths: profile.includePaths,
        excludeExports: profile.excludeExports,
        discoverExports: profile.scanMode !== 'include-only',
      });
      if (discoveredPaths.length === 0) {
        diagnostics.push({
          code: 'ELIB-2001',
          level: 'error',
          stage: 'scan',
          libraryId: descriptor.libraryId,
          message: `No renderable exports found for ${descriptor.libraryId}.`,
          hint: 'Verify include paths and module export names.',
          retryable: true,
        });
      }

      const canonicalComponents = profile.toCanonicalComponents(
        module,
        discoveredPaths
      );
      const canonicalWithDts = await enrichCanonicalPropOptionsFromDts(
        descriptor,
        canonicalComponents,
        options
      );
      const canonicalWithManifest = applyManifestToCanonicalComponents(
        canonicalWithDts,
        profile.manifest
      );
      const groups = profile.toGroups(canonicalWithManifest);
      const groupsWithManifest = applyManifestToGroups(
        canonicalWithManifest,
        groups,
        profile.manifest
      );

      registerExternalRuntimeComponents(canonicalWithManifest, diagnostics);
      registerExternalGroups(groupsWithManifest);
    } catch (error) {
      diagnostics.push({
        code: 'ELIB-1099',
        level: 'error',
        stage: 'load',
        libraryId: descriptor.libraryId,
        message: `Unexpected ${descriptor.libraryId} runtime load failure.`,
        hint: String(error),
        retryable: true,
      });
    }

    return diagnostics;
  })().finally(() => {
    inFlightEnsures.delete(cacheKey);
  });

  inFlightEnsures.set(cacheKey, promise);
  return promise;
};
