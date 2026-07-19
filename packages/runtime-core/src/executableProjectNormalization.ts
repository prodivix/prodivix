import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  EXECUTION_PROVIDER_CAPABILITIES,
  type ExecutionProviderCapability,
  type ExecutionSourceTrace,
  type ExecutionValue,
  type ExecutionWorkspaceSnapshotRef,
} from './execution.types';
import {
  DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_INVOCATION_PATH,
  DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_RESULT_PATH,
  DEFAULT_EXECUTABLE_PROJECT_BUILD_OUTPUT_DIRECTORY,
  DEFAULT_EXECUTABLE_PROJECT_PREVIEW_ENTRY_FILE,
  DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
  EXECUTABLE_PROJECT_COMMANDS,
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  type ExecutableProjectCacheHints,
  type ExecutableProjectBuildPlan,
  type ExecutableProjectCapabilityRequirements,
  type ExecutableProjectCommand,
  type ExecutableProjectCommandName,
  type ExecutableProjectDataMockFixtureBehavior,
  type ExecutableProjectDataMockCollection,
  type ExecutableProjectDataMockPage,
  type ExecutableProjectDataMockProvision,
  type ExecutableProjectEntrypoint,
  type ExecutableProjectFile,
  type ExecutableProjectPublicBuildConfigurationEntry,
  type ExecutableProjectPreviewPlan,
  type ExecutableProjectResourceHints,
  type ExecutableProjectServerRuntimeMockProvision,
  type ExecutableProjectServerFunctionPlan,
  type ExecutableProjectTarget,
  type ExecutableProjectTestPlan,
} from './executableProject.types';

const DEFAULT_INSTALL_COMMAND: ExecutableProjectCommand = Object.freeze({
  command: 'npm',
  args: Object.freeze(['install']),
});

const DEFAULT_PREVIEW_COMMAND: ExecutableProjectCommand = Object.freeze({
  command: 'npm',
  args: Object.freeze(['run', 'dev', '--', '--host', '0.0.0.0']),
});

const DEFAULT_BUILD_COMMAND: ExecutableProjectCommand = Object.freeze({
  command: 'npm',
  args: Object.freeze(['run', 'build']),
});

const createDefaultTestCommand = (
  reportFilePath: string
): ExecutableProjectCommand =>
  Object.freeze({
    command: 'npm',
    args: Object.freeze([
      'run',
      'test',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--no-file-parallelism',
      `--outputFile.json=${reportFilePath}`,
    ]),
  });

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const assertExecutableProjectExactKeys = (
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new TypeError(
      `${label} contains an unsupported field: ${unexpected}.`
    );
  }
  return value;
};

const normalizeIdentifier = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized !== value || normalized.includes('\0')) {
    throw new TypeError(`${label} must be a normalized non-empty string.`);
  }
  return normalized;
};

const normalizeBoundedIdentifier = (
  value: unknown,
  label: string,
  maximumLength = 4_096
): string => {
  const result = normalizeIdentifier(value, label);
  if (result.length > maximumLength)
    throw new TypeError(`${label} exceeds the size limit.`);
  return result;
};

export const normalizeExecutableProjectPath = (value: unknown): string => {
  const path = normalizeIdentifier(value, 'Executable project file path');
  if (path.length > EXECUTABLE_PROJECT_LIMITS.maxPathLength) {
    throw new TypeError('Executable project file path exceeds the size limit.');
  }
  if (path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) {
    throw new TypeError(
      `Executable project file path is not relative: ${path}`
    );
  }
  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment !== segment.trim()
    )
  ) {
    throw new TypeError(
      `Executable project file path is not normalized: ${path}`
    );
  }
  return path;
};

const canonicalClone = (value: unknown, label: string, depth = 0): unknown => {
  if (depth > 16) throw new TypeError(`${label} exceeds the depth limit.`);
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry, index) =>
        canonicalClone(entry, `${label}[${index}]`, depth + 1)
      )
    );
  }
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must contain transport-safe values.`);
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return Object.freeze(
    Object.fromEntries(
      entries.map(([key, entry]) => [
        key,
        canonicalClone(entry, `${label}.${key}`, depth + 1),
      ])
    )
  );
};

const normalizeNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value as number;
};

const normalizeDataMockPage = (
  value: unknown,
  label: string
): ExecutableProjectDataMockPage => {
  if (typeof value !== 'object' || value === null)
    throw new TypeError(`${label} must be an object.`);
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'offset') {
    const record = assertExecutableProjectExactKeys(
      value,
      ['kind', 'offset', 'limit', 'total', 'hasMore'],
      label
    );
    if (typeof record.hasMore !== 'boolean')
      throw new TypeError(`${label}.hasMore must be a boolean.`);
    const limit = normalizeNonNegativeInteger(record.limit, `${label}.limit`);
    if (limit < 1) throw new TypeError(`${label}.limit must be positive.`);
    return Object.freeze({
      kind,
      offset: normalizeNonNegativeInteger(record.offset, `${label}.offset`),
      limit,
      ...(record.total === undefined
        ? {}
        : {
            total: normalizeNonNegativeInteger(record.total, `${label}.total`),
          }),
      hasMore: record.hasMore,
    });
  }
  if (kind === 'cursor') {
    const record = assertExecutableProjectExactKeys(
      value,
      ['kind', 'nextCursor', 'previousCursor', 'hasMore'],
      label
    );
    if (typeof record.hasMore !== 'boolean')
      throw new TypeError(`${label}.hasMore must be a boolean.`);
    return Object.freeze({
      kind,
      ...(record.nextCursor === undefined
        ? {}
        : {
            nextCursor: normalizeBoundedIdentifier(
              record.nextCursor,
              `${label}.nextCursor`
            ),
          }),
      ...(record.previousCursor === undefined
        ? {}
        : {
            previousCursor: normalizeBoundedIdentifier(
              record.previousCursor,
              `${label}.previousCursor`
            ),
          }),
      hasMore: record.hasMore,
    });
  }
  throw new TypeError(`${label}.kind is unsupported.`);
};

const normalizeDataMockDelay = (
  value: unknown,
  label: string
): number | undefined => {
  if (value === undefined) return undefined;
  const result = normalizeNonNegativeInteger(value, label);
  if (result > 60_000)
    throw new TypeError(`${label} exceeds the 60000ms limit.`);
  return result;
};

const normalizeDataMockBehavior = (
  value: unknown,
  label: string,
  collectionIds: ReadonlySet<string>
): ExecutableProjectDataMockFixtureBehavior => {
  if (typeof value !== 'object' || value === null)
    throw new TypeError(`${label} must be an object.`);
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'result') {
    const record = assertExecutableProjectExactKeys(
      value,
      ['kind', 'value', 'empty', 'page', 'delayMs'],
      label
    );
    if (typeof record.empty !== 'boolean')
      throw new TypeError(`${label}.empty must be a boolean.`);
    const delayMs = normalizeDataMockDelay(record.delayMs, `${label}.delayMs`);
    return Object.freeze({
      kind,
      value: canonicalClone(record.value, `${label}.value`) as never,
      empty: record.empty,
      ...(record.page === undefined
        ? {}
        : { page: normalizeDataMockPage(record.page, `${label}.page`) }),
      ...(delayMs === undefined ? {} : { delayMs }),
    });
  }
  if (kind === 'error') {
    const record = assertExecutableProjectExactKeys(
      value,
      ['kind', 'code', 'retryable', 'delayMs'],
      label
    );
    if (typeof record.retryable !== 'boolean')
      throw new TypeError(`${label}.retryable must be a boolean.`);
    const delayMs = normalizeDataMockDelay(record.delayMs, `${label}.delayMs`);
    return Object.freeze({
      kind,
      code: normalizeBoundedIdentifier(record.code, `${label}.code`),
      retryable: record.retryable,
      ...(delayMs === undefined ? {} : { delayMs }),
    });
  }
  if (kind === 'crud') {
    const record = assertExecutableProjectExactKeys(
      value,
      [
        'kind',
        'collectionId',
        'action',
        'idInputKey',
        'valueInputKey',
        'delayMs',
      ],
      label
    );
    const collectionId = normalizeBoundedIdentifier(
      record.collectionId,
      `${label}.collectionId`
    );
    if (!collectionIds.has(collectionId))
      throw new TypeError(`${label} references an unknown collection.`);
    const action = record.action;
    if (
      action !== 'list' &&
      action !== 'get' &&
      action !== 'create' &&
      action !== 'update' &&
      action !== 'delete'
    )
      throw new TypeError(`${label}.action is unsupported.`);
    const requiresId =
      action === 'get' || action === 'update' || action === 'delete';
    const requiresValue = action === 'create' || action === 'update';
    if (requiresId !== (record.idInputKey !== undefined))
      throw new TypeError(
        `${label}.idInputKey must be present exactly for get/update/delete.`
      );
    if (requiresValue !== (record.valueInputKey !== undefined))
      throw new TypeError(
        `${label}.valueInputKey must be present exactly for create/update.`
      );
    const delayMs = normalizeDataMockDelay(record.delayMs, `${label}.delayMs`);
    return Object.freeze({
      kind,
      collectionId,
      action,
      ...(requiresId
        ? {
            idInputKey: normalizeBoundedIdentifier(
              record.idInputKey,
              `${label}.idInputKey`
            ),
          }
        : {}),
      ...(requiresValue
        ? {
            valueInputKey: normalizeBoundedIdentifier(
              record.valueInputKey,
              `${label}.valueInputKey`
            ),
          }
        : {}),
      ...(delayMs === undefined ? {} : { delayMs }),
    });
  }
  throw new TypeError(`${label}.kind is unsupported.`);
};

const normalizeDataMockCollections = (
  value: unknown
): readonly ExecutableProjectDataMockCollection[] => {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value))
    throw new TypeError(
      'Executable project Data mock collections must be an array.'
    );
  if (value.length > EXECUTABLE_PROJECT_LIMITS.maxDataMockFixtures)
    throw new TypeError(
      'Executable project contains too many Data mock collections.'
    );
  const ids = new Set<string>();
  let totalEntities = 0;
  return Object.freeze(
    value
      .map((entry, index) => {
        const label = `Executable project Data mock collection ${index}`;
        const record = assertExecutableProjectExactKeys(
          entry,
          ['id', 'entityIdKey', 'initialEntities'],
          label
        );
        const id = normalizeBoundedIdentifier(record.id, `${label}.id`);
        if (ids.has(id))
          throw new TypeError(`Duplicate Data mock collection: ${id}.`);
        ids.add(id);
        const entityIdKey = normalizeBoundedIdentifier(
          record.entityIdKey,
          `${label}.entityIdKey`
        );
        if (!Array.isArray(record.initialEntities))
          throw new TypeError(`${label}.initialEntities must be an array.`);
        totalEntities += record.initialEntities.length;
        if (totalEntities > EXECUTABLE_PROJECT_LIMITS.maxDataMockFixtures)
          throw new TypeError(
            'Executable project contains too many Data mock collection entities.'
          );
        const entityIds = new Set<string>();
        const initialEntities = Object.freeze(
          record.initialEntities.map((entity, entityIndex) => {
            const normalized = canonicalClone(
              entity,
              `${label}.initialEntities[${entityIndex}]`
            );
            if (!isPlainRecord(normalized))
              throw new TypeError(`${label} entities must be JSON objects.`);
            const entityId = normalized[entityIdKey];
            if (
              (typeof entityId !== 'string' || !entityId) &&
              (typeof entityId !== 'number' || !Number.isFinite(entityId))
            )
              throw new TypeError(
                `${label} entity ${entityIndex} has an invalid identity.`
              );
            const identity = JSON.stringify(entityId);
            if (entityIds.has(identity))
              throw new TypeError(
                `${label} contains duplicate entity identities.`
              );
            entityIds.add(identity);
            return normalized as Readonly<Record<string, ExecutionValue>>;
          })
        );
        return Object.freeze({ id, entityIdKey, initialEntities });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );
};

export const normalizeExecutableProjectDataMockProvision = (
  value: unknown
): ExecutableProjectDataMockProvision | undefined => {
  if (value === undefined) return undefined;
  const record = assertExecutableProjectExactKeys(
    value,
    ['fixtureSetId', 'emulatedAdapterIds', 'collections', 'fixtures'],
    'Executable project Data mock provision'
  );
  if (
    !Array.isArray(record.emulatedAdapterIds) ||
    !record.emulatedAdapterIds.length
  )
    throw new TypeError(
      'Executable project Data mock provision must emulate at least one adapter.'
    );
  if (!Array.isArray(record.fixtures))
    throw new TypeError(
      'Executable project Data mock fixtures must be an array.'
    );
  if (record.fixtures.length > EXECUTABLE_PROJECT_LIMITS.maxDataMockFixtures)
    throw new TypeError(
      'Executable project contains too many Data mock fixtures.'
    );
  const adapterIds = new Set<string>();
  const emulatedAdapterIds = Object.freeze(
    record.emulatedAdapterIds
      .map((adapterId, index) =>
        normalizeBoundedIdentifier(
          adapterId,
          `Executable project emulated Data adapter ${index}`
        )
      )
      .sort()
      .map((adapterId) => {
        if (adapterIds.has(adapterId))
          throw new TypeError(`Duplicate emulated Data adapter: ${adapterId}.`);
        adapterIds.add(adapterId);
        return adapterId;
      })
  );
  const fixtureIds = new Set<string>();
  const matchKeys = new Set<string>();
  const collections = normalizeDataMockCollections(record.collections);
  const collectionIds = new Set(collections.map(({ id }) => id));
  const fixtures = Object.freeze(
    record.fixtures
      .map((value, index) => {
        const label = `Executable project Data mock fixture ${index}`;
        const fixture = assertExecutableProjectExactKeys(
          value,
          [
            'id',
            'documentId',
            'operationId',
            'operationKind',
            'input',
            'behavior',
          ],
          label
        );
        const id = normalizeBoundedIdentifier(fixture.id, `${label}.id`);
        if (fixtureIds.has(id))
          throw new TypeError(`Duplicate Data mock fixture id: ${id}.`);
        fixtureIds.add(id);
        const documentId = normalizeBoundedIdentifier(
          fixture.documentId,
          `${label}.documentId`
        );
        const operationId = normalizeBoundedIdentifier(
          fixture.operationId,
          `${label}.operationId`
        );
        if (
          fixture.operationKind !== 'query' &&
          fixture.operationKind !== 'mutation'
        )
          throw new TypeError(`${label}.operationKind is unsupported.`);
        const input =
          fixture.input === undefined
            ? undefined
            : canonicalClone(fixture.input, `${label}.input`);
        const matchKey = JSON.stringify([
          documentId,
          operationId,
          fixture.operationKind,
          input === undefined ? '*' : input,
        ]);
        if (matchKeys.has(matchKey))
          throw new TypeError('Ambiguous Data mock fixture match key.');
        matchKeys.add(matchKey);
        return Object.freeze({
          id,
          documentId,
          operationId,
          operationKind: fixture.operationKind,
          ...(input === undefined ? {} : { input: input as never }),
          behavior: normalizeDataMockBehavior(
            fixture.behavior,
            `${label}.behavior`,
            collectionIds
          ),
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );
  const provision = Object.freeze({
    fixtureSetId: normalizeBoundedIdentifier(
      record.fixtureSetId,
      'Executable project Data fixture set id'
    ),
    emulatedAdapterIds,
    ...(collections.length ? { collections } : {}),
    fixtures,
  });
  const byteLength = utf8ToBytes(JSON.stringify(provision)).byteLength;
  if (byteLength > EXECUTABLE_PROJECT_LIMITS.maxDataMockProvisionBytes)
    throw new TypeError(
      'Executable project Data mock provision exceeds the size limit.'
    );
  return provision;
};

const serverRuntimeAuthorityKey = (value: string): boolean =>
  /^(authorization|cookie|setcookie|password|secret|token|accesstoken|refreshtoken|sessionid|credential|privatekey)$/u.test(
    value.replaceAll(/[-_]/gu, '').toLowerCase()
  );

const cloneServerRuntimeMockValue = (
  value: unknown,
  label: string,
  budget: { nodes: number },
  depth = 0
): ExecutionValue => {
  budget.nodes += 1;
  if (depth > 64 || budget.nodes > 65_536)
    throw new TypeError(`${label} exceeds the structural budget.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value))
    return Object.freeze(
      value.map((entry, index) =>
        cloneServerRuntimeMockValue(
          entry,
          `${label}[${index}]`,
          budget,
          depth + 1
        )
      )
    );
  if (!isPlainRecord(value))
    throw new TypeError(`${label} must contain transport-safe values.`);
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => {
      if (serverRuntimeAuthorityKey(key))
        throw new TypeError(`${label} contains forbidden authority material.`);
      return [
        key,
        cloneServerRuntimeMockValue(
          entry,
          `${label}.${key}`,
          budget,
          depth + 1
        ),
      ] as const;
    });
  return Object.freeze(Object.fromEntries(entries));
};

/** Runtime Core only owns bounded projection; Server Runtime owns the provision's semantic schema. */
export const normalizeExecutableProjectServerRuntimeMockProvision = (
  value: unknown
): ExecutableProjectServerRuntimeMockProvision | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value))
    throw new TypeError(
      'Executable project Server Runtime mock provision must be an object.'
    );
  const provision = cloneServerRuntimeMockValue(
    value,
    'Executable project Server Runtime mock provision',
    { nodes: 0 }
  );
  if (
    utf8ToBytes(JSON.stringify(provision)).byteLength >
    EXECUTABLE_PROJECT_LIMITS.maxServerRuntimeMockProvisionBytes
  )
    throw new TypeError(
      'Executable project Server Runtime mock provision exceeds the size limit.'
    );
  return provision;
};

export const cloneExecutableProjectSourceTrace = (
  value: unknown,
  label: string
): ExecutionSourceTrace => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['sourceRef', 'sourceSpan', 'label'],
    label
  );
  if (!isPlainRecord(record.sourceRef)) {
    throw new TypeError(`${label}.sourceRef must be a plain object.`);
  }
  const sourceRef = canonicalClone(
    record.sourceRef,
    `${label}.sourceRef`
  ) as DiagnosticTargetRef;
  const sourceSpan =
    record.sourceSpan === undefined
      ? undefined
      : (canonicalClone(
          record.sourceSpan,
          `${label}.sourceSpan`
        ) as SourceSpan);
  const traceLabel =
    record.label === undefined
      ? undefined
      : normalizeIdentifier(record.label, `${label}.label`);
  return Object.freeze({
    sourceRef,
    ...(sourceSpan ? { sourceSpan } : {}),
    ...(traceLabel ? { label: traceLabel } : {}),
  });
};

export const normalizeExecutableProjectWorkspaceRef = (
  value: unknown
): ExecutionWorkspaceSnapshotRef => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['workspaceId', 'snapshotId', 'partitionRevisions'],
    'Executable project workspace reference'
  );
  const partitionRevisions = record.partitionRevisions;
  if (partitionRevisions !== undefined && !isPlainRecord(partitionRevisions)) {
    throw new TypeError(
      'Executable project workspace partition revisions must be a plain object.'
    );
  }
  const normalizedPartitions = partitionRevisions
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(partitionRevisions)
            .map(([key, revision]) => [
              normalizeIdentifier(key, 'Workspace partition key'),
              normalizeIdentifier(revision, `Workspace partition ${key}`),
            ])
            .sort(([left], [right]) => left.localeCompare(right))
        )
      )
    : undefined;
  return Object.freeze({
    workspaceId: normalizeIdentifier(record.workspaceId, 'Workspace id'),
    snapshotId: normalizeIdentifier(record.snapshotId, 'Workspace snapshot id'),
    ...(normalizedPartitions
      ? { partitionRevisions: normalizedPartitions }
      : {}),
  });
};

export const normalizeExecutableProjectTarget = (
  value: unknown
): ExecutableProjectTarget => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['presetId', 'framework', 'runtime'],
    'Executable project target'
  );
  return Object.freeze({
    presetId: normalizeIdentifier(record.presetId, 'Target preset id'),
    framework: normalizeIdentifier(record.framework, 'Target framework'),
    runtime: normalizeIdentifier(record.runtime, 'Target runtime'),
  });
};

export const normalizeExecutableProjectCommand = (
  value: unknown,
  label: string
): ExecutableProjectCommand => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['command', 'args'],
    label
  );
  const args = record.args ?? [];
  if (!Array.isArray(args))
    throw new TypeError(`${label}.args must be an array.`);
  if (args.length > EXECUTABLE_PROJECT_LIMITS.maxCommandArguments) {
    throw new TypeError(`${label} contains too many arguments.`);
  }
  const normalizedArgs = Object.freeze(
    args.map((argument, index) => {
      if (typeof argument !== 'string' || argument.includes('\0')) {
        throw new TypeError(
          `${label} argument ${index} must be a safe string.`
        );
      }
      if (
        argument.length > EXECUTABLE_PROJECT_LIMITS.maxCommandArgumentLength
      ) {
        throw new TypeError(
          `${label} argument ${index} exceeds the size limit.`
        );
      }
      return argument;
    })
  );
  const command = normalizeIdentifier(record.command, `${label} command`);
  if (!(EXECUTABLE_PROJECT_COMMANDS as readonly string[]).includes(command)) {
    throw new TypeError(`${label} command is not allowlisted: ${command}.`);
  }
  return Object.freeze({
    command: command as ExecutableProjectCommandName,
    args: normalizedArgs,
  });
};

export const normalizeExecutableProjectEntrypoints = (
  value: unknown,
  files: readonly ExecutableProjectFile[]
): readonly ExecutableProjectEntrypoint[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      'Executable project entrypoints must be a non-empty array.'
    );
  }
  if (value.length > EXECUTABLE_PROJECT_LIMITS.maxEntrypoints) {
    throw new TypeError('Executable project contains too many entrypoints.');
  }
  const filePaths = new Set(files.map((file) => file.path));
  const seen = new Set<string>();
  const entrypoints = value.map((entry, index) => {
    const record = assertExecutableProjectExactKeys(
      entry,
      ['kind', 'path'],
      `Executable project entrypoint ${index}`
    );
    const kind = record.kind;
    if (
      kind !== 'preview' &&
      kind !== 'build' &&
      kind !== 'test' &&
      kind !== 'production'
    ) {
      throw new TypeError(
        `Unsupported executable project entrypoint kind: ${kind}`
      );
    }
    const path = normalizeExecutableProjectPath(record.path);
    const identity = `${kind}:${path}`;
    if (seen.has(identity)) {
      throw new TypeError(
        `Duplicate executable project entrypoint: ${identity}`
      );
    }
    if (!filePaths.has(path)) {
      throw new TypeError(
        `Executable project entrypoint does not exist: ${path}`
      );
    }
    seen.add(identity);
    return Object.freeze({ kind, path });
  });
  entrypoints.sort((left, right) =>
    left.kind === right.kind
      ? left.path.localeCompare(right.path)
      : left.kind.localeCompare(right.kind)
  );
  return Object.freeze(entrypoints);
};

const normalizeCapabilities = (
  value: unknown,
  label: string
): readonly ExecutionProviderCapability[] => {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const allowed = new Set<string>(EXECUTION_PROVIDER_CAPABILITIES);
  const seen = new Set<string>();
  const capabilities = value.map((capability) => {
    if (typeof capability !== 'string' || !allowed.has(capability)) {
      throw new TypeError(
        `${label} contains an unsupported capability: ${capability}`
      );
    }
    if (seen.has(capability)) {
      throw new TypeError(
        `${label} contains a duplicate capability: ${capability}`
      );
    }
    seen.add(capability);
    return capability as ExecutionProviderCapability;
  });
  capabilities.sort((left, right) => left.localeCompare(right));
  return Object.freeze(capabilities);
};

export const normalizeExecutableProjectCapabilityRequirements = (
  value: unknown
): ExecutableProjectCapabilityRequirements => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['preview', 'build', 'test', 'production'],
    'Executable project capability requirements'
  );
  return Object.freeze({
    preview: normalizeCapabilities(record.preview, 'Preview capabilities'),
    build: normalizeCapabilities(record.build, 'Build capabilities'),
    test: normalizeCapabilities(record.test, 'Test capabilities'),
    production: normalizeCapabilities(
      record.production ?? [],
      'Production capabilities'
    ),
  });
};

export const normalizeExecutableProjectPublicBuildConfiguration = (
  value: unknown
): readonly ExecutableProjectPublicBuildConfigurationEntry[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(
      'Executable project public build configuration must be an array.'
    );
  }
  if (
    value.length > EXECUTABLE_PROJECT_LIMITS.maxPublicBuildConfigurationEntries
  ) {
    throw new TypeError(
      'Executable project public build configuration is too large.'
    );
  }
  const seen = new Set<string>();
  const entries = value.map((entry, index) => {
    const record = assertExecutableProjectExactKeys(
      entry,
      ['name', 'value', 'classification'],
      `Executable project public build configuration ${index}`
    );
    const name = normalizeIdentifier(
      record.name,
      `Executable project public build configuration ${index} name`
    );
    if (seen.has(name)) {
      throw new TypeError(`Duplicate public build configuration name: ${name}`);
    }
    if (typeof record.value !== 'string' || record.value.includes('\0')) {
      throw new TypeError(
        `Public build configuration ${name} must be a safe string.`
      );
    }
    if (record.classification !== 'public-build') {
      throw new TypeError(
        `Public build configuration ${name} must be explicitly classified public-build.`
      );
    }
    seen.add(name);
    return Object.freeze({
      name,
      value: record.value,
      classification: 'public-build' as const,
    });
  });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return Object.freeze(entries);
};

const normalizePositiveHint = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value as number;
};

export const normalizeExecutableProjectResourceHints = (
  value: unknown
): ExecutableProjectResourceHints => {
  const record = assertExecutableProjectExactKeys(
    value ?? {},
    ['cpuCores', 'memoryMb', 'diskMb', 'timeoutMs', 'maxOutputBytes'],
    'Executable project resource hints'
  );
  return Object.freeze({
    ...(record.cpuCores === undefined
      ? {}
      : { cpuCores: normalizePositiveHint(record.cpuCores, 'CPU cores') }),
    ...(record.memoryMb === undefined
      ? {}
      : { memoryMb: normalizePositiveHint(record.memoryMb, 'Memory MB') }),
    ...(record.diskMb === undefined
      ? {}
      : { diskMb: normalizePositiveHint(record.diskMb, 'Disk MB') }),
    ...(record.timeoutMs === undefined
      ? {}
      : { timeoutMs: normalizePositiveHint(record.timeoutMs, 'Timeout') }),
    ...(record.maxOutputBytes === undefined
      ? {}
      : {
          maxOutputBytes: normalizePositiveHint(
            record.maxOutputBytes,
            'Maximum output bytes'
          ),
        }),
  });
};

export const normalizeExecutableProjectCacheHints = (
  value: unknown
): ExecutableProjectCacheHints => {
  const record = assertExecutableProjectExactKeys(
    value ?? { dependencyInstall: 'reuse-if-matched' },
    ['dependencyInstall'],
    'Executable project cache hints'
  );
  if (
    record.dependencyInstall !== 'reuse-if-matched' &&
    record.dependencyInstall !== 'isolated'
  ) {
    throw new TypeError(
      'Unsupported executable project dependency cache policy.'
    );
  }
  return Object.freeze({ dependencyInstall: record.dependencyInstall });
};

export const normalizeExecutableProjectBuildPlan = (
  value: unknown
): ExecutableProjectBuildPlan => {
  const record = assertExecutableProjectExactKeys(
    value ?? {},
    ['outputDirectoryPath'],
    'Executable project build plan'
  );
  return Object.freeze({
    outputDirectoryPath: normalizeExecutableProjectPath(
      record.outputDirectoryPath ??
        DEFAULT_EXECUTABLE_PROJECT_BUILD_OUTPUT_DIRECTORY
    ),
  });
};

export const normalizeExecutableProjectPreviewPlan = (
  value: unknown,
  buildCommand: ExecutableProjectCommand,
  buildPlan: ExecutableProjectBuildPlan
): ExecutableProjectPreviewPlan => {
  const record = assertExecutableProjectExactKeys(
    value ?? {},
    ['mode', 'command', 'outputDirectoryPath', 'entryFilePath'],
    'Executable project preview plan'
  );
  const mode = record.mode ?? 'static-bundle';
  if (mode !== 'static-bundle')
    throw new TypeError(`Unsupported executable project preview mode: ${mode}`);
  return Object.freeze({
    mode,
    command: normalizeExecutableProjectCommand(
      record.command ?? buildCommand,
      'Executable project static preview command'
    ),
    outputDirectoryPath: normalizeExecutableProjectPath(
      record.outputDirectoryPath ?? buildPlan.outputDirectoryPath
    ),
    entryFilePath: normalizeExecutableProjectPath(
      record.entryFilePath ?? DEFAULT_EXECUTABLE_PROJECT_PREVIEW_ENTRY_FILE
    ),
  });
};

export const normalizeExecutableProjectTestPlan = (
  value: unknown
): ExecutableProjectTestPlan => {
  const record = assertExecutableProjectExactKeys(
    value ?? {},
    ['framework', 'command', 'reportFilePath'],
    'Executable project test plan'
  );
  const framework = record.framework ?? 'vitest';
  if (framework !== 'vitest') {
    throw new TypeError(
      `Unsupported executable project test framework: ${framework}`
    );
  }
  const reportFilePath = normalizeExecutableProjectPath(
    record.reportFilePath ?? DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH
  );
  return Object.freeze({
    framework,
    command: normalizeExecutableProjectCommand(
      record.command ?? createDefaultTestCommand(reportFilePath),
      'Executable project test command'
    ),
    reportFilePath,
  });
};

export const normalizeExecutableProjectServerFunctionPlan = (
  value: unknown
): ExecutableProjectServerFunctionPlan | undefined => {
  if (value === undefined) return undefined;
  const record = assertExecutableProjectExactKeys(
    value,
    [
      'format',
      'command',
      'invocationFilePath',
      'resultFilePath',
      'entrypointFilePath',
      'sourceFilePath',
      'functionRef',
      'runtimeManifest',
    ],
    'Executable project Server Function plan'
  );
  const format =
    record.format ?? EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT;
  if (format !== EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT)
    throw new TypeError(
      'Executable project Server Function plan format is unsupported.'
    );
  const reference = assertExecutableProjectExactKeys(
    record.functionRef,
    ['artifactId', 'exportName'],
    'Executable project Server Function reference'
  );
  const artifactId = normalizeBoundedIdentifier(
    reference.artifactId,
    'Executable project Server Function artifact id',
    256
  );
  const exportName = normalizeBoundedIdentifier(
    reference.exportName,
    'Executable project Server Function export name',
    256
  );
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(artifactId) ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)
  )
    throw new TypeError(
      'Executable project Server Function reference is invalid.'
    );
  const runtimeManifest = canonicalClone(
    record.runtimeManifest,
    'Executable project Server Function runtime manifest'
  ) as ExecutionValue;
  if (
    utf8ToBytes(JSON.stringify(runtimeManifest)).byteLength >
    EXECUTABLE_PROJECT_LIMITS.maxServerRuntimeMockProvisionBytes
  )
    throw new TypeError(
      'Executable project Server Function runtime manifest exceeds the size limit.'
    );
  return Object.freeze({
    format,
    command: normalizeExecutableProjectCommand(
      record.command,
      'Executable project Server Function command'
    ),
    invocationFilePath: normalizeExecutableProjectPath(
      record.invocationFilePath ??
        DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_INVOCATION_PATH
    ),
    resultFilePath: normalizeExecutableProjectPath(
      record.resultFilePath ??
        DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_RESULT_PATH
    ),
    entrypointFilePath: normalizeExecutableProjectPath(
      record.entrypointFilePath
    ),
    sourceFilePath: normalizeExecutableProjectPath(record.sourceFilePath),
    functionRef: Object.freeze({ artifactId, exportName }),
    runtimeManifest,
  });
};

export const normalizeExecutableProjectCommands = (
  record: Record<string, unknown>
) =>
  Object.freeze({
    installCommand: normalizeExecutableProjectCommand(
      record.installCommand ?? DEFAULT_INSTALL_COMMAND,
      'Executable project install command'
    ),
    previewCommand: normalizeExecutableProjectCommand(
      record.previewCommand ?? DEFAULT_PREVIEW_COMMAND,
      'Executable project preview command'
    ),
    buildCommand: normalizeExecutableProjectCommand(
      record.buildCommand ?? DEFAULT_BUILD_COMMAND,
      'Executable project build command'
    ),
  });
