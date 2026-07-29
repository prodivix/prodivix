import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  EXECUTABLE_PROJECT_LIMITS,
  cloneExecutableProjectSourceTrace,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const VERIFICATION_ARTIFACT_PROJECTION_LIMITS = Object.freeze({
  maximumInputBytes: 4 * 1024 * 1024,
  maximumSources: 20_000,
  maximumPathBytes: 1_024,
  maximumBuildLogLines: 512,
  maximumBuildOutputs: 4_096,
  maximumCount: 1_000_000_000,
});

export type VerificationArtifactProjectionSource = Readonly<{
  path: string;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

export type VerificationArtifactProjectionSourceIdentity = Readonly<{
  fileId: string;
  path: string;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

export type VerificationArtifactProjectionSourceResolver = Readonly<{
  resolve(reportedPath: string): VerificationArtifactProjectionSourceIdentity;
}>;

export type VerificationArtifactProjectionSourceDigestBinding = Readonly<{
  reportedPathDigest: string;
  path: string;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/iu;
const WINDOWS_ABSOLUTE_PATH_PATTERN =
  /(?:^|[\s"'(=])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])/u;
const POSIX_ABSOLUTE_PATH_PATTERN =
  /(?:^|[\s"'(=])\/(?!\/)(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]*/u;

export const readVerificationProjectionCanonicalText = (
  value: unknown,
  label: string,
  maximumBytes: number = VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumPathBytes
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    // eslint-disable-next-line no-control-regex -- controls are forbidden at the projection boundary
    /[\u0000-\u001f\u007f]/u.test(value) ||
    utf8Encoder.encode(value).byteLength > maximumBytes
  ) {
    throw new TypeError(`${label} must be bounded canonical text.`);
  }
  return value;
};

const pathSegments = (value: string): readonly string[] => value.split('/');

export const readVerificationProjectionRelativePath = (
  value: unknown,
  label: string
): string => {
  const path = readVerificationProjectionCanonicalText(value, label).replace(
    /\\/gu,
    '/'
  );
  const segments = pathSegments(path);
  if (
    path !== value ||
    path.startsWith('/') ||
    /^[A-Za-z]:\//u.test(path) ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.includes(':')
    )
  ) {
    throw new TypeError(`${label} must be a canonical relative path.`);
  }
  return path;
};

export const readVerificationArtifactProviderRoot = (
  value: unknown
): string => {
  const source = readVerificationProjectionCanonicalText(
    value,
    'Verification artifact provider root',
    4_096
  );
  let root = source.replace(/\\/gu, '/');
  while (
    root.length > 1 &&
    root.endsWith('/') &&
    !/^[A-Za-z]:\/$/u.test(root)
  ) {
    root = root.slice(0, -1);
  }
  const absolute =
    root === '/' ||
    /^[A-Za-z]:\/(?:[^/]+(?:\/[^/]+)*)?$/u.test(root) ||
    /^\/\/[^/]+\/[^/]+(?:\/[^/]+)*$/u.test(root) ||
    /^\/[^/]+(?:\/[^/]+)*$/u.test(root);
  if (
    !absolute ||
    pathSegments(root)
      .filter(Boolean)
      .some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      'Verification artifact provider root must be an absolute canonical path.'
    );
  }
  return root;
};

const normalizeReportedPath = (value: unknown): string => {
  const source = readVerificationProjectionCanonicalText(
    value,
    'Verification artifact reported path',
    4_096
  );
  const path = source.replace(/\\/gu, '/');
  const absolute =
    /^\/[^/]+(?:\/[^/]+)*$/u.test(path) ||
    /^[A-Za-z]:\/[^/]+(?:\/[^/]+)*$/u.test(path) ||
    /^\/\/[^/]+\/[^/]+(?:\/[^/]+)+$/u.test(path);
  if (
    URL_PATTERN.test(path) ||
    !absolute ||
    pathSegments(path)
      .filter(Boolean)
      .some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      'Verification artifact reported path must be an absolute provider path.'
    );
  }
  return path;
};

export const digestVerificationPrivateProviderPath = (value: string): string =>
  `sha256-${bytesToHex(
    sha256(utf8Encoder.encode(normalizeReportedPath(value)))
  )}`;

const normalizeSourceTrace = (
  value: unknown,
  label: string
): readonly ExecutionSourceTrace[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must declare SourceTrace.`);
  }
  return Object.freeze(
    value.map((trace, index) =>
      cloneExecutableProjectSourceTrace(trace, `${label}[${index}]`)
    )
  );
};

export const readVerificationProjectionExactRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key))
    )
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

export const readVerificationProjectionSafeInteger = (
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new TypeError(`${label} must be a bounded safe integer.`);
  }
  return value as number;
};

const targetRefFields = Object.freeze({
  workspace: [['workspaceId'], []],
  'workspace-node': [['workspaceId', 'nodeId'], []],
  document: [['documentId'], ['workspaceId']],
  'pir-node': [['documentId', 'nodeId'], []],
  'inspector-field': [['documentId', 'nodeId', 'fieldPath'], []],
  route: [['routeId'], []],
  'nodegraph-node': [['documentId', 'nodeId'], []],
  'nodegraph-port': [['documentId', 'nodeId', 'portId'], []],
  'animation-timeline': [['documentId', 'timelineId'], []],
  'animation-track': [['documentId', 'timelineId', 'bindingId', 'trackId'], []],
  'data-source': [['documentId'], []],
  'data-operation': [['documentId', 'operationId'], []],
  'code-artifact': [['artifactId'], []],
  'behavior-scenario': [['documentId'], []],
  'behavior-step': [['documentId', 'stepId'], ['assertionId']],
  'behavior-replay-record': [['planDigest', 'cellId', 'attemptId'], []],
  'verification-policy': [['documentId'], []],
  'verification-plan-cell': [['planDigest', 'cellId'], []],
  'verification-evidence': [['planDigest', 'cellId', 'attemptId'], []],
  'verification-closure': [['planDigest'], []],
  operation: [['operation'], []],
  'theme-token': [['themeId', 'tokenPath'], []],
  'runtime-dom': [['stablePath'], ['routeId']],
  'component-slot': [['documentId', 'nodeId', 'slotName'], []],
} as const);

const readSourceRef = (value: unknown, label: string): unknown => {
  const base = readVerificationProjectionExactRecord(
    value,
    ['kind'],
    [
      'workspaceId',
      'nodeId',
      'documentId',
      'fieldPath',
      'routeId',
      'portId',
      'timelineId',
      'bindingId',
      'trackId',
      'operationId',
      'artifactId',
      'stepId',
      'assertionId',
      'planDigest',
      'cellId',
      'attemptId',
      'operation',
      'themeId',
      'tokenPath',
      'stablePath',
      'slotName',
      'width',
      'height',
    ],
    label
  );
  const kind = readVerificationProjectionCanonicalText(
    base.kind,
    `${label}.kind`,
    128
  );
  if (kind === 'viewport') {
    const record = readVerificationProjectionExactRecord(
      value,
      ['kind', 'width', 'height'],
      ['routeId'],
      label
    );
    if (
      typeof record.width !== 'number' ||
      !Number.isFinite(record.width) ||
      record.width < 0 ||
      typeof record.height !== 'number' ||
      !Number.isFinite(record.height) ||
      record.height < 0
    ) {
      throw new TypeError(`${label} viewport dimensions are invalid.`);
    }
    if (record.routeId !== undefined) {
      readVerificationProjectionCanonicalText(
        record.routeId,
        `${label}.routeId`
      );
    }
    return value;
  }
  const fields = targetRefFields[kind as keyof typeof targetRefFields];
  if (!fields) {
    throw new TypeError(`${label}.kind is unsupported.`);
  }
  const [required, optional] = fields;
  const record = readVerificationProjectionExactRecord(
    value,
    ['kind', ...required],
    optional,
    label
  );
  for (const field of [...required, ...optional]) {
    if (record[field] !== undefined) {
      readVerificationProjectionCanonicalText(
        record[field],
        `${label}.${field}`
      );
    }
  }
  return value;
};

const readSourceSpan = (value: unknown, label: string): unknown => {
  const record = readVerificationProjectionExactRecord(
    value,
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    [],
    label
  );
  readVerificationProjectionCanonicalText(
    record.artifactId,
    `${label}.artifactId`
  );
  const startLine = readVerificationProjectionSafeInteger(
    record.startLine,
    `${label}.startLine`,
    1,
    1_000_000_000
  );
  const startColumn = readVerificationProjectionSafeInteger(
    record.startColumn,
    `${label}.startColumn`,
    1,
    1_000_000_000
  );
  const endLine = readVerificationProjectionSafeInteger(
    record.endLine,
    `${label}.endLine`,
    1,
    1_000_000_000
  );
  const endColumn = readVerificationProjectionSafeInteger(
    record.endColumn,
    `${label}.endColumn`,
    1,
    1_000_000_000
  );
  if (
    endLine < startLine ||
    (endLine === startLine && endColumn < startColumn)
  ) {
    throw new TypeError(`${label} has an inverted range.`);
  }
  return value;
};

export const readVerificationProjectionSourceTraces = (
  value: unknown,
  label: string
): readonly ExecutionSourceTrace[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > EXECUTABLE_PROJECT_LIMITS.maxSourceTracesPerFile
  ) {
    throw new TypeError(`${label} must be a non-empty bounded SourceTrace.`);
  }
  value.forEach((entry, index) => {
    const record = readVerificationProjectionExactRecord(
      entry,
      ['sourceRef'],
      ['sourceSpan', 'label'],
      `${label}[${index}]`
    );
    readSourceRef(record.sourceRef, `${label}[${index}].sourceRef`);
    if (record.sourceSpan !== undefined) {
      readSourceSpan(record.sourceSpan, `${label}[${index}].sourceSpan`);
    }
    if (record.label !== undefined) {
      readVerificationProjectionCanonicalText(
        record.label,
        `${label}[${index}].label`
      );
    }
  });
  return normalizeSourceTrace(value as readonly ExecutionSourceTrace[], label);
};

/**
 * Creates an exact provider-root resolver. It intentionally does not accept
 * suffix matches: every reporter identity must map to one declared snapshot
 * source under the root that produced the artifact.
 */
export const createVerificationArtifactProjectionSourceResolver = (
  providerRoot: string,
  sources: readonly VerificationArtifactProjectionSource[]
): VerificationArtifactProjectionSourceResolver => {
  const root = readVerificationArtifactProviderRoot(providerRoot);
  if (
    !Array.isArray(sources) ||
    sources.length === 0 ||
    sources.length > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumSources
  ) {
    throw new TypeError(
      'Verification artifact projection sources must be a non-empty bounded array.'
    );
  }
  const byPath = new Map<
    string,
    VerificationArtifactProjectionSourceIdentity
  >();
  for (const [index, source] of sources.entries()) {
    if (!isPlainObject(source)) {
      throw new TypeError(
        `Verification artifact projection source[${index}] must be a plain object.`
      );
    }
    const keys = Object.keys(source);
    if (
      keys.length !== 2 ||
      !keys.includes('path') ||
      !keys.includes('sourceTrace')
    ) {
      throw new TypeError(
        `Verification artifact projection source[${index}] has unknown or missing fields.`
      );
    }
    const path = readVerificationProjectionRelativePath(
      source.path,
      `Verification artifact projection source[${index}].path`
    );
    if (byPath.has(path)) {
      throw new TypeError(
        `Verification artifact projection source path is duplicated: ${path}.`
      );
    }
    byPath.set(
      path,
      Object.freeze({
        fileId: path,
        path,
        sourceTrace: readVerificationProjectionSourceTraces(
          (source as VerificationArtifactProjectionSource).sourceTrace,
          `Verification artifact projection source[${index}].sourceTrace`
        ),
      })
    );
  }
  const rootPrefix = root.endsWith('/') ? root : `${root}/`;
  return Object.freeze({
    resolve: (
      reportedPath: string
    ): VerificationArtifactProjectionSourceIdentity => {
      const normalized = normalizeReportedPath(reportedPath);
      if (!normalized.startsWith(rootPrefix)) {
        throw new TypeError(
          'Verification artifact reported path is outside its exact provider root.'
        );
      }
      const relativePath = normalized.slice(rootPrefix.length);
      const identity = byPath.get(relativePath);
      if (!identity) {
        throw new TypeError(
          `Verification artifact reported path is not a declared snapshot source: ${relativePath}.`
        );
      }
      return identity;
    },
  });
};

export const createVerificationArtifactProjectionDigestResolver = (
  bindings: readonly VerificationArtifactProjectionSourceDigestBinding[]
): VerificationArtifactProjectionSourceResolver => {
  if (
    !Array.isArray(bindings) ||
    bindings.length === 0 ||
    bindings.length > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumSources
  ) {
    throw new TypeError(
      'Verification artifact path digest bindings must be a non-empty bounded array.'
    );
  }
  const byDigest = new Map<
    string,
    VerificationArtifactProjectionSourceIdentity
  >();
  const paths = new Set<string>();
  for (const [index, binding] of bindings.entries()) {
    const digest = binding.reportedPathDigest;
    if (
      typeof digest !== 'string' ||
      !/^sha256-[a-f0-9]{64}$/u.test(digest) ||
      byDigest.has(digest)
    ) {
      throw new TypeError(
        'Verification artifact path digest bindings must have unique canonical digests.'
      );
    }
    const path = readVerificationProjectionRelativePath(
      binding.path,
      `Verification artifact path digest binding[${index}].path`
    );
    if (paths.has(path)) {
      throw new TypeError(
        'Verification artifact path digest bindings must have unique relative paths.'
      );
    }
    paths.add(path);
    byDigest.set(
      digest,
      Object.freeze({
        fileId: path,
        path,
        sourceTrace: readVerificationProjectionSourceTraces(
          binding.sourceTrace,
          `Verification artifact path digest binding[${index}].sourceTrace`
        ),
      })
    );
  }
  return Object.freeze({
    resolve: (
      reportedPath: string
    ): VerificationArtifactProjectionSourceIdentity => {
      const identity = byDigest.get(
        digestVerificationPrivateProviderPath(reportedPath)
      );
      if (!identity) {
        throw new TypeError(
          'Verification artifact reported path has no exact private identity binding.'
        );
      }
      return identity;
    },
  });
};

const assertPublicProjectionValue = (
  value: unknown,
  label: string,
  seen: Set<object>
): void => {
  if (typeof value === 'string') {
    if (
      URL_PATTERN.test(value) ||
      WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
      POSIX_ABSOLUTE_PATH_PATTERN.test(value)
    ) {
      throw new TypeError(`${label} contains an absolute path or URL.`);
    }
    return;
  }
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} must contain finite JSON numbers.`);
    }
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) {
    throw new TypeError(`${label} must be an acyclic JSON value.`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertPublicProjectionValue(entry, `${label}[${index}]`, seen)
    );
  } else if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertPublicProjectionValue(entry, `${label}.${key}`, seen);
    }
  } else {
    throw new TypeError(`${label} must contain only plain JSON values.`);
  }
  seen.delete(value);
};

export const encodePublicVerificationArtifactProjection = (
  value: unknown,
  label: string
): Uint8Array => {
  assertPublicProjectionValue(value, label, new Set<object>());
  return utf8Encoder.encode(canonicalJsonText(value));
};

export const decodeVerificationArtifactProjectionSource = (
  source: string | Uint8Array,
  label: string
): string => {
  const bytes =
    typeof source === 'string' ? utf8Encoder.encode(source) : source;
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumInputBytes
  ) {
    throw new TypeError(`${label} is missing or exceeds its byte budget.`);
  }
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new TypeError(`${label} must be strict UTF-8.`);
  }
};

export const decodePublicVerificationArtifactProjection = (
  bytes: Uint8Array,
  label: string
): Record<string, unknown> => {
  const text = decodeVerificationArtifactProjectionSource(bytes, label);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError(`${label} must be valid JSON.`);
  }
  if (canonicalJsonText(value) !== text || !isPlainObject(value)) {
    throw new TypeError(
      `${label} must be a canonical JSON object without duplicate or reordered fields.`
    );
  }
  assertPublicProjectionValue(value, label, new Set<object>());
  return value;
};

export const containsPrivateAbsolutePathOrUrl = (value: string): boolean =>
  URL_PATTERN.test(value) ||
  WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
  POSIX_ABSOLUTE_PATH_PATTERN.test(value);
