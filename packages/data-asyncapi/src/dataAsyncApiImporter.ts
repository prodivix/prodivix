import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  decodeCurrentDataSourceDocument,
  JSON_SCHEMA_2020_12_URI,
  type DataConfigurationValue,
  type DataImportEntityMapping,
  type DataImportProvenance,
  type DataJsonSchema202012,
  type DataJsonValue,
  type DataOperation,
  type DataSchema,
  type DataSourceDefinition,
  type DataSourceDocument,
} from '@prodivix/data';
import type { RuntimeZone } from '@prodivix/runtime-core';
import { DATA_ASYNCAPI_ADAPTER_ID } from './dataAsyncApiAdapter';

export const DATA_ASYNCAPI_IMPORT_LIMITS = Object.freeze({
  maxDocumentBytes: 4 * 1024 * 1024,
  maxDepth: 64,
  maxNodes: 100_000,
  maxChannels: 256,
  maxOperations: 512,
  maxMessagesPerOperation: 1,
} as const);

export const DATA_ASYNCAPI_IMPORT_ISSUE_CODES = Object.freeze({
  invalidDocument: 'DATA_ASYNCAPI_IMPORT_INVALID_DOCUMENT',
  unsupportedVersion: 'DATA_ASYNCAPI_IMPORT_UNSUPPORTED_VERSION',
  unsupportedAction: 'DATA_ASYNCAPI_IMPORT_UNSUPPORTED_ACTION',
  unsupportedShape: 'DATA_ASYNCAPI_IMPORT_UNSUPPORTED_SHAPE',
  limitExceeded: 'DATA_ASYNCAPI_IMPORT_LIMIT_EXCEEDED',
  targetDrift: 'DATA_ASYNCAPI_IMPORT_TARGET_DRIFT',
  reimportConflict: 'DATA_ASYNCAPI_IMPORT_REIMPORT_CONFLICT',
  impactRequired: 'DATA_ASYNCAPI_IMPORT_IMPACT_REQUIRED',
} as const);

export type DataAsyncApiImportIssueCode =
  (typeof DATA_ASYNCAPI_IMPORT_ISSUE_CODES)[keyof typeof DATA_ASYNCAPI_IMPORT_ISSUE_CODES];

export type DataAsyncApiImportIssue = Readonly<{
  code: DataAsyncApiImportIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}>;

export type DataAsyncApiImportChange = Readonly<{
  entity: 'source' | 'schema' | 'operation';
  change: 'add' | 'update' | 'preserve-local' | 'remove';
  targetId: string;
  externalId?: string;
}>;

export type DataAsyncApiImportImpact = Readonly<{
  schemaIds: readonly string[];
  operationIds: readonly string[];
}>;

export type DataAsyncApiImpactApproval = DataAsyncApiImportImpact;

export type CreateDataAsyncApiImportProposalInput = Readonly<{
  spec: unknown;
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
  endpoint: string;
  runtimeZone?: Extract<RuntimeZone, 'client' | 'server' | 'edge'>;
  currentDocument?: DataSourceDocument;
  impactApproval?: DataAsyncApiImpactApproval;
}>;

export type DataAsyncApiImportTarget = Readonly<{
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
}>;

type BlockedStatus = 'invalid' | 'conflict' | 'impact-required';

export type DataAsyncApiImportProposal =
  | Readonly<{
      status: 'ready';
      target: DataAsyncApiImportTarget;
      document: DataSourceDocument;
      changes: readonly DataAsyncApiImportChange[];
      impact: DataAsyncApiImportImpact;
      issues: readonly DataAsyncApiImportIssue[];
    }>
  | Readonly<{
      status: BlockedStatus;
      target: DataAsyncApiImportTarget;
      changes: readonly DataAsyncApiImportChange[];
      impact: DataAsyncApiImportImpact;
      issues: readonly DataAsyncApiImportIssue[];
    }>;

type JsonRecord = Record<string, unknown>;
type ImportedEntity<T> = Readonly<{
  externalId: string;
  targetId: string;
  value: T;
  digest: string;
}>;
type Projection = Readonly<{
  source: DataSourceDefinition;
  sourceDigest: string;
  specificationDigest: string;
  schemas: ReadonlyMap<string, ImportedEntity<DataSchema>>;
  operations: ReadonlyMap<string, ImportedEntity<DataOperation>>;
}>;

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
const canonical = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value && value === value.trim() && !value.includes('\0'));
const pointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const issue = (
  issues: DataAsyncApiImportIssue[],
  code: DataAsyncApiImportIssueCode,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
): void => {
  issues.push(Object.freeze({ code, severity, path, message }));
};

const cloneBounded = (
  input: unknown,
  issues: DataAsyncApiImportIssue[]
): DataJsonValue | undefined => {
  let nodes = 0;
  const visit = (
    value: unknown,
    path: string,
    depth: number,
    parents: Set<object>
  ): DataJsonValue | undefined => {
    nodes += 1;
    if (
      nodes > DATA_ASYNCAPI_IMPORT_LIMITS.maxNodes ||
      depth > DATA_ASYNCAPI_IMPORT_LIMITS.maxDepth
    ) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.limitExceeded,
        path,
        'AsyncAPI document exceeds the structural budget.'
      );
      return undefined;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        issue(
          issues,
          DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
          path,
          'AsyncAPI numbers must be finite.'
        );
        return undefined;
      }
      return value;
    }
    if (!value || typeof value !== 'object') {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'AsyncAPI input must be JSON.'
      );
      return undefined;
    }
    if (parents.has(value)) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'AsyncAPI input must be acyclic.'
      );
      return undefined;
    }
    const next = new Set(parents).add(value);
    if (Array.isArray(value)) {
      const result: DataJsonValue[] = [];
      for (const [index, entry] of value.entries()) {
        const cloned = visit(entry, `${path}/${index}`, depth + 1, next);
        if (cloned === undefined) return undefined;
        result.push(cloned);
      }
      return Object.freeze(result);
    }
    if (!isRecord(value)) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'AsyncAPI objects must be plain records.'
      );
      return undefined;
    }
    const result: Record<string, DataJsonValue> = {};
    for (const key of Object.keys(value).sort(compare)) {
      const cloned = visit(
        value[key],
        `${path}/${pointerSegment(key)}`,
        depth + 1,
        next
      );
      if (cloned === undefined) return undefined;
      result[key] = cloned;
    }
    return Object.freeze(result);
  };
  const cloned = visit(input, '', 0, new Set());
  if (
    cloned !== undefined &&
    utf8ToBytes(JSON.stringify(cloned)).length >
      DATA_ASYNCAPI_IMPORT_LIMITS.maxDocumentBytes
  ) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/',
      'AsyncAPI document exceeds the byte budget.'
    );
    return undefined;
  }
  return cloned;
};

const stableJson = (value: unknown): string => {
  const sort = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sort);
    if (!isRecord(entry)) return entry;
    return Object.fromEntries(
      Object.keys(entry)
        .sort(compare)
        .map((key) => [key, sort(entry[key])])
    );
  };
  return JSON.stringify(sort(value));
};
const digest = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(stableJson(value))))}`;
const literal = (value: DataJsonValue): DataConfigurationValue =>
  Object.freeze({ kind: 'literal', value });
const slug = (value: string, fallback: string): string =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80) || fallback;
const sortedUnique = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compare));

class StableIdAllocator {
  readonly #used = new Set<string>();
  constructor(
    private readonly previous: Readonly<
      Record<string, DataImportEntityMapping>
    >,
    private readonly fallback: string
  ) {
    for (const mapping of Object.values(previous))
      this.#used.add(mapping.targetId);
  }
  allocate(externalId: string, preferred: string): string {
    const retained = this.previous[externalId]?.targetId;
    if (retained) return retained;
    let candidate = slug(preferred, this.fallback);
    if (this.#used.has(candidate))
      candidate = `${candidate.slice(0, 70)}-${digest(externalId).slice(7, 15)}`;
    while (this.#used.has(candidate)) candidate = `${candidate}-x`;
    this.#used.add(candidate);
    return candidate;
  }
}

const decodePointerToken = (value: string): string | undefined => {
  if (/~(?:[^01]|$)/u.test(value)) return undefined;
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
};

const resolveLocalRef = (
  root: JsonRecord,
  value: unknown,
  path: string,
  issues: DataAsyncApiImportIssue[]
): JsonRecord | undefined => {
  if (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    canonical(value.$ref)
  ) {
    if (!value.$ref.startsWith('#/')) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        path,
        'Only local AsyncAPI references are supported.'
      );
      return undefined;
    }
    let current: unknown = root;
    for (const raw of value.$ref.slice(2).split('/')) {
      const token = decodePointerToken(raw);
      if (!token || !isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[token];
    }
    if (!isRecord(current)) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'AsyncAPI local reference did not resolve to an object.'
      );
      return undefined;
    }
    return current;
  }
  if (isRecord(value)) return value;
  issue(
    issues,
    DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
    path,
    'Expected an AsyncAPI object or local reference.'
  );
  return undefined;
};

const jsonSchema = (
  value: unknown,
  path: string,
  issues: DataAsyncApiImportIssue[]
): DataJsonSchema202012 | undefined => {
  if (value === true || value === false) return value;
  if (!isRecord(value)) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      path,
      'AsyncAPI message payload must be inline JSON Schema.'
    );
    return undefined;
  }
  const visit = (entry: unknown, currentPath: string): DataJsonValue => {
    if (entry === null || typeof entry !== 'object')
      return entry as DataJsonValue;
    if (Array.isArray(entry))
      return Object.freeze(
        entry.map((child, index) => visit(child, `${currentPath}/${index}`))
      );
    if (!isRecord(entry)) return true;
    if (canonical(entry.$ref)) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        `${currentPath}/$ref`,
        'Message payload schemas must be self-contained after import.'
      );
    }
    return Object.freeze(
      Object.fromEntries(
        Object.keys(entry)
          .filter((key) => key !== '$schema')
          .sort(compare)
          .map((key) => [
            key,
            visit(entry[key], `${currentPath}/${pointerSegment(key)}`),
          ])
      )
    );
  };
  const converted = visit(value, path);
  if (!isRecord(converted)) return undefined;
  return Object.freeze({
    $schema: JSON_SCHEMA_2020_12_URI,
    ...(converted as Record<string, unknown>),
  }) as DataJsonSchema202012;
};

const operationMessage = (
  root: JsonRecord,
  operation: JsonRecord,
  channel: JsonRecord,
  path: string,
  issues: DataAsyncApiImportIssue[]
): JsonRecord | undefined => {
  const messages = Array.isArray(operation.messages)
    ? operation.messages
    : isRecord(channel.messages)
      ? [Object.values(channel.messages)[0]]
      : [];
  if (messages.length !== 1) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      `${path}/messages`,
      'Finite AsyncAPI operations must select exactly one message.'
    );
    return undefined;
  }
  return resolveLocalRef(root, messages[0], `${path}/messages/0`, issues);
};

const replyMessage = (
  root: JsonRecord,
  reply: JsonRecord,
  path: string,
  issues: DataAsyncApiImportIssue[]
): JsonRecord | undefined => {
  const messages = Array.isArray(reply.messages) ? reply.messages : [];
  if (messages.length !== 1) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      `${path}/messages`,
      'AsyncAPI request-reply must select exactly one reply message.'
    );
    return undefined;
  }
  return resolveLocalRef(root, messages[0], `${path}/messages/0`, issues);
};

const compileProjection = (
  root: JsonRecord,
  input: CreateDataAsyncApiImportProposalInput,
  previous: DataImportProvenance | undefined,
  issues: DataAsyncApiImportIssue[]
): Projection | undefined => {
  if (
    typeof root.asyncapi !== 'string' ||
    !/^3\.0(?:\.\d+)?$/u.test(root.asyncapi)
  ) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedVersion,
      '/asyncapi',
      'Only the frozen AsyncAPI 3.0 contract is supported.'
    );
    return undefined;
  }
  const channels = isRecord(root.channels) ? root.channels : undefined;
  const operationsRecord = isRecord(root.operations)
    ? root.operations
    : undefined;
  if (!channels || !operationsRecord) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
      '/',
      'AsyncAPI channels and operations are required.'
    );
    return undefined;
  }
  if (
    Object.keys(channels).length > DATA_ASYNCAPI_IMPORT_LIMITS.maxChannels ||
    Object.keys(operationsRecord).length >
      DATA_ASYNCAPI_IMPORT_LIMITS.maxOperations
  ) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/',
      'AsyncAPI channel or operation budget exceeded.'
    );
    return undefined;
  }
  let base: URL;
  try {
    base = new URL(input.endpoint);
  } catch {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
      '/@endpoint',
      'AsyncAPI HTTP endpoint must be absolute.'
    );
    return undefined;
  }
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:') ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      '/@endpoint',
      'AsyncAPI finite adapter supports only credential-free HTTP(S) endpoints.'
    );
    return undefined;
  }
  const schemaIds = new StableIdAllocator(
    previous?.schemasByExternalId ?? {},
    'schema'
  );
  const operationIds = new StableIdAllocator(
    previous?.operationsByExternalId ?? {},
    'operation'
  );
  const schemas = new Map<string, ImportedEntity<DataSchema>>();
  const operations = new Map<string, ImportedEntity<DataOperation>>();
  for (const operationId of Object.keys(operationsRecord).sort(compare)) {
    const path = `/operations/${pointerSegment(operationId)}`;
    // Schema and operation names are derived from this key verbatim, so a
    // non-canonical key must be rejected with its own path instead of surfacing
    // later as an unattributable canonical-contract rejection of the projection.
    if (!canonical(operationId)) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'AsyncAPI operation keys must be canonical strings.'
      );
      continue;
    }
    const operation = resolveLocalRef(
      root,
      operationsRecord[operationId],
      path,
      issues
    );
    if (!operation) continue;
    if (operation.action === 'receive') {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedAction,
        `${path}/action`,
        'AsyncAPI receive/subscription/stream operations are unsupported.'
      );
      continue;
    }
    if (operation.action !== 'send') {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedAction,
        `${path}/action`,
        'AsyncAPI operation action must be send for the finite adapter.'
      );
      continue;
    }
    const channel = resolveLocalRef(
      root,
      operation.channel,
      `${path}/channel`,
      issues
    );
    if (!channel) continue;
    if (
      !canonical(channel.address) ||
      !channel.address.startsWith('/') ||
      channel.address.startsWith('//') ||
      channel.address.includes('{')
    ) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        `${path}/channel/address`,
        'Finite AsyncAPI channel address must be a static origin-relative path.'
      );
      continue;
    }
    const message = operationMessage(root, operation, channel, path, issues);
    const inputSchemaValue = message
      ? jsonSchema(message.payload, `${path}/messages/0/payload`, issues)
      : undefined;
    if (!message || !inputSchemaValue) continue;
    const hasReply = operation.reply !== undefined;
    const reply = hasReply
      ? resolveLocalRef(root, operation.reply, `${path}/reply`, issues)
      : undefined;
    const replyPayload = reply
      ? replyMessage(root, reply, `${path}/reply`, issues)
      : undefined;
    const outputSchemaValue = hasReply
      ? replyPayload
        ? jsonSchema(
            replyPayload.payload,
            `${path}/reply/messages/0/payload`,
            issues
          )
        : undefined
      : ({ $schema: JSON_SCHEMA_2020_12_URI, type: 'boolean' } as const);
    if (!outputSchemaValue) continue;
    const externalId = `operation:${operationId}`;
    const targetId = operationIds.allocate(externalId, operationId);
    const inputExternalId = `${externalId}:input`;
    const outputExternalId = `${externalId}:output`;
    const inputId = schemaIds.allocate(inputExternalId, `${targetId}-input`);
    const outputId = schemaIds.allocate(outputExternalId, `${targetId}-output`);
    const inputSchema: DataSchema = Object.freeze({
      id: inputId,
      name: `${operationId} message`,
      schema: inputSchemaValue,
    });
    const outputSchema: DataSchema = Object.freeze({
      id: outputId,
      name: hasReply ? `${operationId} reply` : `${operationId} receipt`,
      schema: outputSchemaValue,
    });
    const inputDigest = digest({
      name: inputSchema.name,
      schema: inputSchema.schema,
    });
    const outputDigest = digest({
      name: outputSchema.name,
      schema: outputSchema.schema,
    });
    schemas.set(
      inputExternalId,
      Object.freeze({
        externalId: inputExternalId,
        targetId: inputId,
        value: inputSchema,
        digest: inputDigest,
      })
    );
    schemas.set(
      outputExternalId,
      Object.freeze({
        externalId: outputExternalId,
        targetId: outputId,
        value: outputSchema,
        digest: outputDigest,
      })
    );
    const canonicalKind =
      hasReply && operation['x-prodivix-kind'] === 'mutation'
        ? 'mutation'
        : hasReply
          ? 'query'
          : 'mutation';
    if (
      hasReply &&
      operation['x-prodivix-kind'] !== undefined &&
      operation['x-prodivix-kind'] !== 'query' &&
      operation['x-prodivix-kind'] !== 'mutation'
    ) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        `${path}/x-prodivix-kind`,
        'AsyncAPI request-reply canonical kind must be query or mutation.'
      );
      continue;
    }
    const configurationByKey: Record<string, DataConfigurationValue> = {
      action: literal(hasReply ? 'request-reply' : 'publish'),
      path: literal(channel.address),
      emptyWhen: literal('never'),
    };
    const value: DataOperation = Object.freeze({
      id: targetId,
      name: canonical(operation.title) ? operation.title : operationId,
      ...(canonical(operation.summary)
        ? { description: operation.summary }
        : {}),
      kind: canonicalKind,
      inputSchemaId: inputId,
      outputSchemaId: outputId,
      configurationByKey: Object.freeze(configurationByKey),
      policies: Object.freeze({}),
    });
    operations.set(
      externalId,
      Object.freeze({
        externalId,
        targetId,
        value,
        digest: digest({
          name: value.name,
          description: value.description,
          kind: value.kind,
          inputSchemaId: value.inputSchemaId,
          outputSchemaId: value.outputSchemaId,
          configurationByKey: value.configurationByKey,
        }),
      })
    );
  }
  if (issues.some((entry) => entry.severity === 'error')) return undefined;
  const source: DataSourceDefinition = Object.freeze({
    id: input.sourceId,
    name: canonical(isRecord(root.info) ? root.info.title : undefined)
      ? ((root.info as JsonRecord).title as string)
      : input.sourceId,
    adapterId: DATA_ASYNCAPI_ADAPTER_ID,
    runtimeZone: input.runtimeZone ?? 'client',
    bindingsById: Object.freeze({}),
    configurationByKey: Object.freeze({ endpoint: literal(base.toString()) }),
  });
  return Object.freeze({
    source,
    sourceDigest: digest({
      name: source.name,
      adapterId: source.adapterId,
      runtimeZone: source.runtimeZone,
      endpoint: source.configurationByKey.endpoint,
    }),
    specificationDigest: digest(root),
    schemas,
    operations,
  });
};

const sourceDigest = (source: DataSourceDefinition): string =>
  digest({
    name: source.name,
    adapterId: source.adapterId,
    runtimeZone: source.runtimeZone,
    endpoint: source.configurationByKey.endpoint,
  });
const schemaDigest = (schema: DataSchema): string =>
  digest({
    name: schema.name,
    description: schema.description,
    schema: schema.schema,
  });
const operationDigest = (operation: DataOperation): string =>
  digest({
    name: operation.name,
    description: operation.description,
    kind: operation.kind,
    inputSchemaId: operation.inputSchemaId,
    outputSchemaId: operation.outputSchemaId,
    configurationByKey: Object.fromEntries(
      Object.entries(operation.configurationByKey).filter(([key]) =>
        [
          'action',
          'path',
          'bodyInputPath',
          'responseBodyPath',
          'emptyWhen',
          'authorization',
          'idempotencyHeader',
        ].includes(key)
      )
    ),
  });
const mappings = <T>(
  entities: ReadonlyMap<string, ImportedEntity<T>>
): Readonly<Record<string, DataImportEntityMapping>> =>
  Object.freeze(
    Object.fromEntries(
      [...entities.entries()]
        .sort(([left], [right]) => compare(left, right))
        .map(([externalId, entry]) => [
          externalId,
          Object.freeze({
            targetId: entry.targetId,
            importedDigest: entry.digest,
          }),
        ])
    )
  );
const exactApproval = (
  impact: DataAsyncApiImportImpact,
  approval: DataAsyncApiImpactApproval | undefined
): boolean =>
  Boolean(
    approval &&
    stableJson(sortedUnique(approval.schemaIds)) ===
      stableJson(impact.schemaIds) &&
    stableJson(sortedUnique(approval.operationIds)) ===
      stableJson(impact.operationIds)
  );
const blocked = (
  status: BlockedStatus,
  target: DataAsyncApiImportTarget,
  issues: DataAsyncApiImportIssue[],
  changes: DataAsyncApiImportChange[],
  schemaIds: string[],
  operationIds: string[]
): DataAsyncApiImportProposal =>
  Object.freeze({
    status,
    target,
    issues: Object.freeze(issues),
    changes: Object.freeze(changes),
    impact: Object.freeze({
      schemaIds: sortedUnique(schemaIds),
      operationIds: sortedUnique(operationIds),
    }),
  });

/** Compiles the finite AsyncAPI 3.0 subset into an explicitly adoptable proposal. */
export const createDataAsyncApiImportProposal = (
  input: CreateDataAsyncApiImportProposalInput
): DataAsyncApiImportProposal => {
  const target = Object.freeze({
    documentId: input.documentId,
    importId: input.importId,
    externalDocumentId: input.externalDocumentId,
    sourceId: input.sourceId,
  });
  const issues: DataAsyncApiImportIssue[] = [];
  const changes: DataAsyncApiImportChange[] = [];
  const schemaImpact: string[] = [];
  const operationImpact: string[] = [];
  for (const [path, value] of [
    ['/@documentId', input.documentId],
    ['/@importId', input.importId],
    ['/@externalDocumentId', input.externalDocumentId],
    ['/@sourceId', input.sourceId],
  ] as const)
    if (!canonical(value))
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'Expected a canonical identity.'
      );
  let current: DataSourceDocument | undefined;
  if (input.currentDocument) {
    const decoded = decodeCurrentDataSourceDocument(input.currentDocument, {
      documentId: input.documentId,
    });
    if (decoded.ok) current = decoded.value;
    else
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
        '/@currentDocument',
        'Current Data document is not canonical.'
      );
  }
  const previous = current?.importProvenanceById?.[input.importId];
  if (current && !previous)
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${pointerSegment(input.importId)}`,
      'Reimport requires matching canonical provenance.'
    );
  if (
    previous &&
    (previous.kind !== 'asyncapi-3.0' ||
      previous.externalDocumentId !== input.externalDocumentId)
  )
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${pointerSegment(input.importId)}`,
      'AsyncAPI reimport identity drifted.'
    );
  const cloned = cloneBounded(input.spec, issues);
  const projection = isRecord(cloned)
    ? compileProjection(cloned, input, previous, issues)
    : undefined;
  if (!projection || issues.some((entry) => entry.severity === 'error'))
    return blocked(
      'invalid',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  const provenance: DataImportProvenance = Object.freeze({
    id: input.importId,
    kind: 'asyncapi-3.0',
    externalDocumentId: input.externalDocumentId,
    sourceDigest: projection.specificationDigest,
    sourceImportedDigest: projection.sourceDigest,
    schemasByExternalId: mappings(projection.schemas),
    operationsByExternalId: mappings(projection.operations),
  });
  if (!current || !previous) {
    const decoded = decodeCurrentDataSourceDocument(
      {
        source: projection.source,
        schemasById: Object.freeze(
          Object.fromEntries(
            [...projection.schemas.values()].map((entry) => [
              entry.targetId,
              entry.value,
            ])
          )
        ),
        operationsById: Object.freeze(
          Object.fromEntries(
            [...projection.operations.values()].map((entry) => [
              entry.targetId,
              entry.value,
            ])
          )
        ),
        importProvenanceById: Object.freeze({ [input.importId]: provenance }),
      },
      { documentId: input.documentId }
    );
    if (!decoded.ok) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
        '/@proposal',
        'Imported AsyncAPI projection does not satisfy the canonical Data source contract.'
      );
      return blocked(
        'invalid',
        target,
        issues,
        changes,
        schemaImpact,
        operationImpact
      );
    }
    const document = decoded.value;
    changes.push(
      Object.freeze({
        entity: 'source',
        change: 'add',
        targetId: document.source.id,
      }),
      ...[...projection.schemas.values()].map((entry) =>
        Object.freeze({
          entity: 'schema' as const,
          change: 'add' as const,
          targetId: entry.targetId,
          externalId: entry.externalId,
        })
      ),
      ...[...projection.operations.values()].map((entry) =>
        Object.freeze({
          entity: 'operation' as const,
          change: 'add' as const,
          targetId: entry.targetId,
          externalId: entry.externalId,
        })
      )
    );
    return Object.freeze({
      status: 'ready',
      target,
      document,
      changes: Object.freeze(changes),
      impact: Object.freeze({
        schemaIds: Object.freeze([]),
        operationIds: Object.freeze([]),
      }),
      issues: Object.freeze(issues),
    });
  }
  let source = current.source;
  const localSourceDigest = sourceDigest(source);
  if (localSourceDigest === previous.sourceImportedDigest) {
    source = Object.freeze({
      ...source,
      name: projection.source.name,
      adapterId: projection.source.adapterId,
      runtimeZone: projection.source.runtimeZone,
      configurationByKey: Object.freeze({
        ...source.configurationByKey,
        endpoint: projection.source.configurationByKey.endpoint!,
      }),
    });
    if (projection.sourceDigest !== previous.sourceImportedDigest)
      changes.push(
        Object.freeze({
          entity: 'source',
          change: 'update',
          targetId: source.id,
        })
      );
  } else if (projection.sourceDigest === previous.sourceImportedDigest)
    changes.push(
      Object.freeze({
        entity: 'source',
        change: 'preserve-local',
        targetId: source.id,
      })
    );
  else
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.reimportConflict,
      '/source',
      'AsyncAPI source changed both locally and upstream.'
    );
  const schemasById: Record<string, DataSchema> = { ...current.schemasById };
  for (const [externalId, oldMapping] of Object.entries(
    previous.schemasByExternalId
  )) {
    const existing = current.schemasById[oldMapping.targetId];
    const desired = projection.schemas.get(externalId);
    if (!existing) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${pointerSegment(oldMapping.targetId)}`,
        'Imported schema target is missing.'
      );
      continue;
    }
    const localDigest = schemaDigest(existing);
    if (!desired) {
      if (localDigest !== oldMapping.importedDigest)
        issue(
          issues,
          DATA_ASYNCAPI_IMPORT_ISSUE_CODES.reimportConflict,
          `/schemasById/${pointerSegment(existing.id)}`,
          'Upstream removed a locally edited schema.'
        );
      else {
        delete schemasById[existing.id];
        schemaImpact.push(existing.id);
        changes.push(
          Object.freeze({
            entity: 'schema',
            change: 'remove',
            targetId: existing.id,
            externalId,
          })
        );
      }
    } else if (localDigest === oldMapping.importedDigest) {
      schemasById[existing.id] = desired.value;
      if (desired.digest !== oldMapping.importedDigest) {
        schemaImpact.push(existing.id);
        changes.push(
          Object.freeze({
            entity: 'schema',
            change: 'update',
            targetId: existing.id,
            externalId,
          })
        );
      }
    } else if (desired.digest === oldMapping.importedDigest)
      changes.push(
        Object.freeze({
          entity: 'schema',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    else
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.reimportConflict,
        `/schemasById/${pointerSegment(existing.id)}`,
        'Schema changed both locally and upstream.'
      );
  }
  for (const [externalId, desired] of projection.schemas) {
    if (previous.schemasByExternalId[externalId]) continue;
    if (schemasById[desired.targetId])
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${pointerSegment(desired.targetId)}`,
        'New imported schema collides with an existing target.'
      );
    else {
      schemasById[desired.targetId] = desired.value;
      changes.push(
        Object.freeze({
          entity: 'schema',
          change: 'add',
          targetId: desired.targetId,
          externalId,
        })
      );
    }
  }
  const operationsById: Record<string, DataOperation> = {
    ...current.operationsById,
  };
  for (const [externalId, oldMapping] of Object.entries(
    previous.operationsByExternalId
  )) {
    const existing = current.operationsById[oldMapping.targetId];
    const desired = projection.operations.get(externalId);
    if (!existing) {
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${pointerSegment(oldMapping.targetId)}`,
        'Imported operation target is missing.'
      );
      continue;
    }
    const localDigest = operationDigest(existing);
    if (!desired) {
      if (localDigest !== oldMapping.importedDigest)
        issue(
          issues,
          DATA_ASYNCAPI_IMPORT_ISSUE_CODES.reimportConflict,
          `/operationsById/${pointerSegment(existing.id)}`,
          'Upstream removed a locally edited operation.'
        );
      else {
        delete operationsById[existing.id];
        operationImpact.push(existing.id);
        changes.push(
          Object.freeze({
            entity: 'operation',
            change: 'remove',
            targetId: existing.id,
            externalId,
          })
        );
      }
    } else if (localDigest === oldMapping.importedDigest) {
      operationsById[existing.id] = Object.freeze({
        ...desired.value,
        configurationByKey: Object.freeze({
          ...existing.configurationByKey,
          ...desired.value.configurationByKey,
        }),
        policies: existing.policies,
      });
      if (desired.digest !== oldMapping.importedDigest) {
        operationImpact.push(existing.id);
        changes.push(
          Object.freeze({
            entity: 'operation',
            change: 'update',
            targetId: existing.id,
            externalId,
          })
        );
      }
    } else if (desired.digest === oldMapping.importedDigest)
      changes.push(
        Object.freeze({
          entity: 'operation',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    else
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.reimportConflict,
        `/operationsById/${pointerSegment(existing.id)}`,
        'Operation changed both locally and upstream.'
      );
  }
  for (const [externalId, desired] of projection.operations) {
    if (previous.operationsByExternalId[externalId]) continue;
    if (operationsById[desired.targetId])
      issue(
        issues,
        DATA_ASYNCAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${pointerSegment(desired.targetId)}`,
        'New imported operation collides with an existing target.'
      );
    else {
      operationsById[desired.targetId] = desired.value;
      changes.push(
        Object.freeze({
          entity: 'operation',
          change: 'add',
          targetId: desired.targetId,
          externalId,
        })
      );
    }
  }
  if (issues.some((entry) => entry.severity === 'error'))
    return blocked(
      'conflict',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  const impact = Object.freeze({
    schemaIds: sortedUnique(schemaImpact),
    operationIds: sortedUnique(operationImpact),
  });
  if (
    (impact.schemaIds.length || impact.operationIds.length) &&
    !exactApproval(impact, input.impactApproval)
  ) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.impactRequired,
      '/@impactApproval',
      'Exact semantic impact approval is required.'
    );
    return blocked(
      'impact-required',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  }
  const decoded = decodeCurrentDataSourceDocument(
    {
      source,
      schemasById: Object.freeze(schemasById),
      operationsById: Object.freeze(operationsById),
      importProvenanceById: Object.freeze({
        ...(current.importProvenanceById ?? {}),
        [input.importId]: provenance,
      }),
    },
    { documentId: input.documentId }
  );
  if (!decoded.ok) {
    issue(
      issues,
      DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument,
      '/@proposal',
      'AsyncAPI reimport projection does not satisfy the canonical Data source contract.'
    );
    return blocked(
      'invalid',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  }
  const document = decoded.value;
  return Object.freeze({
    status: 'ready',
    target,
    document,
    changes: Object.freeze(changes),
    impact,
    issues: Object.freeze(issues),
  });
};
