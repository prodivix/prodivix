import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeExecutableProjectPath } from './executableProjectNormalization';
import type {
  ExecutionSourceTrace,
  ExecutionWorkspaceSnapshotRef,
} from './execution.types';
import {
  EXECUTION_FILESYSTEM_DIFF_FORMAT,
  EXECUTION_FILESYSTEM_DIFF_LIMITS,
  type ExecutionFilesystemDiff,
  type ExecutionFilesystemDiffChange,
  type ExecutionFilesystemDiffChangeInput,
  type ExecutionFilesystemDiffContent,
  type ExecutionFilesystemDiffInput,
} from './executionFilesystemDiff.types';

type JsonRecord = Record<string, unknown>;

const exactRecord = (
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object.`);
  const record = value as JsonRecord;
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(record).find((key) => !allowed.has(key));
  if (unknownKey)
    throw new TypeError(`${label} has unsupported field: ${unknownKey}.`);
  const missingKey = requiredKeys.find((key) => record[key] === undefined);
  if (missingKey) throw new TypeError(`${label}.${missingKey} is required.`);
  return record;
};

const normalizedString = (
  value: unknown,
  label: string,
  maximumLength = EXECUTION_FILESYSTEM_DIFF_LIMITS.maxStringLength
): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > maximumLength
  )
    throw new TypeError(`${label} must be a normalized string.`);
  return value;
};

const canonicalDigest = (value: unknown, label: string): string => {
  const result = normalizedString(value, label);
  if (!/^sha256-[a-f0-9]{64}$/u.test(result))
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  return result;
};

const encodeBase64 = (contents: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < contents.byteLength; index += 1)
    binary += String.fromCharCode(contents[index]!);
  return (globalThis as unknown as { btoa(value: string): string }).btoa(
    binary
  );
};

const decodeBase64 = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  )
    throw new TypeError(`${label} must be canonical base64.`);
  const binary = (
    globalThis as unknown as { atob(encoded: string): string }
  ).atob(value);
  const contents = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  );
  if (encodeBase64(contents) !== value)
    throw new TypeError(`${label} must use canonical base64 padding.`);
  return contents;
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
  'inspector-field': { required: ['documentId', 'nodeId', 'fieldPath'] },
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
  'component-slot': { required: ['documentId', 'nodeId', 'slotName'] },
});

const decodeTargetRef = (
  value: unknown,
  label: string
): DiagnosticTargetRef => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object.`);
  const input = exactRecord(value, Object.keys(value), ['kind'], label);
  const kind = normalizedString(input.kind, `${label}.kind`);
  const shape = targetShapes[kind];
  if (!shape) throw new TypeError(`${label} has unsupported kind: ${kind}.`);
  const record = exactRecord(
    value,
    ['kind', ...shape.required, ...(shape.optional ?? [])],
    ['kind', ...shape.required],
    label
  );
  const output: Record<string, string | number> = { kind };
  for (const key of [...shape.required, ...(shape.optional ?? [])]) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (kind === 'viewport' && (key === 'width' || key === 'height')) {
      if (!Number.isSafeInteger(entry) || (entry as number) < 1)
        throw new TypeError(`${label}.${key} must be a positive integer.`);
      output[key] = entry as number;
    } else output[key] = normalizedString(entry, `${label}.${key}`);
  }
  return Object.freeze(output) as DiagnosticTargetRef;
};

const decodeSourceSpan = (value: unknown, label: string): SourceSpan => {
  const record = exactRecord(
    value,
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    label
  );
  const integer = (key: string): number => {
    const entry = record[key];
    if (!Number.isSafeInteger(entry) || (entry as number) < 1)
      throw new TypeError(`${label}.${key} must be a positive integer.`);
    return entry as number;
  };
  return Object.freeze({
    artifactId: normalizedString(record.artifactId, `${label}.artifactId`),
    startLine: integer('startLine'),
    startColumn: integer('startColumn'),
    endLine: integer('endLine'),
    endColumn: integer('endColumn'),
  });
};

const decodeSourceTrace = (
  value: unknown,
  label: string
): readonly ExecutionSourceTrace[] => {
  if (!Array.isArray(value) || !value.length)
    throw new TypeError(`${label} must be a non-empty array.`);
  if (value.length > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxSourceTracesPerChange)
    throw new TypeError(`${label} contains too many entries.`);
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
        sourceRef: decodeTargetRef(record.sourceRef, `${itemLabel}.sourceRef`),
        ...(record.sourceSpan === undefined
          ? {}
          : {
              sourceSpan: decodeSourceSpan(
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

const decodeWorkspace = (value: unknown): ExecutionWorkspaceSnapshotRef => {
  const record = exactRecord(
    value,
    ['workspaceId', 'snapshotId', 'partitionRevisions'],
    ['workspaceId', 'snapshotId'],
    'Execution filesystem diff workspace'
  );
  let partitionRevisions: Readonly<Record<string, string>> | undefined;
  if (record.partitionRevisions !== undefined) {
    const revisions = exactRecord(
      record.partitionRevisions,
      Object.keys(record.partitionRevisions as object),
      [],
      'Execution filesystem diff partition revisions'
    );
    const entries = Object.entries(revisions).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    if (entries.length > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxPartitionRevisions)
      throw new TypeError('Execution filesystem diff has too many revisions.');
    partitionRevisions = Object.freeze(
      Object.fromEntries(
        entries.map(([key, revision]) => [
          normalizedString(key, 'Filesystem revision key'),
          normalizedString(revision, `Filesystem revision ${key}`),
        ])
      )
    );
  }
  return Object.freeze({
    workspaceId: normalizedString(record.workspaceId, 'Filesystem workspaceId'),
    snapshotId: normalizedString(record.snapshotId, 'Filesystem snapshotId'),
    ...(partitionRevisions ? { partitionRevisions } : {}),
  });
};

const decodeContent = (
  value: unknown,
  label: string
): ExecutionFilesystemDiffContent => {
  const record = exactRecord(
    value,
    ['encoding', 'size', 'digest', 'contents'],
    ['encoding', 'size', 'digest', 'contents'],
    label
  );
  if (record.encoding !== 'base64')
    throw new TypeError(`${label}.encoding is unsupported.`);
  const contents = decodeBase64(record.contents, `${label}.contents`);
  if (
    !Number.isSafeInteger(record.size) ||
    record.size !== contents.byteLength ||
    contents.byteLength > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxFileBytes
  )
    throw new TypeError(`${label}.size is invalid.`);
  const expectedDigest = `sha256-${bytesToHex(sha256(contents))}`;
  if (canonicalDigest(record.digest, `${label}.digest`) !== expectedDigest)
    throw new TypeError(`${label}.digest does not match its contents.`);
  return Object.freeze({
    size: contents.byteLength,
    digest: expectedDigest,
    contents,
  });
};

const changeId = (
  kind: ExecutionFilesystemDiffChange['kind'],
  path: string,
  baselineDigest: string,
  runtimeDigest: string
): string =>
  `filesystem-change:${bytesToHex(
    sha256(utf8ToBytes(`${kind}\n${path}\n${baselineDigest}\n${runtimeDigest}`))
  )}`;

const decodeChange = (
  value: unknown,
  index: number
): ExecutionFilesystemDiffChange => {
  const label = `Execution filesystem diff change ${index}`;
  const record = exactRecord(
    value,
    ['changeId', 'kind', 'path', 'baseline', 'runtime', 'sourceTrace'],
    ['changeId', 'kind', 'path'],
    label
  );
  if (!['added', 'modified', 'deleted'].includes(String(record.kind)))
    throw new TypeError(`${label}.kind is unsupported.`);
  const kind = record.kind as ExecutionFilesystemDiffChange['kind'];
  const path = normalizeExecutableProjectPath(record.path);
  if (path.length > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxPathLength)
    throw new TypeError(`${label}.path is too long.`);
  const baseline =
    record.baseline === undefined
      ? undefined
      : decodeContent(record.baseline, `${label}.baseline`);
  const runtime =
    record.runtime === undefined
      ? undefined
      : decodeContent(record.runtime, `${label}.runtime`);
  if (
    (kind === 'added' && (baseline || !runtime)) ||
    (kind === 'modified' && (!baseline || !runtime)) ||
    (kind === 'deleted' && (!baseline || runtime)) ||
    (kind === 'modified' && baseline?.digest === runtime?.digest)
  )
    throw new TypeError(`${label} content does not match its change kind.`);
  const expectedChangeId = changeId(
    kind,
    path,
    baseline?.digest ?? '-',
    runtime?.digest ?? '-'
  );
  if (record.changeId !== expectedChangeId)
    throw new TypeError(`${label}.changeId is not canonical.`);
  return Object.freeze({
    changeId: expectedChangeId,
    kind,
    path,
    ...(baseline ? { baseline } : {}),
    ...(runtime ? { runtime } : {}),
    ...(record.sourceTrace === undefined
      ? {}
      : {
          sourceTrace: decodeSourceTrace(
            record.sourceTrace,
            `${label}.sourceTrace`
          ),
        }),
  });
};

const toWireContent = (content: Readonly<{ contents: Uint8Array }>) => {
  const contents = new Uint8Array(content.contents);
  return {
    encoding: 'base64',
    size: contents.byteLength,
    digest: `sha256-${bytesToHex(sha256(contents))}`,
    contents: encodeBase64(contents),
  };
};

const toWireChange = (change: ExecutionFilesystemDiffChangeInput) => {
  const path = normalizeExecutableProjectPath(change.path);
  const baseline = change.baseline ? toWireContent(change.baseline) : undefined;
  const runtime = change.runtime ? toWireContent(change.runtime) : undefined;
  return {
    changeId: changeId(
      change.kind,
      path,
      baseline?.digest ?? '-',
      runtime?.digest ?? '-'
    ),
    kind: change.kind,
    path,
    ...(baseline ? { baseline } : {}),
    ...(runtime ? { runtime } : {}),
    ...(change.sourceTrace?.length ? { sourceTrace: change.sourceTrace } : {}),
  };
};

const toWire = (
  diff: ExecutionFilesystemDiff | ExecutionFilesystemDiffInput
) => ({
  format: EXECUTION_FILESYSTEM_DIFF_FORMAT,
  snapshotDigest: diff.snapshotDigest,
  workspace: diff.workspace,
  capturedAt: diff.capturedAt,
  complete: diff.complete,
  changes: diff.changes.map((change) => toWireChange(change)),
});

/** Strictly decodes bounded sandbox filesystem observations. */
export const decodeExecutionFilesystemDiff = (
  value: string | Uint8Array
): ExecutionFilesystemDiff => {
  const text =
    typeof value === 'string'
      ? value
      : new (
          globalThis as unknown as {
            TextDecoder: new (
              label?: string,
              options?: Readonly<{ fatal?: boolean }>
            ) => { decode(input: Uint8Array): string };
          }
        ).TextDecoder('utf-8', { fatal: true }).decode(value);
  if (
    utf8ToBytes(text).byteLength >
    EXECUTION_FILESYSTEM_DIFF_LIMITS.maxPayloadBytes
  )
    throw new TypeError('Execution filesystem diff payload is too large.');
  const record = exactRecord(
    JSON.parse(text) as unknown,
    [
      'format',
      'snapshotDigest',
      'workspace',
      'capturedAt',
      'complete',
      'changes',
    ],
    [
      'format',
      'snapshotDigest',
      'workspace',
      'capturedAt',
      'complete',
      'changes',
    ],
    'Execution filesystem diff'
  );
  if (record.format !== EXECUTION_FILESYSTEM_DIFF_FORMAT)
    throw new TypeError('Execution filesystem diff format is unsupported.');
  if (
    !Number.isSafeInteger(record.capturedAt) ||
    (record.capturedAt as number) < 0 ||
    typeof record.complete !== 'boolean' ||
    !Array.isArray(record.changes) ||
    record.changes.length > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxChanges
  )
    throw new TypeError('Execution filesystem diff envelope is invalid.');
  let previousPath = '';
  let totalBytes = 0;
  const changes = record.changes.map((entry, index) => {
    const change = decodeChange(entry, index);
    if (previousPath && change.path <= previousPath)
      throw new TypeError(
        'Execution filesystem diff changes must be uniquely sorted by path.'
      );
    previousPath = change.path;
    totalBytes += (change.baseline?.size ?? 0) + (change.runtime?.size ?? 0);
    if (totalBytes > EXECUTION_FILESYSTEM_DIFF_LIMITS.maxTotalContentBytes)
      throw new TypeError(
        'Execution filesystem diff exceeds the content budget.'
      );
    return change;
  });
  return Object.freeze({
    format: EXECUTION_FILESYSTEM_DIFF_FORMAT,
    snapshotDigest: canonicalDigest(
      record.snapshotDigest,
      'Filesystem snapshot digest'
    ),
    workspace: decodeWorkspace(record.workspace),
    capturedAt: record.capturedAt as number,
    complete: record.complete as boolean,
    changes: Object.freeze(changes),
  });
};

/** Creates a canonical diff while deriving all content digests and stable change ids. */
export const createExecutionFilesystemDiff = (
  input: ExecutionFilesystemDiffInput
): ExecutionFilesystemDiff =>
  decodeExecutionFilesystemDiff(JSON.stringify(toWire(input)));

/** Encodes the canonical wire shape used by durable Remote artifacts. */
export const encodeExecutionFilesystemDiff = (
  diff: ExecutionFilesystemDiff
): Uint8Array =>
  utf8ToBytes(JSON.stringify(toWire(createExecutionFilesystemDiff(diff))));
