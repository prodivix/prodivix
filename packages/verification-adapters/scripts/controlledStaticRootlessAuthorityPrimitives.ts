import { createHash } from 'node:crypto';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const STAGE_ORDER = Object.freeze([
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
] as const);
export type Stage = (typeof STAGE_ORDER)[number];

export const RESULT_ALLOWLIST: Readonly<Record<Stage, readonly string[]>> =
  Object.freeze({
    version: Object.freeze([]),
    install: Object.freeze(['package-import']),
    isolation: Object.freeze(['isolation-observation']),
    typecheck: Object.freeze([]),
    build: Object.freeze(['build-file-set', 'build-log']),
    test: Object.freeze(['coverage-summary', 'test-report']),
  });
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
export const OCI_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
export const SEMVER_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
export const EMPTY_DIGEST =
  'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export type DecodedControlledStaticRootlessAuthorities = Readonly<{
  providerProcess: Readonly<Record<string, unknown>>;
  processTree: Readonly<Record<string, unknown>>;
  aggregateProviderFileSetDigest: string;
}>;

export const digestBytes = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

export const exactRecord = (
  value: unknown,
  required: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => isUnsafeObjectKey(key) || !required.includes(key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

export const readDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be canonical SHA-256.`);
  }
  return value;
};

export const readNonNegativeInteger = (
  value: unknown,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value as number;
};

const withoutAuthorityDigest = (
  value: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== 'authorityDigest')
    )
  );

export const assertAuthorityDigest = (
  value: Readonly<Record<string, unknown>>,
  label: string
): void => {
  if (
    readDigest(value.authorityDigest, `${label} digest`) !==
    digestBytes(canonicalJsonText(withoutAuthorityDigest(value)))
  ) {
    throw new TypeError(`${label} digest drifted.`);
  }
};

const decodeOutput = (
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> => {
  const output = exactRecord(
    value,
    ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
    label
  );
  const byteLength = readNonNegativeInteger(
    output.byteLength,
    `${label} byteLength`
  );
  if (
    readNonNegativeInteger(
      output.capturedByteLength,
      `${label} capturedByteLength`
    ) !== byteLength ||
    output.truncated !== false
  ) {
    throw new TypeError(`${label} was not captured exactly.`);
  }
  return Object.freeze({
    digest: readDigest(output.digest, `${label} digest`),
    byteLength,
    capturedByteLength: byteLength,
    truncated: false,
  });
};

export const decodeControllerProcess = (
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> => {
  const receipt = exactRecord(
    value,
    [
      'application',
      'args',
      'cwd',
      'environmentDigest',
      'startedAtEpochMs',
      'completedAtEpochMs',
      'exitCode',
      'signal',
      'timedOut',
      'stdout',
      'stderr',
    ],
    label
  );
  const startedAtEpochMs = readNonNegativeInteger(
    receipt.startedAtEpochMs,
    `${label} start`
  );
  const completedAtEpochMs = readNonNegativeInteger(
    receipt.completedAtEpochMs,
    `${label} completion`
  );
  if (
    receipt.application !== 'podman' ||
    !Array.isArray(receipt.args) ||
    receipt.args.some((argument) => typeof argument !== 'string') ||
    receipt.cwd !== 'repository:/' ||
    !Number.isSafeInteger(receipt.exitCode) ||
    receipt.signal !== null ||
    receipt.timedOut !== false ||
    completedAtEpochMs < startedAtEpochMs
  ) {
    throw new TypeError(`${label} identity drifted.`);
  }
  return Object.freeze({
    application: 'podman',
    args: Object.freeze([...(receipt.args as string[])]),
    cwd: 'repository:/',
    environmentDigest: readDigest(
      receipt.environmentDigest,
      `${label} environment`
    ),
    startedAtEpochMs,
    completedAtEpochMs,
    exitCode: receipt.exitCode as number,
    signal: null,
    timedOut: false,
    stdout: decodeOutput(receipt.stdout, `${label} stdout`),
    stderr: decodeOutput(receipt.stderr, `${label} stderr`),
  });
};

export const processArgs = (
  receipt: Readonly<Record<string, unknown>>
): readonly string[] => receipt.args as readonly string[];

export const processExitCode = (
  receipt: Readonly<Record<string, unknown>>
): number => receipt.exitCode as number;

export const processStartedAt = (
  receipt: Readonly<Record<string, unknown>>
): number => receipt.startedAtEpochMs as number;

export const processCompletedAt = (
  receipt: Readonly<Record<string, unknown>>
): number => receipt.completedAtEpochMs as number;

export const decodePackageImportAuthority = (
  value: unknown,
  expected: Readonly<{
    requestDigest: string;
    snapshotDigest: string;
    manifestDigest: string;
    lockDigest: string;
    toolchainFileSetDigest: string;
    rollupVersion: string;
    rollupImplementation: string;
    rollupAliasSpec: string;
    esbuildVersion: string;
    esbuildImplementation: string;
    esbuildAliasSpec: string;
  }>
): Readonly<Record<string, unknown>> => {
  const authority = exactRecord(
    value,
    [
      'format',
      'producerStage',
      'requestDigest',
      'snapshotDigest',
      'projectManifestDigest',
      'lockDigest',
      'toolchainFileSetDigest',
      'rollupVersion',
      'rollupImplementation',
      'rollupAliasSpec',
      'esbuildVersion',
      'esbuildImplementation',
      'esbuildAliasSpec',
      'archivePath',
      'archiveDigest',
      'archiveByteLength',
      'contentDigest',
      'manifestDigest',
      'fileSetDigest',
      'entryCount',
      'totalFileBytes',
      'maximumDepth',
      'installStageAuthorityDigest',
      'authorityDigest',
    ],
    'Controlled rootless package import authority'
  );
  const archiveByteLength = readNonNegativeInteger(
    authority.archiveByteLength,
    'Controlled rootless package archive bytes'
  );
  const entryCount = readNonNegativeInteger(
    authority.entryCount,
    'Controlled rootless package entry count'
  );
  const totalFileBytes = readNonNegativeInteger(
    authority.totalFileBytes,
    'Controlled rootless package file bytes'
  );
  const maximumDepth = readNonNegativeInteger(
    authority.maximumDepth,
    'Controlled rootless package maximum depth'
  );
  if (
    authority.format !==
      'prodivix.controlled-static-rootless-package-import-authority.v1' ||
    authority.producerStage !== 'install' ||
    authority.requestDigest !== expected.requestDigest ||
    authority.snapshotDigest !== expected.snapshotDigest ||
    authority.projectManifestDigest !== expected.manifestDigest ||
    authority.lockDigest !== expected.lockDigest ||
    authority.toolchainFileSetDigest !== expected.toolchainFileSetDigest ||
    authority.rollupVersion !== expected.rollupVersion ||
    authority.rollupImplementation !== expected.rollupImplementation ||
    authority.rollupAliasSpec !== expected.rollupAliasSpec ||
    authority.esbuildVersion !== expected.esbuildVersion ||
    authority.esbuildImplementation !== expected.esbuildImplementation ||
    authority.esbuildAliasSpec !== expected.esbuildAliasSpec ||
    authority.archivePath !== '.prodivix/package-import.json.gz' ||
    archiveByteLength < 1 ||
    entryCount < 1 ||
    totalFileBytes < 1 ||
    maximumDepth < 1
  ) {
    throw new TypeError(
      'Controlled rootless package import authority drifted.'
    );
  }
  const normalized = Object.freeze({
    format: 'prodivix.controlled-static-rootless-package-import-authority.v1',
    producerStage: 'install',
    requestDigest: expected.requestDigest,
    snapshotDigest: expected.snapshotDigest,
    projectManifestDigest: expected.manifestDigest,
    lockDigest: expected.lockDigest,
    toolchainFileSetDigest: expected.toolchainFileSetDigest,
    rollupVersion: expected.rollupVersion,
    rollupImplementation: expected.rollupImplementation,
    rollupAliasSpec: expected.rollupAliasSpec,
    esbuildVersion: expected.esbuildVersion,
    esbuildImplementation: expected.esbuildImplementation,
    esbuildAliasSpec: expected.esbuildAliasSpec,
    archivePath: '.prodivix/package-import.json.gz',
    archiveDigest: readDigest(
      authority.archiveDigest,
      'Controlled rootless package archive digest'
    ),
    archiveByteLength,
    contentDigest: readDigest(
      authority.contentDigest,
      'Controlled rootless package content digest'
    ),
    manifestDigest: readDigest(
      authority.manifestDigest,
      'Controlled rootless package manifest digest'
    ),
    fileSetDigest: readDigest(
      authority.fileSetDigest,
      'Controlled rootless package file-set digest'
    ),
    entryCount,
    totalFileBytes,
    maximumDepth,
    installStageAuthorityDigest: readDigest(
      authority.installStageAuthorityDigest,
      'Controlled rootless package install stage digest'
    ),
    authorityDigest: readDigest(
      authority.authorityDigest,
      'Controlled rootless package authority digest'
    ),
  });
  assertAuthorityDigest(normalized, 'Controlled rootless package authority');
  if (!sameCanonicalJson(normalized, authority)) {
    throw new TypeError(
      'Controlled rootless package import authority fields drifted.'
    );
  }
  return normalized;
};
