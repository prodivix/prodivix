export const BUNDLED_PLUGIN_ARTIFACT_VERSION = '1.0' as const;
export const DEFAULT_BUNDLED_PLUGIN_MAX_RESOURCES = 512;
export const DEFAULT_BUNDLED_PLUGIN_MAX_RESOURCE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_BUNDLED_PLUGIN_MAX_PACKAGE_BYTES = 16 * 1024 * 1024;

export type BundledPluginResourceV1 = Readonly<{
  path: string;
  bytes: readonly number[];
}>;

export type BundledPluginArtifactV1 = Readonly<{
  schemaVersion: typeof BUNDLED_PLUGIN_ARTIFACT_VERSION;
  manifestPath: string;
  packageDigest: string;
  resources: readonly BundledPluginResourceV1[];
}>;

export type BundledPluginArtifactLimits = Readonly<{
  maxResources?: number;
  maxResourceBytes?: number;
  maxPackageBytes?: number;
}>;

export type BundledPluginArtifactIssueCode =
  | 'invalid-artifact'
  | 'invalid-manifest-path'
  | 'invalid-resource-path'
  | 'duplicate-resource-path'
  | 'missing-manifest'
  | 'invalid-resource-bytes'
  | 'resource-limit-exceeded'
  | 'package-limit-exceeded'
  | 'digest-mismatch'
  | 'operation-aborted';

export type BundledPluginArtifactIssue = Readonly<{
  code: BundledPluginArtifactIssueCode;
  message: string;
  path?: string;
  limit?: number;
  actual?: number;
}>;

export type VerifiedBundledPluginResource = Readonly<{
  path: string;
  bytes: Uint8Array;
}>;

export type VerifiedBundledPluginArtifact = Readonly<{
  manifestPath: string;
  packageDigest: string;
  resources: readonly VerifiedBundledPluginResource[];
}>;

export type BundledPluginArtifactVerificationResult =
  | Readonly<{
      ok: true;
      artifact: VerifiedBundledPluginArtifact;
      issues: readonly [];
    }>
  | Readonly<{
      ok: false;
      issues: readonly BundledPluginArtifactIssue[];
    }>;

export type BundledPluginDigestService = Readonly<{
  digestSha256(bytes: Uint8Array, signal: AbortSignal): Promise<string>;
}>;

type ArtifactResourceInput = Readonly<{
  path: string;
  bytes: Uint8Array | readonly number[];
}>;

type CreateBundledPluginArtifactOptions = Readonly<{
  manifestPath: string;
  resources: readonly ArtifactResourceInput[];
  signal?: AbortSignal;
  digestService?: BundledPluginDigestService;
  limits?: BundledPluginArtifactLimits;
}>;

const encoder = new TextEncoder();
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const compareBytes = (left: Uint8Array, right: Uint8Array): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const compareUtf8 = (left: string, right: string): number =>
  compareBytes(encoder.encode(left), encoder.encode(right));

const encodeBase64 = (bytes: Uint8Array): string => {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(value >>> 18) & 63];
    output += BASE64_ALPHABET[(value >>> 12) & 63];
    output +=
      index + 1 < bytes.length ? BASE64_ALPHABET[(value >>> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : '=';
  }
  return output;
};

export const createWebCryptoBundledPluginDigestService =
  (): BundledPluginDigestService =>
    Object.freeze({
      digestSha256: async (bytes, signal) => {
        if (signal.aborted) throw new Error('Digest operation was aborted.');
        const digest = await globalThis.crypto.subtle.digest(
          'SHA-256',
          new Uint8Array(bytes)
        );
        if (signal.aborted) throw new Error('Digest operation was aborted.');
        return `sha256-${encodeBase64(new Uint8Array(digest))}`;
      },
    });

const canonicalizeJson = (
  value: unknown,
  active: WeakSet<object>,
  depth: number
): string => {
  if (depth > 64) throw new TypeError('JSON value exceeds 64 levels.');
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JSON numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError('Canonical JSON accepts JSON values only.');
  }
  if (active.has(value))
    throw new TypeError('Canonical JSON cannot contain cycles.');

  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (
    (isArray && prototype !== Array.prototype) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(
      'Canonical JSON accepts plain objects and arrays only.'
    );
  }

  active.add(value);
  try {
    if (isArray) {
      const array = value as unknown[];
      const items: string[] = [];
      for (let index = 0; index < array.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          array,
          String(index)
        );
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new TypeError('Canonical JSON cannot contain sparse arrays.');
        }
        items.push(canonicalizeJson(descriptor.value, active, depth + 1));
      }
      return `[${items.join(',')}]`;
    }

    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort(compareUtf8);
    const entries = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new TypeError(
          'Canonical JSON properties must be data properties.'
        );
      }
      return `${JSON.stringify(key)}:${canonicalizeJson(
        descriptor.value,
        active,
        depth + 1
      )}`;
    });
    return `{${entries.join(',')}}`;
  } finally {
    active.delete(value);
  }
};

export const canonicalJsonBytes = (value: unknown): Uint8Array =>
  encoder.encode(canonicalizeJson(value, new WeakSet<object>(), 0));

export const normalizeBundledPluginResourcePath = (path: string): string => {
  if (typeof path !== 'string' || path.includes('\0')) {
    throw new TypeError(
      'Plugin resource path must be a string without NUL bytes.'
    );
  }
  const posixPath = path.replaceAll('\\', '/');
  if (/^[A-Za-z]:\//.test(posixPath) || posixPath.startsWith('/')) {
    throw new TypeError('Plugin resource path must be package-relative.');
  }
  const segments = posixPath.split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      throw new TypeError('Plugin resource path cannot traverse its package.');
    }
    normalized.push(segment);
  }
  if (normalized.length === 0) {
    throw new TypeError('Plugin resource path cannot be empty.');
  }
  return normalized.join('/');
};

const toBytes = (bytes: Uint8Array | readonly number[]): Uint8Array => {
  if (Object.prototype.toString.call(bytes) === '[object Uint8Array]') {
    return Uint8Array.from(bytes as Uint8Array);
  }
  if (
    !Array.isArray(bytes) ||
    bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new TypeError('Plugin resource bytes must contain octets.');
  }
  return Uint8Array.from(bytes);
};

const normalizeLimit = (value: number | undefined, fallback: number): number =>
  Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;

const resolveLimits = (limits: BundledPluginArtifactLimits = {}) =>
  Object.freeze({
    maxResources: normalizeLimit(
      limits.maxResources,
      DEFAULT_BUNDLED_PLUGIN_MAX_RESOURCES
    ),
    maxResourceBytes: normalizeLimit(
      limits.maxResourceBytes,
      DEFAULT_BUNDLED_PLUGIN_MAX_RESOURCE_BYTES
    ),
    maxPackageBytes: normalizeLimit(
      limits.maxPackageBytes,
      DEFAULT_BUNDLED_PLUGIN_MAX_PACKAGE_BYTES
    ),
  });

const frameResources = (
  resources: readonly VerifiedBundledPluginResource[]
): Uint8Array => {
  const framed = resources
    .map((resource) => ({
      ...resource,
      pathBytes: encoder.encode(resource.path),
    }))
    .sort((left, right) => compareBytes(left.pathBytes, right.pathBytes));
  const totalBytes = framed.reduce(
    (total, resource) =>
      total + 4 + resource.pathBytes.length + 8 + resource.bytes.length,
    0
  );
  if (!Number.isSafeInteger(totalBytes)) {
    throw new RangeError('Framed plugin package is too large.');
  }
  const output = new Uint8Array(totalBytes);
  const view = new DataView(output.buffer);
  let offset = 0;
  framed.forEach((resource) => {
    view.setUint32(offset, resource.pathBytes.length, false);
    offset += 4;
    output.set(resource.pathBytes, offset);
    offset += resource.pathBytes.length;
    view.setBigUint64(offset, BigInt(resource.bytes.length), false);
    offset += 8;
    output.set(resource.bytes, offset);
    offset += resource.bytes.length;
  });
  return output;
};

export const computeBundledPluginPackageDigest = async (
  resources: readonly ArtifactResourceInput[],
  options: Readonly<{
    signal?: AbortSignal;
    digestService?: BundledPluginDigestService;
  }> = {}
): Promise<string> => {
  const signal = options.signal ?? new AbortController().signal;
  if (signal.aborted) throw new Error('Digest operation was aborted.');
  const normalized = resources.map((resource) => ({
    path: normalizeBundledPluginResourcePath(resource.path),
    bytes: toBytes(resource.bytes),
  }));
  return (
    options.digestService ?? createWebCryptoBundledPluginDigestService()
  ).digestSha256(frameResources(normalized), signal);
};

const invalidArtifact = (
  code: BundledPluginArtifactIssueCode,
  message: string,
  extra: Omit<BundledPluginArtifactIssue, 'code' | 'message'> = {}
): BundledPluginArtifactVerificationResult => ({
  ok: false,
  issues: [Object.freeze({ code, message, ...extra })],
});

export const verifyBundledPluginArtifact = async (
  artifact: BundledPluginArtifactV1,
  options: Readonly<{
    signal?: AbortSignal;
    digestService?: BundledPluginDigestService;
    limits?: BundledPluginArtifactLimits;
  }> = {}
): Promise<BundledPluginArtifactVerificationResult> => {
  const signal = options.signal ?? new AbortController().signal;
  if (signal.aborted) {
    return invalidArtifact(
      'operation-aborted',
      'Plugin artifact verification was aborted.'
    );
  }
  if (
    !artifact ||
    typeof artifact !== 'object' ||
    artifact.schemaVersion !== BUNDLED_PLUGIN_ARTIFACT_VERSION ||
    !Array.isArray(artifact.resources) ||
    typeof artifact.packageDigest !== 'string'
  ) {
    return invalidArtifact(
      'invalid-artifact',
      'Bundled plugin artifact structure is invalid.'
    );
  }

  let manifestPath: string;
  try {
    manifestPath = normalizeBundledPluginResourcePath(artifact.manifestPath);
  } catch {
    return invalidArtifact(
      'invalid-manifest-path',
      'Plugin Manifest path is invalid.'
    );
  }
  if (manifestPath !== artifact.manifestPath) {
    return invalidArtifact(
      'invalid-manifest-path',
      'Plugin Manifest path must already use canonical POSIX form.',
      { path: artifact.manifestPath }
    );
  }

  const limits = resolveLimits(options.limits);
  if (artifact.resources.length > limits.maxResources) {
    return invalidArtifact(
      'resource-limit-exceeded',
      'Bundled plugin artifact contains too many resources.',
      { limit: limits.maxResources, actual: artifact.resources.length }
    );
  }

  const seen = new Set<string>();
  const resources: VerifiedBundledPluginResource[] = [];
  let packageBytes = 0;
  for (const resource of artifact.resources) {
    let path: string;
    try {
      path = normalizeBundledPluginResourcePath(resource.path);
    } catch {
      return invalidArtifact(
        'invalid-resource-path',
        'Plugin resource path is invalid.',
        {
          path: resource.path,
        }
      );
    }
    if (path !== resource.path) {
      return invalidArtifact(
        'invalid-resource-path',
        'Plugin resource path must already use canonical POSIX form.',
        { path: resource.path }
      );
    }
    if (seen.has(path)) {
      return invalidArtifact(
        'duplicate-resource-path',
        'Plugin resource path is duplicated.',
        {
          path,
        }
      );
    }
    seen.add(path);
    let bytes: Uint8Array;
    try {
      bytes = toBytes(resource.bytes);
    } catch {
      return invalidArtifact(
        'invalid-resource-bytes',
        'Plugin resource bytes are invalid.',
        {
          path,
        }
      );
    }
    if (bytes.length > limits.maxResourceBytes) {
      return invalidArtifact(
        'resource-limit-exceeded',
        'Plugin resource exceeds its byte limit.',
        { path, limit: limits.maxResourceBytes, actual: bytes.length }
      );
    }
    packageBytes += bytes.length;
    if (packageBytes > limits.maxPackageBytes) {
      return invalidArtifact(
        'package-limit-exceeded',
        'Bundled plugin artifact exceeds its package byte limit.',
        { limit: limits.maxPackageBytes, actual: packageBytes }
      );
    }
    resources.push(Object.freeze({ path, bytes }));
  }

  if (!seen.has(manifestPath)) {
    return invalidArtifact(
      'missing-manifest',
      'Bundled plugin artifact has no Manifest resource.',
      {
        path: manifestPath,
      }
    );
  }

  try {
    const packageDigest = await (
      options.digestService ?? createWebCryptoBundledPluginDigestService()
    ).digestSha256(frameResources(resources), signal);
    if (packageDigest !== artifact.packageDigest) {
      return invalidArtifact(
        'digest-mismatch',
        'Bundled plugin artifact digest does not match its resources.'
      );
    }
  } catch {
    return invalidArtifact(
      signal.aborted ? 'operation-aborted' : 'invalid-artifact',
      signal.aborted
        ? 'Plugin artifact verification was aborted.'
        : 'Plugin artifact digest could not be computed.'
    );
  }

  return {
    ok: true,
    artifact: Object.freeze({
      manifestPath,
      packageDigest: artifact.packageDigest,
      resources: Object.freeze(resources),
    }),
    issues: [],
  };
};

export const createBundledPluginArtifact = async (
  options: CreateBundledPluginArtifactOptions
): Promise<BundledPluginArtifactV1> => {
  const manifestPath = normalizeBundledPluginResourcePath(options.manifestPath);
  const resources = options.resources.map((resource) =>
    Object.freeze({
      path: normalizeBundledPluginResourcePath(resource.path),
      bytes: Object.freeze([...toBytes(resource.bytes)]),
    })
  );
  const packageDigest = await computeBundledPluginPackageDigest(resources, {
    signal: options.signal,
    digestService: options.digestService,
  });
  const artifact = Object.freeze({
    schemaVersion: BUNDLED_PLUGIN_ARTIFACT_VERSION,
    manifestPath,
    packageDigest,
    resources: Object.freeze(resources),
  });
  const verified = await verifyBundledPluginArtifact(artifact, {
    signal: options.signal,
    digestService: options.digestService,
    limits: options.limits,
  });
  if (!verified.ok) throw new TypeError(verified.issues[0]?.message);
  return artifact;
};
