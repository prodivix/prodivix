import { createHash } from 'node:crypto';
import {
  createExecutableProjectSnapshot,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
  type ExecutionBuildBundle,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT =
  'prodivix.controlled-static-toolchain-request.v1' as const;
export const CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT =
  'prodivix.controlled-static-toolchain-result.v1' as const;
export const CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT =
  'prodivix.controlled-static-toolchain-authority-receipt.v1' as const;
export const CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT =
  'prodivix.controlled-static-toolchain-projection-authority.v1' as const;
export const CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT =
  'prodivix.controlled-static-toolchain-projection-receipt.v1' as const;

const MAXIMUM_PROTOCOL_BYTES = 256 * 1024 * 1024;
const MAXIMUM_FILES = 20_000;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export type ControlledStaticToolchainRequest = Readonly<{
  format: typeof CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT;
  requestDigest: string;
  snapshot: ExecutableProjectSnapshot;
}>;

export type EncodedControlledStaticToolchainRequest = Readonly<{
  source: string;
  requestDigest: string;
}>;

export type ControlledStaticToolchainCommandReceipt = Readonly<{
  stage: 'version' | 'install' | 'isolation' | 'typecheck' | 'test' | 'build';
  application: string;
  args: readonly string[];
  cwd: 'workspace:/' | 'controller:/';
  executionBoundary: 'sandbox' | 'trusted-controller';
  environmentDigest: string;
  tool: Readonly<{
    binary: string;
    version: string;
    subjectBinary?: string;
    subjectVersion?: string;
  }>;
  startedAtEpochMs: number;
  completedAtEpochMs: number;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: Readonly<{
    digest: string;
    byteLength: number;
    capturedByteLength: number;
    truncated: boolean;
  }>;
  stderr: Readonly<{
    digest: string;
    byteLength: number;
    capturedByteLength: number;
    truncated: boolean;
  }>;
}>;

export type ControlledStaticToolchainAuthorityReceipt = Readonly<{
  format: typeof CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT;
  provider: 'windows-appcontainer' | 'linux-rootless-podman';
  requestDigest: string;
  snapshotDigest: string;
  environment: Readonly<{
    install: Readonly<{
      keys: readonly string[];
      digest: string;
    }>;
    execution: Readonly<{
      keys: readonly string[];
      digest: string;
    }>;
  }>;
  commands: readonly ControlledStaticToolchainCommandReceipt[];
  isolation: Readonly<{
    provider: 'windows-appcontainer' | 'linux-rootless-podman';
    networkMode: 'none';
    liveEgressAttemptCount: number;
    liveEgressSuccessCount: 0;
    hostMountCount: 0;
    rootFilesystem: 'read-only' | 'appcontainer-lowbox';
    authority: unknown;
  }>;
  processTree: unknown;
  toolchain: Readonly<{
    pnpmVersion: string;
    nodeVersion: string;
    nodeBinaryDigest: string;
    typescriptVersion: string;
    vitestVersion: string;
    viteVersion: string;
    rollupVersion: string;
    rollupImplementation: '@rollup/wasm-node';
    rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
    esbuildVersion: string;
    esbuildImplementation: 'esbuild-wasm';
    esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
    manifestDigest: string;
    lockDigest: string;
    toolchainFileSetDigest: string;
  }>;
  artifacts: Readonly<{
    testReportDigest: string;
    coverageSummaryDigest: string;
    buildLogDigest: string;
    buildFileSetDigest: string;
    buildFileCount: number;
  }>;
  sandboxResultDigest: string;
  receiptDigest: string;
}>;

export type ControlledStaticToolchainResult = Readonly<{
  format: typeof CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT;
  buildBundle: ExecutionBuildBundle;
  buildSummary: Uint8Array;
  coverageSummary: Uint8Array;
  testReport: ExecutionTestReport;
  authorityReceipt: ControlledStaticToolchainAuthorityReceipt;
  projectionAuthority: ControlledStaticToolchainProjectionAuthority;
}>;

export type ControlledStaticToolchainRawEnvelope = Readonly<{
  encoding: 'base64';
  byteLength: number;
  digest: string;
  contents: string;
}>;

export type ControlledStaticToolchainProjectionAuthority = Readonly<{
  format: typeof CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT;
  raw: Readonly<{
    buildBundle: ControlledStaticToolchainRawEnvelope;
    testReport: ControlledStaticToolchainRawEnvelope;
    coverageSummary: ControlledStaticToolchainRawEnvelope;
    buildLog: ControlledStaticToolchainRawEnvelope;
  }>;
  receipt: Readonly<{
    format: typeof CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT;
    snapshotDigest: string;
    target: ExecutableProjectSnapshot['target'];
    toolchainAuthorityReceiptDigest: string;
    rawBuildBundleDigest: string;
    rawTestReportDigest: string;
    rawCoverageSummaryDigest: string;
    rawBuildLogDigest: string;
    projectedBuildBundleDigest: string;
    projectedBuildSummaryDigest: string;
    projectedCoverageSummaryDigest: string;
    projectedTestReportDigest: string;
    buildFileSetDigest: string;
    buildFileCount: number;
    receiptDigest: string;
  }>;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  label: string,
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!required.includes(key) && !optional.includes(key))
    )
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

const relativePath = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':')
      )
  ) {
    throw new TypeError(`${label} must be a canonical relative path.`);
  }
  return value;
};

const decodeBase64 = (value: unknown, label: string): Uint8Array =>
  decodeCanonicalBase64(value, {
    label,
    maximumBytes: MAXIMUM_PROTOCOL_BYTES,
  });

const decodeSnapshotFiles = (
  value: readonly unknown[]
): ExecutableProjectSnapshotInput['files'] =>
  Object.freeze(
    value.map(
      (entry, index): ExecutableProjectSnapshotInput['files'][number] => {
        const file = exactRecord(
          entry,
          ['path', 'encoding', 'contents'],
          `Controlled executable snapshot files[${index}]`,
          ['sourceTrace']
        );
        if (file.encoding !== 'utf8' && file.encoding !== 'base64') {
          throw new TypeError(
            `Controlled static toolchain files[${index}].encoding is unsupported.`
          );
        }
        if (typeof file.contents !== 'string') {
          throw new TypeError(
            `Controlled static toolchain files[${index}].contents is invalid.`
          );
        }
        return Object.freeze({
          path: relativePath(
            file.path,
            `Controlled executable snapshot files[${index}].path`
          ),
          contents:
            file.encoding === 'utf8'
              ? file.contents
              : decodeBase64(
                  file.contents,
                  `Controlled executable snapshot files[${index}].contents`
                ),
          ...(file.sourceTrace === undefined
            ? {}
            : {
                sourceTrace:
                  file.sourceTrace as readonly ExecutionSourceTrace[],
              }),
        });
      }
    )
  );

const decodeSnapshot = (value: unknown): ExecutableProjectSnapshot => {
  const snapshotRecord = exactRecord(
    value,
    [
      'format',
      'contentDigest',
      'workspace',
      'target',
      'files',
      'dependencyPlan',
      'entrypoints',
      'capabilityRequirements',
      'publicBuildConfiguration',
      'resourceHints',
      'cacheHints',
      'installCommand',
      'previewCommand',
      'buildCommand',
      'previewPlan',
      'buildPlan',
      'testPlan',
    ],
    'Controlled executable snapshot',
    ['dataMockProvision', 'serverRuntimeMockProvision', 'serverFunctionPlan']
  );
  if (
    snapshotRecord.format !== 'prodivix.executable-project.v6' ||
    typeof snapshotRecord.contentDigest !== 'string' ||
    !DIGEST_PATTERN.test(snapshotRecord.contentDigest) ||
    !Array.isArray(snapshotRecord.files) ||
    snapshotRecord.files.length === 0 ||
    snapshotRecord.files.length > MAXIMUM_FILES
  ) {
    throw new TypeError('Controlled executable snapshot identity is invalid.');
  }
  const files = decodeSnapshotFiles(snapshotRecord.files);
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    throw new TypeError(
      'Controlled executable snapshot file paths are duplicated.'
    );
  }
  const dependencyPlan = exactRecord(
    snapshotRecord.dependencyPlan,
    ['manifestFilePath', 'installFingerprint'],
    'Controlled executable snapshot dependencyPlan',
    ['lockFilePath']
  );
  if (
    typeof dependencyPlan.manifestFilePath !== 'string' ||
    typeof dependencyPlan.installFingerprint !== 'string' ||
    !DIGEST_PATTERN.test(dependencyPlan.installFingerprint) ||
    (dependencyPlan.lockFilePath !== undefined &&
      typeof dependencyPlan.lockFilePath !== 'string')
  ) {
    throw new TypeError(
      'Controlled executable snapshot dependency plan is invalid.'
    );
  }
  const snapshotInput = Object.fromEntries(
    Object.entries(snapshotRecord).filter(
      ([key]) =>
        key !== 'format' &&
        key !== 'contentDigest' &&
        key !== 'files' &&
        key !== 'dependencyPlan'
    )
  ) as unknown as ExecutableProjectSnapshotInput;
  const snapshot = createExecutableProjectSnapshot({
    ...snapshotInput,
    files,
    dependencyPlan: {
      manifestFilePath: dependencyPlan.manifestFilePath,
      ...(dependencyPlan.lockFilePath === undefined
        ? {}
        : { lockFilePath: dependencyPlan.lockFilePath }),
    },
  });
  if (snapshot.contentDigest !== snapshotRecord.contentDigest) {
    throw new TypeError(
      'Controlled executable snapshot content digest does not match its exact file set and contract.'
    );
  }
  return snapshot;
};

const encodeSnapshotFile = (file: ExecutableProjectSnapshot['files'][number]) =>
  Object.freeze({
    path: file.path,
    encoding:
      typeof file.contents === 'string'
        ? ('utf8' as const)
        : ('base64' as const),
    contents:
      typeof file.contents === 'string'
        ? file.contents
        : Buffer.from(file.contents).toString('base64'),
    ...(file.sourceTrace ? { sourceTrace: file.sourceTrace } : {}),
  });

/** Encodes the exact current snapshot consumed by the fixed sandbox process. */
export const encodeControlledStaticToolchainRequest = (
  snapshot: ExecutableProjectSnapshot
): EncodedControlledStaticToolchainRequest => {
  const source = canonicalJsonText({
    format: CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT,
    snapshot: {
      ...snapshot,
      files: snapshot.files.map(encodeSnapshotFile),
    },
  });
  const decoded = decodeControlledStaticToolchainRequest(source);
  if (decoded.snapshot.contentDigest !== snapshot.contentDigest) {
    throw new TypeError(
      'Controlled static toolchain request encoder drifted from its snapshot.'
    );
  }
  return Object.freeze({ source, requestDigest: decoded.requestDigest });
};

export const decodeControlledStaticToolchainRequest = (
  source: string | Uint8Array
): ControlledStaticToolchainRequest => {
  const bytes =
    typeof source === 'string' ? Buffer.from(source, 'utf8') : source;
  if (bytes.byteLength === 0 || bytes.byteLength > MAXIMUM_PROTOCOL_BYTES) {
    throw new TypeError(
      'Controlled static toolchain request exceeds its budget.'
    );
  }
  let value: unknown;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new TypeError(
      'Controlled static toolchain request must be strict JSON.'
    );
  }
  if (canonicalJsonText(value) !== text) {
    throw new TypeError(
      'Controlled static toolchain request must use canonical JSON.'
    );
  }
  const record = exactRecord(
    value,
    ['format', 'snapshot'],
    'Controlled static toolchain request'
  );
  if (record.format !== CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT) {
    throw new TypeError(
      'Controlled static toolchain request format is unsupported.'
    );
  }
  return Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT,
    requestDigest: `sha256-${createHash('sha256').update(bytes).digest('hex')}`,
    snapshot: decodeSnapshot(record.snapshot),
  });
};
