import {
  createExecutableProjectSnapshot,
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  exactRecord,
  normalizedString,
  safeInteger,
  sha256Digest,
  sourceTraces,
} from './remoteExecutionCodecPrimitives';
import type {
  RemoteExecutableProjectFileContentsWire,
  RemoteExecutableProjectSnapshotWire,
  RemoteExecutionSnapshotSource,
  RemoteExecutionSnapshotSourceWire,
} from './remoteExecutionProtocol.types';

const encodeContents = (
  contents: string | Uint8Array
): RemoteExecutableProjectFileContentsWire =>
  typeof contents === 'string'
    ? Object.freeze({ encoding: 'utf8', value: contents })
    : Object.freeze({
        encoding: 'bytes',
        value: Object.freeze(Array.from(contents)),
      });

const decodeContents = (value: unknown, label: string): string | Uint8Array => {
  const record = exactRecord(
    value,
    ['encoding', 'value'],
    ['encoding', 'value'],
    label
  );
  if (record.encoding === 'utf8') {
    if (typeof record.value !== 'string') {
      throw new TypeError(`${label}.value must be a string.`);
    }
    return record.value;
  }
  if (record.encoding !== 'bytes' || !Array.isArray(record.value)) {
    throw new TypeError(`${label} has unsupported encoding.`);
  }
  if (record.value.length > EXECUTABLE_PROJECT_LIMITS.maxFileBytes) {
    throw new TypeError(`${label}.value exceeds the file byte limit.`);
  }
  return new Uint8Array(
    record.value.map((entry, index) => {
      const byte = safeInteger(entry, `${label}.value[${index}]`);
      if (byte > 255)
        throw new TypeError(`${label}.value[${index}] is not a byte.`);
      return byte;
    })
  );
};

export const encodeRemoteExecutableProjectSnapshot = (
  snapshot: ExecutableProjectSnapshot
): RemoteExecutableProjectSnapshotWire =>
  Object.freeze({
    format: snapshot.format,
    workspace: snapshot.workspace,
    target: snapshot.target,
    contentDigest: snapshot.contentDigest,
    files: Object.freeze(
      snapshot.files.map((file) =>
        Object.freeze({
          path: file.path,
          contents: encodeContents(file.contents),
          ...(file.sourceTrace ? { sourceTrace: file.sourceTrace } : {}),
        })
      )
    ),
    dependencyPlan: Object.freeze({
      manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
      ...(snapshot.dependencyPlan.lockFilePath
        ? { lockFilePath: snapshot.dependencyPlan.lockFilePath }
        : {}),
    }),
    entrypoints: snapshot.entrypoints,
    capabilityRequirements: snapshot.capabilityRequirements,
    publicBuildConfiguration: snapshot.publicBuildConfiguration,
    resourceHints: snapshot.resourceHints,
    cacheHints: snapshot.cacheHints,
    ...(snapshot.dataMockProvision
      ? { dataMockProvision: snapshot.dataMockProvision }
      : {}),
    ...(snapshot.serverRuntimeMockProvision
      ? { serverRuntimeMockProvision: snapshot.serverRuntimeMockProvision }
      : {}),
    installCommand: snapshot.installCommand,
    previewCommand: snapshot.previewCommand,
    buildCommand: snapshot.buildCommand,
    previewPlan: snapshot.previewPlan,
    buildPlan: snapshot.buildPlan,
    testPlan: snapshot.testPlan,
    ...(snapshot.serverFunctionPlan
      ? { serverFunctionPlan: snapshot.serverFunctionPlan }
      : {}),
  });

export const decodeRemoteExecutableProjectSnapshot = (
  value: unknown
): ExecutableProjectSnapshot => {
  const record = exactRecord(
    value,
    [
      'format',
      'workspace',
      'target',
      'contentDigest',
      'files',
      'dependencyPlan',
      'entrypoints',
      'capabilityRequirements',
      'publicBuildConfiguration',
      'resourceHints',
      'cacheHints',
      'dataMockProvision',
      'serverRuntimeMockProvision',
      'installCommand',
      'previewCommand',
      'buildCommand',
      'previewPlan',
      'buildPlan',
      'testPlan',
      'serverFunctionPlan',
    ],
    [
      'format',
      'workspace',
      'target',
      'contentDigest',
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
    'Remote executable project snapshot'
  );
  if (record.format !== EXECUTABLE_PROJECT_SNAPSHOT_FORMAT) {
    throw new TypeError(
      'Remote executable project snapshot format is unsupported.'
    );
  }
  if (!Array.isArray(record.files)) {
    throw new TypeError(
      'Remote executable project snapshot files must be an array.'
    );
  }
  const dependencyPlan = exactRecord(
    record.dependencyPlan,
    ['manifestFilePath', 'lockFilePath'],
    ['manifestFilePath'],
    'Remote executable project dependency plan'
  );
  const snapshot = createExecutableProjectSnapshot({
    workspace: record.workspace as never,
    target: record.target as never,
    files: record.files.map((entry, index) => {
      const label = `Remote executable project file ${index}`;
      const file = exactRecord(
        entry,
        ['path', 'contents', 'sourceTrace'],
        ['path', 'contents'],
        label
      );
      return {
        path: normalizedString(file.path, `${label}.path`),
        contents: decodeContents(file.contents, `${label}.contents`),
        ...(file.sourceTrace === undefined
          ? {}
          : {
              sourceTrace: sourceTraces(
                file.sourceTrace,
                `${label}.sourceTrace`
              ),
            }),
      };
    }),
    dependencyPlan: {
      manifestFilePath: normalizedString(
        dependencyPlan.manifestFilePath,
        'Remote dependency manifest path'
      ),
      ...(dependencyPlan.lockFilePath === undefined
        ? {}
        : {
            lockFilePath: normalizedString(
              dependencyPlan.lockFilePath,
              'Remote dependency lock path'
            ),
          }),
    },
    entrypoints: record.entrypoints as never,
    capabilityRequirements: record.capabilityRequirements as never,
    publicBuildConfiguration: record.publicBuildConfiguration as never,
    resourceHints: record.resourceHints as never,
    cacheHints: record.cacheHints as never,
    ...(record.dataMockProvision === undefined
      ? {}
      : { dataMockProvision: record.dataMockProvision as never }),
    ...(record.serverRuntimeMockProvision === undefined
      ? {}
      : {
          serverRuntimeMockProvision:
            record.serverRuntimeMockProvision as never,
        }),
    installCommand: record.installCommand as never,
    previewCommand: record.previewCommand as never,
    buildCommand: record.buildCommand as never,
    previewPlan: record.previewPlan as never,
    buildPlan: record.buildPlan as never,
    testPlan: record.testPlan as never,
    ...(record.serverFunctionPlan === undefined
      ? {}
      : { serverFunctionPlan: record.serverFunctionPlan as never }),
  });
  const expectedDigest = sha256Digest(
    record.contentDigest,
    'Remote executable project content digest'
  );
  if (snapshot.contentDigest !== expectedDigest) {
    throw new TypeError(
      'Remote executable project content digest does not match payload.'
    );
  }
  return snapshot;
};

export const encodeRemoteExecutionSnapshotSource = (
  source: RemoteExecutionSnapshotSource
): RemoteExecutionSnapshotSourceWire =>
  source.kind === 'reference'
    ? Object.freeze({
        kind: 'reference',
        snapshotId: source.snapshotId,
        contentDigest: source.contentDigest,
      })
    : Object.freeze({
        kind: 'upload',
        snapshot: encodeRemoteExecutableProjectSnapshot(source.snapshot),
      });

export const decodeRemoteExecutionSnapshotSource = (
  value: unknown
): RemoteExecutionSnapshotSource => {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Remote execution snapshot source must be an object.');
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'reference') {
    const record = exactRecord(
      value,
      ['kind', 'snapshotId', 'contentDigest'],
      ['kind', 'snapshotId', 'contentDigest'],
      'Remote execution snapshot reference'
    );
    return Object.freeze({
      kind,
      snapshotId: normalizedString(record.snapshotId, 'Remote snapshot id'),
      contentDigest: sha256Digest(
        record.contentDigest,
        'Remote snapshot digest'
      ),
    });
  }
  if (kind === 'upload') {
    const record = exactRecord(
      value,
      ['kind', 'snapshot'],
      ['kind', 'snapshot'],
      'Remote execution snapshot upload'
    );
    return Object.freeze({
      kind,
      snapshot: decodeRemoteExecutableProjectSnapshot(record.snapshot),
    });
  }
  throw new TypeError('Remote execution snapshot source kind is unsupported.');
};
