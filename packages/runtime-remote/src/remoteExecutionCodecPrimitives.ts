import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';
import {
  createExecutionProviderDescriptor,
  createExecutionRequest,
  type ExecutionProviderDescriptor,
  type ExecutionRequest,
  type ExecutionSourceTrace,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { REMOTE_EXECUTION_PROTOCOL_LIMITS } from './remoteExecutionProtocol.types';

export const isPlainRecord = (
  value: unknown
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const exactRecord = (
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new TypeError(`${label} contains unsupported field: ${unexpected}.`);
  }
  const missing = requiredKeys.find(
    (key) => !Object.prototype.hasOwnProperty.call(value, key)
  );
  if (missing) throw new TypeError(`${label} is missing field: ${missing}.`);
  return value;
};

export const normalizedString = (value: unknown, label: string): string => {
  if (typeof value !== 'string')
    throw new TypeError(`${label} must be a string.`);
  const normalized = value.trim();
  if (
    !normalized ||
    normalized !== value ||
    normalized.includes('\0') ||
    normalized.length > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxIdentifierLength
  ) {
    throw new TypeError(`${label} must be a normalized non-empty string.`);
  }
  return normalized;
};

export const sha256Digest = (value: unknown, label: string): string => {
  const digest = normalizedString(value, label);
  if (!/^sha256-[a-f0-9]{64}$/u.test(digest)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return digest;
};

export const safeString = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    value.length > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxStringLength
  ) {
    throw new TypeError(`${label} must be a safe string.`);
  }
  return value;
};

export const safeInteger = (
  value: unknown,
  label: string,
  minimum = 0
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}.`);
  }
  return value as number;
};

export const optionalSafeInteger = (
  value: unknown,
  label: string,
  minimum = 0
): number | undefined =>
  value === undefined ? undefined : safeInteger(value, label, minimum);

export const booleanValue = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean')
    throw new TypeError(`${label} must be boolean.`);
  return value;
};

export const stringRecord = (
  value: unknown,
  label: string
): Readonly<Record<string, string>> => {
  const record = exactRecord(
    value,
    isPlainRecord(value) ? Object.keys(value) : [],
    [],
    label
  );
  if (
    Object.keys(record).length >
    REMOTE_EXECUTION_PROTOCOL_LIMITS.maxRecordEntries
  ) {
    throw new TypeError(`${label} contains too many entries.`);
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(record)
        .map(([key, entry]) => [
          normalizedString(key, `${label} key`),
          normalizedString(entry, `${label}.${key}`),
        ])
        .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    )
  );
};

export const executionValue = (
  value: unknown,
  label: string,
  depth = 0,
  state: { nodes: number } = { nodes: 0 }
): ExecutionValue => {
  state.nodes += 1;
  if (state.nodes > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxValueNodes) {
    throw new TypeError(`${label} exceeds the node limit.`);
  }
  if (depth > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxValueDepth) {
    throw new TypeError(`${label} exceeds the depth limit.`);
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    if (
      typeof value === 'string' &&
      value.length > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxStringLength
    ) {
      throw new TypeError(`${label} exceeds the string limit.`);
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxArrayEntries) {
      throw new TypeError(`${label} exceeds the array limit.`);
    }
    return Object.freeze(
      value.map((entry, index) =>
        executionValue(entry, `${label}[${index}]`, depth + 1, state)
      )
    );
  }
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must contain transport-safe values.`);
  }
  if (
    Object.keys(value).length >
    REMOTE_EXECUTION_PROTOCOL_LIMITS.maxRecordEntries
  ) {
    throw new TypeError(`${label} exceeds the record limit.`);
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
        .map(([key, entry]) => [
          key,
          executionValue(entry, `${label}.${key}`, depth + 1, state),
        ])
    )
  );
};

const targetShapes: Readonly<
  Record<
    string,
    Readonly<{ required: readonly string[]; optional?: readonly string[] }>
  >
> = Object.freeze({
  workspace: { required: ['workspaceId'] },
  'workspace-node': { required: ['workspaceId', 'nodeId'] },
  document: { required: ['documentId'], optional: ['workspaceId'] },
  'pir-node': { required: ['documentId', 'nodeId'] },
  'inspector-field': {
    required: ['documentId', 'nodeId', 'fieldPath'],
  },
  route: { required: ['routeId'] },
  'nodegraph-node': { required: ['documentId', 'nodeId'] },
  'nodegraph-port': { required: ['documentId', 'nodeId', 'portId'] },
  'animation-timeline': { required: ['documentId', 'timelineId'] },
  'animation-track': {
    required: ['documentId', 'timelineId', 'bindingId', 'trackId'],
  },
  'data-source': { required: ['documentId'] },
  'data-operation': { required: ['documentId', 'operationId'] },
  'code-artifact': { required: ['artifactId'] },
  operation: { required: ['operation'] },
  'theme-token': { required: ['themeId', 'tokenPath'] },
  viewport: { required: ['width', 'height'], optional: ['routeId'] },
  'runtime-dom': { required: ['stablePath'], optional: ['routeId'] },
  'component-slot': {
    required: ['documentId', 'nodeId', 'slotName'],
  },
});

export const diagnosticTargetRef = (
  value: unknown,
  label: string
): DiagnosticTargetRef => {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const kind = normalizedString(value.kind, `${label}.kind`);
  const shape = targetShapes[kind];
  if (!shape) throw new TypeError(`${label} has unsupported kind: ${kind}.`);
  const record = exactRecord(
    value,
    ['kind', ...shape.required, ...(shape.optional ?? [])],
    ['kind', ...shape.required],
    label
  );
  const output: Record<string, string | number> = { kind };
  [...shape.required, ...(shape.optional ?? [])].forEach((key) => {
    const entry = record[key];
    if (entry === undefined) return;
    output[key] =
      kind === 'viewport' && (key === 'width' || key === 'height')
        ? safeInteger(entry, `${label}.${key}`, 1)
        : normalizedString(entry, `${label}.${key}`);
  });
  return Object.freeze(output) as DiagnosticTargetRef;
};

export const sourceSpan = (value: unknown, label: string): SourceSpan => {
  const record = exactRecord(
    value,
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    label
  );
  return Object.freeze({
    artifactId: normalizedString(record.artifactId, `${label}.artifactId`),
    startLine: safeInteger(record.startLine, `${label}.startLine`, 1),
    startColumn: safeInteger(record.startColumn, `${label}.startColumn`, 1),
    endLine: safeInteger(record.endLine, `${label}.endLine`, 1),
    endColumn: safeInteger(record.endColumn, `${label}.endColumn`, 1),
  });
};

export const sourceTraces = (
  value: unknown,
  label: string
): readonly ExecutionSourceTrace[] => {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  if (value.length > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxSourceTraces) {
    throw new TypeError(`${label} contains too many source traces.`);
  }
  return Object.freeze(
    value.map((entry, index) => {
      const itemLabel = `${label}[${index}]`;
      const record = exactRecord(
        entry,
        ['sourceRef', 'sourceSpan', 'label'],
        ['sourceRef'],
        itemLabel
      );
      return Object.freeze({
        sourceRef: diagnosticTargetRef(
          record.sourceRef,
          `${itemLabel}.sourceRef`
        ),
        ...(record.sourceSpan === undefined
          ? {}
          : {
              sourceSpan: sourceSpan(
                record.sourceSpan,
                `${itemLabel}.sourceSpan`
              ),
            }),
        ...(record.label === undefined
          ? {}
          : { label: normalizedString(record.label, `${itemLabel}.label`) }),
      });
    })
  );
};

export const providerDescriptor = (
  value: unknown,
  label: string
): ExecutionProviderDescriptor => {
  const record = exactRecord(
    value,
    [
      'id',
      'version',
      'displayName',
      'isolation',
      'profiles',
      'runtimeZones',
      'invocationKinds',
      'capabilities',
    ],
    [
      'id',
      'version',
      'isolation',
      'profiles',
      'runtimeZones',
      'invocationKinds',
      'capabilities',
    ],
    label
  );
  return createExecutionProviderDescriptor(record as never);
};

export const executionRequest = (
  value: unknown,
  label: string
): ExecutionRequest => {
  const record = exactRecord(
    value,
    [
      'requestId',
      'profile',
      'runtimeZone',
      'workspace',
      'environment',
      'invocation',
      'requiredCapabilities',
      'timeoutMs',
      'metadata',
    ],
    [
      'requestId',
      'profile',
      'runtimeZone',
      'workspace',
      'invocation',
      'requiredCapabilities',
    ],
    label
  );
  const workspace = exactRecord(
    record.workspace,
    ['workspaceId', 'snapshotId', 'partitionRevisions'],
    ['workspaceId', 'snapshotId'],
    `${label}.workspace`
  );
  const invocation = exactRecord(
    record.invocation,
    ['kind', 'targetRef', 'entrypoint', 'input'],
    ['kind', 'targetRef'],
    `${label}.invocation`
  );
  const environment =
    record.environment === undefined
      ? undefined
      : exactRecord(
          record.environment,
          ['environmentId', 'revision', 'mode'],
          ['environmentId', 'revision', 'mode'],
          `${label}.environment`
        );
  return createExecutionRequest({
    requestId: normalizedString(record.requestId, `${label}.requestId`),
    profile: record.profile as never,
    runtimeZone: record.runtimeZone as never,
    workspace: {
      workspaceId: normalizedString(
        workspace.workspaceId,
        `${label}.workspace.workspaceId`
      ),
      snapshotId: normalizedString(
        workspace.snapshotId,
        `${label}.workspace.snapshotId`
      ),
      ...(workspace.partitionRevisions === undefined
        ? {}
        : {
            partitionRevisions: stringRecord(
              workspace.partitionRevisions,
              `${label}.workspace.partitionRevisions`
            ),
          }),
    },
    ...(environment
      ? {
          environment: {
            environmentId: normalizedString(
              environment.environmentId,
              `${label}.environment.environmentId`
            ),
            revision: normalizedString(
              environment.revision,
              `${label}.environment.revision`
            ),
            mode: environment.mode as never,
          },
        }
      : {}),
    invocation: {
      kind: invocation.kind as never,
      targetRef: diagnosticTargetRef(
        invocation.targetRef,
        `${label}.invocation.targetRef`
      ),
      ...(invocation.entrypoint === undefined
        ? {}
        : {
            entrypoint: normalizedString(
              invocation.entrypoint,
              `${label}.invocation.entrypoint`
            ),
          }),
      ...(invocation.input === undefined
        ? {}
        : {
            input: executionValue(
              invocation.input,
              `${label}.invocation.input`
            ),
          }),
    },
    requiredCapabilities: record.requiredCapabilities as never,
    ...(record.timeoutMs === undefined
      ? {}
      : { timeoutMs: safeInteger(record.timeoutMs, `${label}.timeoutMs`, 1) }),
    ...(record.metadata === undefined
      ? {}
      : { metadata: stringRecord(record.metadata, `${label}.metadata`) }),
  });
};

const diagnosticDomains = new Set([
  'pir',
  'workspace',
  'plugin',
  'route',
  'editor',
  'ux',
  'code',
  'nodegraph',
  'animation',
  'data',
  'codegen',
  'backend',
  'semantic',
  'ai',
]);

export const diagnostic = (
  value: unknown,
  label: string
): ProdivixDiagnostic => {
  const record = exactRecord(
    value,
    [
      'code',
      'severity',
      'domain',
      'message',
      'hint',
      'docsUrl',
      'retryable',
      'meta',
      'targetRef',
      'sourceSpan',
      'quickFixes',
    ],
    ['code', 'severity', 'domain', 'message'],
    label
  );
  const severity = normalizedString(record.severity, `${label}.severity`);
  if (!['info', 'warning', 'error', 'fatal'].includes(severity)) {
    throw new TypeError(`${label}.severity is unsupported.`);
  }
  const domain = normalizedString(record.domain, `${label}.domain`);
  if (!diagnosticDomains.has(domain)) {
    throw new TypeError(`${label}.domain is unsupported.`);
  }
  if (record.quickFixes !== undefined) {
    throw new TypeError(`${label}.quickFixes is not transport-supported.`);
  }
  return Object.freeze({
    code: normalizedString(record.code, `${label}.code`),
    severity: severity as ProdivixDiagnostic['severity'],
    domain: domain as ProdivixDiagnostic['domain'],
    message: safeString(record.message, `${label}.message`),
    ...(record.hint === undefined
      ? {}
      : { hint: safeString(record.hint, `${label}.hint`) }),
    ...(record.docsUrl === undefined
      ? {}
      : { docsUrl: normalizedString(record.docsUrl, `${label}.docsUrl`) }),
    ...(record.retryable === undefined
      ? {}
      : { retryable: booleanValue(record.retryable, `${label}.retryable`) }),
    ...(record.meta === undefined
      ? {}
      : {
          meta: executionValue(record.meta, `${label}.meta`) as Record<
            string,
            unknown
          >,
        }),
    ...(record.targetRef === undefined
      ? {}
      : {
          targetRef: diagnosticTargetRef(
            record.targetRef,
            `${label}.targetRef`
          ),
        }),
    ...(record.sourceSpan === undefined
      ? {}
      : { sourceSpan: sourceSpan(record.sourceSpan, `${label}.sourceSpan`) }),
  });
};
