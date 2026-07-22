import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  JSON_SCHEMA_2020_12_URI,
  normalizeDataSourceDocument,
  type DataConfigurationValue,
  type DataImportEntityMapping,
  type DataImportProvenance,
  type DataJsonSchema202012,
  type DataJsonValue,
  type DataOperation,
  type DataSchema,
  type DataSourceBinding,
  type DataSourceDefinition,
  type DataSourceDocument,
} from '@prodivix/data';
import type { RuntimeZone } from '@prodivix/runtime-core';
import { DATA_HTTP_ADAPTER_ID } from './dataHttpAdapter';

export const DATA_OPENAPI_IMPORT_LIMITS = Object.freeze({
  maxDocumentBytes: 4 * 1024 * 1024,
  maxDepth: 64,
  maxNodes: 100_000,
  maxPaths: 256,
  maxOperations: 512,
  maxSchemas: 256,
  maxParametersPerOperation: 128,
  maxGeneratedSchemaBytes: 16 * 1024 * 1024,
} as const);

export const DATA_OPENAPI_IMPORT_ISSUE_CODES = Object.freeze({
  invalidDocument: 'DATA_OPENAPI_INVALID_DOCUMENT',
  unsupportedVersion: 'DATA_OPENAPI_UNSUPPORTED_VERSION',
  unsupportedShape: 'DATA_OPENAPI_UNSUPPORTED_SHAPE',
  limitExceeded: 'DATA_OPENAPI_LIMIT_EXCEEDED',
  securityUnsupported: 'DATA_OPENAPI_SECURITY_UNSUPPORTED',
  targetDrift: 'DATA_OPENAPI_TARGET_DRIFT',
  reimportConflict: 'DATA_OPENAPI_REIMPORT_CONFLICT',
  impactRequired: 'DATA_OPENAPI_IMPACT_REQUIRED',
} as const);

export type DataOpenApiImportIssueCode =
  (typeof DATA_OPENAPI_IMPORT_ISSUE_CODES)[keyof typeof DATA_OPENAPI_IMPORT_ISSUE_CODES];

export type DataOpenApiImportIssue = Readonly<{
  code: DataOpenApiImportIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}>;

export type DataOpenApiImportChange = Readonly<{
  entity: 'source' | 'schema' | 'operation';
  change: 'add' | 'update' | 'preserve-local' | 'remove';
  targetId: string;
  externalId?: string;
}>;

export type DataOpenApiImportImpact = Readonly<{
  schemaIds: readonly string[];
  operationIds: readonly string[];
}>;

export type DataOpenApiImpactApproval = Readonly<{
  schemaIds: readonly string[];
  operationIds: readonly string[];
}>;

export type CreateDataOpenApiImportProposalInput = Readonly<{
  spec: unknown;
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
  runtimeZone?: Extract<RuntimeZone, 'client' | 'server' | 'edge'>;
  baseUrl?: string;
  currentDocument?: DataSourceDocument;
  impactApproval?: DataOpenApiImpactApproval;
}>;

type DataOpenApiBlockedStatus = 'invalid' | 'conflict' | 'impact-required';

export type DataOpenApiImportTarget = Readonly<{
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
}>;

export type DataOpenApiImportProposal =
  | Readonly<{
      status: 'ready';
      target: DataOpenApiImportTarget;
      document: DataSourceDocument;
      changes: readonly DataOpenApiImportChange[];
      impact: DataOpenApiImportImpact;
      issues: readonly DataOpenApiImportIssue[];
    }>
  | Readonly<{
      status: DataOpenApiBlockedStatus;
      target: DataOpenApiImportTarget;
      changes: readonly DataOpenApiImportChange[];
      impact: DataOpenApiImportImpact;
      issues: readonly DataOpenApiImportIssue[];
    }>;

type JsonRecord = Record<string, unknown>;

type ImportedSchema = Readonly<{
  externalId: string;
  targetId: string;
  value: DataSchema;
  digest: string;
}>;

type ImportedOperation = Readonly<{
  externalId: string;
  targetId: string;
  value: DataOperation;
  digest: string;
}>;

type ImportedProjection = Readonly<{
  source: DataSourceDefinition;
  sourceDigest: string;
  specificationDigest: string;
  schemas: ReadonlyMap<string, ImportedSchema>;
  operations: ReadonlyMap<string, ImportedOperation>;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const pointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const childPath = (path: string, segment: string): string =>
  `${path === '/' ? '' : path}/${pointerSegment(segment)}`;

const isPlainRecord = (value: unknown): value is JsonRecord =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );

const issue = (
  issues: DataOpenApiImportIssue[],
  code: DataOpenApiImportIssueCode,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
): void => {
  issues.push(Object.freeze({ code, severity, path, message }));
};

const canonical = (
  value: unknown,
  path: string,
  issues: DataOpenApiImportIssue[]
): string | undefined => {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !value.includes('\0')
  ) {
    return value;
  }
  issue(
    issues,
    DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
    path,
    'Expected a non-empty canonical string.'
  );
  return undefined;
};

const recordAt = (
  value: unknown,
  path: string,
  issues: DataOpenApiImportIssue[],
  required = true
): JsonRecord | undefined => {
  if (value === undefined && !required) return undefined;
  if (isPlainRecord(value)) return value;
  issue(
    issues,
    DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
    path,
    'Expected an object.'
  );
  return undefined;
};

const arrayAt = (
  value: unknown,
  path: string,
  issues: DataOpenApiImportIssue[],
  required = true
): readonly unknown[] | undefined => {
  if (value === undefined && !required) return undefined;
  if (Array.isArray(value)) return value;
  issue(
    issues,
    DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
    path,
    'Expected an array.'
  );
  return undefined;
};

const cloneBoundedJson = (
  value: unknown,
  issues: DataOpenApiImportIssue[]
): DataJsonValue | undefined => {
  let nodes = 0;
  const visit = (
    current: unknown,
    path: string,
    depth: number,
    ancestors: Set<object>
  ): DataJsonValue | undefined => {
    nodes += 1;
    if (
      nodes > DATA_OPENAPI_IMPORT_LIMITS.maxNodes ||
      depth > DATA_OPENAPI_IMPORT_LIMITS.maxDepth
    ) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
        path,
        'OpenAPI document exceeds the node or depth budget.'
      );
      return undefined;
    }
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return current;
    }
    if (typeof current === 'number') {
      if (Number.isFinite(current)) return Object.is(current, -0) ? 0 : current;
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'OpenAPI numbers must be finite.'
      );
      return undefined;
    }
    if (!current || typeof current !== 'object' || ancestors.has(current)) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'OpenAPI input must be acyclic JSON.'
      );
      return undefined;
    }
    ancestors.add(current);
    if (Array.isArray(current)) {
      const output: DataJsonValue[] = [];
      current.forEach((entry, index) => {
        const cloned = visit(
          entry,
          childPath(path, String(index)),
          depth + 1,
          ancestors
        );
        if (cloned !== undefined) output.push(cloned);
      });
      ancestors.delete(current);
      return Object.freeze(output);
    }
    if (!isPlainRecord(current)) {
      ancestors.delete(current);
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'OpenAPI objects must be plain records.'
      );
      return undefined;
    }
    const entries: [string, DataJsonValue][] = [];
    for (const key of Object.keys(current).sort(compareText)) {
      const cloned = visit(
        current[key],
        childPath(path, key),
        depth + 1,
        ancestors
      );
      if (cloned !== undefined) entries.push([key, cloned]);
    }
    ancestors.delete(current);
    return Object.freeze(Object.fromEntries(entries));
  };
  const cloned = visit(value, '/', 0, new Set());
  if (
    cloned !== undefined &&
    utf8ToBytes(JSON.stringify(cloned)).length >
      DATA_OPENAPI_IMPORT_LIMITS.maxDocumentBytes
  ) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/',
      'OpenAPI document exceeds the byte budget.'
    );
    return undefined;
  }
  return cloned;
};

const stableJson = (value: unknown): string => {
  const sort = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(sort);
    if (!isPlainRecord(current)) return current;
    return Object.fromEntries(
      Object.keys(current)
        .sort(compareText)
        .map((key) => [key, sort(current[key])])
    );
  };
  return JSON.stringify(sort(value));
};

const digest = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(stableJson(value))))}`;

const slug = (value: string, fallback: string): string =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80) || fallback;

class StableIdAllocator {
  readonly #used = new Set<string>();

  constructor(
    private readonly previous: Readonly<
      Record<string, DataImportEntityMapping>
    >,
    issues: DataOpenApiImportIssue[],
    private readonly entity: 'schema' | 'operation'
  ) {
    for (const [externalId, mapping] of Object.entries(previous).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      if (this.#used.has(mapping.targetId)) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
          `/importProvenanceById/${entity}sByExternalId/${pointerSegment(externalId)}/targetId`,
          `Canonical ${entity} target is mapped more than once.`
        );
      }
      this.#used.add(mapping.targetId);
    }
  }

  allocate(externalId: string, preferred: string): string {
    const previous = this.previous[externalId]?.targetId;
    if (previous) return previous;
    let candidate = slug(preferred, this.entity);
    if (this.#used.has(candidate)) {
      candidate = `${candidate.slice(0, 70)}-${digest(externalId).slice(7, 15)}`;
    }
    while (this.#used.has(candidate)) candidate = `${candidate}-x`;
    this.#used.add(candidate);
    return candidate;
  }
}

const literal = (value: DataJsonValue): DataConfigurationValue =>
  Object.freeze({ kind: 'literal', value });

const bindingValue = (
  kind: DataSourceBinding['kind'],
  bindingId: string
): DataSourceBinding =>
  Object.freeze({ kind, reference: Object.freeze({ bindingId }) });

const schemaManagedProjection = (schema: DataSchema): unknown => ({
  name: schema.name,
  description: schema.description,
  schema: schema.schema,
});

const managedOperationConfigurationKeys = new Set([
  'method',
  'path',
  'parameterMappings',
  'bodyInputPath',
  'responseBodyPath',
  'emptyWhen',
  'authorization',
  'apiKey',
  'apiKeyHeader',
]);

const operationManagedProjection = (operation: DataOperation): unknown => ({
  name: operation.name,
  description: operation.description,
  kind: operation.kind,
  inputSchemaId: operation.inputSchemaId,
  outputSchemaId: operation.outputSchemaId,
  configurationByKey: Object.fromEntries(
    Object.entries(operation.configurationByKey).filter(([key]) =>
      managedOperationConfigurationKeys.has(key)
    )
  ),
});

const sourceManagedProjection = (source: DataSourceDefinition): unknown => ({
  name: source.name,
  adapterId: source.adapterId,
  runtimeZone: source.runtimeZone,
  baseUrl: source.configurationByKey.baseUrl,
});

const decodePointerToken = (value: string): string | undefined => {
  if (/~(?:[^01]|$)/u.test(value)) return undefined;
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
};

const componentNameFromRef = (value: string): string | undefined => {
  const prefix = '#/components/schemas/';
  if (!value.startsWith(prefix)) return undefined;
  return decodePointerToken(value.slice(prefix.length));
};

const componentDefinitionKey = (name: string): string =>
  `__prodivix_openapi__${name}`;

const convertSchemaNode = (
  value: unknown,
  path: string,
  componentNames: ReadonlySet<string>,
  issues: DataOpenApiImportIssue[]
): DataJsonSchema202012 => {
  const visit = (current: unknown, currentPath: string): DataJsonValue => {
    if (current === null || typeof current !== 'object') {
      return current as DataJsonValue;
    }
    if (Array.isArray(current)) {
      return Object.freeze(
        current.map((entry, index) =>
          visit(entry, childPath(currentPath, String(index)))
        )
      );
    }
    if (!isPlainRecord(current)) return true;
    const entries: [string, DataJsonValue][] = [];
    for (const key of Object.keys(current).sort(compareText)) {
      const entry = current[key];
      if (key === '$schema') {
        if (entry !== JSON_SCHEMA_2020_12_URI) {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            childPath(currentPath, key),
            'Imported schemas must use JSON Schema 2020-12.'
          );
        }
        continue;
      }
      if (key === '$ref') {
        if (typeof entry !== 'string') {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
            childPath(currentPath, key),
            'Schema $ref must be a string.'
          );
          continue;
        }
        if (entry.startsWith('#/$defs/__prodivix_openapi__')) {
          entries.push(['$ref', entry]);
          continue;
        }
        const componentName = componentNameFromRef(entry);
        if (!componentName || !componentNames.has(componentName)) {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            childPath(currentPath, key),
            'Only local OpenAPI component schema references are supported.'
          );
          continue;
        }
        entries.push([
          '$ref',
          `#/$defs/${pointerSegment(componentDefinitionKey(componentName))}`,
        ]);
        continue;
      }
      entries.push([key, visit(entry, childPath(currentPath, key))]);
    }
    return Object.freeze(Object.fromEntries(entries));
  };
  return visit(value, path) as DataJsonSchema202012;
};

type ComponentSchemaRegistry = Readonly<{
  names: readonly string[];
  nameSet: ReadonlySet<string>;
  definitionsByName: ReadonlyMap<string, DataJsonSchema202012>;
  dependenciesByName: ReadonlyMap<string, ReadonlySet<string>>;
  byteSizeByName: ReadonlyMap<string, number>;
}>;

type GeneratedSchemaBudget = {
  usedBytes: number;
  exceeded: boolean;
};

const collectComponentDefinitionReferences = (
  value: unknown,
  knownNames: ReadonlySet<string>
): ReadonlySet<string> => {
  const references = new Set<string>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!isPlainRecord(current)) continue;
    if (typeof current.$ref === 'string') {
      const prefix = '#/$defs/';
      if (current.$ref.startsWith(prefix)) {
        const key = decodePointerToken(current.$ref.slice(prefix.length));
        const componentPrefix = '__prodivix_openapi__';
        if (key?.startsWith(componentPrefix)) {
          const name = key.slice(componentPrefix.length);
          if (knownNames.has(name)) references.add(name);
        }
      }
    }
    stack.push(...Object.values(current));
  }
  return references;
};

const createComponentSchemaRegistry = (
  componentSchemas: Readonly<Record<string, unknown>>,
  issues: DataOpenApiImportIssue[]
): ComponentSchemaRegistry => {
  const names = Object.freeze(Object.keys(componentSchemas).sort(compareText));
  const nameSet = new Set(names);
  const definitionsByName = new Map<string, DataJsonSchema202012>();
  const byteSizeByName = new Map<string, number>();
  for (const name of names) {
    const definition = convertSchemaNode(
      componentSchemas[name],
      `/components/schemas/${pointerSegment(name)}`,
      nameSet,
      issues
    );
    definitionsByName.set(name, definition);
    byteSizeByName.set(name, utf8ToBytes(stableJson(definition)).length);
  }
  const dependenciesByName = new Map<string, ReadonlySet<string>>();
  for (const name of names) {
    dependenciesByName.set(
      name,
      collectComponentDefinitionReferences(definitionsByName.get(name), nameSet)
    );
  }
  return Object.freeze({
    names,
    nameSet,
    definitionsByName,
    dependenciesByName,
    byteSizeByName,
  });
};

const attachComponentDefinitions = (
  converted: DataJsonSchema202012,
  path: string,
  registry: ComponentSchemaRegistry,
  issues: DataOpenApiImportIssue[],
  budget: GeneratedSchemaBudget
): DataJsonSchema202012 => {
  if (typeof converted === 'boolean') return converted;
  const reachable = new Set(
    collectComponentDefinitionReferences(converted, registry.nameSet)
  );
  const pending = [...reachable];
  while (pending.length > 0) {
    const name = pending.pop()!;
    for (const dependency of registry.dependenciesByName.get(name) ?? []) {
      if (reachable.has(dependency)) continue;
      reachable.add(dependency);
      pending.push(dependency);
    }
  }
  const reachableNames = [...reachable].sort(compareText);
  const projectedBytes =
    utf8ToBytes(stableJson(converted)).length +
    reachableNames.reduce(
      (total, name) => total + (registry.byteSizeByName.get(name) ?? 0),
      0
    );
  if (
    budget.exceeded ||
    budget.usedBytes + projectedBytes >
      DATA_OPENAPI_IMPORT_LIMITS.maxGeneratedSchemaBytes
  ) {
    if (!budget.exceeded) {
      budget.exceeded = true;
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
        path,
        'Generated schema projections exceed the import byte budget.'
      );
    }
    return true;
  }
  budget.usedBytes += projectedBytes;
  const existingDefinitions = isPlainRecord(converted.$defs)
    ? converted.$defs
    : {};
  const definitions = Object.fromEntries([
    ...Object.entries(existingDefinitions),
    ...reachableNames.map((name) => [
      componentDefinitionKey(name),
      registry.definitionsByName.get(name)!,
    ]),
  ]);
  return Object.freeze({
    ...converted,
    $schema: JSON_SCHEMA_2020_12_URI,
    ...(Object.keys(definitions).length
      ? { $defs: Object.freeze(definitions) }
      : {}),
  });
};

const withComponentDefinitions = (
  value: unknown,
  path: string,
  registry: ComponentSchemaRegistry,
  issues: DataOpenApiImportIssue[],
  budget: GeneratedSchemaBudget
): DataJsonSchema202012 =>
  attachComponentDefinitions(
    convertSchemaNode(value, path, registry.nameSet, issues),
    path,
    registry,
    issues,
    budget
  );

const resolveParameter = (
  value: unknown,
  path: string,
  componentParameters: JsonRecord,
  issues: DataOpenApiImportIssue[]
): JsonRecord | undefined => {
  const parameter = recordAt(value, path, issues);
  if (!parameter) return undefined;
  if (parameter.$ref === undefined) return parameter;
  if (typeof parameter.$ref !== 'string') {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
      childPath(path, '$ref'),
      'Parameter $ref must be a string.'
    );
    return undefined;
  }
  const prefix = '#/components/parameters/';
  if (!parameter.$ref.startsWith(prefix)) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      childPath(path, '$ref'),
      'Only local parameter component references are supported.'
    );
    return undefined;
  }
  const name = decodePointerToken(parameter.$ref.slice(prefix.length));
  return name
    ? recordAt(
        componentParameters[name],
        `/components/parameters/${pointerSegment(name)}`,
        issues
      )
    : undefined;
};

type ParsedParameter = Readonly<{
  location: 'path' | 'query' | 'header';
  name: string;
  required: boolean;
  schema: unknown;
}>;

const parseParameters = (
  pathParameters: unknown,
  operationParameters: unknown,
  path: string,
  componentParameters: JsonRecord,
  issues: DataOpenApiImportIssue[]
): readonly ParsedParameter[] => {
  const merged = new Map<string, ParsedParameter>();
  const consume = (value: unknown, parameterPath: string): void => {
    const values = arrayAt(value, parameterPath, issues, false) ?? [];
    if (values.length > DATA_OPENAPI_IMPORT_LIMITS.maxParametersPerOperation) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
        parameterPath,
        'Operation parameter count exceeds the import budget.'
      );
    }
    values.forEach((entry, index) => {
      const entryPath = childPath(parameterPath, String(index));
      const parameter = resolveParameter(
        entry,
        entryPath,
        componentParameters,
        issues
      );
      if (!parameter) return;
      const name = canonical(
        parameter.name,
        childPath(entryPath, 'name'),
        issues
      );
      const location = parameter.in;
      if (
        location !== 'path' &&
        location !== 'query' &&
        location !== 'header'
      ) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
          childPath(entryPath, 'in'),
          'Only path, query, and non-credential header parameters are supported.'
        );
        return;
      }
      if (!name || parameter.schema === undefined) {
        if (parameter.schema === undefined) {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            childPath(entryPath, 'schema'),
            'Parameter content mappings are unsupported; a schema is required.'
          );
        }
        return;
      }
      const normalizedName = location === 'header' ? name.toLowerCase() : name;
      if (
        location === 'header' &&
        [
          'authorization',
          'cookie',
          'proxy-authorization',
          'set-cookie',
        ].includes(normalizedName)
      ) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
          childPath(entryPath, 'name'),
          'Credential headers must be modeled by a security scheme placeholder.'
        );
        return;
      }
      const required = location === 'path' ? true : parameter.required === true;
      merged.set(`${location}:${normalizedName}`, {
        location,
        name: normalizedName,
        required,
        schema: parameter.schema,
      });
    });
  };
  consume(pathParameters, childPath(path, 'parameters'));
  consume(operationParameters, childPath(path, 'operation/parameters'));
  return Object.freeze(
    [...merged.values()].sort((left, right) =>
      compareText(
        `${left.location}:${left.name}`,
        `${right.location}:${right.name}`
      )
    )
  );
};

const safeHeaderName = (value: string): boolean =>
  value === value.toLowerCase() &&
  value.length <= 128 &&
  /^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(value) &&
  ![
    'authorization',
    'connection',
    'content-length',
    'content-type',
    'cookie',
    'host',
    'proxy-authorization',
    'set-cookie',
    'transfer-encoding',
  ].includes(value);

const applySecurity = (
  security: unknown,
  securitySchemes: JsonRecord,
  operationPath: string,
  bindings: Record<string, DataSourceBinding>,
  configuration: Record<string, DataConfigurationValue>,
  issues: DataOpenApiImportIssue[]
): void => {
  if (security === undefined) return;
  const requirements = arrayAt(
    security,
    childPath(operationPath, 'security'),
    issues
  );
  if (!requirements || requirements.length === 0) return;
  if (requirements.length !== 1) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
      childPath(operationPath, 'security'),
      'The first vertical supports exactly one security alternative.'
    );
    return;
  }
  const requirement = recordAt(
    requirements[0],
    childPath(childPath(operationPath, 'security'), '0'),
    issues
  );
  if (!requirement) return;
  const schemeNames = Object.keys(requirement);
  if (schemeNames.length !== 1) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
      childPath(operationPath, 'security'),
      'Combined security schemes are not supported by this import vertical.'
    );
    return;
  }
  const schemeName = schemeNames[0]!;
  const scheme = recordAt(
    securitySchemes[schemeName],
    `/components/securitySchemes/${pointerSegment(schemeName)}`,
    issues
  );
  if (!scheme) return;
  const bindingId = `openapi-auth-${slug(schemeName, 'credential')}`;
  bindings[bindingId] = bindingValue('secret-ref', bindingId);
  const secret = bindingValue('secret-ref', bindingId);
  if (
    scheme.type === 'http' ||
    scheme.type === 'oauth2' ||
    scheme.type === 'openIdConnect'
  ) {
    configuration.authorization = secret;
    return;
  }
  if (scheme.type === 'apiKey' && scheme.in === 'header') {
    if (
      typeof scheme.name !== 'string' ||
      !safeHeaderName(scheme.name.toLowerCase())
    ) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
        `/components/securitySchemes/${pointerSegment(schemeName)}/name`,
        'API key headers must use a safe non-credential header name.'
      );
      return;
    }
    configuration.apiKey = secret;
    configuration.apiKeyHeader = literal(scheme.name.toLowerCase());
    return;
  }
  issue(
    issues,
    DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
    `/components/securitySchemes/${pointerSegment(schemeName)}`,
    'Only HTTP/OAuth/OpenID authorization or header API keys are supported.'
  );
};

const resolveServer = (
  root: JsonRecord,
  explicitBaseUrl: string | undefined,
  issues: DataOpenApiImportIssue[]
): Readonly<{ origin: string; basePath: string }> | undefined => {
  let source = explicitBaseUrl;
  if (!source) {
    const servers = arrayAt(root.servers, '/servers', issues, false) ?? [];
    if (servers.length > 1) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        '/servers',
        'Only the first OpenAPI server is imported; alternatives remain explicit user work.',
        'warning'
      );
    }
    const server = recordAt(servers[0], '/servers/0', issues, false);
    source = server
      ? canonical(server.url, '/servers/0/url', issues)
      : undefined;
    if (server?.variables !== undefined) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        '/servers/0/variables',
        'Server URL variables require an explicit baseUrl override.'
      );
    }
  }
  if (!source) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
      '/servers',
      'An absolute OpenAPI server URL or explicit baseUrl is required.'
    );
    return undefined;
  }
  try {
    const url = new URL(source);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      source.includes('{')
    ) {
      throw new Error('unsafe');
    }
    const basePath =
      url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, '');
    return Object.freeze({ origin: url.origin, basePath });
  } catch {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      '/servers/0/url',
      'OpenAPI server URL must be an absolute HTTP(S) URL without credentials, variables, query, or fragment.'
    );
    return undefined;
  }
};

const compileProjection = (
  normalizedSpec: DataJsonValue,
  input: CreateDataOpenApiImportProposalInput,
  previous: DataImportProvenance | undefined,
  issues: DataOpenApiImportIssue[]
): ImportedProjection | undefined => {
  const root = recordAt(normalizedSpec, '/', issues);
  if (!root) return undefined;
  if (
    typeof root.openapi !== 'string' ||
    !/^3\.1(?:\.\d+)?$/u.test(root.openapi)
  ) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedVersion,
      '/openapi',
      'Only OpenAPI 3.1.x documents are supported.'
    );
  }
  const information = recordAt(root.info, '/info', issues);
  const title = information
    ? canonical(information.title, '/info/title', issues)
    : undefined;
  const server = resolveServer(root, input.baseUrl, issues);
  const components =
    recordAt(root.components, '/components', issues, false) ?? {};
  const componentSchemas =
    recordAt(components.schemas, '/components/schemas', issues, false) ?? {};
  const componentParameters =
    recordAt(components.parameters, '/components/parameters', issues, false) ??
    {};
  const securitySchemes =
    recordAt(
      components.securitySchemes,
      '/components/securitySchemes',
      issues,
      false
    ) ?? {};
  const schemaNames = Object.keys(componentSchemas).sort(compareText);
  if (schemaNames.length > DATA_OPENAPI_IMPORT_LIMITS.maxSchemas) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/components/schemas',
      'Component schema count exceeds the import budget.'
    );
  }
  const componentRegistry = createComponentSchemaRegistry(
    componentSchemas,
    issues
  );
  const generatedSchemaBudget: GeneratedSchemaBudget = {
    usedBytes: 0,
    exceeded: false,
  };
  const paths = recordAt(root.paths, '/paths', issues);
  if (!paths || !server || !title) return undefined;
  const pathNames = Object.keys(paths).sort(compareText);
  if (pathNames.length > DATA_OPENAPI_IMPORT_LIMITS.maxPaths) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/paths',
      'Path count exceeds the import budget.'
    );
  }

  const schemaAllocator = new StableIdAllocator(
    previous?.schemasByExternalId ?? {},
    issues,
    'schema'
  );
  const operationAllocator = new StableIdAllocator(
    previous?.operationsByExternalId ?? {},
    issues,
    'operation'
  );
  const importedSchemas = new Map<string, ImportedSchema>();
  const importedOperations = new Map<string, ImportedOperation>();
  for (const name of schemaNames) {
    const externalId = `#/components/schemas/${pointerSegment(name)}`;
    const targetId = schemaAllocator.allocate(externalId, name);
    const value = Object.freeze({
      id: targetId,
      name,
      schema: attachComponentDefinitions(
        componentRegistry.definitionsByName.get(name)!,
        externalId,
        componentRegistry,
        issues,
        generatedSchemaBudget
      ),
    });
    importedSchemas.set(
      externalId,
      Object.freeze({
        externalId,
        targetId,
        value,
        digest: digest(schemaManagedProjection(value)),
      })
    );
  }

  const bindings: Record<string, DataSourceBinding> = {};
  let operationCount = 0;
  const methods = ['get', 'head', 'post', 'put', 'patch', 'delete'] as const;
  for (const pathName of pathNames) {
    if (!pathName.startsWith('/') || pathName.startsWith('//')) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        childPath('/paths', pathName),
        'OpenAPI paths must be origin-relative.'
      );
      continue;
    }
    const pathItemPath = childPath('/paths', pathName);
    const pathItem = recordAt(paths[pathName], pathItemPath, issues);
    if (!pathItem) continue;
    if (pathItem.servers !== undefined) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
        childPath(pathItemPath, 'servers'),
        'Path-level servers are not supported by the first import vertical.'
      );
    }
    for (const method of methods) {
      const rawOperation = pathItem[method];
      if (rawOperation === undefined) continue;
      operationCount += 1;
      const operationPath = childPath(pathItemPath, method);
      const operation = recordAt(rawOperation, operationPath, issues);
      if (!operation) continue;
      if (operation.servers !== undefined) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
          childPath(operationPath, 'servers'),
          'Operation-level servers are not supported by the first import vertical.'
        );
      }
      const operationId =
        operation.operationId === undefined
          ? undefined
          : canonical(
              operation.operationId,
              childPath(operationPath, 'operationId'),
              issues
            );
      const externalId = operationId
        ? `operation:${operationId}`
        : `operation:${method.toUpperCase()} ${pathName}`;
      if (importedOperations.has(externalId)) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
          operationPath,
          `Duplicate stable operation identity "${externalId}".`
        );
        continue;
      }
      const targetId = operationAllocator.allocate(
        externalId,
        operationId ?? `${method}-${pathName}`
      );
      const parameters = parseParameters(
        pathItem.parameters,
        operation.parameters,
        operationPath,
        componentParameters,
        issues
      );
      const inputProperties: Record<string, DataJsonSchema202012> = {};
      const inputRequired: string[] = [];
      const parameterMappings: Record<string, Record<string, string>> = {
        path: {},
        query: {},
        header: {},
      };
      const nameCounts = new Map<string, number>();
      parameters.forEach((parameter) =>
        nameCounts.set(
          parameter.name,
          (nameCounts.get(parameter.name) ?? 0) + 1
        )
      );
      const usedInputKeys = new Set<string>();
      for (const parameter of parameters) {
        let inputKey =
          (nameCounts.get(parameter.name) ?? 0) > 1
            ? `${parameter.location}_${parameter.name}`
            : parameter.name;
        while (usedInputKeys.has(inputKey)) inputKey = `${inputKey}_value`;
        usedInputKeys.add(inputKey);
        inputProperties[inputKey] = convertSchemaNode(
          parameter.schema,
          `${operationPath}/parameters/${pointerSegment(parameter.name)}/schema`,
          componentRegistry.nameSet,
          issues
        );
        if (parameter.required) inputRequired.push(inputKey);
        parameterMappings[parameter.location]![parameter.name] =
          `/${pointerSegment(inputKey)}`;
      }
      const pathVariables = [...pathName.matchAll(/\{([^{}]+)\}/gu)].map(
        (match) => match[1]!
      );
      const declaredPathParameters = new Set(
        parameters
          .filter((parameter) => parameter.location === 'path')
          .map((parameter) => parameter.name)
      );
      if (
        pathVariables.some((name) => !declaredPathParameters.has(name)) ||
        [...declaredPathParameters].some(
          (name) => !pathVariables.includes(name)
        )
      ) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
          operationPath,
          'Path template variables and required path parameters must match exactly.'
        );
      }

      let bodyInputPath: string | undefined;
      if (operation.requestBody !== undefined) {
        if (method === 'get' || method === 'head') {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            childPath(operationPath, 'requestBody'),
            'GET and HEAD request bodies are outside the HTTP importer contract.'
          );
        }
        const requestBody = recordAt(
          operation.requestBody,
          childPath(operationPath, 'requestBody'),
          issues
        );
        const content = requestBody
          ? recordAt(
              requestBody.content,
              childPath(operationPath, 'requestBody/content'),
              issues
            )
          : undefined;
        const jsonContent = content
          ? recordAt(
              content['application/json'],
              childPath(operationPath, 'requestBody/content/application~1json'),
              issues
            )
          : undefined;
        if (!jsonContent || jsonContent.schema === undefined) {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            childPath(operationPath, 'requestBody'),
            'Only application/json request bodies with a schema are supported.'
          );
        } else {
          let bodyKey = 'body';
          while (usedInputKeys.has(bodyKey)) bodyKey = `request_${bodyKey}`;
          usedInputKeys.add(bodyKey);
          inputProperties[bodyKey] = convertSchemaNode(
            jsonContent.schema,
            childPath(
              operationPath,
              'requestBody/content/application~1json/schema'
            ),
            componentRegistry.nameSet,
            issues
          );
          if (requestBody?.required === true) inputRequired.push(bodyKey);
          bodyInputPath = `/${pointerSegment(bodyKey)}`;
        }
      }

      let inputSchemaId: string | undefined;
      if (Object.keys(inputProperties).length > 0) {
        const inputExternalId = `${externalId}#input`;
        inputSchemaId = schemaAllocator.allocate(
          inputExternalId,
          `${targetId}-input`
        );
        const inputSchema = Object.freeze({
          id: inputSchemaId,
          name: `${operationId ?? `${method.toUpperCase()} ${pathName}`} input`,
          schema: withComponentDefinitions(
            {
              type: 'object',
              properties: inputProperties,
              ...(inputRequired.length
                ? { required: [...new Set(inputRequired)].sort(compareText) }
                : {}),
              additionalProperties: false,
            },
            `${operationPath}/@input`,
            componentRegistry,
            issues,
            generatedSchemaBudget
          ),
        });
        importedSchemas.set(
          inputExternalId,
          Object.freeze({
            externalId: inputExternalId,
            targetId: inputSchemaId,
            value: inputSchema,
            digest: digest(schemaManagedProjection(inputSchema)),
          })
        );
      }

      const responses = recordAt(
        operation.responses,
        childPath(operationPath, 'responses'),
        issues
      );
      const successStatuses = responses
        ? Object.keys(responses)
            .filter((status) => /^2[0-9]{2}$/u.test(status))
            .sort(compareText)
        : [];
      if (successStatuses.length === 0) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
          childPath(operationPath, 'responses'),
          'At least one exact 2xx response is required.'
        );
      }
      let responseSchema: unknown = true;
      let responseSignature: string | undefined;
      let emptyWhen: 'never' | 'status-204' = 'never';
      for (const status of successStatuses) {
        const responsePath = childPath(
          childPath(operationPath, 'responses'),
          status
        );
        const response = recordAt(responses?.[status], responsePath, issues);
        const content = response
          ? recordAt(
              response.content,
              childPath(responsePath, 'content'),
              issues,
              false
            )
          : undefined;
        const jsonContent = content
          ? recordAt(
              content['application/json'],
              childPath(responsePath, 'content/application~1json'),
              issues,
              false
            )
          : undefined;
        const currentSchema = jsonContent?.schema ?? true;
        if (status === '204') emptyWhen = 'status-204';
        const signature = stableJson(currentSchema);
        if (responseSignature === undefined) {
          responseSignature = signature;
          responseSchema = currentSchema;
        } else if (responseSignature !== signature) {
          issue(
            issues,
            DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
            responsePath,
            'All imported 2xx responses must share one JSON response schema.'
          );
        }
      }
      const outputExternalId = `${externalId}#response`;
      const outputSchemaId = schemaAllocator.allocate(
        outputExternalId,
        `${targetId}-output`
      );
      const outputSchema = Object.freeze({
        id: outputSchemaId,
        name: `${operationId ?? `${method.toUpperCase()} ${pathName}`} response`,
        schema: withComponentDefinitions(
          responseSchema,
          `${operationPath}/@response`,
          componentRegistry,
          issues,
          generatedSchemaBudget
        ),
      });
      importedSchemas.set(
        outputExternalId,
        Object.freeze({
          externalId: outputExternalId,
          targetId: outputSchemaId,
          value: outputSchema,
          digest: digest(schemaManagedProjection(outputSchema)),
        })
      );

      const configuration: Record<string, DataConfigurationValue> = {
        method: literal(method.toUpperCase()),
        path: literal(`${server.basePath}${pathName}` || '/'),
        emptyWhen: literal(emptyWhen),
      };
      const compactMappings = Object.fromEntries(
        Object.entries(parameterMappings).filter(
          ([, mapping]) => Object.keys(mapping).length > 0
        )
      ) as DataJsonValue;
      if (Object.keys(compactMappings as object).length > 0) {
        configuration.parameterMappings = literal(compactMappings);
      }
      if (bodyInputPath) configuration.bodyInputPath = literal(bodyInputPath);
      if (typeof operation['x-prodivix-response-body-path'] === 'string') {
        configuration.responseBodyPath = literal(
          operation['x-prodivix-response-body-path']
        );
      }
      applySecurity(
        operation.security ?? root.security,
        securitySchemes,
        operationPath,
        bindings,
        configuration,
        issues
      );
      const kind = method === 'get' || method === 'head' ? 'query' : 'mutation';
      const value: DataOperation = Object.freeze({
        id: targetId,
        ...(typeof operation.summary === 'string' && operation.summary.trim()
          ? { name: operation.summary.trim() }
          : operationId
            ? { name: operationId }
            : {}),
        ...(typeof operation.description === 'string' &&
        operation.description.trim()
          ? { description: operation.description.trim() }
          : {}),
        kind,
        ...(inputSchemaId ? { inputSchemaId } : {}),
        outputSchemaId,
        configurationByKey: Object.freeze(configuration),
        policies: Object.freeze({}),
      });
      importedOperations.set(
        externalId,
        Object.freeze({
          externalId,
          targetId,
          value,
          digest: digest(operationManagedProjection(value)),
        })
      );
    }
  }
  if (operationCount > DATA_OPENAPI_IMPORT_LIMITS.maxOperations) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.limitExceeded,
      '/paths',
      'Operation count exceeds the import budget.'
    );
  }
  const requestedRuntimeZone =
    input.runtimeZone ?? input.currentDocument?.source.runtimeZone ?? 'server';
  const runtimeZone = ['client', 'server', 'edge'].includes(
    requestedRuntimeZone
  )
    ? (requestedRuntimeZone as 'client' | 'server' | 'edge')
    : 'server';
  if (runtimeZone !== requestedRuntimeZone) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
      '/@runtimeZone',
      'OpenAPI imports support only client, server, or edge runtime zones.'
    );
  }
  if (
    runtimeZone === 'client' &&
    Object.values(bindings).some((binding) => binding.kind === 'secret-ref')
  ) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
      '/@runtimeZone',
      'Authenticated OpenAPI operations cannot import into the client runtime zone.'
    );
  }
  const source: DataSourceDefinition = Object.freeze({
    id: input.sourceId,
    name: title,
    adapterId: DATA_HTTP_ADAPTER_ID,
    runtimeZone,
    bindingsById: Object.freeze(bindings),
    configurationByKey: Object.freeze({ baseUrl: literal(server.origin) }),
  });
  return Object.freeze({
    source,
    sourceDigest: digest(sourceManagedProjection(source)),
    specificationDigest: digest(normalizedSpec),
    schemas: importedSchemas,
    operations: importedOperations,
  });
};

const mergeSource = (
  current: DataSourceDefinition,
  desired: DataSourceDefinition
): DataSourceDefinition =>
  Object.freeze({
    ...current,
    name: desired.name,
    adapterId: desired.adapterId,
    runtimeZone: desired.runtimeZone,
    bindingsById: Object.freeze({
      ...current.bindingsById,
      ...desired.bindingsById,
    }),
    configurationByKey: Object.freeze({
      ...current.configurationByKey,
      baseUrl: desired.configurationByKey.baseUrl!,
    }),
  });

const mergeOperation = (
  current: DataOperation,
  desired: DataOperation
): DataOperation =>
  Object.freeze({
    ...desired,
    configurationByKey: Object.freeze({
      ...Object.fromEntries(
        Object.entries(current.configurationByKey).filter(
          ([key]) => !managedOperationConfigurationKeys.has(key)
        )
      ),
      ...desired.configurationByKey,
    }),
    policies: current.policies,
  });

const sortedUnique = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareText));

const impactApproved = (
  impact: DataOpenApiImportImpact,
  approval: DataOpenApiImpactApproval | undefined
): boolean =>
  Boolean(
    approval &&
    stableJson(sortedUnique(approval.schemaIds)) ===
      stableJson(impact.schemaIds) &&
    stableJson(sortedUnique(approval.operationIds)) ===
      stableJson(impact.operationIds)
  );

const provenanceFromProjection = (
  input: CreateDataOpenApiImportProposalInput,
  projection: ImportedProjection
): DataImportProvenance =>
  Object.freeze({
    id: input.importId,
    kind: 'openapi-3.1',
    externalDocumentId: input.externalDocumentId,
    sourceDigest: projection.specificationDigest,
    sourceImportedDigest: projection.sourceDigest,
    schemasByExternalId: Object.freeze(
      Object.fromEntries(
        [...projection.schemas.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([externalId, schema]) => [
            externalId,
            Object.freeze({
              targetId: schema.targetId,
              importedDigest: schema.digest,
            }),
          ])
      )
    ),
    operationsByExternalId: Object.freeze(
      Object.fromEntries(
        [...projection.operations.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([externalId, operation]) => [
            externalId,
            Object.freeze({
              targetId: operation.targetId,
              importedDigest: operation.digest,
            }),
          ])
      )
    ),
  });

const blocked = (
  status: DataOpenApiBlockedStatus,
  target: DataOpenApiImportTarget,
  issues: DataOpenApiImportIssue[],
  changes: DataOpenApiImportChange[],
  schemaImpact: string[],
  operationImpact: string[]
): DataOpenApiImportProposal =>
  Object.freeze({
    status,
    target,
    changes: Object.freeze(changes),
    impact: Object.freeze({
      schemaIds: sortedUnique(schemaImpact),
      operationIds: sortedUnique(operationImpact),
    }),
    issues: Object.freeze(issues),
  });

/**
 * Compiles an OpenAPI 3.1 document into a bounded proposal. This function never
 * writes Workspace state; callers must explicitly adopt a ready proposal.
 */
export const createDataOpenApiImportProposal = (
  input: CreateDataOpenApiImportProposalInput
): DataOpenApiImportProposal => {
  const target: DataOpenApiImportTarget = Object.freeze({
    documentId: input.documentId,
    importId: input.importId,
    externalDocumentId: input.externalDocumentId,
    sourceId: input.sourceId,
  });
  const issues: DataOpenApiImportIssue[] = [];
  const changes: DataOpenApiImportChange[] = [];
  const schemaImpact: string[] = [];
  const operationImpact: string[] = [];
  for (const [path, value] of [
    ['/@documentId', input.documentId],
    ['/@importId', input.importId],
    ['/@externalDocumentId', input.externalDocumentId],
    ['/@sourceId', input.sourceId],
  ] as const) {
    canonical(value, path, issues);
  }
  let current: DataSourceDocument | undefined;
  if (input.currentDocument) {
    try {
      current = normalizeDataSourceDocument(input.currentDocument, {
        documentId: input.documentId,
      });
    } catch {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
        '/@currentDocument',
        'Current Data source document is not canonical.'
      );
    }
  }
  const previous = current?.importProvenanceById?.[input.importId];
  if (current && !previous) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${pointerSegment(input.importId)}`,
      'Reimport requires matching canonical provenance.'
    );
  }
  if (
    previous &&
    (previous.kind !== 'openapi-3.1' ||
      previous.externalDocumentId !== input.externalDocumentId)
  ) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${pointerSegment(input.importId)}`,
      'Reimport external identity or protocol kind drifted.'
    );
  }
  const normalizedSpec = cloneBoundedJson(input.spec, issues);
  let projection: ImportedProjection | undefined;
  if (normalizedSpec) {
    try {
      projection = compileProjection(normalizedSpec, input, previous, issues);
    } catch {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        '/@proposal',
        'OpenAPI projection could not be compiled into the canonical Data contract.'
      );
    }
  }
  if (!projection || issues.some((entry) => entry.severity === 'error')) {
    return blocked(
      'invalid',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  }
  const nextProvenance = provenanceFromProjection(input, projection);
  if (!current || !previous) {
    let document: DataSourceDocument;
    try {
      document = normalizeDataSourceDocument(
        {
          source: projection.source,
          schemasById: Object.freeze(
            Object.fromEntries(
              [...projection.schemas.values()]
                .sort((left, right) =>
                  compareText(left.targetId, right.targetId)
                )
                .map((schema) => [schema.targetId, schema.value])
            )
          ),
          operationsById: Object.freeze(
            Object.fromEntries(
              [...projection.operations.values()]
                .sort((left, right) =>
                  compareText(left.targetId, right.targetId)
                )
                .map((operation) => [operation.targetId, operation.value])
            )
          ),
          importProvenanceById: Object.freeze({
            [input.importId]: nextProvenance,
          }),
        },
        { documentId: input.documentId }
      );
    } catch {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        '/@proposal',
        'Imported OpenAPI projection does not satisfy the canonical Data source contract.'
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
    changes.push(
      Object.freeze({
        entity: 'source',
        change: 'add',
        targetId: document.source.id,
      }),
      ...[...projection.schemas.values()].map((schema) =>
        Object.freeze({
          entity: 'schema' as const,
          change: 'add' as const,
          targetId: schema.targetId,
          externalId: schema.externalId,
        })
      ),
      ...[...projection.operations.values()].map((operation) =>
        Object.freeze({
          entity: 'operation' as const,
          change: 'add' as const,
          targetId: operation.targetId,
          externalId: operation.externalId,
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
  const currentSourceDigest = digest(sourceManagedProjection(current.source));
  if (currentSourceDigest === previous.sourceImportedDigest) {
    source = mergeSource(current.source, projection.source);
    if (projection.sourceDigest !== previous.sourceImportedDigest) {
      changes.push(
        Object.freeze({
          entity: 'source',
          change: 'update',
          targetId: source.id,
        })
      );
    }
  } else if (projection.sourceDigest === previous.sourceImportedDigest) {
    changes.push(
      Object.freeze({
        entity: 'source',
        change: 'preserve-local',
        targetId: source.id,
      })
    );
  } else {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
      '/source',
      'Source configuration changed both locally and upstream.'
    );
  }

  const schemasById: Record<string, DataSchema> = { ...current.schemasById };
  for (const [externalId, oldMapping] of Object.entries(
    previous.schemasByExternalId
  ).sort(([left], [right]) => compareText(left, right))) {
    const existing = current.schemasById[oldMapping.targetId];
    const desired = projection.schemas.get(externalId);
    if (!existing) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${pointerSegment(oldMapping.targetId)}`,
        'Previously imported schema target is missing.'
      );
      continue;
    }
    const existingDigest = digest(schemaManagedProjection(existing));
    if (!desired) {
      if (existingDigest !== oldMapping.importedDigest) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
          `/schemasById/${pointerSegment(existing.id)}`,
          'Upstream removed a locally edited schema.'
        );
      } else {
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
      continue;
    }
    if (existingDigest === oldMapping.importedDigest) {
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
    } else if (desired.digest === oldMapping.importedDigest) {
      changes.push(
        Object.freeze({
          entity: 'schema',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    } else {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
        `/schemasById/${pointerSegment(existing.id)}`,
        'Schema changed both locally and upstream.'
      );
    }
  }
  for (const [externalId, desired] of projection.schemas) {
    if (previous.schemasByExternalId[externalId]) continue;
    if (schemasById[desired.targetId]) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${pointerSegment(desired.targetId)}`,
        'New imported schema collides with an existing canonical target.'
      );
      continue;
    }
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

  const operationsById: Record<string, DataOperation> = {
    ...current.operationsById,
  };
  for (const [externalId, oldMapping] of Object.entries(
    previous.operationsByExternalId
  ).sort(([left], [right]) => compareText(left, right))) {
    const existing = current.operationsById[oldMapping.targetId];
    const desired = projection.operations.get(externalId);
    if (!existing) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${pointerSegment(oldMapping.targetId)}`,
        'Previously imported operation target is missing.'
      );
      continue;
    }
    const existingDigest = digest(operationManagedProjection(existing));
    if (!desired) {
      if (existingDigest !== oldMapping.importedDigest) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
          `/operationsById/${pointerSegment(existing.id)}`,
          'Upstream removed a locally edited operation.'
        );
      } else {
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
      continue;
    }
    if (existingDigest === oldMapping.importedDigest) {
      operationsById[existing.id] = mergeOperation(existing, desired.value);
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
    } else if (desired.digest === oldMapping.importedDigest) {
      changes.push(
        Object.freeze({
          entity: 'operation',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    } else {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
        `/operationsById/${pointerSegment(existing.id)}`,
        'Operation changed both locally and upstream.'
      );
    }
  }
  for (const [externalId, desired] of projection.operations) {
    if (previous.operationsByExternalId[externalId]) continue;
    if (operationsById[desired.targetId]) {
      issue(
        issues,
        DATA_OPENAPI_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${pointerSegment(desired.targetId)}`,
        'New imported operation collides with an existing canonical target.'
      );
      continue;
    }
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

  for (const operation of Object.values(operationsById)) {
    for (const schemaId of [
      operation.inputSchemaId,
      operation.outputSchemaId,
    ]) {
      if (schemaId && !schemasById[schemaId]) {
        issue(
          issues,
          DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
          `/operationsById/${pointerSegment(operation.id)}`,
          `Reimport would leave operation schema reference "${schemaId}" unresolved.`
        );
      }
    }
  }
  if (issues.some((entry) => entry.severity === 'error')) {
    return blocked(
      'conflict',
      target,
      issues,
      changes,
      schemaImpact,
      operationImpact
    );
  }
  const impact = Object.freeze({
    schemaIds: sortedUnique(schemaImpact),
    operationIds: sortedUnique(operationImpact),
  });
  if (
    (impact.schemaIds.length > 0 || impact.operationIds.length > 0) &&
    !impactApproved(impact, input.impactApproval)
  ) {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.impactRequired,
      '/@impactApproval',
      'Exact Semantic Index impact approval is required before reimport adoption.'
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
  let document: DataSourceDocument;
  try {
    document = normalizeDataSourceDocument(
      {
        source,
        schemasById: Object.freeze(schemasById),
        operationsById: Object.freeze(operationsById),
        importProvenanceById: Object.freeze({
          ...(current.importProvenanceById ?? {}),
          [input.importId]: nextProvenance,
        }),
      },
      { documentId: input.documentId }
    );
  } catch {
    issue(
      issues,
      DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
      '/@proposal',
      'Reimport projection does not satisfy the canonical Data source contract.'
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
  return Object.freeze({
    status: 'ready',
    target,
    document,
    changes: Object.freeze(changes),
    impact,
    issues: Object.freeze(issues),
  });
};
