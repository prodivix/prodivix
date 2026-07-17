import type {
  EnvironmentBindingReference,
  RuntimeZone,
  SecretRef,
} from '@prodivix/runtime-core';
import type { DataOperationReference as AuthoringDataOperationReference } from '@prodivix/authoring';

export const DATA_SOURCE_WIRE_VERSION = 1 as const;
export const DATA_DOCUMENT_ISSUE_CODES = Object.freeze({
  invalid: 'DAT-1001',
} as const);
export const JSON_SCHEMA_2020_12_URI =
  'https://json-schema.org/draft/2020-12/schema' as const;

export type DataJsonValue =
  null | boolean | number | string | readonly DataJsonValue[] | DataJsonObject;

export type DataJsonObject = Readonly<{
  [key: string]: DataJsonValue;
}>;

export type DataJsonSchemaType =
  'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer';

/** JSON Schema 2020-12 remains an open vocabulary while common keywords stay typed. */
export type DataJsonSchema202012 =
  | boolean
  | (Readonly<{
      $schema?: typeof JSON_SCHEMA_2020_12_URI;
      $id?: string;
      $ref?: string;
      $defs?: Readonly<Record<string, DataJsonSchema202012>>;
      title?: string;
      description?: string;
      type?: DataJsonSchemaType | readonly DataJsonSchemaType[];
      properties?: Readonly<Record<string, DataJsonSchema202012>>;
      required?: readonly string[];
      additionalProperties?: boolean | DataJsonSchema202012;
      items?: DataJsonSchema202012;
      prefixItems?: readonly DataJsonSchema202012[];
      enum?: readonly DataJsonValue[];
      const?: DataJsonValue;
      default?: DataJsonValue;
      examples?: readonly DataJsonValue[];
      allOf?: readonly DataJsonSchema202012[];
      anyOf?: readonly DataJsonSchema202012[];
      oneOf?: readonly DataJsonSchema202012[];
      not?: DataJsonSchema202012;
    }> &
      Readonly<Record<string, unknown>>);

export type DataSourceBinding =
  | Readonly<{
      kind: 'environment-ref';
      reference: EnvironmentBindingReference;
    }>
  | Readonly<{
      kind: 'secret-ref';
      reference: SecretRef;
    }>;

export type DataConfigurationValue =
  Readonly<{ kind: 'literal'; value: DataJsonValue }> | DataSourceBinding;

export type DataSourceDefinition = Readonly<{
  id: string;
  name?: string;
  adapterId: string;
  runtimeZone: RuntimeZone;
  bindingsById: Readonly<Record<string, DataSourceBinding>>;
  configurationByKey: Readonly<Record<string, DataConfigurationValue>>;
}>;

export type DataSchema = Readonly<{
  id: string;
  name?: string;
  description?: string;
  schema: DataJsonSchema202012;
}>;

export const DATA_OPERATION_KINDS = Object.freeze([
  'query',
  'mutation',
] as const);
export type DataOperationKind = (typeof DATA_OPERATION_KINDS)[number];

export type DataOperationReference = AuthoringDataOperationReference;

export const DATA_CACHE_POLICY_LIMITS = Object.freeze({
  maxDurationMs: 7 * 24 * 60 * 60_000,
  maxKeyInputPaths: 64,
} as const);

export type DataCachePolicy =
  | Readonly<{ strategy: 'no-store' }>
  | Readonly<{
      strategy: 'cache-first';
      ttlMs: number;
      keyInputPaths?: readonly string[];
    }>
  | Readonly<{
      strategy: 'network-first';
      ttlMs: number;
      staleWhileRevalidateMs?: number;
      keyInputPaths?: readonly string[];
    }>
  | Readonly<{
      strategy: 'stale-while-revalidate';
      ttlMs: number;
      staleWhileRevalidateMs: number;
      keyInputPaths?: readonly string[];
    }>;

export type DataRetryPolicy = Readonly<{
  maxAttempts: number;
  backoff: 'fixed' | 'exponential';
  initialDelayMs: number;
  maxDelayMs?: number;
}>;

/**
 * Declares that an adapter may derive one opaque upstream key from the stable
 * invocation identity and reuse it across every retry attempt.
 */
export type DataIdempotencyPolicy = Readonly<{
  kind: 'invocation-key';
}>;

export type DataOffsetPaginationPolicy = Readonly<{
  kind: 'offset';
  offsetInput: string;
  limitInput: string;
  defaultLimit: number;
  maxLimit?: number;
  totalPath?: string;
}>;

export type DataCursorPaginationPolicy = Readonly<{
  kind: 'cursor';
  cursorInput: string;
  limitInput: string;
  defaultLimit: number;
  maxLimit?: number;
  nextCursorPath: string;
  previousCursorPath?: string;
}>;

export type DataPaginationPolicy =
  DataOffsetPaginationPolicy | DataCursorPaginationPolicy;

export type DataOptimisticCrudEffectPolicy = Readonly<{
  kind: 'crud';
  action: 'create' | 'update' | 'delete';
  target: DataOperationReference;
  entityIdPath?: string;
  valueInputPath?: string;
  valueOutputPath?: string;
  placement?: 'start' | 'end';
  rollback: 'on-error';
}>;

export type DataOperationPolicies = Readonly<{
  cache?: DataCachePolicy;
  retry?: DataRetryPolicy;
  idempotency?: DataIdempotencyPolicy;
  pagination?: DataPaginationPolicy;
  optimistic?: DataOptimisticCrudEffectPolicy;
}>;

export type DataOperation = Readonly<{
  id: string;
  name?: string;
  description?: string;
  kind: DataOperationKind;
  inputSchemaId?: string;
  outputSchemaId: string;
  configurationByKey: Readonly<Record<string, DataConfigurationValue>>;
  policies: DataOperationPolicies;
}>;

/** The stable current model deliberately has no persistence version field. */
export type DataSourceDocument = Readonly<{
  source: DataSourceDefinition;
  schemasById: Readonly<Record<string, DataSchema>>;
  operationsById: Readonly<Record<string, DataOperation>>;
}>;

export type DataSourceDocumentWireV1 = Readonly<{
  wireVersion: typeof DATA_SOURCE_WIRE_VERSION;
  source: DataSourceDefinition;
  schemasById: Readonly<Record<string, DataSchema>>;
  operationsById: Readonly<Record<string, DataOperation>>;
}>;

export type DataDocumentIssue = Readonly<{
  code: (typeof DATA_DOCUMENT_ISSUE_CODES)['invalid'];
  path: string;
  message: string;
}>;

export type DataSourceDocumentValidationOptions = Readonly<{
  documentId?: string;
}>;

export type DataSourceDocumentDecodeResult =
  | Readonly<{ ok: true; value: DataSourceDocument }>
  | Readonly<{ ok: false; issues: readonly DataDocumentIssue[] }>;

export type DataSourceDocumentValidationResult = Readonly<{
  valid: boolean;
  issues: readonly DataDocumentIssue[];
}>;

export const DATA_LIFECYCLE_STATUSES = Object.freeze([
  'idle',
  'loading',
  'success',
  'empty',
  'error',
] as const);
export type DataLifecycleStatus = (typeof DATA_LIFECYCLE_STATUSES)[number];

export type DataOperationError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, DataJsonValue>>;
}>;

export type DataOffsetPageSnapshot = Readonly<{
  kind: 'offset';
  offset: number;
  limit: number;
  total?: number;
  hasMore: boolean;
}>;

export type DataCursorPageSnapshot = Readonly<{
  kind: 'cursor';
  nextCursor?: string;
  previousCursor?: string;
  hasMore: boolean;
}>;

export type DataPageSnapshot = DataOffsetPageSnapshot | DataCursorPageSnapshot;

type DataLifecycleBase = Readonly<{
  operation: DataOperationReference;
  sequence: number;
}>;

export type DataLifecycleSnapshot<Value extends DataJsonValue = DataJsonValue> =
  | (DataLifecycleBase & Readonly<{ status: 'idle' }>)
  | (DataLifecycleBase &
      Readonly<{
        status: 'loading';
        invocationId: string;
        attempt: number;
        startedAt: number;
      }>)
  | (DataLifecycleBase &
      Readonly<{
        status: 'success';
        invocationId: string;
        attempt: number;
        startedAt: number;
        completedAt: number;
        value: Value;
        page?: DataPageSnapshot;
      }>)
  | (DataLifecycleBase &
      Readonly<{
        status: 'empty';
        invocationId: string;
        attempt: number;
        startedAt: number;
        completedAt: number;
        page?: DataPageSnapshot;
      }>)
  | (DataLifecycleBase &
      Readonly<{
        status: 'error';
        invocationId: string;
        attempt: number;
        startedAt: number;
        completedAt: number;
        error: DataOperationError;
      }>);
