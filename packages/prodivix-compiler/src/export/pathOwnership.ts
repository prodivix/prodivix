import type { CompileDiagnostic } from '#src/core/diagnostics';
import { getFileContributionDesiredPath } from '#src/export/filePlanner';
import {
  createUniqueExportPath,
  normalizeExportPath,
} from '#src/export/pathPlanner';
import type {
  ExportPathRewrite,
  ExportProgramContribution,
  ExportReservedPath,
  ReserveExportPath,
} from '#src/export/types';

export const EXPORT_RESERVED_PATH_CONFLICT_CODE = 'EXP-4002';

export type ExportPathRegistry = {
  reservePath: ReserveExportPath;
  pathRewrites: ExportPathRewrite[];
  diagnostics: CompileDiagnostic[];
};

type ReservePathSource = Parameters<ReserveExportPath>[1];

const describeOwner = (reservation: ExportReservedPath) =>
  reservation.owner === 'entry-module'
    ? `the generated entry module "${reservation.ownerId}"`
    : `the generated scaffold file "${reservation.ownerId}"`;

const createReservedPathConflictDiagnostic = (input: {
  reservation: ExportReservedPath;
  emittedPath: string;
  source?: ReservePathSource;
}): CompileDiagnostic => ({
  code: EXPORT_RESERVED_PATH_CONFLICT_CODE,
  severity: 'error',
  source: 'export',
  message: `Export path "${input.reservation.path}" is reserved for ${describeOwner(
    input.reservation
  )}, but "${
    input.source?.id ?? 'an unidentified contribution'
  }" also requested it and was emitted at "${input.emittedPath}".`,
  path: `/files/${input.reservation.path}`,
  suggestion:
    'Rename or move the conflicting document so it no longer targets a generated entry path.',
});

/**
 * Owns every emitted export path.
 *
 * The scaffold imports the generated entry by a hard-coded specifier
 * (`index.html` -> `src/main.tsx` -> `./App`), so those paths are reserved
 * up front and can only be claimed by their declared owner. Any other
 * contribution that normalizes onto a reserved path is still emitted at a
 * unique path, but the export fails closed with a blocking diagnostic instead
 * of silently rewiring the entry chain to authored code.
 */
export const createExportPathRegistry = (
  reservations: readonly ExportReservedPath[] = []
): ExportPathRegistry => {
  const usedPaths = new Set<string>();
  const claimedPaths = new Set<string>();
  const pathRewrites: ExportPathRewrite[] = [];
  const diagnostics: CompileDiagnostic[] = [];
  const reservationByPath = new Map<string, ExportReservedPath>();

  reservations.forEach((reservation) => {
    const path = normalizeExportPath(reservation.path);
    if (reservationByPath.has(path)) return;
    reservationByPath.set(path, { ...reservation, path });
    usedPaths.add(path);
  });

  const recordRewrite = (
    requestedPath: string,
    emittedPath: string,
    normalizedPath: string,
    source?: ReservePathSource
  ) => {
    if (emittedPath === requestedPath) return;
    pathRewrites.push({
      requestedPath,
      emittedPath,
      reason: emittedPath === normalizedPath ? 'normalization' : 'conflict',
      sourceId: source?.id,
      sourceKind: source?.kind,
    });
  };

  const reservePath: ReserveExportPath = (desiredPath, source) => {
    const normalizedPath = normalizeExportPath(desiredPath);
    const reservation = reservationByPath.get(normalizedPath);
    if (
      reservation &&
      reservation.ownerId === source?.id &&
      !claimedPaths.has(normalizedPath)
    ) {
      claimedPaths.add(normalizedPath);
      recordRewrite(desiredPath, normalizedPath, normalizedPath, source);
      return normalizedPath;
    }
    const emittedPath = createUniqueExportPath(desiredPath, usedPaths);
    recordRewrite(desiredPath, emittedPath, normalizedPath, source);
    if (reservation) {
      diagnostics.push(
        createReservedPathConflictDiagnostic({
          reservation,
          emittedPath,
          source,
        })
      );
    }
    return emittedPath;
  };

  return { reservePath, pathRewrites, diagnostics };
};

/**
 * Derives the scaffold path reservations from the scaffold itself, so a preset
 * can never declare a stale list next to the files it actually emits.
 */
export const collectScaffoldReservedPaths = (
  contributions: readonly ExportProgramContribution[],
  sourceRoot: string
): ExportReservedPath[] =>
  contributions
    .flatMap((contribution) => contribution.files ?? [])
    .map((file) => ({
      path: normalizeExportPath(
        getFileContributionDesiredPath(file, sourceRoot)
      ),
      ownerId: file.id,
      owner: 'scaffold' as const,
    }));
