import { RUNTIME_ZONES, type RuntimeZone } from '@prodivix/runtime-core';
import {
  DATA_CACHE_POLICY_LIMITS,
  DATA_DOCUMENT_ISSUE_CODES,
  DATA_OPERATION_KINDS,
  JSON_SCHEMA_2020_12_URI,
  type DataCachePolicy,
  type DataConfigurationValue,
  type DataCursorPageSnapshot,
  type DataCursorPaginationPolicy,
  type DataDocumentIssue,
  type DataJsonObject,
  type DataJsonSchema202012,
  type DataJsonSchemaType,
  type DataJsonValue,
  type DataLifecycleSnapshot,
  type DataOffsetPageSnapshot,
  type DataOffsetPaginationPolicy,
  type DataOperation,
  type DataOperationError,
  type DataOperationPolicies,
  type DataOperationReference,
  type DataOptimisticCrudEffectPolicy,
  type DataPageSnapshot,
  type DataRetryPolicy,
  type DataSchema,
  type DataSourceBinding,
  type DataSourceDefinition,
  type DataSourceDocument,
  type DataSourceDocumentDecodeResult,
  type DataSourceDocumentValidationOptions,
  type DataSourceDocumentValidationResult,
} from './data.types';

type JsonRecord = Readonly<Record<string, unknown>>;

const runtimeZones = new Set<RuntimeZone>(RUNTIME_ZONES);
const operationKinds = new Set(DATA_OPERATION_KINDS);
const schemaTypes = new Set<DataJsonSchemaType>([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'string',
  'integer',
]);

const isPlainRecord = (value: unknown): value is JsonRecord =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isDataJsonPointer = (value: string): boolean =>
  value.startsWith('/') && !/~(?:[^01]|$)/u.test(value);

const childPath = (path: string, segment: string): string =>
  `${path === '/' ? '' : path}/${escapePointerSegment(segment)}`;

const appendIssue = (
  issues: DataDocumentIssue[],
  path: string,
  message: string
): void => {
  issues.push(
    Object.freeze({
      code: DATA_DOCUMENT_ISSUE_CODES.invalid,
      path,
      message,
    })
  );
};

const readRecord = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): JsonRecord | undefined => {
  if (isPlainRecord(value)) return value;
  appendIssue(issues, path, 'Expected a plain object.');
  return undefined;
};

const checkExactKeys = (
  value: JsonRecord,
  required: ReadonlySet<string>,
  optional: ReadonlySet<string>,
  path: string,
  issues: DataDocumentIssue[]
): void => {
  for (const key of Object.keys(value)) {
    if (!required.has(key) && !optional.has(key)) {
      appendIssue(issues, childPath(path, key), `Unknown field "${key}".`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      appendIssue(
        issues,
        childPath(path, key),
        `Missing required field "${key}".`
      );
    }
  }
};

const readCanonicalString = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): string | undefined => {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !value.includes('\0')
  ) {
    return value;
  }
  appendIssue(
    issues,
    path,
    'Expected a non-empty canonical string without surrounding whitespace or null bytes.'
  );
  return undefined;
};

const readOptionalCanonicalString = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): string | undefined =>
  value === undefined ? undefined : readCanonicalString(value, path, issues);

const readBoolean = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  appendIssue(issues, path, 'Expected a boolean.');
  return undefined;
};

const readSafeInteger = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[],
  minimum: number
): number | undefined => {
  if (Number.isSafeInteger(value) && (value as number) >= minimum) {
    return value as number;
  }
  appendIssue(
    issues,
    path,
    `Expected a safe integer greater than or equal to ${minimum}.`
  );
  return undefined;
};

const cloneJsonValue = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[],
  ancestors = new Set<object>()
): DataJsonValue | undefined => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
    appendIssue(issues, path, 'JSON numbers must be finite.');
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    appendIssue(issues, path, 'Expected a JSON value.');
    return undefined;
  }
  if (ancestors.has(value)) {
    appendIssue(issues, path, 'JSON values must not contain cycles.');
    return undefined;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result: DataJsonValue[] = [];
    value.forEach((item, index) => {
      const cloned = cloneJsonValue(
        item,
        childPath(path, String(index)),
        issues,
        ancestors
      );
      if (cloned !== undefined) result.push(cloned);
    });
    ancestors.delete(value);
    return Object.freeze(result);
  }
  if (!isPlainRecord(value)) {
    ancestors.delete(value);
    appendIssue(issues, path, 'JSON objects must be plain object records.');
    return undefined;
  }
  const entries: [string, DataJsonValue][] = [];
  for (const key of Object.keys(value).sort(compareText)) {
    const cloned = cloneJsonValue(
      value[key],
      childPath(path, key),
      issues,
      ancestors
    );
    if (cloned !== undefined) entries.push([key, cloned]);
  }
  ancestors.delete(value);
  return Object.freeze(Object.fromEntries(entries));
};

const validateSchemaNode = (
  value: DataJsonValue,
  path: string,
  issues: DataDocumentIssue[],
  requireDialect: boolean
): void => {
  if (typeof value === 'boolean') return;
  if (!isPlainRecord(value)) {
    appendIssue(
      issues,
      path,
      'JSON Schema must be a boolean or object schema.'
    );
    return;
  }
  const dialect = value.$schema;
  if (requireDialect && dialect === undefined) {
    appendIssue(
      issues,
      childPath(path, '$schema'),
      `Object schemas must declare JSON Schema 2020-12 using "${JSON_SCHEMA_2020_12_URI}".`
    );
  } else if (dialect !== undefined && dialect !== JSON_SCHEMA_2020_12_URI) {
    appendIssue(
      issues,
      childPath(path, '$schema'),
      `Expected the JSON Schema 2020-12 dialect "${JSON_SCHEMA_2020_12_URI}".`
    );
  }

  for (const keyword of ['$id', '$ref', 'title', 'description'] as const) {
    const keywordValue = value[keyword];
    if (keywordValue !== undefined && typeof keywordValue !== 'string') {
      appendIssue(
        issues,
        childPath(path, keyword),
        `JSON Schema ${keyword} must be a string.`
      );
    }
  }

  const typeValue = value.type;
  if (typeValue !== undefined) {
    const values = Array.isArray(typeValue) ? typeValue : [typeValue];
    if (
      values.length === 0 ||
      values.some(
        (item) =>
          typeof item !== 'string' ||
          !schemaTypes.has(item as DataJsonSchemaType)
      ) ||
      new Set(values).size !== values.length
    ) {
      appendIssue(
        issues,
        childPath(path, 'type'),
        'JSON Schema type must be a supported type name or a non-empty unique array of type names.'
      );
    }
  }

  for (const keyword of ['$defs', 'properties'] as const) {
    const map = value[keyword];
    if (map === undefined) continue;
    if (!isPlainRecord(map)) {
      appendIssue(
        issues,
        childPath(path, keyword),
        `JSON Schema ${keyword} must be an object of schemas.`
      );
      continue;
    }
    for (const [key, schema] of Object.entries(map)) {
      validateSchemaNode(
        schema as DataJsonValue,
        childPath(childPath(path, keyword), key),
        issues,
        false
      );
    }
  }

  for (const keyword of ['additionalProperties', 'items', 'not'] as const) {
    const schema = value[keyword];
    if (schema !== undefined) {
      validateSchemaNode(
        schema as DataJsonValue,
        childPath(path, keyword),
        issues,
        false
      );
    }
  }

  for (const keyword of ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = value[keyword];
    if (schemas === undefined) continue;
    if (!Array.isArray(schemas)) {
      appendIssue(
        issues,
        childPath(path, keyword),
        `JSON Schema ${keyword} must be an array of schemas.`
      );
      continue;
    }
    schemas.forEach((schema, index) =>
      validateSchemaNode(
        schema,
        childPath(childPath(path, keyword), String(index)),
        issues,
        false
      )
    );
  }

  if (value.required !== undefined) {
    const required = value.required;
    if (
      !Array.isArray(required) ||
      required.some((item) => typeof item !== 'string') ||
      new Set(required).size !== required.length
    ) {
      appendIssue(
        issues,
        childPath(path, 'required'),
        'JSON Schema required must be a unique array of strings.'
      );
    }
  }
  for (const keyword of ['enum', 'examples'] as const) {
    if (value[keyword] !== undefined && !Array.isArray(value[keyword])) {
      appendIssue(
        issues,
        childPath(path, keyword),
        `JSON Schema ${keyword} must be an array.`
      );
    }
  }
};

const parseJsonSchema = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataJsonSchema202012 | undefined => {
  const normalized = cloneJsonValue(value, path, issues);
  if (normalized === undefined) return undefined;
  validateSchemaNode(normalized, path, issues, true);
  return normalized as DataJsonSchema202012;
};

const parseOperationReference = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOperationReference | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['documentId', 'operationId']),
    new Set(),
    path,
    issues
  );
  const documentId = readCanonicalString(
    record.documentId,
    childPath(path, 'documentId'),
    issues
  );
  const operationId = readCanonicalString(
    record.operationId,
    childPath(path, 'operationId'),
    issues
  );
  if (!documentId || !operationId) return undefined;
  return Object.freeze({ documentId, operationId });
};

const parseBinding = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataSourceBinding | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['kind', 'reference']),
    new Set(),
    path,
    issues
  );
  if (record.kind !== 'environment-ref' && record.kind !== 'secret-ref') {
    appendIssue(
      issues,
      childPath(path, 'kind'),
      'Binding kind must be "environment-ref" or "secret-ref".'
    );
    return undefined;
  }
  const referenceRecord = readRecord(
    record.reference,
    childPath(path, 'reference'),
    issues
  );
  if (!referenceRecord) return undefined;
  checkExactKeys(
    referenceRecord,
    new Set(['bindingId']),
    new Set(),
    childPath(path, 'reference'),
    issues
  );
  const bindingId = readCanonicalString(
    referenceRecord.bindingId,
    childPath(childPath(path, 'reference'), 'bindingId'),
    issues
  );
  if (!bindingId) return undefined;
  return Object.freeze({
    kind: record.kind,
    reference: Object.freeze({ bindingId }),
  });
};

const parseBindings = (
  value: unknown,
  path: string,
  runtimeZone: RuntimeZone | undefined,
  issues: DataDocumentIssue[]
): Readonly<Record<string, DataSourceBinding>> => {
  const record = readRecord(value, path, issues);
  if (!record) return Object.freeze({});
  const entries: [string, DataSourceBinding][] = [];
  for (const key of Object.keys(record).sort(compareText)) {
    const keyPath = childPath(path, key);
    const canonicalKey = readCanonicalString(key, keyPath, issues);
    const binding = parseBinding(record[key], keyPath, issues);
    if (!canonicalKey || !binding) continue;
    if (binding.reference.bindingId !== canonicalKey) {
      appendIssue(
        issues,
        childPath(childPath(keyPath, 'reference'), 'bindingId'),
        'Binding record key must equal reference.bindingId.'
      );
    }
    if (
      binding.kind === 'secret-ref' &&
      (runtimeZone === 'client' || runtimeZone === 'worker')
    ) {
      appendIssue(
        issues,
        keyPath,
        `Secret references are not permitted in the ${runtimeZone} runtime zone.`
      );
    }
    entries.push([canonicalKey, binding]);
  }
  return Object.freeze(Object.fromEntries(entries));
};

const parseConfigurationValue = (
  value: unknown,
  path: string,
  bindingsById: Readonly<Record<string, DataSourceBinding>>,
  runtimeZone: RuntimeZone | undefined,
  issues: DataDocumentIssue[]
): DataConfigurationValue | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  if (record.kind === 'literal') {
    checkExactKeys(record, new Set(['kind', 'value']), new Set(), path, issues);
    const literal = cloneJsonValue(
      record.value,
      childPath(path, 'value'),
      issues
    );
    if (literal === undefined) return undefined;
    return Object.freeze({ kind: 'literal', value: literal });
  }
  const binding = parseBinding(record, path, issues);
  if (!binding) {
    if (record.kind !== 'environment-ref' && record.kind !== 'secret-ref') {
      appendIssue(
        issues,
        childPath(path, 'kind'),
        'Configuration values must be literal, environment-ref, or secret-ref.'
      );
    }
    return undefined;
  }
  const declared = bindingsById[binding.reference.bindingId];
  if (!declared) {
    appendIssue(
      issues,
      childPath(childPath(path, 'reference'), 'bindingId'),
      `Binding "${binding.reference.bindingId}" is not declared by the data source.`
    );
  } else if (declared.kind !== binding.kind) {
    appendIssue(
      issues,
      childPath(path, 'kind'),
      `Binding "${binding.reference.bindingId}" is declared as ${declared.kind}.`
    );
  }
  if (
    binding.kind === 'secret-ref' &&
    (runtimeZone === 'client' || runtimeZone === 'worker')
  ) {
    appendIssue(
      issues,
      path,
      `Secret references are not permitted in the ${runtimeZone} runtime zone.`
    );
  }
  return binding;
};

const parseConfiguration = (
  value: unknown,
  path: string,
  bindingsById: Readonly<Record<string, DataSourceBinding>>,
  runtimeZone: RuntimeZone | undefined,
  issues: DataDocumentIssue[]
): Readonly<Record<string, DataConfigurationValue>> => {
  const record = readRecord(value, path, issues);
  if (!record) return Object.freeze({});
  const entries: [string, DataConfigurationValue][] = [];
  for (const key of Object.keys(record).sort(compareText)) {
    const keyPath = childPath(path, key);
    const canonicalKey = readCanonicalString(key, keyPath, issues);
    const parsed = parseConfigurationValue(
      record[key],
      keyPath,
      bindingsById,
      runtimeZone,
      issues
    );
    if (canonicalKey && parsed) entries.push([canonicalKey, parsed]);
  }
  return Object.freeze(Object.fromEntries(entries));
};

const parseSource = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataSourceDefinition | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set([
      'id',
      'adapterId',
      'runtimeZone',
      'bindingsById',
      'configurationByKey',
    ]),
    new Set(['name']),
    path,
    issues
  );
  const id = readCanonicalString(record.id, childPath(path, 'id'), issues);
  const name = readOptionalCanonicalString(
    record.name,
    childPath(path, 'name'),
    issues
  );
  const adapterId = readCanonicalString(
    record.adapterId,
    childPath(path, 'adapterId'),
    issues
  );
  let runtimeZone: RuntimeZone | undefined;
  if (runtimeZones.has(record.runtimeZone as RuntimeZone)) {
    runtimeZone = record.runtimeZone as RuntimeZone;
  } else {
    appendIssue(
      issues,
      childPath(path, 'runtimeZone'),
      'Unsupported runtime zone.'
    );
  }
  const bindingsById = parseBindings(
    record.bindingsById,
    childPath(path, 'bindingsById'),
    runtimeZone,
    issues
  );
  const configurationByKey = parseConfiguration(
    record.configurationByKey,
    childPath(path, 'configurationByKey'),
    bindingsById,
    runtimeZone,
    issues
  );
  if (!id || !adapterId || !runtimeZone) return undefined;
  return Object.freeze({
    id,
    ...(name ? { name } : {}),
    adapterId,
    runtimeZone,
    bindingsById,
    configurationByKey,
  });
};

const parseSchemas = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): Readonly<Record<string, DataSchema>> => {
  const record = readRecord(value, path, issues);
  if (!record) return Object.freeze({});
  const entries: [string, DataSchema][] = [];
  for (const key of Object.keys(record).sort(compareText)) {
    const schemaPath = childPath(path, key);
    const canonicalKey = readCanonicalString(key, schemaPath, issues);
    const rawSchema = readRecord(record[key], schemaPath, issues);
    if (!canonicalKey || !rawSchema) continue;
    checkExactKeys(
      rawSchema,
      new Set(['id', 'schema']),
      new Set(['name', 'description']),
      schemaPath,
      issues
    );
    const id = readCanonicalString(
      rawSchema.id,
      childPath(schemaPath, 'id'),
      issues
    );
    const name = readOptionalCanonicalString(
      rawSchema.name,
      childPath(schemaPath, 'name'),
      issues
    );
    const description = readOptionalCanonicalString(
      rawSchema.description,
      childPath(schemaPath, 'description'),
      issues
    );
    const schema = parseJsonSchema(
      rawSchema.schema,
      childPath(schemaPath, 'schema'),
      issues
    );
    if (id && id !== canonicalKey) {
      appendIssue(
        issues,
        childPath(schemaPath, 'id'),
        'Schema record key must equal schema.id.'
      );
    }
    if (!id || schema === undefined) continue;
    entries.push([
      canonicalKey,
      Object.freeze({
        id,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        schema,
      }),
    ]);
  }
  return Object.freeze(Object.fromEntries(entries));
};

const parseCachePolicy = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataCachePolicy | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['strategy']),
    new Set(['ttlMs', 'staleWhileRevalidateMs', 'keyInputPaths']),
    path,
    issues
  );
  const strategies = new Set([
    'no-store',
    'cache-first',
    'network-first',
    'stale-while-revalidate',
  ]);
  if (typeof record.strategy !== 'string' || !strategies.has(record.strategy)) {
    appendIssue(
      issues,
      childPath(path, 'strategy'),
      'Unsupported cache strategy.'
    );
    return undefined;
  }
  const ttlMs =
    record.ttlMs === undefined
      ? undefined
      : readSafeInteger(record.ttlMs, childPath(path, 'ttlMs'), issues, 1);
  const staleWhileRevalidateMs =
    record.staleWhileRevalidateMs === undefined
      ? undefined
      : readSafeInteger(
          record.staleWhileRevalidateMs,
          childPath(path, 'staleWhileRevalidateMs'),
          issues,
          1
        );
  if (ttlMs !== undefined && ttlMs > DATA_CACHE_POLICY_LIMITS.maxDurationMs)
    appendIssue(
      issues,
      childPath(path, 'ttlMs'),
      `Cache ttlMs must not exceed ${DATA_CACHE_POLICY_LIMITS.maxDurationMs}.`
    );
  if (
    staleWhileRevalidateMs !== undefined &&
    staleWhileRevalidateMs > DATA_CACHE_POLICY_LIMITS.maxDurationMs
  )
    appendIssue(
      issues,
      childPath(path, 'staleWhileRevalidateMs'),
      `Cache staleWhileRevalidateMs must not exceed ${DATA_CACHE_POLICY_LIMITS.maxDurationMs}.`
    );
  if (
    ttlMs !== undefined &&
    staleWhileRevalidateMs !== undefined &&
    ttlMs + staleWhileRevalidateMs > DATA_CACHE_POLICY_LIMITS.maxDurationMs
  )
    appendIssue(
      issues,
      path,
      `Cache fresh and stale retention must not exceed ${DATA_CACHE_POLICY_LIMITS.maxDurationMs}.`
    );
  let keyInputPaths: readonly string[] | undefined;
  if (record.keyInputPaths !== undefined) {
    if (!Array.isArray(record.keyInputPaths)) {
      appendIssue(
        issues,
        childPath(path, 'keyInputPaths'),
        'Expected an array.'
      );
    } else {
      if (
        record.keyInputPaths.length > DATA_CACHE_POLICY_LIMITS.maxKeyInputPaths
      )
        appendIssue(
          issues,
          childPath(path, 'keyInputPaths'),
          `Cache key input paths must not exceed ${DATA_CACHE_POLICY_LIMITS.maxKeyInputPaths} entries.`
        );
      const paths = record.keyInputPaths
        .map((item, index) =>
          readCanonicalString(
            item,
            childPath(childPath(path, 'keyInputPaths'), String(index)),
            issues
          )
        )
        .filter((item): item is string => Boolean(item));
      paths.forEach((pointer, index) => {
        if (!isDataJsonPointer(pointer))
          appendIssue(
            issues,
            childPath(childPath(path, 'keyInputPaths'), String(index)),
            'Cache key input paths must be RFC 6901 JSON Pointers.'
          );
      });
      if (new Set(paths).size !== paths.length) {
        appendIssue(
          issues,
          childPath(path, 'keyInputPaths'),
          'Cache key input paths must be unique.'
        );
      }
      keyInputPaths = Object.freeze(paths);
    }
  }
  if (record.strategy === 'no-store') {
    if (
      record.ttlMs !== undefined ||
      record.staleWhileRevalidateMs !== undefined ||
      record.keyInputPaths !== undefined
    )
      appendIssue(
        issues,
        path,
        'no-store cache policy cannot declare cache lifetime or key fields.'
      );
  } else if (ttlMs === undefined) {
    appendIssue(
      issues,
      childPath(path, 'ttlMs'),
      'Stored cache policies require a positive ttlMs.'
    );
  }
  if (record.strategy === 'cache-first' && staleWhileRevalidateMs !== undefined)
    appendIssue(
      issues,
      childPath(path, 'staleWhileRevalidateMs'),
      'cache-first does not accept staleWhileRevalidateMs.'
    );
  if (
    record.strategy === 'stale-while-revalidate' &&
    staleWhileRevalidateMs === undefined
  )
    appendIssue(
      issues,
      childPath(path, 'staleWhileRevalidateMs'),
      'stale-while-revalidate requires a positive staleWhileRevalidateMs.'
    );
  return Object.freeze({
    strategy: record.strategy as DataCachePolicy['strategy'],
    ...(ttlMs !== undefined ? { ttlMs } : {}),
    ...(staleWhileRevalidateMs !== undefined ? { staleWhileRevalidateMs } : {}),
    ...(keyInputPaths ? { keyInputPaths } : {}),
  }) as DataCachePolicy;
};

const parseRetryPolicy = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataRetryPolicy | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['maxAttempts', 'backoff', 'initialDelayMs']),
    new Set(['maxDelayMs']),
    path,
    issues
  );
  const maxAttempts = readSafeInteger(
    record.maxAttempts,
    childPath(path, 'maxAttempts'),
    issues,
    1
  );
  const initialDelayMs = readSafeInteger(
    record.initialDelayMs,
    childPath(path, 'initialDelayMs'),
    issues,
    0
  );
  const maxDelayMs =
    record.maxDelayMs === undefined
      ? undefined
      : readSafeInteger(
          record.maxDelayMs,
          childPath(path, 'maxDelayMs'),
          issues,
          0
        );
  if (record.backoff !== 'fixed' && record.backoff !== 'exponential') {
    appendIssue(
      issues,
      childPath(path, 'backoff'),
      'Retry backoff must be "fixed" or "exponential".'
    );
  }
  if (
    initialDelayMs !== undefined &&
    maxDelayMs !== undefined &&
    maxDelayMs < initialDelayMs
  ) {
    appendIssue(
      issues,
      childPath(path, 'maxDelayMs'),
      'Retry maxDelayMs must be greater than or equal to initialDelayMs.'
    );
  }
  if (
    maxAttempts === undefined ||
    initialDelayMs === undefined ||
    (record.backoff !== 'fixed' && record.backoff !== 'exponential')
  ) {
    return undefined;
  }
  return Object.freeze({
    maxAttempts,
    backoff: record.backoff,
    initialDelayMs,
    ...(maxDelayMs !== undefined ? { maxDelayMs } : {}),
  });
};

const parseIdempotencyPolicy = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOperationPolicies['idempotency'] | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(record, new Set(['kind']), new Set(), path, issues);
  if (record.kind !== 'invocation-key') {
    appendIssue(
      issues,
      childPath(path, 'kind'),
      'Idempotency kind must be "invocation-key".'
    );
    return undefined;
  }
  return Object.freeze({ kind: 'invocation-key' });
};

const parsePaginationPolicy = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOffsetPaginationPolicy | DataCursorPaginationPolicy | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  const commonOptional = new Set(['maxLimit']);
  if (record.kind === 'offset') {
    checkExactKeys(
      record,
      new Set(['kind', 'offsetInput', 'limitInput', 'defaultLimit']),
      new Set([...commonOptional, 'totalPath']),
      path,
      issues
    );
  } else if (record.kind === 'cursor') {
    checkExactKeys(
      record,
      new Set([
        'kind',
        'cursorInput',
        'limitInput',
        'defaultLimit',
        'nextCursorPath',
      ]),
      new Set([...commonOptional, 'previousCursorPath']),
      path,
      issues
    );
  } else {
    appendIssue(
      issues,
      childPath(path, 'kind'),
      'Pagination kind must be "offset" or "cursor".'
    );
    return undefined;
  }
  const defaultLimit = readSafeInteger(
    record.defaultLimit,
    childPath(path, 'defaultLimit'),
    issues,
    1
  );
  const maxLimit =
    record.maxLimit === undefined
      ? undefined
      : readSafeInteger(
          record.maxLimit,
          childPath(path, 'maxLimit'),
          issues,
          1
        );
  if (
    defaultLimit !== undefined &&
    maxLimit !== undefined &&
    maxLimit < defaultLimit
  ) {
    appendIssue(
      issues,
      childPath(path, 'maxLimit'),
      'Pagination maxLimit must be greater than or equal to defaultLimit.'
    );
  }
  const limitInput = readCanonicalString(
    record.limitInput,
    childPath(path, 'limitInput'),
    issues
  );
  if (record.kind === 'offset') {
    const offsetInput = readCanonicalString(
      record.offsetInput,
      childPath(path, 'offsetInput'),
      issues
    );
    const totalPath = readOptionalCanonicalString(
      record.totalPath,
      childPath(path, 'totalPath'),
      issues
    );
    if (!offsetInput || !limitInput || defaultLimit === undefined)
      return undefined;
    if (offsetInput === limitInput)
      appendIssue(
        issues,
        childPath(path, 'limitInput'),
        'Pagination offsetInput and limitInput must be distinct.'
      );
    return Object.freeze({
      kind: 'offset',
      offsetInput,
      limitInput,
      defaultLimit,
      ...(maxLimit !== undefined ? { maxLimit } : {}),
      ...(totalPath ? { totalPath } : {}),
    });
  }
  const cursorInput = readCanonicalString(
    record.cursorInput,
    childPath(path, 'cursorInput'),
    issues
  );
  const nextCursorPath = readCanonicalString(
    record.nextCursorPath,
    childPath(path, 'nextCursorPath'),
    issues
  );
  const previousCursorPath = readOptionalCanonicalString(
    record.previousCursorPath,
    childPath(path, 'previousCursorPath'),
    issues
  );
  if (
    !cursorInput ||
    !limitInput ||
    !nextCursorPath ||
    defaultLimit === undefined
  ) {
    return undefined;
  }
  if (cursorInput === limitInput)
    appendIssue(
      issues,
      childPath(path, 'limitInput'),
      'Pagination cursorInput and limitInput must be distinct.'
    );
  return Object.freeze({
    kind: 'cursor',
    cursorInput,
    limitInput,
    defaultLimit,
    ...(maxLimit !== undefined ? { maxLimit } : {}),
    nextCursorPath,
    ...(previousCursorPath ? { previousCursorPath } : {}),
  });
};

const parseOptimisticPolicy = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOptimisticCrudEffectPolicy | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['kind', 'action', 'target', 'rollback']),
    new Set(['entityIdPath', 'valueInputPath', 'valueOutputPath', 'placement']),
    path,
    issues
  );
  if (record.kind !== 'crud') {
    appendIssue(
      issues,
      childPath(path, 'kind'),
      'Optimistic effect kind must be "crud".'
    );
  }
  if (
    record.action !== 'create' &&
    record.action !== 'update' &&
    record.action !== 'delete'
  ) {
    appendIssue(
      issues,
      childPath(path, 'action'),
      'Unsupported optimistic CRUD action.'
    );
  }
  if (record.rollback !== 'on-error') {
    appendIssue(
      issues,
      childPath(path, 'rollback'),
      'Optimistic rollback must be "on-error".'
    );
  }
  if (
    record.placement !== undefined &&
    record.placement !== 'start' &&
    record.placement !== 'end'
  ) {
    appendIssue(
      issues,
      childPath(path, 'placement'),
      'Placement must be "start" or "end".'
    );
  }
  const target = parseOperationReference(
    record.target,
    childPath(path, 'target'),
    issues
  );
  const entityIdPath = readOptionalCanonicalString(
    record.entityIdPath,
    childPath(path, 'entityIdPath'),
    issues
  );
  const valueInputPath = readOptionalCanonicalString(
    record.valueInputPath,
    childPath(path, 'valueInputPath'),
    issues
  );
  const valueOutputPath = readOptionalCanonicalString(
    record.valueOutputPath,
    childPath(path, 'valueOutputPath'),
    issues
  );
  for (const [field, pointer] of [
    ['entityIdPath', entityIdPath],
    ['valueInputPath', valueInputPath],
    ['valueOutputPath', valueOutputPath],
  ] as const) {
    if (pointer && !isDataJsonPointer(pointer))
      appendIssue(
        issues,
        childPath(path, field),
        `${field} must be an RFC 6901 JSON Pointer.`
      );
  }
  if (
    (record.action === 'create' || record.action === 'update') &&
    (!valueInputPath || !valueOutputPath)
  )
    appendIssue(
      issues,
      path,
      'Optimistic create/update requires valueInputPath and valueOutputPath.'
    );
  if (
    (record.action === 'update' || record.action === 'delete') &&
    !entityIdPath
  )
    appendIssue(
      issues,
      childPath(path, 'entityIdPath'),
      'Optimistic update/delete requires entityIdPath.'
    );
  if (record.action !== 'create' && record.placement !== undefined)
    appendIssue(
      issues,
      childPath(path, 'placement'),
      'Placement is available only to optimistic create.'
    );
  if (
    record.kind !== 'crud' ||
    (record.action !== 'create' &&
      record.action !== 'update' &&
      record.action !== 'delete') ||
    record.rollback !== 'on-error' ||
    !target
  ) {
    return undefined;
  }
  return Object.freeze({
    kind: 'crud',
    action: record.action,
    target,
    ...(entityIdPath ? { entityIdPath } : {}),
    ...(valueInputPath ? { valueInputPath } : {}),
    ...(valueOutputPath ? { valueOutputPath } : {}),
    ...(record.placement === 'start' || record.placement === 'end'
      ? { placement: record.placement }
      : {}),
    rollback: 'on-error',
  });
};

const parsePolicies = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOperationPolicies => {
  const record = readRecord(value, path, issues);
  if (!record) return Object.freeze({});
  checkExactKeys(
    record,
    new Set(),
    new Set(['cache', 'retry', 'idempotency', 'pagination', 'optimistic']),
    path,
    issues
  );
  const cache =
    record.cache === undefined
      ? undefined
      : parseCachePolicy(record.cache, childPath(path, 'cache'), issues);
  const retry =
    record.retry === undefined
      ? undefined
      : parseRetryPolicy(record.retry, childPath(path, 'retry'), issues);
  const idempotency =
    record.idempotency === undefined
      ? undefined
      : parseIdempotencyPolicy(
          record.idempotency,
          childPath(path, 'idempotency'),
          issues
        );
  const pagination =
    record.pagination === undefined
      ? undefined
      : parsePaginationPolicy(
          record.pagination,
          childPath(path, 'pagination'),
          issues
        );
  const optimistic =
    record.optimistic === undefined
      ? undefined
      : parseOptimisticPolicy(
          record.optimistic,
          childPath(path, 'optimistic'),
          issues
        );
  return Object.freeze({
    ...(cache ? { cache } : {}),
    ...(retry ? { retry } : {}),
    ...(idempotency ? { idempotency } : {}),
    ...(pagination ? { pagination } : {}),
    ...(optimistic ? { optimistic } : {}),
  });
};

const parseOperations = (
  value: unknown,
  path: string,
  source: DataSourceDefinition | undefined,
  issues: DataDocumentIssue[]
): Readonly<Record<string, DataOperation>> => {
  const record = readRecord(value, path, issues);
  if (!record) return Object.freeze({});
  const entries: [string, DataOperation][] = [];
  for (const key of Object.keys(record).sort(compareText)) {
    const operationPath = childPath(path, key);
    const canonicalKey = readCanonicalString(key, operationPath, issues);
    const rawOperation = readRecord(record[key], operationPath, issues);
    if (!canonicalKey || !rawOperation) continue;
    checkExactKeys(
      rawOperation,
      new Set([
        'id',
        'kind',
        'outputSchemaId',
        'configurationByKey',
        'policies',
      ]),
      new Set(['name', 'description', 'inputSchemaId']),
      operationPath,
      issues
    );
    const id = readCanonicalString(
      rawOperation.id,
      childPath(operationPath, 'id'),
      issues
    );
    const name = readOptionalCanonicalString(
      rawOperation.name,
      childPath(operationPath, 'name'),
      issues
    );
    const description = readOptionalCanonicalString(
      rawOperation.description,
      childPath(operationPath, 'description'),
      issues
    );
    const inputSchemaId = readOptionalCanonicalString(
      rawOperation.inputSchemaId,
      childPath(operationPath, 'inputSchemaId'),
      issues
    );
    const outputSchemaId = readCanonicalString(
      rawOperation.outputSchemaId,
      childPath(operationPath, 'outputSchemaId'),
      issues
    );
    if (!operationKinds.has(rawOperation.kind as DataOperation['kind'])) {
      appendIssue(
        issues,
        childPath(operationPath, 'kind'),
        'Operation kind must be "query" or "mutation".'
      );
    }
    const configurationByKey = parseConfiguration(
      rawOperation.configurationByKey,
      childPath(operationPath, 'configurationByKey'),
      source?.bindingsById ?? Object.freeze({}),
      source?.runtimeZone,
      issues
    );
    const policies = parsePolicies(
      rawOperation.policies,
      childPath(operationPath, 'policies'),
      issues
    );
    if (id && id !== canonicalKey) {
      appendIssue(
        issues,
        childPath(operationPath, 'id'),
        'Operation record key must equal operation.id.'
      );
    }
    if (
      rawOperation.kind === 'mutation' &&
      (policies.cache || policies.pagination)
    ) {
      appendIssue(
        issues,
        childPath(operationPath, 'policies'),
        'Cache and pagination policies are available only to query operations.'
      );
    }
    if (
      rawOperation.kind === 'mutation' &&
      policies.retry &&
      policies.retry.maxAttempts > 1 &&
      !policies.idempotency
    )
      appendIssue(
        issues,
        childPath(childPath(operationPath, 'policies'), 'retry'),
        'Mutation retry requires an explicit invocation-key idempotency contract.'
      );
    if (rawOperation.kind === 'query' && policies.idempotency) {
      appendIssue(
        issues,
        childPath(childPath(operationPath, 'policies'), 'idempotency'),
        'Idempotency policies are available only to mutation operations.'
      );
    }
    if (rawOperation.kind === 'query' && policies.optimistic) {
      appendIssue(
        issues,
        childPath(childPath(operationPath, 'policies'), 'optimistic'),
        'Optimistic CRUD effects are available only to mutation operations.'
      );
    }
    if (
      !id ||
      !outputSchemaId ||
      !operationKinds.has(rawOperation.kind as DataOperation['kind'])
    ) {
      continue;
    }
    entries.push([
      canonicalKey,
      Object.freeze({
        id,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        kind: rawOperation.kind as DataOperation['kind'],
        ...(inputSchemaId ? { inputSchemaId } : {}),
        outputSchemaId,
        configurationByKey,
        policies,
      }),
    ]);
  }
  return Object.freeze(Object.fromEntries(entries));
};

const validateRelations = (
  document: DataSourceDocument,
  options: DataSourceDocumentValidationOptions,
  issues: DataDocumentIssue[]
): void => {
  for (const operation of Object.values(document.operationsById)) {
    const operationPath = childPath('/operationsById', operation.id);
    for (const [field, schemaId] of [
      ['inputSchemaId', operation.inputSchemaId],
      ['outputSchemaId', operation.outputSchemaId],
    ] as const) {
      if (schemaId && !document.schemasById[schemaId]) {
        appendIssue(
          issues,
          childPath(operationPath, field),
          `Schema "${schemaId}" does not exist in this data source document.`
        );
      }
    }
    const optimistic = operation.policies.optimistic;
    if (
      optimistic &&
      options.documentId &&
      optimistic.target.documentId === options.documentId
    ) {
      const target = document.operationsById[optimistic.target.operationId];
      if (!target) {
        appendIssue(
          issues,
          `${operationPath}/policies/optimistic/target/operationId`,
          `Optimistic target operation "${optimistic.target.operationId}" does not exist.`
        );
      } else if (target.kind !== 'query') {
        appendIssue(
          issues,
          `${operationPath}/policies/optimistic/target/operationId`,
          'Optimistic CRUD effects must target a query operation.'
        );
      }
    }
  }
};

/** Internal current-model decoder shared by validation and the strict wire boundary. */
export const decodeCurrentDataSourceDocument = (
  input: unknown,
  options: DataSourceDocumentValidationOptions = {}
): DataSourceDocumentDecodeResult => {
  const issues: DataDocumentIssue[] = [];
  if (options.documentId !== undefined) {
    readCanonicalString(options.documentId, '/@documentId', issues);
  }
  const record = readRecord(input, '/', issues);
  if (!record)
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  checkExactKeys(
    record,
    new Set(['source', 'schemasById', 'operationsById']),
    new Set(),
    '/',
    issues
  );
  const source = parseSource(record.source, '/source', issues);
  const schemasById = parseSchemas(record.schemasById, '/schemasById', issues);
  const operationsById = parseOperations(
    record.operationsById,
    '/operationsById',
    source,
    issues
  );
  if (!source) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const document: DataSourceDocument = Object.freeze({
    source,
    schemasById,
    operationsById,
  });
  validateRelations(document, options, issues);
  return issues.length > 0
    ? Object.freeze({ ok: false, issues: Object.freeze(issues) })
    : Object.freeze({ ok: true, value: document });
};

export const validateDataSourceDocument = (
  input: unknown,
  options: DataSourceDocumentValidationOptions = {}
): DataSourceDocumentValidationResult => {
  const decoded = decodeCurrentDataSourceDocument(input, options);
  return decoded.ok
    ? Object.freeze({ valid: true, issues: Object.freeze([]) })
    : Object.freeze({ valid: false, issues: decoded.issues });
};

export const normalizeDataSourceDocument = (
  input: DataSourceDocument,
  options: DataSourceDocumentValidationOptions = {}
): DataSourceDocument => {
  const decoded = decodeCurrentDataSourceDocument(input, options);
  if (decoded.ok) return decoded.value;
  const summary = decoded.issues
    .slice(0, 5)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ');
  throw new TypeError(`Invalid data source document: ${summary}`);
};

export const createDataOperationReference = (
  input: DataOperationReference
): DataOperationReference => {
  const issues: DataDocumentIssue[] = [];
  const reference = parseOperationReference(input, '/', issues);
  if (reference && issues.length === 0) return reference;
  throw new TypeError(
    `Invalid data operation reference: ${issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
};

const parsePageSnapshot = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataPageSnapshot | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  if (record.kind === 'offset') {
    checkExactKeys(
      record,
      new Set(['kind', 'offset', 'limit', 'hasMore']),
      new Set(['total']),
      path,
      issues
    );
    const offset = readSafeInteger(
      record.offset,
      childPath(path, 'offset'),
      issues,
      0
    );
    const limit = readSafeInteger(
      record.limit,
      childPath(path, 'limit'),
      issues,
      1
    );
    const total =
      record.total === undefined
        ? undefined
        : readSafeInteger(record.total, childPath(path, 'total'), issues, 0);
    const hasMore = readBoolean(
      record.hasMore,
      childPath(path, 'hasMore'),
      issues
    );
    if (total !== undefined && offset !== undefined && offset > total) {
      appendIssue(
        issues,
        childPath(path, 'offset'),
        'Page offset must not exceed total.'
      );
    }
    if (offset === undefined || limit === undefined || hasMore === undefined)
      return undefined;
    const result: DataOffsetPageSnapshot = Object.freeze({
      kind: 'offset',
      offset,
      limit,
      ...(total !== undefined ? { total } : {}),
      hasMore,
    });
    return result;
  }
  if (record.kind === 'cursor') {
    checkExactKeys(
      record,
      new Set(['kind', 'hasMore']),
      new Set(['nextCursor', 'previousCursor']),
      path,
      issues
    );
    const nextCursor = readOptionalCanonicalString(
      record.nextCursor,
      childPath(path, 'nextCursor'),
      issues
    );
    const previousCursor = readOptionalCanonicalString(
      record.previousCursor,
      childPath(path, 'previousCursor'),
      issues
    );
    const hasMore = readBoolean(
      record.hasMore,
      childPath(path, 'hasMore'),
      issues
    );
    if (hasMore && !nextCursor) {
      appendIssue(
        issues,
        childPath(path, 'nextCursor'),
        'Cursor pages with hasMore=true must declare nextCursor.'
      );
    }
    if (hasMore === undefined) return undefined;
    const result: DataCursorPageSnapshot = Object.freeze({
      kind: 'cursor',
      ...(nextCursor ? { nextCursor } : {}),
      ...(previousCursor ? { previousCursor } : {}),
      hasMore,
    });
    return result;
  }
  appendIssue(
    issues,
    childPath(path, 'kind'),
    'Page kind must be "offset" or "cursor".'
  );
  return undefined;
};

const parseOperationError = (
  value: unknown,
  path: string,
  issues: DataDocumentIssue[]
): DataOperationError | undefined => {
  const record = readRecord(value, path, issues);
  if (!record) return undefined;
  checkExactKeys(
    record,
    new Set(['code', 'message', 'retryable']),
    new Set(['details']),
    path,
    issues
  );
  const code = readCanonicalString(
    record.code,
    childPath(path, 'code'),
    issues
  );
  const message = readCanonicalString(
    record.message,
    childPath(path, 'message'),
    issues
  );
  const retryable = readBoolean(
    record.retryable,
    childPath(path, 'retryable'),
    issues
  );
  let details: DataJsonObject | undefined;
  if (record.details !== undefined) {
    const normalized = cloneJsonValue(
      record.details,
      childPath(path, 'details'),
      issues
    );
    if (normalized !== undefined && isPlainRecord(normalized)) {
      details = normalized as DataJsonObject;
    } else if (normalized !== undefined) {
      appendIssue(
        issues,
        childPath(path, 'details'),
        'Error details must be a JSON object.'
      );
    }
  }
  if (!code || !message || retryable === undefined) return undefined;
  return Object.freeze({
    code,
    message,
    retryable,
    ...(details ? { details } : {}),
  });
};

export const createDataLifecycleSnapshot = <
  Snapshot extends DataLifecycleSnapshot,
>(
  input: Snapshot
): Snapshot => {
  const issues: DataDocumentIssue[] = [];
  const record = readRecord(input, '/', issues);
  if (!record)
    throw new TypeError('Invalid data lifecycle snapshot: expected an object.');
  const operation = parseOperationReference(
    record.operation,
    '/operation',
    issues
  );
  const sequence = readSafeInteger(record.sequence, '/sequence', issues, 0);
  const status = record.status;
  if (
    status !== 'idle' &&
    status !== 'loading' &&
    status !== 'success' &&
    status !== 'empty' &&
    status !== 'error'
  ) {
    appendIssue(issues, '/status', 'Unsupported data lifecycle status.');
  }
  const requiredByStatus: Record<string, readonly string[]> = {
    idle: ['operation', 'sequence', 'status'],
    loading: [
      'operation',
      'sequence',
      'status',
      'invocationId',
      'attempt',
      'startedAt',
    ],
    success: [
      'operation',
      'sequence',
      'status',
      'invocationId',
      'attempt',
      'startedAt',
      'completedAt',
      'value',
    ],
    empty: [
      'operation',
      'sequence',
      'status',
      'invocationId',
      'attempt',
      'startedAt',
      'completedAt',
    ],
    error: [
      'operation',
      'sequence',
      'status',
      'invocationId',
      'attempt',
      'startedAt',
      'completedAt',
      'error',
    ],
  };
  const optionalByStatus: Record<string, readonly string[]> = {
    idle: [],
    loading: [],
    success: ['page'],
    empty: ['page'],
    error: [],
  };
  if (typeof status === 'string' && requiredByStatus[status]) {
    checkExactKeys(
      record,
      new Set(requiredByStatus[status]),
      new Set(optionalByStatus[status]),
      '/',
      issues
    );
  }
  let result: DataLifecycleSnapshot | undefined;
  if (operation && sequence !== undefined && status === 'idle') {
    result = Object.freeze({ operation, sequence, status });
  } else if (
    operation &&
    sequence !== undefined &&
    (status === 'loading' ||
      status === 'success' ||
      status === 'empty' ||
      status === 'error')
  ) {
    const invocationId = readCanonicalString(
      record.invocationId,
      '/invocationId',
      issues
    );
    const attempt = readSafeInteger(record.attempt, '/attempt', issues, 1);
    const startedAt = readSafeInteger(
      record.startedAt,
      '/startedAt',
      issues,
      0
    );
    const completedAt =
      status === 'loading'
        ? undefined
        : readSafeInteger(record.completedAt, '/completedAt', issues, 0);
    if (
      startedAt !== undefined &&
      completedAt !== undefined &&
      completedAt < startedAt
    ) {
      appendIssue(
        issues,
        '/completedAt',
        'completedAt must not precede startedAt.'
      );
    }
    if (invocationId && attempt !== undefined && startedAt !== undefined) {
      if (status === 'loading') {
        result = Object.freeze({
          operation,
          sequence,
          status,
          invocationId,
          attempt,
          startedAt,
        });
      } else if (completedAt !== undefined) {
        if (status === 'success') {
          const value = cloneJsonValue(record.value, '/value', issues);
          const page =
            record.page === undefined
              ? undefined
              : parsePageSnapshot(record.page, '/page', issues);
          if (value !== undefined) {
            result = Object.freeze({
              operation,
              sequence,
              status,
              invocationId,
              attempt,
              startedAt,
              completedAt,
              value,
              ...(page ? { page } : {}),
            });
          }
        } else if (status === 'empty') {
          const page =
            record.page === undefined
              ? undefined
              : parsePageSnapshot(record.page, '/page', issues);
          result = Object.freeze({
            operation,
            sequence,
            status,
            invocationId,
            attempt,
            startedAt,
            completedAt,
            ...(page ? { page } : {}),
          });
        } else {
          const error = parseOperationError(record.error, '/error', issues);
          if (error) {
            result = Object.freeze({
              operation,
              sequence,
              status,
              invocationId,
              attempt,
              startedAt,
              completedAt,
              error,
            });
          }
        }
      }
    }
  }
  if (result && issues.length === 0) return result as Snapshot;
  throw new TypeError(
    `Invalid data lifecycle snapshot: ${issues
      .slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
};
