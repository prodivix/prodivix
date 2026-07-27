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
import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInputType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  Kind,
  parse,
  typeFromAST,
  validate,
  buildSchema,
  type GraphQLInputType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type OperationDefinitionNode,
} from 'graphql';
import { DATA_GRAPHQL_ADAPTER_ID } from './dataGraphqlAdapter';

export const DATA_GRAPHQL_IMPORT_LIMITS = Object.freeze({
  maxSchemaBytes: 2 * 1024 * 1024,
  maxOperations: 512,
  maxOperationBytes: 128 * 1024,
  maxTypeDepth: 32,
} as const);

export const DATA_GRAPHQL_IMPORT_ISSUE_CODES = Object.freeze({
  invalidDocument: 'DATA_GRAPHQL_IMPORT_INVALID_DOCUMENT',
  unsupportedShape: 'DATA_GRAPHQL_IMPORT_UNSUPPORTED_SHAPE',
  limitExceeded: 'DATA_GRAPHQL_IMPORT_LIMIT_EXCEEDED',
  targetDrift: 'DATA_GRAPHQL_IMPORT_TARGET_DRIFT',
  reimportConflict: 'DATA_GRAPHQL_IMPORT_REIMPORT_CONFLICT',
  impactRequired: 'DATA_GRAPHQL_IMPORT_IMPACT_REQUIRED',
} as const);

export type DataGraphqlImportIssueCode =
  (typeof DATA_GRAPHQL_IMPORT_ISSUE_CODES)[keyof typeof DATA_GRAPHQL_IMPORT_ISSUE_CODES];

export type DataGraphqlImportIssue = Readonly<{
  code: DataGraphqlImportIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}>;

export type DataGraphqlImportOperation = Readonly<{
  document: string;
  operationName?: string;
  targetId?: string;
  name?: string;
  description?: string;
}>;

export type DataGraphqlImportBundle = Readonly<{
  schema: string;
  operations: readonly DataGraphqlImportOperation[];
}>;

export type DataGraphqlImportChange = Readonly<{
  entity: 'source' | 'schema' | 'operation';
  change: 'add' | 'update' | 'preserve-local' | 'remove';
  targetId: string;
  externalId?: string;
}>;

export type DataGraphqlImportImpact = Readonly<{
  schemaIds: readonly string[];
  operationIds: readonly string[];
}>;

export type DataGraphqlImpactApproval = DataGraphqlImportImpact;

export type CreateDataGraphqlImportProposalInput = Readonly<{
  bundle: DataGraphqlImportBundle;
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
  endpoint: string;
  runtimeZone?: Extract<RuntimeZone, 'client' | 'server' | 'edge'>;
  currentDocument?: DataSourceDocument;
  impactApproval?: DataGraphqlImpactApproval;
}>;

export type DataGraphqlImportTarget = Readonly<{
  documentId: string;
  importId: string;
  externalDocumentId: string;
  sourceId: string;
}>;

type BlockedStatus = 'invalid' | 'conflict' | 'impact-required';

export type DataGraphqlImportProposal =
  | Readonly<{
      status: 'ready';
      target: DataGraphqlImportTarget;
      document: DataSourceDocument;
      changes: readonly DataGraphqlImportChange[];
      impact: DataGraphqlImportImpact;
      issues: readonly DataGraphqlImportIssue[];
    }>
  | Readonly<{
      status: BlockedStatus;
      target: DataGraphqlImportTarget;
      changes: readonly DataGraphqlImportChange[];
      impact: DataGraphqlImportImpact;
      issues: readonly DataGraphqlImportIssue[];
    }>;

type ImportedEntity<T> = Readonly<{
  externalId: string;
  targetId: string;
  value: T;
  digest: string;
}>;

type Projection = Readonly<{
  source: DataSourceDefinition;
  sourceDigest: string;
  bundleDigest: string;
  schemas: ReadonlyMap<string, ImportedEntity<DataSchema>>;
  operations: ReadonlyMap<string, ImportedEntity<DataOperation>>;
}>;

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const stableJson = (value: unknown): string => {
  const sort = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sort);
    if (!entry || typeof entry !== 'object') return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => compare(left, right))
        .map(([key, child]) => [key, sort(child)])
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

const canonical = (value: string): boolean =>
  Boolean(value && value === value.trim() && !value.includes('\0'));

const sourceText = (value: string): boolean =>
  Boolean(value && value.trim() && !value.includes('\0'));

const issue = (
  issues: DataGraphqlImportIssue[],
  code: DataGraphqlImportIssueCode,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
): void => {
  issues.push(Object.freeze({ code, severity, path, message }));
};

const sortedUnique = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compare));

const blocked = (
  status: BlockedStatus,
  target: DataGraphqlImportTarget,
  issues: DataGraphqlImportIssue[],
  changes: DataGraphqlImportChange[],
  schemaIds: string[],
  operationIds: string[]
): DataGraphqlImportProposal =>
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

const scalarSchema = (name: string): DataJsonSchema202012 => {
  switch (name) {
    case 'String':
    case 'ID':
      return Object.freeze({ type: 'string' });
    case 'Int':
      return Object.freeze({ type: 'integer' });
    case 'Float':
      return Object.freeze({ type: 'number' });
    case 'Boolean':
      return Object.freeze({ type: 'boolean' });
    default:
      return true;
  }
};

const schemaNode = (value: DataJsonSchema202012): DataJsonSchema202012 =>
  Object.freeze(value);

type TypeSchemaProjectionContext = {
  readonly definitions: Map<string, DataJsonSchema202012>;
  readonly building: Set<string>;
};

const createTypeSchemaProjectionContext = (): TypeSchemaProjectionContext => ({
  definitions: new Map(),
  building: new Set(),
});

const projectedDefinitions = (
  context: TypeSchemaProjectionContext
): Readonly<Record<string, DataJsonSchema202012>> | undefined =>
  context.definitions.size
    ? Object.freeze(
        Object.fromEntries(
          [...context.definitions.entries()].sort(([left], [right]) =>
            compare(left, right)
          )
        )
      )
    : undefined;

const nullableDefinitionReference = (name: string): DataJsonSchema202012 =>
  schemaNode({
    anyOf: [{ $ref: `#/$defs/${name}` }, { type: 'null' }],
  });

const inputTypeSchema = (
  type: GraphQLInputType,
  context: TypeSchemaProjectionContext,
  depth = 0
): DataJsonSchema202012 => {
  if (depth > DATA_GRAPHQL_IMPORT_LIMITS.maxTypeDepth) return true;
  if (isNonNullType(type)) return inputTypeSchema(type.ofType, context, depth);
  if (isListType(type))
    return schemaNode({
      anyOf: [
        {
          type: 'array',
          items: inputTypeSchema(type.ofType, context, depth + 1),
        },
        { type: 'null' },
      ],
    });
  const named = getNamedType(type);
  if (isScalarType(named)) {
    const base = scalarSchema(named.name);
    return base === true
      ? true
      : schemaNode({ anyOf: [base, { type: 'null' }] });
  }
  if (isEnumType(named))
    return schemaNode({
      anyOf: [
        { type: 'string', enum: named.getValues().map((value) => value.name) },
        { type: 'null' },
      ],
    });
  if (!isInputObjectType(named)) return true;
  if (
    !context.definitions.has(named.name) &&
    !context.building.has(named.name)
  ) {
    context.building.add(named.name);
    const properties: Record<string, DataJsonSchema202012> = {};
    const required: string[] = [];
    for (const field of Object.values(named.getFields()).sort((left, right) =>
      compare(left.name, right.name)
    )) {
      properties[field.name] = inputTypeSchema(field.type, context, depth + 1);
      if (isNonNullType(field.type) && field.defaultValue === undefined)
        required.push(field.name);
    }
    context.definitions.set(
      named.name,
      schemaNode({
        type: 'object',
        properties: Object.freeze(properties),
        ...(required.length ? { required: Object.freeze(required) } : {}),
        additionalProperties: false,
      })
    );
    context.building.delete(named.name);
  }
  return nullableDefinitionReference(named.name);
};

const outputTypeSchema = (
  type: GraphQLOutputType,
  context: TypeSchemaProjectionContext,
  depth = 0
): DataJsonSchema202012 => {
  if (depth > DATA_GRAPHQL_IMPORT_LIMITS.maxTypeDepth) return true;
  if (isNonNullType(type)) return outputTypeSchema(type.ofType, context, depth);
  if (isListType(type))
    return schemaNode({
      anyOf: [
        {
          type: 'array',
          items: outputTypeSchema(type.ofType, context, depth + 1),
        },
        { type: 'null' },
      ],
    });
  const named = getNamedType(type);
  if (isScalarType(named)) {
    const base = scalarSchema(named.name);
    return base === true
      ? true
      : schemaNode({ anyOf: [base, { type: 'null' }] });
  }
  if (isEnumType(named))
    return schemaNode({
      anyOf: [
        { type: 'string', enum: named.getValues().map((value) => value.name) },
        { type: 'null' },
      ],
    });
  if (!isObjectType(named) && !isInterfaceType(named) && !isUnionType(named))
    return true;
  if (isUnionType(named))
    return schemaNode({
      anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
    });
  if (
    !context.definitions.has(named.name) &&
    !context.building.has(named.name)
  ) {
    context.building.add(named.name);
    const properties = Object.fromEntries(
      Object.values(named.getFields())
        .sort((left, right) => compare(left.name, right.name))
        .map((field) => [
          field.name,
          outputTypeSchema(field.type, context, depth + 1),
        ])
    );
    context.definitions.set(
      named.name,
      schemaNode({ type: 'object', properties: Object.freeze(properties) })
    );
    context.building.delete(named.name);
  }
  return nullableDefinitionReference(named.name);
};

const operationDefinition = (
  schema: GraphQLSchema,
  entry: DataGraphqlImportOperation,
  index: number,
  issues: DataGraphqlImportIssue[]
): OperationDefinitionNode | undefined => {
  if (
    !sourceText(entry.document) ||
    utf8ToBytes(entry.document).length >
      DATA_GRAPHQL_IMPORT_LIMITS.maxOperationBytes
  ) {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.limitExceeded,
      `/operations/${index}/document`,
      'GraphQL operation document is invalid or exceeds the byte budget.'
    );
    return undefined;
  }
  try {
    const document = parse(entry.document, { maxTokens: 20_000 });
    const validationErrors = validate(schema, document, undefined, {
      maxErrors: 32,
    });
    if (validationErrors.length) {
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
        `/operations/${index}/document`,
        'GraphQL operation document does not validate against the imported schema.'
      );
      return undefined;
    }
    const definitions = document.definitions.filter(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === Kind.OPERATION_DEFINITION
    );
    const selected = entry.operationName
      ? definitions.filter(
          (definition) => definition.name?.value === entry.operationName
        )
      : definitions.length === 1
        ? definitions
        : [];
    if (
      selected.length !== 1 ||
      (selected[0]?.operation !== 'query' &&
        selected[0]?.operation !== 'mutation')
    ) {
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.unsupportedShape,
        `/operations/${index}`,
        'Each import entry must select exactly one finite query or mutation.'
      );
      return undefined;
    }
    return selected[0];
  } catch {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
      `/operations/${index}/document`,
      'GraphQL operation document could not be parsed.'
    );
    return undefined;
  }
};

const compileProjection = (
  input: CreateDataGraphqlImportProposalInput,
  previous: DataImportProvenance | undefined,
  issues: DataGraphqlImportIssue[]
): Projection | undefined => {
  if (
    !sourceText(input.bundle.schema) ||
    utf8ToBytes(input.bundle.schema).length >
      DATA_GRAPHQL_IMPORT_LIMITS.maxSchemaBytes
  ) {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.limitExceeded,
      '/schema',
      'GraphQL SDL is invalid or exceeds the byte budget.'
    );
    return undefined;
  }
  if (
    input.bundle.operations.length === 0 ||
    input.bundle.operations.length > DATA_GRAPHQL_IMPORT_LIMITS.maxOperations
  ) {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.limitExceeded,
      '/operations',
      'GraphQL import requires a bounded non-empty operation set.'
    );
    return undefined;
  }
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(input.bundle.schema, {
      assumeValid: false,
      assumeValidSDL: false,
    });
  } catch {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
      '/schema',
      'GraphQL schema SDL could not be built.'
    );
    return undefined;
  }
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
      '/@endpoint',
      'GraphQL endpoint must be absolute.'
    );
    return undefined;
  }
  if (
    (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.unsupportedShape,
      '/@endpoint',
      'GraphQL endpoint contains unsupported URL fields.'
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
  for (const [index, entry] of input.bundle.operations.entries()) {
    const definition = operationDefinition(schema, entry, index, issues);
    if (!definition) continue;
    // Caller-authored labels reach DataOperation.name/description unchanged, so
    // they must be rejected here with their own path instead of surfacing later
    // as an unattributable canonical-contract rejection of the whole projection.
    // An empty description is exempt: the projection drops falsy descriptions,
    // so only a description that will actually project is validated. An empty
    // name is not exempt — `entry.name ?? operationName` keeps it and the
    // canonical contract would reject the whole projection downstream.
    const invalidLabel = (['name', 'description'] as const).find((key) => {
      const value = entry[key];
      if (value === undefined) return false;
      if (key === 'description' && value === '') return false;
      return !canonical(value);
    });
    if (invalidLabel) {
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
        `/operations/${index}/${invalidLabel}`,
        `GraphQL operation ${invalidLabel} must be a canonical string.`
      );
      continue;
    }
    const operationName =
      entry.operationName ?? definition.name?.value ?? `operation-${index + 1}`;
    const externalId = `operation:${operationName}`;
    if (operations.has(externalId)) {
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
        `/operations/${index}`,
        'GraphQL operation names must be unique within an import.'
      );
      continue;
    }
    const operationId = operationIds.allocate(
      externalId,
      entry.targetId ?? operationName
    );
    const inputExternalId = `${externalId}:input`;
    const outputExternalId = `${externalId}:output`;
    const inputId = schemaIds.allocate(inputExternalId, `${operationId}-input`);
    const outputId = schemaIds.allocate(
      outputExternalId,
      `${operationId}-output`
    );
    const properties: Record<string, DataJsonSchema202012> = {};
    const required: string[] = [];
    const inputProjection = createTypeSchemaProjectionContext();
    for (const variable of definition.variableDefinitions ?? []) {
      const type = typeFromAST(schema, variable.type);
      if (!type || !isInputType(type)) {
        issue(
          issues,
          DATA_GRAPHQL_IMPORT_ISSUE_CODES.unsupportedShape,
          `/operations/${index}/variables/${variable.variable.name.value}`,
          'GraphQL variable type cannot be projected to canonical JSON Schema.'
        );
        continue;
      }
      properties[variable.variable.name.value] = inputTypeSchema(
        type,
        inputProjection
      );
      if (isNonNullType(type) && !variable.defaultValue)
        required.push(variable.variable.name.value);
    }
    const inputDefinitions = projectedDefinitions(inputProjection);
    const inputSchema: DataSchema = Object.freeze({
      id: inputId,
      name: `${operationName} input`,
      schema: Object.freeze({
        $schema: JSON_SCHEMA_2020_12_URI,
        type: 'object',
        properties: Object.freeze(properties),
        ...(required.length ? { required: Object.freeze(required) } : {}),
        additionalProperties: false,
        ...(inputDefinitions ? { $defs: inputDefinitions } : {}),
      }),
    });
    const root =
      definition.operation === 'query'
        ? schema.getQueryType()
        : schema.getMutationType();
    const topFields = definition.selectionSet.selections.filter(
      (selection) => selection.kind === Kind.FIELD
    );
    const singleField = topFields.length === 1 ? topFields[0] : undefined;
    const fieldDefinition =
      singleField && root
        ? root.getFields()[singleField.name.value]
        : undefined;
    const outputProjection = createTypeSchemaProjectionContext();
    const projectedOutput = fieldDefinition
      ? outputTypeSchema(fieldDefinition.type, outputProjection)
      : undefined;
    const outputDefinitions = projectedDefinitions(outputProjection);
    const outputSchemaValue: DataJsonSchema202012 = fieldDefinition
      ? Object.freeze({
          $schema: JSON_SCHEMA_2020_12_URI,
          ...((projectedOutput === true ? {} : projectedOutput) as Record<
            string,
            unknown
          >),
          ...(outputDefinitions ? { $defs: outputDefinitions } : {}),
        })
      : Object.freeze({
          $schema: JSON_SCHEMA_2020_12_URI,
          type: 'object',
          additionalProperties: true,
        });
    const outputSchema: DataSchema = Object.freeze({
      id: outputId,
      name: `${operationName} output`,
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
    const configurationByKey: Record<string, DataConfigurationValue> = {
      document: literal(entry.document),
      operationName: literal(operationName),
      partialErrorPolicy: literal('reject'),
      emptyWhen: literal('never'),
      ...(singleField
        ? {
            resultPath: literal(
              `/${(singleField.alias ?? singleField.name).value.replaceAll('~', '~0').replaceAll('/', '~1')}`
            ),
          }
        : {}),
    };
    const operationKind =
      definition.operation === 'query'
        ? ('query' as const)
        : ('mutation' as const);
    const operation: DataOperation = Object.freeze({
      id: operationId,
      name: entry.name ?? operationName,
      ...(entry.description ? { description: entry.description } : {}),
      kind: operationKind,
      inputSchemaId: inputId,
      outputSchemaId: outputId,
      configurationByKey: Object.freeze(configurationByKey),
      policies: Object.freeze({}),
    });
    operations.set(
      externalId,
      Object.freeze({
        externalId,
        targetId: operationId,
        value: operation,
        digest: digest({
          name: operation.name,
          description: operation.description,
          kind: operation.kind,
          inputSchemaId: operation.inputSchemaId,
          outputSchemaId: operation.outputSchemaId,
          configurationByKey: operation.configurationByKey,
        }),
      })
    );
  }
  if (issues.some((entry) => entry.severity === 'error')) return undefined;
  const source: DataSourceDefinition = Object.freeze({
    id: input.sourceId,
    name: input.sourceId,
    adapterId: DATA_GRAPHQL_ADAPTER_ID,
    runtimeZone: input.runtimeZone ?? 'client',
    bindingsById: Object.freeze({}),
    configurationByKey: Object.freeze({
      endpoint: literal(endpoint.toString()),
    }),
  });
  return Object.freeze({
    source,
    sourceDigest: digest({
      name: source.name,
      adapterId: source.adapterId,
      runtimeZone: source.runtimeZone,
      endpoint: source.configurationByKey.endpoint,
    }),
    bundleDigest: digest(input.bundle),
    schemas,
    operations,
  });
};

const schemaDigest = (schema: DataSchema): string =>
  digest({
    name: schema.name,
    description: schema.description,
    schema: schema.schema,
  });

const managedOperationConfigurationKeys = new Set([
  'document',
  'operationName',
  'variablesInputPath',
  'resultPath',
  'partialErrorPolicy',
  'emptyWhen',
  'authorization',
  'idempotencyHeader',
]);

const operationDigest = (operation: DataOperation): string =>
  digest({
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

const sourceDigest = (source: DataSourceDefinition): string =>
  digest({
    name: source.name,
    adapterId: source.adapterId,
    runtimeZone: source.runtimeZone,
    endpoint: source.configurationByKey.endpoint,
  });

const mappingRecord = <T>(
  entities: ReadonlyMap<string, ImportedEntity<T>>
): Readonly<Record<string, DataImportEntityMapping>> =>
  Object.freeze(
    Object.fromEntries(
      [...entities.entries()]
        .sort(([left], [right]) => compare(left, right))
        .map(([externalId, entity]) => [
          externalId,
          Object.freeze({
            targetId: entity.targetId,
            importedDigest: entity.digest,
          }),
        ])
    )
  );

const exactApproval = (
  impact: DataGraphqlImportImpact,
  approval: DataGraphqlImpactApproval | undefined
): boolean =>
  Boolean(
    approval &&
    stableJson(sortedUnique(approval.schemaIds)) ===
      stableJson(impact.schemaIds) &&
    stableJson(sortedUnique(approval.operationIds)) ===
      stableJson(impact.operationIds)
  );

/** Compiles SDL plus finite operation documents into an explicitly adoptable proposal. */
export const createDataGraphqlImportProposal = (
  input: CreateDataGraphqlImportProposalInput
): DataGraphqlImportProposal => {
  const target = Object.freeze({
    documentId: input.documentId,
    importId: input.importId,
    externalDocumentId: input.externalDocumentId,
    sourceId: input.sourceId,
  });
  const issues: DataGraphqlImportIssue[] = [];
  const changes: DataGraphqlImportChange[] = [];
  const schemaImpact: string[] = [];
  const operationImpact: string[] = [];
  for (const [path, value] of [
    ['/@documentId', input.documentId],
    ['/@importId', input.importId],
    ['/@externalDocumentId', input.externalDocumentId],
    ['/@sourceId', input.sourceId],
  ] as const) {
    if (!canonical(value))
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
        path,
        'Expected a canonical identity.'
      );
  }
  let current: DataSourceDocument | undefined;
  if (input.currentDocument) {
    const decoded = decodeCurrentDataSourceDocument(input.currentDocument, {
      documentId: input.documentId,
    });
    if (decoded.ok) current = decoded.value;
    else
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
        '/@currentDocument',
        'Current Data document is not canonical.'
      );
  }
  const previous = current?.importProvenanceById?.[input.importId];
  if (current && !previous)
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${input.importId}`,
      'Reimport requires matching canonical provenance.'
    );
  if (
    previous &&
    (previous.kind !== 'graphql-sdl' ||
      previous.externalDocumentId !== input.externalDocumentId)
  )
    issue(
      issues,
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
      `/importProvenanceById/${input.importId}`,
      'GraphQL reimport identity drifted.'
    );
  const projection = compileProjection(input, previous, issues);
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
    kind: 'graphql-sdl',
    externalDocumentId: input.externalDocumentId,
    sourceDigest: projection.bundleDigest,
    sourceImportedDigest: projection.sourceDigest,
    schemasByExternalId: mappingRecord(projection.schemas),
    operationsByExternalId: mappingRecord(projection.operations),
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
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
        '/@proposal',
        'Imported GraphQL projection does not satisfy the canonical Data source contract.'
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
  const currentSourceDigest = sourceDigest(source);
  if (currentSourceDigest === previous.sourceImportedDigest) {
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
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.reimportConflict,
      '/source',
      'GraphQL source changed both locally and upstream.'
    );
  }
  const schemasById: Record<string, DataSchema> = { ...current.schemasById };
  for (const [externalId, oldMapping] of Object.entries(
    previous.schemasByExternalId
  )) {
    const existing = current.schemasById[oldMapping.targetId];
    const desired = projection.schemas.get(externalId);
    if (!existing) {
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${oldMapping.targetId}`,
        'Imported schema target is missing.'
      );
      continue;
    }
    const localDigest = schemaDigest(existing);
    if (!desired) {
      if (localDigest !== oldMapping.importedDigest)
        issue(
          issues,
          DATA_GRAPHQL_IMPORT_ISSUE_CODES.reimportConflict,
          `/schemasById/${existing.id}`,
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
    } else if (desired.digest === oldMapping.importedDigest) {
      changes.push(
        Object.freeze({
          entity: 'schema',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    } else
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.reimportConflict,
        `/schemasById/${existing.id}`,
        'Schema changed both locally and upstream.'
      );
  }
  for (const [externalId, desired] of projection.schemas) {
    if (previous.schemasByExternalId[externalId]) continue;
    if (schemasById[desired.targetId])
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
        `/schemasById/${desired.targetId}`,
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
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${oldMapping.targetId}`,
        'Imported operation target is missing.'
      );
      continue;
    }
    const localDigest = operationDigest(existing);
    if (!desired) {
      if (localDigest !== oldMapping.importedDigest)
        issue(
          issues,
          DATA_GRAPHQL_IMPORT_ISSUE_CODES.reimportConflict,
          `/operationsById/${existing.id}`,
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
          ...Object.fromEntries(
            Object.entries(existing.configurationByKey).filter(
              ([key]) => !managedOperationConfigurationKeys.has(key)
            )
          ),
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
    } else if (desired.digest === oldMapping.importedDigest) {
      changes.push(
        Object.freeze({
          entity: 'operation',
          change: 'preserve-local',
          targetId: existing.id,
          externalId,
        })
      );
    } else
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.reimportConflict,
        `/operationsById/${existing.id}`,
        'Operation changed both locally and upstream.'
      );
  }
  for (const [externalId, desired] of projection.operations) {
    if (previous.operationsByExternalId[externalId]) continue;
    if (operationsById[desired.targetId])
      issue(
        issues,
        DATA_GRAPHQL_IMPORT_ISSUE_CODES.targetDrift,
        `/operationsById/${desired.targetId}`,
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
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.impactRequired,
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
      DATA_GRAPHQL_IMPORT_ISSUE_CODES.invalidDocument,
      '/@proposal',
      'GraphQL reimport projection does not satisfy the canonical Data source contract.'
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
