import {
  createExecutableProjectSnapshot,
  normalizeExecutableProjectPath,
  type ExecutableProjectEntrypoint,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  assertSameExecutableProjectSnapshot,
  canonicalExecutableProjectSnapshot,
  compilerBytes,
  digestCompilerBytes,
  digestCompilerValue,
  executableProjectSnapshotInput,
} from './executableProjectSnapshotCanonical';

export const COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT =
  'prodivix.compiler-diagnostic-test-extension-receipt.v1' as const;
export const COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER =
  '@prodivix/golden-conformance' as const;

const COMPILER_OWNER = '@prodivix/prodivix-compiler' as const;
const INTEGRATION_TEST_PATH_PATTERN =
  /^src\/[A-Za-z0-9][A-Za-z0-9._/-]*\.integration\.test\.tsx?$/u;

export type CompilerDiagnosticTestExtensionFileBinding = Readonly<{
  path: string;
  size: number;
  digest: string;
  sourceTraceDigest: string;
}>;

export type CompilerDiagnosticTestExtensionReceipt = Readonly<{
  format: typeof COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT;
  owner: typeof COMPILER_OWNER;
  extensionOwner: typeof COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER;
  extensionKind: 'integration-test';
  baseSnapshotDigest: string;
  snapshotDigest: string;
  files: readonly CompilerDiagnosticTestExtensionFileBinding[];
  entrypoints: readonly ExecutableProjectEntrypoint[];
  receiptDigest: string;
}>;

export type CreateCompilerDiagnosticTestExtensionInput = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  extensionOwner: typeof COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER;
  extensionKind: 'integration-test';
  files: readonly ExecutableProjectFile[];
  entrypoints: readonly ExecutableProjectEntrypoint[];
}>;

export type CompilerDiagnosticTestExtension = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  receipt: CompilerDiagnosticTestExtensionReceipt;
}>;

const canonicalExtensionFiles = (
  base: ExecutableProjectSnapshot,
  files: readonly ExecutableProjectFile[]
): readonly ExecutableProjectFile[] => {
  if (!Array.isArray(files) || files.length !== 1) {
    throw new TypeError(
      'Diagnostic integration extension must add exactly one owned test file.'
    );
  }
  const existingPaths = new Set(base.files.map(({ path }) => path));
  const canonical = files.map((file) => {
    const path = normalizeExecutableProjectPath(file.path);
    if (
      path !== file.path ||
      !INTEGRATION_TEST_PATH_PATTERN.test(path) ||
      existingPaths.has(path) ||
      typeof file.contents !== 'string' ||
      !Array.isArray(file.sourceTrace) ||
      file.sourceTrace.length === 0 ||
      file.sourceTrace.some(
        ({ sourceRef }: ExecutionSourceTrace) =>
          sourceRef.kind !== 'workspace' ||
          sourceRef.workspaceId !== base.workspace.workspaceId
      )
    ) {
      throw new TypeError(
        'Diagnostic integration extension file is outside its exact owner allowlist.'
      );
    }
    return Object.freeze({
      path,
      contents: file.contents,
      sourceTrace: Object.freeze(
        file.sourceTrace.map((trace: ExecutionSourceTrace) =>
          Object.freeze(trace)
        )
      ),
    });
  });
  return Object.freeze(canonical);
};

const canonicalExtensionEntrypoints = (
  files: readonly ExecutableProjectFile[],
  entrypoints: readonly ExecutableProjectEntrypoint[]
): readonly ExecutableProjectEntrypoint[] => {
  if (
    !Array.isArray(entrypoints) ||
    entrypoints.length !== files.length ||
    entrypoints.some(
      (entrypoint, index) =>
        entrypoint.kind !== 'test' || entrypoint.path !== files[index]!.path
    )
  ) {
    throw new TypeError(
      'Diagnostic integration extension must add one exact test entrypoint per file.'
    );
  }
  return Object.freeze(
    entrypoints.map((entrypoint) => Object.freeze({ ...entrypoint }))
  );
};

const extensionFileBinding = (
  file: ExecutableProjectFile
): CompilerDiagnosticTestExtensionFileBinding => {
  const bytes = compilerBytes(file.contents);
  return Object.freeze({
    path: file.path,
    size: bytes.byteLength,
    digest: digestCompilerBytes(bytes),
    sourceTraceDigest: digestCompilerValue(file.sourceTrace ?? []),
  });
};

const issueReceipt = (
  base: ExecutableProjectSnapshot,
  snapshot: ExecutableProjectSnapshot,
  files: readonly ExecutableProjectFile[],
  entrypoints: readonly ExecutableProjectEntrypoint[]
): CompilerDiagnosticTestExtensionReceipt => {
  const withoutDigest = Object.freeze({
    format: COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
    owner: COMPILER_OWNER,
    extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    extensionKind: 'integration-test' as const,
    baseSnapshotDigest: base.contentDigest,
    snapshotDigest: snapshot.contentDigest,
    files: Object.freeze(
      files
        .map(extensionFileBinding)
        .sort((left, right) => compareUnicodeCodePoints(left.path, right.path))
    ),
    entrypoints: Object.freeze(
      [...entrypoints].sort((left, right) =>
        compareUnicodeCodePoints(
          `${left.kind}:${left.path}`,
          `${right.kind}:${right.path}`
        )
      )
    ),
  });
  return Object.freeze({
    ...withoutDigest,
    receiptDigest: digestCompilerValue(withoutDigest),
  });
};

/**
 * Adds only the Golden-owned integration-test seam and signs the exact
 * before/after snapshot lineage. Arbitrary source files remain outside this
 * allowlist.
 */
export const createCompilerDiagnosticTestExtension = (
  input: CreateCompilerDiagnosticTestExtensionInput
): CompilerDiagnosticTestExtension => {
  if (
    input.extensionOwner !== COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER ||
    input.extensionKind !== 'integration-test'
  ) {
    throw new TypeError('Diagnostic test extension owner or kind is invalid.');
  }
  const base = canonicalExecutableProjectSnapshot(
    input.snapshot,
    'Diagnostic test extension base snapshot'
  );
  const files = canonicalExtensionFiles(base, input.files);
  const entrypoints = canonicalExtensionEntrypoints(files, input.entrypoints);
  if (
    base.entrypoints.some((entrypoint) =>
      entrypoints.some(
        (candidate) =>
          candidate.kind === entrypoint.kind &&
          candidate.path === entrypoint.path
      )
    )
  ) {
    throw new TypeError(
      'Diagnostic integration extension entrypoint already exists.'
    );
  }
  const snapshot = createExecutableProjectSnapshot(
    executableProjectSnapshotInput(
      base,
      Object.freeze([...base.files, ...files]),
      Object.freeze([...base.entrypoints, ...entrypoints])
    )
  );
  return Object.freeze({
    snapshot,
    receipt: issueReceipt(base, snapshot, files, entrypoints),
  });
};

const deriveExtensionDelta = (
  base: ExecutableProjectSnapshot,
  snapshot: ExecutableProjectSnapshot
): Readonly<{
  files: readonly ExecutableProjectFile[];
  entrypoints: readonly ExecutableProjectEntrypoint[];
}> => {
  const basePaths = new Set(base.files.map(({ path }) => path));
  const baseEntrypoints = new Set(
    base.entrypoints.map(({ kind, path }) => `${kind}\u0000${path}`)
  );
  for (const baseFile of base.files) {
    const candidate = snapshot.files.find(({ path }) => path === baseFile.path);
    if (!candidate || !sameCanonicalJson(candidate, baseFile)) {
      throw new TypeError(
        `Diagnostic test extension overwrote Compiler file: ${baseFile.path}.`
      );
    }
  }
  const files = Object.freeze(
    snapshot.files.filter(({ path }) => !basePaths.has(path))
  );
  const entrypoints = Object.freeze(
    snapshot.entrypoints.filter(
      ({ kind, path }) => !baseEntrypoints.has(`${kind}\u0000${path}`)
    )
  );
  return Object.freeze({ files, entrypoints });
};

export const issueCompilerDiagnosticTestExtensionReceipt = (
  baseSnapshot: ExecutableProjectSnapshot,
  extendedSnapshot: ExecutableProjectSnapshot
): CompilerDiagnosticTestExtensionReceipt => {
  const base = canonicalExecutableProjectSnapshot(
    baseSnapshot,
    'Diagnostic test extension base snapshot'
  );
  const snapshot = canonicalExecutableProjectSnapshot(
    extendedSnapshot,
    'Diagnostic test extension snapshot'
  );
  const delta = deriveExtensionDelta(base, snapshot);
  const extension = createCompilerDiagnosticTestExtension({
    snapshot: base,
    extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    extensionKind: 'integration-test',
    files: delta.files,
    entrypoints: delta.entrypoints,
  });
  assertSameExecutableProjectSnapshot(
    snapshot,
    extension.snapshot,
    'Diagnostic test extension result'
  );
  return extension.receipt;
};

export const assertCompilerDiagnosticTestExtensionReceipt = (
  receipt: CompilerDiagnosticTestExtensionReceipt,
  baseSnapshot: ExecutableProjectSnapshot,
  extendedSnapshot: ExecutableProjectSnapshot
): void => {
  const expected = issueCompilerDiagnosticTestExtensionReceipt(
    baseSnapshot,
    extendedSnapshot
  );
  if (!sameCanonicalJson(receipt, expected)) {
    throw new TypeError(
      'Diagnostic test extension receipt does not match its exact snapshot lineage.'
    );
  }
};
