import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
} from '#src/workspace/workspaceVerificationProbeContract';

/**
 * Build and security adapters may plant this marker to prove that their
 * scanner examines opaque/binary artifact bytes. It is never emitted by the
 * verification probe itself.
 */
export const WORKSPACE_VERIFICATION_CREDENTIAL_CANARY =
  '__PRODIVIX_CREDENTIAL_CANARY_V1__';

export type ProductionVerificationProbeMarker =
  | 'probe-canary'
  | 'probe-endpoint'
  | 'probe-module-id'
  | 'probe-module-path'
  | 'credential-canary';

export type ProductionVerificationProbeScanFile = Readonly<{
  path: string;
  contents: string | Uint8Array;
}>;

export type ProductionVerificationProbeScanOptions = Readonly<{
  maximumFiles?: number;
  maximumFileBytes?: number;
  maximumTotalBytes?: number;
}>;

export const PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS = Object.freeze({
  maximumFiles: 100_000,
  maximumFileBytes: 256 * 1_024 * 1_024,
  maximumTotalBytes: 1_024 * 1_024 * 1_024,
  maximumPathBytes: 4_096,
});

export type ProductionVerificationProbeScanInputErrorCode =
  | 'invalid-input'
  | 'invalid-limits'
  | 'unsafe-path'
  | 'duplicate-path'
  | 'too-many-files'
  | 'file-too-large'
  | 'bundle-too-large';

export class ProductionVerificationProbeScanInputError extends TypeError {
  readonly code: ProductionVerificationProbeScanInputErrorCode;
  readonly fileIndex?: number;
  readonly duplicateOfIndex?: number;

  constructor(
    code: ProductionVerificationProbeScanInputErrorCode,
    options: Readonly<{
      fileIndex?: number;
      duplicateOfIndex?: number;
    }> = {}
  ) {
    super(`Production verification scan rejected input: ${code}.`);
    this.name = 'ProductionVerificationProbeScanInputError';
    this.code = code;
    this.fileIndex = options.fileIndex;
    this.duplicateOfIndex = options.duplicateOfIndex;
  }
}

export type ProductionVerificationProbeScanFinding = Readonly<{
  path: string;
  marker: ProductionVerificationProbeMarker;
  byteOffset: number;
}>;

export type ProductionVerificationProbeScanResult =
  | Readonly<{
      status: 'clean';
      findings: readonly ProductionVerificationProbeScanFinding[];
    }>
  | Readonly<{
      status: 'blocked';
      findings: readonly ProductionVerificationProbeScanFinding[];
    }>;

const MARKERS: readonly Readonly<{
  marker: ProductionVerificationProbeMarker;
  value: string;
}>[] = Object.freeze([
  { marker: 'probe-canary', value: WORKSPACE_VERIFICATION_PROBE_CANARY },
  { marker: 'probe-endpoint', value: WORKSPACE_VERIFICATION_PROBE_ENDPOINT },
  { marker: 'probe-module-id', value: WORKSPACE_VERIFICATION_PROBE_MODULE_ID },
  {
    marker: 'probe-module-path',
    value: WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  },
  {
    marker: 'credential-canary',
    value: WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
  },
]);

const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  'buffer'
)?.get;
const SHARED_ARRAY_BUFFER_BYTE_LENGTH_GETTER =
  typeof SharedArrayBuffer === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')
        ?.get;

const isSharedArrayBuffer = (value: ArrayBufferLike): boolean => {
  if (!SHARED_ARRAY_BUFFER_BYTE_LENGTH_GETTER) return false;
  try {
    Reflect.apply(SHARED_ARRAY_BUFFER_BYTE_LENGTH_GETTER, value, []);
    return true;
  } catch {
    return false;
  }
};

const findBytes = (haystack: Uint8Array, needle: Uint8Array): number => {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  const maximumStart = haystack.length - needle.length;
  for (let start = 0; start <= maximumStart; start += 1) {
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

const readLimit = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > fallback
  ) {
    throw new ProductionVerificationProbeScanInputError('invalid-limits');
  }
  return value;
};

const invalidInput = (
  fileIndex?: number
): ProductionVerificationProbeScanInputError =>
  new ProductionVerificationProbeScanInputError('invalid-input', {
    ...(fileIndex === undefined ? {} : { fileIndex }),
  });

const guardInputIntrospection = <T>(
  operation: () => T,
  fileIndex?: number
): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ProductionVerificationProbeScanInputError) {
      throw error;
    }
    throw invalidInput(fileIndex);
  }
};

const validateExactPlainRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  fileIndex?: number
): object =>
  guardInputIntrospection(() => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidInput(fileIndex);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidInput(fileIndex);
    }
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some((key) => typeof key !== 'string' || !allowedKeys.has(key)) ||
      requiredKeys.some((key) => !ownKeys.includes(key))
    ) {
      throw invalidInput(fileIndex);
    }
    return value;
  }, fileIndex);

const readEnumerableDataProperty = (
  value: object,
  key: string,
  fileIndex?: number
): unknown =>
  guardInputIntrospection(() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw invalidInput(fileIndex);
    }
    return descriptor.value;
  }, fileIndex);

const readOptionalEnumerableDataProperty = (
  value: object,
  key: string
): unknown =>
  guardInputIntrospection(() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return undefined;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw invalidInput();
    }
    return descriptor.value;
  });

const readScanOptions = (
  value: unknown
): Readonly<{
  maximumFiles: number;
  maximumFileBytes: number;
  maximumTotalBytes: number;
}> => {
  const record = validateExactPlainRecord(
    value,
    [],
    ['maximumFiles', 'maximumFileBytes', 'maximumTotalBytes']
  );
  return Object.freeze({
    maximumFiles: readLimit(
      readOptionalEnumerableDataProperty(record, 'maximumFiles'),
      PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS.maximumFiles
    ),
    maximumFileBytes: readLimit(
      readOptionalEnumerableDataProperty(record, 'maximumFileBytes'),
      PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS.maximumFileBytes
    ),
    maximumTotalBytes: readLimit(
      readOptionalEnumerableDataProperty(record, 'maximumTotalBytes'),
      PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS.maximumTotalBytes
    ),
  });
};

const readSafePath = (
  value: unknown,
  fileIndex: number,
  encoder: TextEncoder
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS.maximumPathBytes ||
    value !== value.normalize('NFC') ||
    value.trim() !== value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes(':') ||
    encoder.encode(value).byteLength >
      PRODUCTION_VERIFICATION_PROBE_SCAN_LIMITS.maximumPathBytes
  ) {
    throw new ProductionVerificationProbeScanInputError('unsafe-path', {
      fileIndex,
    });
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        [...segment].some((character) => {
          const codePoint = character.codePointAt(0)!;
          return codePoint <= 0x1f || codePoint === 0x7f;
        })
    )
  ) {
    throw new ProductionVerificationProbeScanInputError('unsafe-path', {
      fileIndex,
    });
  }
  return value;
};

const cloneScanContents = (
  value: unknown,
  fileIndex: number
): string | Uint8Array => {
  if (typeof value === 'string') return value;
  return guardInputIntrospection(() => {
    if (!(value instanceof Uint8Array) || !TYPED_ARRAY_BUFFER_GETTER) {
      throw invalidInput(fileIndex);
    }
    const sourceBuffer = Reflect.apply(
      TYPED_ARRAY_BUFFER_GETTER,
      value,
      []
    ) as ArrayBufferLike;
    if (isSharedArrayBuffer(sourceBuffer)) {
      throw invalidInput(fileIndex);
    }
    return new Uint8Array(value);
  }, fileIndex);
};

const utf8ByteLength = (value: string, stopAfter: number): number => {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    byteLength +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
    if (byteLength > stopAfter) return byteLength;
  }
  return byteLength;
};

const prepareFiles = (
  files: unknown,
  options: unknown,
  encoder: TextEncoder
): readonly Readonly<{
  path: string;
  bytes: Uint8Array;
}>[] => {
  const { maximumFiles, maximumFileBytes, maximumTotalBytes } =
    readScanOptions(options);
  const length = guardInputIntrospection(() => {
    if (
      !Array.isArray(files) ||
      Object.getPrototypeOf(files) !== Array.prototype
    ) {
      throw invalidInput();
    }
    const descriptor = Object.getOwnPropertyDescriptor(files, 'length');
    if (
      !descriptor ||
      descriptor.enumerable ||
      !('value' in descriptor) ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0
    ) {
      throw invalidInput();
    }
    return descriptor.value as number;
  });
  if (length > maximumFiles) {
    throw new ProductionVerificationProbeScanInputError('too-many-files');
  }
  guardInputIntrospection(() => {
    const expectedKeys = new Set([
      'length',
      ...Array.from({ length }, (_, index) => String(index)),
    ]);
    const ownKeys = Reflect.ownKeys(files as object);
    if (
      ownKeys.length !== expectedKeys.size ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))
    ) {
      throw invalidInput();
    }
  });

  const firstIndexByPath = new Map<string, number>();
  let totalBytes = 0;
  const preparedFiles: Readonly<{ path: string; bytes: Uint8Array }>[] = [];
  for (let fileIndex = 0; fileIndex < length; fileIndex += 1) {
    const file = readEnumerableDataProperty(
      files as object,
      String(fileIndex),
      fileIndex
    );
    const record = validateExactPlainRecord(
      file,
      ['path', 'contents'],
      [],
      fileIndex
    );
    const pathValue = readEnumerableDataProperty(record, 'path', fileIndex);
    const contents = cloneScanContents(
      readEnumerableDataProperty(record, 'contents', fileIndex),
      fileIndex
    );
    const path = readSafePath(pathValue, fileIndex, encoder);
    const duplicateOfIndex = firstIndexByPath.get(path);
    if (duplicateOfIndex !== undefined) {
      throw new ProductionVerificationProbeScanInputError('duplicate-path', {
        fileIndex,
        duplicateOfIndex,
      });
    }
    firstIndexByPath.set(path, fileIndex);

    const remainingTotalBytes = maximumTotalBytes - totalBytes;
    const byteLength =
      typeof contents === 'string'
        ? utf8ByteLength(
            contents,
            Math.min(maximumFileBytes, remainingTotalBytes)
          )
        : contents.byteLength;
    if (byteLength > maximumFileBytes) {
      throw new ProductionVerificationProbeScanInputError('file-too-large', {
        fileIndex,
      });
    }
    if (byteLength > remainingTotalBytes) {
      throw new ProductionVerificationProbeScanInputError('bundle-too-large', {
        fileIndex,
      });
    }
    const bytes =
      typeof contents === 'string' ? encoder.encode(contents) : contents;
    totalBytes += byteLength;
    preparedFiles.push(Object.freeze({ path, bytes }));
  }
  return Object.freeze(preparedFiles);
};

/**
 * Scans every supplied byte, including opaque binary artifacts. Findings
 * identify only the fixed marker class and offset; surrounding bytes are never
 * copied into diagnostics where a credential could be disclosed.
 */
export const scanProductionBundleForVerificationProbe = (
  files: readonly ProductionVerificationProbeScanFile[],
  options: ProductionVerificationProbeScanOptions = {}
): ProductionVerificationProbeScanResult => {
  const encoder = new TextEncoder();
  const preparedFiles = prepareFiles(files, options, encoder);
  const markerBytes = MARKERS.map(({ marker, value }) => ({
    marker,
    bytes: encoder.encode(value),
  }));
  const findings = preparedFiles.flatMap((file) => {
    const bytes = file.bytes;
    return markerBytes.flatMap(({ marker, bytes: needle }) => {
      const byteOffset = findBytes(bytes, needle);
      return byteOffset < 0
        ? []
        : [
            {
              path: file.path,
              marker,
              byteOffset,
            } satisfies ProductionVerificationProbeScanFinding,
          ];
    });
  });
  findings.sort(
    (left, right) =>
      compareUnicodeCodePoints(left.path, right.path) ||
      compareUnicodeCodePoints(left.marker, right.marker) ||
      left.byteOffset - right.byteOffset
  );
  return findings.length === 0
    ? Object.freeze({ status: 'clean', findings: Object.freeze([]) })
    : Object.freeze({
        status: 'blocked',
        findings: Object.freeze(findings),
      });
};

export class ProductionVerificationProbeLeakError extends Error {
  readonly code = 'VER-PRODUCTION-PROBE-LEAK';
  readonly findings: readonly ProductionVerificationProbeScanFinding[];

  constructor(findings: readonly ProductionVerificationProbeScanFinding[]) {
    super(
      `Production bundle contains ${findings.length} forbidden verification or credential marker(s).`
    );
    this.name = 'ProductionVerificationProbeLeakError';
    this.findings = findings;
  }
}

/** Throws before a production artifact can be promoted when any marker leaks. */
export const assertProductionBundleHasNoVerificationProbe = (
  files: readonly ProductionVerificationProbeScanFile[],
  options: ProductionVerificationProbeScanOptions = {}
): void => {
  const result = scanProductionBundleForVerificationProbe(files, options);
  if (result.status === 'blocked') {
    throw new ProductionVerificationProbeLeakError(result.findings);
  }
};
