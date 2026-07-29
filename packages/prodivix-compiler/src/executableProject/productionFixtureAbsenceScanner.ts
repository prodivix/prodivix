import {
  decodeExecutionBuildBundle,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  compilerBytes,
  digestCompilerBytes,
  digestCompilerValue,
} from './executableProjectSnapshotCanonical';
import {
  CompilerProductionFixtureAbsenceError,
  type CompilerProductionFixtureAbsenceFileBinding,
  type CompilerProductionFixtureAbsenceFinding,
  type CompilerProductionFixtureAbsenceMarker,
  type CompilerProductionFixtureAbsenceScanReceipt,
} from './productionFixtureAbsenceReceipt.types';

export const COMPILER_PRODUCTION_FIXTURE_ABSENCE_BUNDLE_ENVELOPE_PATH =
  '.prodivix-authority/execution-build-bundle.json' as const;

const toBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    result +=
      second === undefined
        ? '='
        : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? '=' : alphabet[third & 0x3f];
  }
  return result;
};

export const encodeCompilerProductionBuildBundle = (
  bundle: ExecutionBuildBundle
): Uint8Array =>
  compilerBytes(
    canonicalJsonText({
      format: bundle.format,
      snapshotDigest: bundle.snapshotDigest,
      target: bundle.target,
      files: bundle.files.map((file) => ({
        path: file.path,
        size: file.size,
        digest: file.digest,
        encoding: 'base64',
        contents: toBase64(file.contents),
      })),
    })
  );

export const normalizeCompilerProductionBuildBundle = (
  snapshot: Pick<ExecutableProjectSnapshot, 'contentDigest' | 'target'>,
  bundle: ExecutionBuildBundle
): Readonly<{ bundle: ExecutionBuildBundle; bytes: Uint8Array }> => {
  const bytes = encodeCompilerProductionBuildBundle(bundle);
  const decoded = decodeExecutionBuildBundle(bytes);
  if (
    decoded.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(decoded.target, snapshot.target)
  ) {
    throw new CompilerProductionFixtureAbsenceError(
      'Production Vite dist does not bind the exact executable snapshot.'
    );
  }
  return Object.freeze({ bundle: decoded, bytes });
};

const fileBytes = (file: ExecutableProjectFile): Uint8Array =>
  compilerBytes(file.contents);

export const compilerProductionSourceFileBinding = (
  file: ExecutableProjectFile
): CompilerProductionFixtureAbsenceFileBinding => {
  const bytes = fileBytes(file);
  return Object.freeze({
    path: file.path,
    size: bytes.byteLength,
    digest: digestCompilerBytes(bytes),
    sourceTraceDigest: digestCompilerValue(file.sourceTrace ?? []),
  });
};

export const compilerProductionBuildFileBindings = (
  bundle: ExecutionBuildBundle
): readonly CompilerProductionFixtureAbsenceFileBinding[] =>
  Object.freeze(
    bundle.files.map((file) =>
      Object.freeze({
        path: file.path,
        size: file.size,
        digest: file.digest,
      })
    )
  );

const findBytes = (haystack: Uint8Array, needle: Uint8Array): number => {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }
  return -1;
};

export type CompilerProductionFixtureAbsenceScanFile = Readonly<{
  path: string;
  contents: Uint8Array;
  binding: CompilerProductionFixtureAbsenceFileBinding;
}>;

export const scanCompilerProductionFixtureAbsenceFiles = (
  scope: CompilerProductionFixtureAbsenceScanReceipt['scope'],
  files: readonly CompilerProductionFixtureAbsenceScanFile[],
  markers: readonly CompilerProductionFixtureAbsenceMarker[]
): CompilerProductionFixtureAbsenceScanReceipt => {
  const findings: CompilerProductionFixtureAbsenceFinding[] = [];
  let scannedByteCount = 0;
  for (const file of files) {
    const pathBytes = compilerBytes(file.path);
    scannedByteCount += pathBytes.byteLength + file.contents.byteLength;
    for (const marker of markers) {
      const markerBytes = compilerBytes(marker.value);
      const pathOffset = findBytes(pathBytes, markerBytes);
      if (pathOffset >= 0) {
        findings.push(
          Object.freeze({
            scope,
            path: file.path,
            surface: 'path',
            markerId: marker.id,
            byteOffset: pathOffset,
          })
        );
      }
      const contentsOffset = findBytes(file.contents, markerBytes);
      if (contentsOffset >= 0) {
        findings.push(
          Object.freeze({
            scope,
            path: file.path,
            surface: 'contents',
            markerId: marker.id,
            byteOffset: contentsOffset,
          })
        );
      }
    }
  }
  if (findings.length > 0) {
    findings.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.surface, right.surface) ||
        compareUnicodeCodePoints(left.markerId, right.markerId) ||
        left.byteOffset - right.byteOffset
    );
    throw new CompilerProductionFixtureAbsenceError(
      `Production ${scope} contains forbidden verification or fixture infrastructure.`,
      findings
    );
  }
  const fileSetDigest = digestCompilerValue(
    files.map(({ binding }) => binding)
  );
  const markerSetDigest = digestCompilerValue(markers);
  const withoutDigest = Object.freeze({
    scope,
    fileSetDigest,
    markerSetDigest,
    scannedFileCount: files.length,
    scannedByteCount,
    findingCount: 0 as const,
    status: 'clean' as const,
  });
  return Object.freeze({
    ...withoutDigest,
    scanDigest: digestCompilerValue(withoutDigest),
  });
};

export const compilerProductionSourceScanFiles = (
  files: readonly ExecutableProjectFile[]
): readonly CompilerProductionFixtureAbsenceScanFile[] =>
  Object.freeze(
    files.map((file) => {
      const binding = compilerProductionSourceFileBinding(file);
      return Object.freeze({
        path: file.path,
        contents: fileBytes(file),
        binding,
      });
    })
  );

export const compilerProductionBundleScanFiles = (
  bundle: ExecutionBuildBundle,
  envelope: Uint8Array
): readonly CompilerProductionFixtureAbsenceScanFile[] =>
  Object.freeze([
    Object.freeze({
      path: COMPILER_PRODUCTION_FIXTURE_ABSENCE_BUNDLE_ENVELOPE_PATH,
      contents: envelope,
      binding: Object.freeze({
        path: COMPILER_PRODUCTION_FIXTURE_ABSENCE_BUNDLE_ENVELOPE_PATH,
        size: envelope.byteLength,
        digest: digestCompilerBytes(envelope),
      }),
    }),
    ...bundle.files.map((file) =>
      Object.freeze({
        path: file.path,
        contents: new Uint8Array(file.contents),
        binding: Object.freeze({
          path: file.path,
          size: file.size,
          digest: file.digest,
        }),
      })
    ),
  ]);
