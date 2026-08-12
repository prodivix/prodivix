import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { createExecutableProjectSnapshot } from './executableProject';
import {
  EXECUTABLE_PROJECT_LIMITS,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
} from './executableProject.types';
import type { ExecutionSourceTrace } from './execution.types';

export const EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT =
  'prodivix.executable-project-snapshot-artifact' as const;
export const EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION = 1 as const;
export const EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE =
  'application/vnd.prodivix.executable-project-snapshot+json' as const;

const maximumArtifactBytes = 512 * 1024 * 1024;
const digestPattern = /^sha256-[a-f0-9]{64}$/u;

export type ExecutableProjectSnapshotArtifact = Readonly<{
  bytes: Uint8Array;
  artifactDigest: string;
  semanticDigest: string;
  size: number;
  mediaType: typeof EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE;
  codec: Readonly<{
    format: typeof EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT;
    version: typeof EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION;
    schemaDigest: string;
  }>;
}>;

export const EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST = `sha256-${bytesToHex(
  sha256(
    utf8ToBytes(
      canonicalJsonText({
        format: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT,
        version: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION,
        snapshotFormat: 'prodivix.executable-project.v6',
        fileContents: ['utf8', 'base64'],
        canonicalization: '@prodivix/shared/canonical-json',
      })
    )
  )
)}`;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  label: string,
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
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

const encodeBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output: string[] = [];
  let chunk = '';
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    chunk += alphabet[first >> 2]!;
    chunk += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)]!;
    chunk +=
      second === undefined
        ? '='
        : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]!;
    chunk += third === undefined ? '=' : alphabet[third & 0x3f]!;
    if (chunk.length >= 16_384) {
      output.push(chunk);
      chunk = '';
    }
  }
  if (chunk) output.push(chunk);
  return output.join('');
};

const artifactDigest = (bytes: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(bytes))}`;

const decodeUtf8 = (bytes: Uint8Array): string =>
  new (
    globalThis as unknown as {
      TextDecoder: new (
        label?: string,
        options?: Readonly<{ fatal?: boolean }>
      ) => { decode(input: Uint8Array): string };
    }
  ).TextDecoder('utf-8', { fatal: true }).decode(bytes);

const encodeFile = (file: ExecutableProjectSnapshot['files'][number]) =>
  Object.freeze({
    path: file.path,
    encoding:
      typeof file.contents === 'string'
        ? ('utf8' as const)
        : ('base64' as const),
    contents:
      typeof file.contents === 'string'
        ? file.contents
        : encodeBase64(file.contents),
    ...(file.sourceTrace ? { sourceTrace: file.sourceTrace } : {}),
  });

const decodeFiles = (
  value: readonly unknown[]
): ExecutableProjectSnapshotInput['files'] =>
  Object.freeze(
    value.map((entry, index) => {
      const file = exactRecord(
        entry,
        ['path', 'encoding', 'contents'],
        `Executable snapshot artifact files[${index}]`,
        ['sourceTrace']
      );
      if (
        (file.encoding !== 'utf8' && file.encoding !== 'base64') ||
        typeof file.contents !== 'string'
      ) {
        throw new TypeError(
          `Executable snapshot artifact files[${index}] encoding drifted.`
        );
      }
      return Object.freeze({
        path: relativePath(
          file.path,
          `Executable snapshot artifact files[${index}].path`
        ),
        contents:
          file.encoding === 'utf8'
            ? file.contents
            : decodeCanonicalBase64(file.contents, {
                label: `Executable snapshot artifact files[${index}].contents`,
                maximumBytes: EXECUTABLE_PROJECT_LIMITS.maxFileBytes,
              }),
        ...(file.sourceTrace === undefined
          ? {}
          : {
              sourceTrace: file.sourceTrace as readonly ExecutionSourceTrace[],
            }),
      });
    })
  );

const decodeSnapshot = (value: unknown): ExecutableProjectSnapshot => {
  const record = exactRecord(
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
    'Executable snapshot artifact snapshot',
    ['dataMockProvision', 'serverRuntimeMockProvision', 'serverFunctionPlan']
  );
  if (
    record.format !== 'prodivix.executable-project.v6' ||
    typeof record.contentDigest !== 'string' ||
    !digestPattern.test(record.contentDigest) ||
    !Array.isArray(record.files) ||
    record.files.length < 1 ||
    record.files.length > EXECUTABLE_PROJECT_LIMITS.maxFiles
  ) {
    throw new TypeError('Executable snapshot artifact identity is invalid.');
  }
  const files = decodeFiles(record.files);
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    throw new TypeError('Executable snapshot artifact paths are duplicated.');
  }
  const dependencyPlan = exactRecord(
    record.dependencyPlan,
    ['manifestFilePath', 'installFingerprint'],
    'Executable snapshot artifact dependency plan',
    ['lockFilePath']
  );
  if (
    typeof dependencyPlan.manifestFilePath !== 'string' ||
    typeof dependencyPlan.installFingerprint !== 'string' ||
    !digestPattern.test(dependencyPlan.installFingerprint) ||
    (dependencyPlan.lockFilePath !== undefined &&
      typeof dependencyPlan.lockFilePath !== 'string')
  ) {
    throw new TypeError(
      'Executable snapshot artifact dependency plan is invalid.'
    );
  }
  const snapshotInput = Object.fromEntries(
    Object.entries(record).filter(
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
  if (snapshot.contentDigest !== record.contentDigest) {
    throw new TypeError(
      'Executable snapshot artifact semantic content digest drifted.'
    );
  }
  return snapshot;
};

export const encodeExecutableProjectSnapshotArtifact = (
  snapshot: ExecutableProjectSnapshot
): ExecutableProjectSnapshotArtifact => {
  const bytes = utf8ToBytes(
    canonicalJsonText({
      format: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT,
      version: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION,
      schemaDigest: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
      snapshot: {
        ...snapshot,
        files: snapshot.files.map(encodeFile),
      },
    })
  );
  if (bytes.byteLength < 1 || bytes.byteLength > maximumArtifactBytes) {
    throw new TypeError(
      'Executable snapshot artifact exceeds its byte budget.'
    );
  }
  const decoded = decodeExecutableProjectSnapshotArtifact(bytes);
  if (decoded.snapshot.contentDigest !== snapshot.contentDigest) {
    throw new TypeError('Executable snapshot artifact round trip drifted.');
  }
  return Object.freeze({
    bytes,
    artifactDigest: decoded.artifactDigest,
    semanticDigest: decoded.snapshot.contentDigest,
    size: bytes.byteLength,
    mediaType: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
    codec: Object.freeze({
      format: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT,
      version: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION,
      schemaDigest: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
    }),
  });
};

export const decodeExecutableProjectSnapshotArtifact = (
  source: string | Uint8Array
): Readonly<{
  snapshot: ExecutableProjectSnapshot;
  artifactDigest: string;
  size: number;
  mediaType: typeof EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE;
  schemaDigest: string;
}> => {
  const bytes = typeof source === 'string' ? utf8ToBytes(source) : source;
  if (bytes.byteLength < 1 || bytes.byteLength > maximumArtifactBytes) {
    throw new TypeError(
      'Executable snapshot artifact exceeds its byte budget.'
    );
  }
  let value: unknown;
  let text: string;
  try {
    text = decodeUtf8(bytes);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Executable snapshot artifact must be strict JSON.');
  }
  if (canonicalJsonText(value) !== text) {
    throw new TypeError(
      'Executable snapshot artifact must use canonical JSON.'
    );
  }
  const record = exactRecord(
    value,
    ['format', 'version', 'schemaDigest', 'snapshot'],
    'Executable snapshot artifact'
  );
  if (
    record.format !== EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_FORMAT ||
    record.version !== EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_VERSION ||
    record.schemaDigest !== EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST
  ) {
    throw new TypeError('Executable snapshot artifact codec identity drifted.');
  }
  return Object.freeze({
    snapshot: decodeSnapshot(record.snapshot),
    artifactDigest: artifactDigest(bytes),
    size: bytes.byteLength,
    mediaType: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
    schemaDigest: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
  });
};
