import {
  resolveWorkspaceCommandDomain,
  type WorkspaceCommandDomain,
  type WorkspaceCommandEnvelope,
  type WorkspaceOperation,
  type WorkspacePatchOperation,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';

export type WorkspaceOperationCommitDocumentExpectation = {
  id: string;
  contentRev?: number | null;
  metaRev?: number | null;
};

export type WorkspaceOperationCommitExpectedRevisions = {
  workspaceRev?: number;
  routeRev?: number;
  documents: WorkspaceOperationCommitDocumentExpectation[];
};

export type WorkspaceOperationCommitRequest = {
  expected: WorkspaceOperationCommitExpectedRevisions;
  operation: WorkspaceOperation;
};

export type WorkspaceOperationCommitPlanIssueCode =
  | 'WKS_SYNC_COMMIT_OPERATION_INVALID'
  | 'WKS_SYNC_COMMIT_WORKSPACE_MISMATCH'
  | 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED'
  | 'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID'
  | 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET';

export type WorkspaceOperationCommitPlanIssue = {
  code: WorkspaceOperationCommitPlanIssueCode;
  path: string;
  message: string;
  commandId?: string;
  documentId?: string;
};

export type WorkspaceOperationCommitPlanResult =
  | { ok: true; request: WorkspaceOperationCommitRequest }
  | { ok: false; issues: WorkspaceOperationCommitPlanIssue[] };

export const issue = (
  code: WorkspaceOperationCommitPlanIssueCode,
  path: string,
  message: string,
  commandId?: string,
  documentId?: string
): WorkspaceOperationCommitPlanIssue => ({
  code,
  path,
  message,
  ...(commandId ? { commandId } : {}),
  ...(documentId ? { documentId } : {}),
});

export const parsePointer = (path: string): string[] | null => {
  if (path === '') return [];
  if (!path.startsWith('/')) return null;
  const segments: string[] = [];
  for (const rawSegment of path.slice(1).split('/')) {
    let segment = '';
    for (let index = 0; index < rawSegment.length; index += 1) {
      const character = rawSegment[index];
      if (character !== '~') {
        segment += character;
        continue;
      }
      const escaped = rawSegment[index + 1];
      if (escaped === '0') segment += '~';
      else if (escaped === '1') segment += '/';
      else return null;
      index += 1;
    }
    segments.push(segment);
  }
  return segments;
};

const inferNamespaceDomain = (
  namespace: string
): WorkspaceCommandDomain | undefined => {
  if (namespace.startsWith('core.nodegraph')) return 'nodegraph';
  if (namespace.startsWith('core.animation')) return 'animation';
  if (namespace.startsWith('core.code')) return 'code';
  if (namespace.startsWith('core.resource')) return 'resource';
  if (namespace.startsWith('core.route')) return 'route';
  if (namespace.startsWith('core.workspace')) return 'workspace';
  if (namespace.startsWith('core.pir')) return 'pir';
  return undefined;
};

export const validateCommandTargetAndDomain = (
  command: WorkspaceCommandEnvelope,
  commandIndex: number
): WorkspaceOperationCommitPlanIssue | null => {
  const inferredDomain = inferNamespaceDomain(command.namespace);
  const resolvedDomain = resolveWorkspaceCommandDomain(command);
  if (
    command.domainHint &&
    inferredDomain &&
    command.domainHint !== inferredDomain
  ) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      `/commands/${commandIndex}/domainHint`,
      'Command domainHint must agree with its canonical namespace.',
      command.id
    );
  }
  if (command.target.documentId && command.target.routeNodeId) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      `/commands/${commandIndex}/target`,
      'A command cannot target both a document and a route node.',
      command.id,
      command.target.documentId
    );
  }
  if (command.target.documentId && !inferredDomain && !command.domainHint) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      `/commands/${commandIndex}/domainHint`,
      'A document-targeted command with a custom namespace must declare its document domain explicitly.',
      command.id,
      command.target.documentId
    );
  }
  if (command.target.routeNodeId && resolvedDomain !== 'route') {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      `/commands/${commandIndex}/target/routeNodeId`,
      'routeNodeId requires a route-domain command.',
      command.id
    );
  }
  return null;
};

const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const isCanonicalRequiredString = (value: string): boolean =>
  Boolean(value) && value === value.trim();

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number =>
  [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ] ?? 0;

const isRfc3339Timestamp = (value: string): boolean => {
  if (value !== value.trim()) return false;
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) return false;
  const [
    ,
    yearRaw,
    monthRaw,
    dayRaw,
    hourRaw,
    minuteRaw,
    secondRaw,
    ,
    offsetHourRaw,
    offsetMinuteRaw,
  ] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const offsetHour = offsetHourRaw === undefined ? 0 : Number(offsetHourRaw);
  const offsetMinute =
    offsetMinuteRaw === undefined ? 0 : Number(offsetMinuteRaw);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
};

type WorkspaceOperationWireNormalizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: WorkspaceOperationCommitPlanIssue };

type WireRecord = Record<string, unknown>;

const COMMAND_OPERATION_FIELDS = new Set([
  'kind',
  'command',
  'undoOf',
  'redoOf',
  'sourceOperationIds',
]);
const TRANSACTION_OPERATION_FIELDS = new Set([
  'kind',
  'transaction',
  'undoOf',
  'redoOf',
  'sourceOperationIds',
]);
const TRANSACTION_FIELDS = new Set([
  'id',
  'workspaceId',
  'issuedAt',
  'commands',
  'label',
  'mergeKey',
]);
const COMMAND_FIELDS = new Set([
  'id',
  'namespace',
  'type',
  'version',
  'issuedAt',
  'forwardOps',
  'reverseOps',
  'target',
  'mergeKey',
  'label',
  'domainHint',
]);
const COMMAND_TARGET_FIELDS = new Set([
  'workspaceId',
  'documentId',
  'routeNodeId',
]);
const PATCH_FIELDS = new Set(['op', 'path', 'from', 'value']);
const ATOMIC_PATCH_OPERATIONS = new Set<WorkspacePatchOperation['op']>([
  'add',
  'remove',
  'replace',
  'test',
]);
const COMMAND_DOMAINS = new Set<WorkspaceCommandDomain>([
  'pir',
  'workspace',
  'route',
  'nodegraph',
  'animation',
  'code',
  'resource',
]);

const wireFailure = (
  path: string,
  message: string,
  commandId?: string,
  code: WorkspaceOperationCommitPlanIssueCode = 'WKS_SYNC_COMMIT_OPERATION_INVALID'
): { ok: false; issue: WorkspaceOperationCommitPlanIssue } => ({
  ok: false,
  issue: issue(code, path, message, commandId),
});

const isWireRecord = (value: unknown): value is WireRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const decodeClosedRecord = (
  value: unknown,
  path: string,
  label: string,
  allowedFields: ReadonlySet<string>,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<WireRecord> => {
  if (!isWireRecord(value)) {
    return wireFailure(path, `${label} must be an object.`, commandId);
  }
  const unknownField = Object.keys(value).find(
    (field) => !allowedFields.has(field)
  );
  if (unknownField !== undefined) {
    return wireFailure(
      `${path}/${escapePointerSegment(unknownField)}`,
      `${label} contains an unknown field.`,
      commandId
    );
  }
  return { ok: true, value };
};

const decodeRequiredString = (
  record: WireRecord,
  field: string,
  path: string,
  label: string,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<string> => {
  if (!Object.hasOwn(record, field) || typeof record[field] !== 'string') {
    return wireFailure(
      `${path}/${field}`,
      `${label} must be a string.`,
      commandId
    );
  }
  return { ok: true, value: record[field] };
};

const decodeOptionalString = (
  record: WireRecord,
  field: string,
  path: string,
  label: string,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<string | undefined> => {
  if (!Object.hasOwn(record, field)) return { ok: true, value: undefined };
  if (typeof record[field] !== 'string') {
    return wireFailure(
      `${path}/${field}`,
      `${label} must be a string when present.`,
      commandId
    );
  }
  return { ok: true, value: record[field] };
};

const decodeCanonicalRequiredString = (
  record: WireRecord,
  field: string,
  path: string,
  label: string,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<string> => {
  const decoded = decodeRequiredString(record, field, path, label, commandId);
  if (!decoded.ok) return decoded;
  if (!isCanonicalRequiredString(decoded.value)) {
    return wireFailure(
      `${path}/${field}`,
      `${label} must be non-empty and must not contain surrounding whitespace.`,
      commandId
    );
  }
  return decoded;
};

const decodeCanonicalOptionalString = (
  record: WireRecord,
  field: string,
  path: string,
  label: string,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<string | undefined> => {
  const decoded = decodeOptionalString(record, field, path, label, commandId);
  if (!decoded.ok || decoded.value === undefined) return decoded;
  if (!isCanonicalRequiredString(decoded.value)) {
    return wireFailure(
      `${path}/${field}`,
      `${label} must be non-empty and must not contain surrounding whitespace.`,
      commandId
    );
  }
  return decoded;
};

const decodeRequiredNonEmptyArray = (
  record: WireRecord,
  field: string,
  path: string,
  label: string,
  commandId?: string
): WorkspaceOperationWireNormalizationResult<unknown[]> => {
  if (!Object.hasOwn(record, field) || !Array.isArray(record[field])) {
    return wireFailure(
      `${path}/${field}`,
      `${label} must be an array.`,
      commandId
    );
  }
  if (record[field].length === 0) {
    return wireFailure(
      `${path}/${field}`,
      `${label} must contain at least one item.`,
      commandId
    );
  }
  return { ok: true, value: record[field] };
};

const isJsonValue = (
  value: unknown,
  ancestors: Set<object> = new Set()
): boolean => {
  if (value === null) return true;
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  if (Array.isArray(value)) {
    let valid = true;
    for (let index = 0; index < value.length; index += 1) {
      if (
        !Object.hasOwn(value, index) ||
        !isJsonValue(value[index], ancestors)
      ) {
        valid = false;
        break;
      }
    }
    ancestors.delete(value);
    return valid;
  }
  if (!isWireRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    ancestors.delete(value);
    return false;
  }
  const valid = Object.keys(value).every((key) =>
    isJsonValue(value[key], ancestors)
  );
  ancestors.delete(value);
  return valid;
};

const decodePatchOperation = (
  value: unknown,
  path: string,
  commandId: string
): WorkspaceOperationWireNormalizationResult<WorkspacePatchOperation> => {
  const decodedRecord = decodeClosedRecord(
    value,
    path,
    'Patch operation',
    PATCH_FIELDS,
    commandId
  );
  if (!decodedRecord.ok) return decodedRecord;
  const record = decodedRecord.value;
  const decodedOp = decodeRequiredString(
    record,
    'op',
    path,
    'Patch op',
    commandId
  );
  if (!decodedOp.ok) return decodedOp;
  if (
    !ATOMIC_PATCH_OPERATIONS.has(
      decodedOp.value as WorkspacePatchOperation['op']
    )
  ) {
    if (decodedOp.value === 'move' || decodedOp.value === 'copy') {
      return wireFailure(
        `${path}/op`,
        'Atomic workspace commits do not support move or copy patch operations.',
        commandId,
        'WKS_SYNC_COMMIT_PATH_UNSUPPORTED'
      );
    }
    return wireFailure(
      `${path}/op`,
      'Patch op must be one of add, remove, replace, or test.',
      commandId
    );
  }
  const op = decodedOp.value as WorkspacePatchOperation['op'];
  const decodedPath = decodeRequiredString(
    record,
    'path',
    path,
    'Patch path',
    commandId
  );
  if (!decodedPath.ok) return decodedPath;
  if (
    decodedPath.value !== decodedPath.value.trim() ||
    parsePointer(decodedPath.value) === null
  ) {
    return wireFailure(
      `${path}/path`,
      'Patch paths must be canonical RFC6901 JSON pointers without surrounding whitespace.',
      commandId,
      'WKS_SYNC_COMMIT_PATH_UNSUPPORTED'
    );
  }
  const decodedFrom = decodeOptionalString(
    record,
    'from',
    path,
    'Patch from',
    commandId
  );
  if (!decodedFrom.ok) return decodedFrom;
  if (
    decodedFrom.value !== undefined &&
    (decodedFrom.value !== decodedFrom.value.trim() ||
      parsePointer(decodedFrom.value) === null)
  ) {
    return wireFailure(
      `${path}/from`,
      'Patch from must be a canonical RFC6901 JSON pointer without surrounding whitespace.',
      commandId,
      'WKS_SYNC_COMMIT_PATH_UNSUPPORTED'
    );
  }
  const hasValue = Object.hasOwn(record, 'value');
  if (hasValue && !isJsonValue(record.value)) {
    return wireFailure(
      `${path}/value`,
      'Patch value must be valid JSON.',
      commandId
    );
  }
  if ((op === 'add' || op === 'replace' || op === 'test') && !hasValue) {
    return wireFailure(
      `${path}/value`,
      'add, replace, and test patch operations require a JSON value.',
      commandId
    );
  }
  return {
    ok: true,
    value: {
      op,
      path: decodedPath.value,
      ...(decodedFrom.value !== undefined ? { from: decodedFrom.value } : {}),
      ...(hasValue ? { value: record.value } : {}),
    },
  };
};

const decodeCommandTarget = (
  value: unknown,
  path: string,
  commandId: string
): WorkspaceOperationWireNormalizationResult<
  WorkspaceCommandEnvelope['target']
> => {
  const decodedRecord = decodeClosedRecord(
    value,
    path,
    'Command target',
    COMMAND_TARGET_FIELDS,
    commandId
  );
  if (!decodedRecord.ok) return decodedRecord;
  const record = decodedRecord.value;
  const workspaceId = decodeCanonicalRequiredString(
    record,
    'workspaceId',
    path,
    'Target workspaceId',
    commandId
  );
  if (!workspaceId.ok) return workspaceId;
  const documentId = decodeCanonicalOptionalString(
    record,
    'documentId',
    path,
    'Target documentId',
    commandId
  );
  if (!documentId.ok) return documentId;
  const routeNodeId = decodeCanonicalOptionalString(
    record,
    'routeNodeId',
    path,
    'Target routeNodeId',
    commandId
  );
  if (!routeNodeId.ok) return routeNodeId;
  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      ...(documentId.value !== undefined
        ? { documentId: documentId.value }
        : {}),
      ...(routeNodeId.value !== undefined
        ? { routeNodeId: routeNodeId.value }
        : {}),
    },
  };
};

const decodeCommand = (
  value: unknown,
  path: string
): WorkspaceOperationWireNormalizationResult<WorkspaceCommandEnvelope> => {
  const candidateCommandId =
    isWireRecord(value) && typeof value.id === 'string' ? value.id : undefined;
  const decodedRecord = decodeClosedRecord(
    value,
    path,
    'Command envelope',
    COMMAND_FIELDS,
    candidateCommandId
  );
  if (!decodedRecord.ok) return decodedRecord;
  const record = decodedRecord.value;
  const id = decodeCanonicalRequiredString(
    record,
    'id',
    path,
    'Command id',
    candidateCommandId
  );
  if (!id.ok) return id;
  const commandId = id.value;
  const namespace = decodeCanonicalRequiredString(
    record,
    'namespace',
    path,
    'Command namespace',
    commandId
  );
  if (!namespace.ok) return namespace;
  const type = decodeCanonicalRequiredString(
    record,
    'type',
    path,
    'Command type',
    commandId
  );
  if (!type.ok) return type;
  const version = decodeCanonicalRequiredString(
    record,
    'version',
    path,
    'Command version',
    commandId
  );
  if (!version.ok) return version;
  const issuedAt = decodeRequiredString(
    record,
    'issuedAt',
    path,
    'Command issuedAt',
    commandId
  );
  if (!issuedAt.ok) return issuedAt;
  if (!isRfc3339Timestamp(issuedAt.value)) {
    return wireFailure(
      `${path}/issuedAt`,
      'Command issuedAt must be an RFC3339 timestamp.',
      commandId
    );
  }
  const forwardOps = decodeRequiredNonEmptyArray(
    record,
    'forwardOps',
    path,
    'Command forwardOps',
    commandId
  );
  if (!forwardOps.ok) return forwardOps;
  const reverseOps = decodeRequiredNonEmptyArray(
    record,
    'reverseOps',
    path,
    'Command reverseOps',
    commandId
  );
  if (!reverseOps.ok) return reverseOps;
  const decodedForwardOps: WorkspacePatchOperation[] = [];
  for (let index = 0; index < forwardOps.value.length; index += 1) {
    const decodedPatch = decodePatchOperation(
      forwardOps.value[index],
      `${path}/forwardOps/${index}`,
      commandId
    );
    if (!decodedPatch.ok) return decodedPatch;
    decodedForwardOps.push(decodedPatch.value);
  }
  const decodedReverseOps: WorkspacePatchOperation[] = [];
  for (let index = 0; index < reverseOps.value.length; index += 1) {
    const decodedPatch = decodePatchOperation(
      reverseOps.value[index],
      `${path}/reverseOps/${index}`,
      commandId
    );
    if (!decodedPatch.ok) return decodedPatch;
    decodedReverseOps.push(decodedPatch.value);
  }
  if (!Object.hasOwn(record, 'target')) {
    return wireFailure(
      `${path}/target`,
      'Command target is required.',
      commandId
    );
  }
  const target = decodeCommandTarget(
    record.target,
    `${path}/target`,
    commandId
  );
  if (!target.ok) return target;
  const mergeKey = decodeOptionalString(
    record,
    'mergeKey',
    path,
    'Command mergeKey',
    commandId
  );
  if (!mergeKey.ok) return mergeKey;
  const label = decodeOptionalString(
    record,
    'label',
    path,
    'Command label',
    commandId
  );
  if (!label.ok) return label;
  const domainHint = decodeOptionalString(
    record,
    'domainHint',
    path,
    'Command domainHint',
    commandId
  );
  if (!domainHint.ok) return domainHint;
  if (
    domainHint.value !== undefined &&
    !COMMAND_DOMAINS.has(domainHint.value as WorkspaceCommandDomain)
  ) {
    return wireFailure(
      `${path}/domainHint`,
      'Command domainHint is not a supported command domain.',
      commandId
    );
  }
  return {
    ok: true,
    value: {
      id: commandId,
      namespace: namespace.value,
      type: type.value,
      version: version.value,
      issuedAt: issuedAt.value,
      forwardOps: decodedForwardOps,
      reverseOps: decodedReverseOps,
      target: target.value,
      ...(mergeKey.value !== undefined ? { mergeKey: mergeKey.value } : {}),
      ...(label.value !== undefined ? { label: label.value } : {}),
      ...(domainHint.value !== undefined
        ? { domainHint: domainHint.value as WorkspaceCommandDomain }
        : {}),
    },
  };
};

const decodeTransaction = (
  value: unknown,
  path: string
): WorkspaceOperationWireNormalizationResult<WorkspaceTransactionEnvelope> => {
  const decodedRecord = decodeClosedRecord(
    value,
    path,
    'Transaction envelope',
    TRANSACTION_FIELDS
  );
  if (!decodedRecord.ok) return decodedRecord;
  const record = decodedRecord.value;
  const id = decodeCanonicalRequiredString(
    record,
    'id',
    path,
    'Transaction id'
  );
  if (!id.ok) return id;
  const workspaceId = decodeCanonicalRequiredString(
    record,
    'workspaceId',
    path,
    'Transaction workspaceId'
  );
  if (!workspaceId.ok) return workspaceId;
  const issuedAt = decodeRequiredString(
    record,
    'issuedAt',
    path,
    'Transaction issuedAt'
  );
  if (!issuedAt.ok) return issuedAt;
  if (!isRfc3339Timestamp(issuedAt.value)) {
    return wireFailure(
      `${path}/issuedAt`,
      'Transaction issuedAt must be an RFC3339 timestamp.'
    );
  }
  const commands = decodeRequiredNonEmptyArray(
    record,
    'commands',
    path,
    'Transaction commands'
  );
  if (!commands.ok) return commands;
  const decodedCommands: WorkspaceCommandEnvelope[] = [];
  const commandIds = new Set<string>();
  for (let index = 0; index < commands.value.length; index += 1) {
    const decodedCommand = decodeCommand(
      commands.value[index],
      `${path}/commands/${index}`
    );
    if (!decodedCommand.ok) return decodedCommand;
    if (commandIds.has(decodedCommand.value.id)) {
      return wireFailure(
        `${path}/commands/${index}/id`,
        'Command ids must be unique within a transaction.',
        decodedCommand.value.id
      );
    }
    commandIds.add(decodedCommand.value.id);
    decodedCommands.push(decodedCommand.value);
  }
  const label = decodeOptionalString(
    record,
    'label',
    path,
    'Transaction label'
  );
  if (!label.ok) return label;
  const mergeKey = decodeOptionalString(
    record,
    'mergeKey',
    path,
    'Transaction mergeKey'
  );
  if (!mergeKey.ok) return mergeKey;
  return {
    ok: true,
    value: {
      id: id.value,
      workspaceId: workspaceId.value,
      issuedAt: issuedAt.value,
      commands: decodedCommands,
      ...(label.value !== undefined ? { label: label.value } : {}),
      ...(mergeKey.value !== undefined ? { mergeKey: mergeKey.value } : {}),
    },
  };
};

const decodeCausalMetadata = (
  record: WireRecord
): WorkspaceOperationWireNormalizationResult<
  Pick<WorkspaceOperation, 'undoOf' | 'redoOf' | 'sourceOperationIds'>
> => {
  const undoOf = decodeOptionalString(
    record,
    'undoOf',
    '/operation',
    'Operation undoOf'
  );
  if (!undoOf.ok) return undoOf;
  const redoOf = decodeOptionalString(
    record,
    'redoOf',
    '/operation',
    'Operation redoOf'
  );
  if (!redoOf.ok) return redoOf;
  const canonicalUndoOf = undoOf.value?.trim();
  const canonicalRedoOf = redoOf.value?.trim();
  if (canonicalUndoOf && canonicalRedoOf) {
    return wireFailure(
      '/operation',
      'undoOf and redoOf are mutually exclusive.'
    );
  }
  const sourceOperationIds: string[] = [];
  if (Object.hasOwn(record, 'sourceOperationIds')) {
    if (!Array.isArray(record.sourceOperationIds)) {
      return wireFailure(
        '/operation/sourceOperationIds',
        'Operation sourceOperationIds must be an array when present.'
      );
    }
    const seenSourceIds = new Set<string>();
    for (let index = 0; index < record.sourceOperationIds.length; index += 1) {
      const sourceId = record.sourceOperationIds[index];
      if (typeof sourceId !== 'string') {
        return wireFailure(
          `/operation/sourceOperationIds/${index}`,
          'Source operation ids must be strings.'
        );
      }
      const canonicalSourceId = sourceId.trim();
      if (!canonicalSourceId) {
        return wireFailure(
          `/operation/sourceOperationIds/${index}`,
          'Source operation ids must be non-empty.'
        );
      }
      if (!seenSourceIds.has(canonicalSourceId)) {
        seenSourceIds.add(canonicalSourceId);
        sourceOperationIds.push(canonicalSourceId);
      }
    }
  }
  return {
    ok: true,
    value: {
      ...(canonicalUndoOf ? { undoOf: canonicalUndoOf } : {}),
      ...(canonicalRedoOf ? { redoOf: canonicalRedoOf } : {}),
      ...(sourceOperationIds.length ? { sourceOperationIds } : {}),
    },
  };
};

/**
 * Closes and canonicalizes the complete commit wire envelope before the
 * planner derives a write set or applies the operation to its confirmed base.
 */
export const normalizeWorkspaceOperationWire = (
  operation: unknown
):
  | { ok: true; operation: WorkspaceOperation }
  | { ok: false; issue: WorkspaceOperationCommitPlanIssue } => {
  const operationRecord = decodeClosedRecord(
    operation,
    '/operation',
    'Workspace operation',
    new Set([
      'kind',
      'command',
      'transaction',
      'undoOf',
      'redoOf',
      'sourceOperationIds',
    ])
  );
  if (!operationRecord.ok) return operationRecord;
  const kind = decodeRequiredString(
    operationRecord.value,
    'kind',
    '/operation',
    'Operation kind'
  );
  if (!kind.ok) return kind;
  if (kind.value !== 'command' && kind.value !== 'transaction') {
    return wireFailure(
      '/operation/kind',
      'Operation kind must be command or transaction.'
    );
  }
  const branchRecord = decodeClosedRecord(
    operationRecord.value,
    '/operation',
    'Workspace operation',
    kind.value === 'command'
      ? COMMAND_OPERATION_FIELDS
      : TRANSACTION_OPERATION_FIELDS
  );
  if (!branchRecord.ok) return branchRecord;
  const causalMetadata = decodeCausalMetadata(branchRecord.value);
  if (!causalMetadata.ok) return causalMetadata;
  if (kind.value === 'command') {
    if (!Object.hasOwn(branchRecord.value, 'command')) {
      return wireFailure(
        '/operation/command',
        'Command operation requires a command envelope.'
      );
    }
    const command = decodeCommand(
      branchRecord.value.command,
      '/operation/command'
    );
    if (!command.ok) return command;
    return {
      ok: true,
      operation: {
        kind: 'command',
        command: command.value,
        ...causalMetadata.value,
      },
    };
  }
  if (!Object.hasOwn(branchRecord.value, 'transaction')) {
    return wireFailure(
      '/operation/transaction',
      'Transaction operation requires a transaction envelope.'
    );
  }
  const transaction = decodeTransaction(
    branchRecord.value.transaction,
    '/operation/transaction'
  );
  if (!transaction.ok) return transaction;
  return {
    ok: true,
    operation: {
      kind: 'transaction',
      transaction: transaction.value,
      ...causalMetadata.value,
    },
  };
};
