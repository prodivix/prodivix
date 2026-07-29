import { type ExecutionSourceTrace } from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  VERIFICATION_ARTIFACT_PROJECTION_LIMITS,
  containsPrivateAbsolutePathOrUrl,
  decodePublicVerificationArtifactProjection,
  decodeVerificationArtifactProjectionSource,
  encodePublicVerificationArtifactProjection,
  readVerificationArtifactProviderRoot,
  readVerificationProjectionExactRecord,
  readVerificationProjectionRelativePath,
  readVerificationProjectionSafeInteger,
  readVerificationProjectionSourceTraces,
} from './verificationArtifactProjectionSource';

export const VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE =
  'application/vnd.prodivix.verification-build-summary+json' as const;

export const VERIFICATION_BUILD_SUMMARY_FORMAT =
  'prodivix.verification-build-summary.v1' as const;

export type VerificationBuildSummary = Readonly<{
  format: typeof VERIFICATION_BUILD_SUMMARY_FORMAT;
  subjectDigest: string;
  outcome: 'passed';
  transformedModuleCount: number;
  emittedFileCount: number;
  outputs: readonly string[];
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

export type ProjectVerificationBuildSummaryInput = Readonly<{
  source: string | Uint8Array;
  providerRoot: string;
  subjectDigest: string;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

export type ProjectedVerificationBuildSummary = Readonly<{
  mediaType: typeof VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE;
  value: VerificationBuildSummary;
  bytes: Uint8Array;
}>;

const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex -- ANSI is removed before parsing
  /\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~])/gu;
const COMMAND_PATTERN =
  /^(?:\$|>) (?:tsc -b && vite build|node node_modules\/vite\/bin\/vite\.js build --config=\.prodivix\/controlled-vite\.config\.mjs|node --preserve-symlinks --preserve-symlinks-main --import=\.\/\.prodivix\/windows-runtime\/esbuild-register\.mjs node_modules\/vite\/bin\/vite\.js build --config=\.prodivix\/controlled-vite\.config\.mjs --configLoader=native)$/u;
const VERSION_PATTERN =
  /^vite v[0-9]+\.[0-9]+\.[0-9]+ building client environment for production\.\.\.$/u;
const TRANSFORMED_PATTERN = /^✓ ([0-9]+) modules transformed\.$/u;
const OUTPUT_PATTERN =
  /^(dist\/[^\s]+)\s+[0-9]+(?:\.[0-9]+)? kB(?:\s+│\s+gzip:\s+[0-9]+(?:\.[0-9]+)? kB)?$/u;
const COMPLETED_PATTERN = /^✓ built in [0-9]+(?:\.[0-9]+)?(?:ms|s)$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const readDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

const cleanBuildLines = (
  source: string | Uint8Array,
  providerRoot: string
): readonly string[] => {
  const decoded = decodeVerificationArtifactProjectionSource(
    source,
    'Build log'
  );
  const clean = decoded.replace(ANSI_ESCAPE_PATTERN, '');
  // eslint-disable-next-line no-control-regex -- only newlines and tabs are allowed after ANSI removal
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) {
    throw new TypeError('Build log contains unsupported control characters.');
  }
  const lines = clean
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);
  const providerHeader = lines[0]?.match(
    /^> [A-Za-z0-9@/._+-]+@[^\s]+ build (.+)$/u
  );
  if (providerHeader) {
    if (
      readVerificationArtifactProviderRoot(providerHeader[1]) !==
      readVerificationArtifactProviderRoot(providerRoot)
    ) {
      throw new TypeError(
        'Build log package header does not match its exact provider root.'
      );
    }
    lines.shift();
  }
  if (containsPrivateAbsolutePathOrUrl(lines.join('\n'))) {
    throw new TypeError('Build log contains an absolute path or URL.');
  }
  if (
    lines.length === 0 ||
    lines.length > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumBuildLogLines
  ) {
    throw new TypeError('Build log has an invalid line count.');
  }
  return Object.freeze(lines);
};

export const decodeVerificationBuildSummary = (
  bytes: Uint8Array
): VerificationBuildSummary => {
  const record = readVerificationProjectionExactRecord(
    decodePublicVerificationArtifactProjection(
      bytes,
      'Canonical build summary'
    ),
    [
      'format',
      'subjectDigest',
      'outcome',
      'transformedModuleCount',
      'emittedFileCount',
      'outputs',
      'sourceTrace',
    ],
    [],
    'Canonical build summary'
  );
  if (
    record.format !== VERIFICATION_BUILD_SUMMARY_FORMAT ||
    record.outcome !== 'passed'
  ) {
    throw new TypeError(
      'Canonical build summary format or outcome is unsupported.'
    );
  }
  const transformedModuleCount = readVerificationProjectionSafeInteger(
    record.transformedModuleCount,
    'Canonical build summary transformedModuleCount',
    1,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  if (
    !Array.isArray(record.outputs) ||
    record.outputs.length === 0 ||
    record.outputs.length >
      VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumBuildOutputs
  ) {
    throw new TypeError(
      'Canonical build summary outputs must be a non-empty bounded array.'
    );
  }
  let previous: string | undefined;
  const outputs = record.outputs.map((entry, index) => {
    const path = readVerificationProjectionRelativePath(
      entry,
      `Canonical build summary outputs[${index}]`
    );
    if (
      !path.startsWith('dist/') ||
      (previous !== undefined && compareUnicodeCodePoints(previous, path) >= 0)
    ) {
      throw new TypeError(
        'Canonical build summary outputs must be uniquely sorted dist paths.'
      );
    }
    previous = path;
    return path;
  });
  const emittedFileCount = readVerificationProjectionSafeInteger(
    record.emittedFileCount,
    'Canonical build summary emittedFileCount',
    1,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumBuildOutputs
  );
  if (emittedFileCount !== outputs.length) {
    throw new TypeError(
      'Canonical build summary emittedFileCount does not match outputs.'
    );
  }
  return Object.freeze({
    format: VERIFICATION_BUILD_SUMMARY_FORMAT,
    subjectDigest: readDigest(
      record.subjectDigest,
      'Canonical build summary subjectDigest'
    ),
    outcome: 'passed',
    transformedModuleCount,
    emittedFileCount,
    outputs: Object.freeze(outputs),
    sourceTrace: readVerificationProjectionSourceTraces(
      record.sourceTrace,
      'Canonical build summary sourceTrace'
    ),
  });
};

/**
 * Projects the tightly controlled production build transcript into stable
 * counts and relative output identities. Timings, sizes, ANSI, and provider
 * paths are deliberately discarded.
 */
export const projectVerificationBuildSummary = (
  input: ProjectVerificationBuildSummaryInput
): ProjectedVerificationBuildSummary => {
  const lines = cleanBuildLines(input.source, input.providerRoot);
  let cursor = 0;
  const take = (pattern: RegExp, label: string): RegExpMatchArray => {
    const line = lines[cursor];
    const match = line?.match(pattern);
    if (!match) {
      throw new TypeError(`Build log does not contain exact ${label}.`);
    }
    cursor += 1;
    return match;
  };
  take(COMMAND_PATTERN, 'build command');
  take(VERSION_PATTERN, 'production tool header');
  take(/^transforming\.\.\.$/u, 'transform phase');
  const transformed = Number(
    take(TRANSFORMED_PATTERN, 'transformed module count')[1]
  );
  const transformedModuleCount = readVerificationProjectionSafeInteger(
    transformed,
    'Build log transformed module count',
    1,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  take(/^rendering chunks\.\.\.$/u, 'render phase');
  take(/^computing gzip size\.\.\.$/u, 'size phase');

  const outputs: string[] = [];
  while (cursor < lines.length && !COMPLETED_PATTERN.test(lines[cursor]!)) {
    const match = lines[cursor]!.match(OUTPUT_PATTERN);
    if (!match) {
      throw new TypeError('Build log contains an unknown provider line.');
    }
    outputs.push(
      readVerificationProjectionRelativePath(
        match[1],
        `Build log output[${outputs.length}]`
      )
    );
    cursor += 1;
  }
  if (
    outputs.length === 0 ||
    outputs.length > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumBuildOutputs
  ) {
    throw new TypeError('Build log has an invalid output count.');
  }
  take(COMPLETED_PATTERN, 'successful completion');
  if (cursor !== lines.length) {
    throw new TypeError('Build log contains trailing private provider data.');
  }
  outputs.sort(compareUnicodeCodePoints);
  if (new Set(outputs).size !== outputs.length) {
    throw new TypeError('Build log contains duplicate output identities.');
  }
  const value: VerificationBuildSummary = Object.freeze({
    format: VERIFICATION_BUILD_SUMMARY_FORMAT,
    subjectDigest: readDigest(
      input.subjectDigest,
      'Build summary subjectDigest'
    ),
    outcome: 'passed',
    transformedModuleCount,
    emittedFileCount: outputs.length,
    outputs: Object.freeze(outputs),
    sourceTrace: readVerificationProjectionSourceTraces(
      input.sourceTrace,
      'Build summary sourceTrace'
    ),
  });
  const bytes = encodePublicVerificationArtifactProjection(
    value,
    'Canonical build summary'
  );
  decodeVerificationBuildSummary(bytes);
  return Object.freeze({
    mediaType: VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
    value,
    bytes,
  });
};
