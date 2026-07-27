import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  EXECUTION_PROFILES,
  EXECUTION_PROVIDER_ISOLATIONS,
  RUNTIME_ZONES,
  type ExecutionProfile,
  type ExecutionProviderIsolation,
  type ExecutionValue,
  type RuntimeZone,
} from './execution.types';
import {
  createEnvironmentBindingReference,
  createExecutionEnvironmentSnapshotRef,
  createSecretRef,
  type EnvironmentBindingReference,
  type ExecutionEnvironmentSnapshotRef,
  type SecretRef,
} from './executionEnvironment';

export const EXECUTION_ENVIRONMENT_EXECUTION_CLASSES = Object.freeze([
  'browser',
  'shared-worker',
  'trusted-service',
  'isolated-runner',
  'build',
] as const);
export type ExecutionEnvironmentExecutionClass =
  (typeof EXECUTION_ENVIRONMENT_EXECUTION_CLASSES)[number];

export const EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES = Object.freeze({
  snapshotMissing: 'ENVIRONMENT_SNAPSHOT_MISSING',
  revisionMismatch: 'ENVIRONMENT_REVISION_MISMATCH',
  modeMismatch: 'ENVIRONMENT_MODE_MISMATCH',
  permissionDenied: 'ENVIRONMENT_PERMISSION_DENIED',
  bindingMissing: 'ENVIRONMENT_BINDING_MISSING',
  bindingKindMismatch: 'ENVIRONMENT_BINDING_KIND_MISMATCH',
  secretZoneDenied: 'ENVIRONMENT_SECRET_ZONE_DENIED',
  leaseExpired: 'ENVIRONMENT_LEASE_EXPIRED',
  leaseRevoked: 'ENVIRONMENT_LEASE_REVOKED',
  secretUnavailable: 'ENVIRONMENT_SECRET_UNAVAILABLE',
} as const);
export type ExecutionEnvironmentResolutionErrorCode =
  (typeof EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES)[keyof typeof EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES];

export class ExecutionEnvironmentResolutionError extends Error {
  readonly code: ExecutionEnvironmentResolutionErrorCode;
  readonly retryable = false;

  constructor(code: ExecutionEnvironmentResolutionErrorCode) {
    super('Execution environment resolution was denied.');
    this.name = 'ExecutionEnvironmentResolutionError';
    this.code = code;
  }
}

export type ExecutionEnvironmentSnapshot = Readonly<{
  environmentId: string;
  revision: string;
  mode: 'mock' | 'live';
  publicBindingsById: Readonly<Record<string, ExecutionValue>>;
  secretBindingIds: readonly string[];
}>;

export type ExecutionEnvironmentBindingRequest = Readonly<{
  bindingId: string;
  kind: 'public' | 'secret';
  field: string;
}>;

export type ExecutionEnvironmentResolutionPurpose = Readonly<{
  kind: 'data-operation' | 'process';
  resourceId: string;
  adapterId?: string;
}>;

export type ExecutionEnvironmentPrincipalPartition = Readonly<{
  principalId: string;
  sessionId: string;
}>;

export const createExecutionEnvironmentPrincipalPartitionId = (
  value: ExecutionEnvironmentPrincipalPartition
): string => {
  const principalId = canonical(value.principalId, 'Environment principalId');
  const sessionId = canonical(value.sessionId, 'Environment sessionId');
  const payload = `${principalId.length}:${principalId}${sessionId.length}:${sessionId}`;
  return `environment-principal:sha256:${bytesToHex(
    sha256(utf8ToBytes(payload))
  )}`;
};

export type ExecutionEnvironmentResolutionRequest = Readonly<{
  leaseId: string;
  workspaceId: string;
  principal: ExecutionEnvironmentPrincipalPartition;
  providerId: string;
  providerIsolation: ExecutionProviderIsolation;
  executionClass: ExecutionEnvironmentExecutionClass;
  profile: ExecutionProfile;
  runtimeZone: RuntimeZone;
  environment: ExecutionEnvironmentSnapshotRef;
  purpose: ExecutionEnvironmentResolutionPurpose;
  bindings: readonly ExecutionEnvironmentBindingRequest[];
}>;

export type ExecutionEnvironmentPermissionGrant = Readonly<{
  allowed: true;
  grantId: string;
  permissionRevision: string;
  expiresAt: number;
}>;

export type ExecutionEnvironmentPermissionDenial = Readonly<{
  allowed: false;
}>;

export type ExecutionEnvironmentPermissionDecision =
  ExecutionEnvironmentPermissionGrant | ExecutionEnvironmentPermissionDenial;

export type ExecutionEnvironmentPermissionPort = Readonly<{
  authorize(
    request: ExecutionEnvironmentResolutionRequest
  ):
    | ExecutionEnvironmentPermissionDecision
    | Promise<ExecutionEnvironmentPermissionDecision>;
}>;

export type ExecutionEnvironmentSnapshotPort = Readonly<{
  load(
    environmentId: string
  ):
    | ExecutionEnvironmentSnapshot
    | undefined
    | Promise<ExecutionEnvironmentSnapshot | undefined>;
}>;

export type ExecutionSecretMaterialPort = Readonly<{
  read(input: {
    request: ExecutionEnvironmentResolutionRequest;
    bindingId: string;
    grantId: string;
  }): string | undefined | Promise<string | undefined>;
}>;

export type ExecutionEnvironmentResolutionAuditEvent = Readonly<{
  kind:
    | 'lease-issued'
    | 'public-binding-read'
    | 'secret-binding-used'
    | 'lease-revoked';
  occurredAt: number;
  leaseId: string;
  workspaceId: string;
  principalId: string;
  sessionId: string;
  providerId: string;
  environmentId: string;
  environmentRevision: string;
  permissionRevision: string;
  purposeKind: ExecutionEnvironmentResolutionPurpose['kind'];
  resourceId: string;
  bindingId?: string;
  field?: string;
}>;

export type ExecutionEnvironmentResolutionLeaseMetadata = Readonly<{
  leaseId: string;
  principal: ExecutionEnvironmentPrincipalPartition;
  environment: ExecutionEnvironmentSnapshotRef;
  grantId: string;
  permissionRevision: string;
  expiresAt: number;
}>;

export type ExecutionEnvironmentResolutionLease = Readonly<{
  metadata: ExecutionEnvironmentResolutionLeaseMetadata;
  isActive(): boolean;
  readPublicBinding(
    reference: EnvironmentBindingReference,
    field: string
  ): ExecutionValue;
  useSecret(
    reference: SecretRef,
    field: string,
    consumer: (material: string) => void | Promise<void>
  ): Promise<void>;
  revoke(): void;
}>;

export type ExecutionEnvironmentResolutionService = Readonly<{
  resolve(
    request: ExecutionEnvironmentResolutionRequest
  ): Promise<ExecutionEnvironmentResolutionLease>;
}>;

const MAX_ENVIRONMENT_LEASE_DURATION_MS = 5 * 60_000;
const IDENTITY_LIMIT = 4_096;

const canonical = (value: string, label: string): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.includes('\0') ||
    value.length > IDENTITY_LIMIT
  )
    throw new TypeError(`${label} must be a canonical string.`);
  return value;
};

const finiteTimestamp = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value;
};

const cloneExecutionValue = (value: ExecutionValue): ExecutionValue => {
  let nodes = 0;
  const ancestors = new Set<object>();
  const clone = (candidate: ExecutionValue, depth: number): ExecutionValue => {
    nodes += 1;
    if (nodes > 100_000 || depth > 128)
      throw new TypeError('Environment public binding exceeds its budget.');
    if (candidate === null || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate))
        throw new TypeError('Environment public binding must be JSON-safe.');
      return candidate;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate))
      throw new TypeError('Environment public binding must be JSON-safe.');
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    )
      throw new TypeError('Environment public binding must use plain objects.');
    ancestors.add(candidate);
    const result = Array.isArray(candidate)
      ? Object.freeze(candidate.map((entry) => clone(entry, depth + 1)))
      : Object.freeze(
          Object.fromEntries(
            Object.entries(candidate)
              .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
              .map(([key, entry]) => [key, clone(entry, depth + 1)])
          )
        );
    ancestors.delete(candidate);
    return result;
  };
  return clone(value, 0);
};

const normalizeSnapshot = (
  value: ExecutionEnvironmentSnapshot
): ExecutionEnvironmentSnapshot => {
  const reference = createExecutionEnvironmentSnapshotRef({
    environmentId: value.environmentId,
    revision: value.revision,
    mode: value.mode,
  });
  const publicBindings = Object.entries(value.publicBindingsById)
    .map(
      ([bindingId, bindingValue]) =>
        [
          canonical(bindingId, 'Environment public bindingId'),
          cloneExecutionValue(bindingValue),
        ] as const
    )
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right));
  const secretBindingIds = Object.freeze(
    [...new Set(value.secretBindingIds)]
      .map((bindingId) => canonical(bindingId, 'Environment secret bindingId'))
      .sort(compareUnicodeCodePoints)
  );
  if (
    publicBindings.some(([bindingId]) => secretBindingIds.includes(bindingId))
  )
    throw new TypeError('Environment binding kind must be unambiguous.');
  return Object.freeze({
    ...reference,
    publicBindingsById: Object.freeze(Object.fromEntries(publicBindings)),
    secretBindingIds,
  });
};

const normalizeRequest = (
  value: ExecutionEnvironmentResolutionRequest
): ExecutionEnvironmentResolutionRequest => {
  if (!EXECUTION_ENVIRONMENT_EXECUTION_CLASSES.includes(value.executionClass))
    throw new TypeError('Environment execution class is unsupported.');
  if (!EXECUTION_PROVIDER_ISOLATIONS.includes(value.providerIsolation))
    throw new TypeError('Environment provider isolation is unsupported.');
  if (!EXECUTION_PROFILES.includes(value.profile))
    throw new TypeError('Environment execution profile is unsupported.');
  if (!RUNTIME_ZONES.includes(value.runtimeZone))
    throw new TypeError('Environment runtime zone is unsupported.');
  if (
    value.purpose.kind !== 'data-operation' &&
    value.purpose.kind !== 'process'
  )
    throw new TypeError('Environment resolution purpose is unsupported.');
  const bindings = value.bindings
    .map((binding) =>
      Object.freeze({
        bindingId: canonical(binding.bindingId, 'Environment bindingId'),
        kind: binding.kind,
        field: canonical(binding.field, 'Environment binding field'),
      })
    )
    .sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.field}\0${left.bindingId}`,
        `${right.field}\0${right.bindingId}`
      )
    );
  if (
    bindings.some(
      (binding) => binding.kind !== 'public' && binding.kind !== 'secret'
    )
  )
    throw new TypeError('Environment binding kind is unsupported.');
  if (
    bindings.some(
      (binding, index) =>
        index > 0 && binding.field === bindings[index - 1]?.field
    )
  )
    throw new TypeError('Environment binding fields must be unique.');
  return Object.freeze({
    leaseId: canonical(value.leaseId, 'Environment leaseId'),
    workspaceId: canonical(value.workspaceId, 'Environment workspaceId'),
    principal: Object.freeze({
      principalId: canonical(
        value.principal.principalId,
        'Environment principalId'
      ),
      sessionId: canonical(value.principal.sessionId, 'Environment sessionId'),
    }),
    providerId: canonical(value.providerId, 'Environment providerId'),
    providerIsolation: value.providerIsolation,
    executionClass: value.executionClass,
    profile: value.profile,
    runtimeZone: value.runtimeZone,
    environment: createExecutionEnvironmentSnapshotRef(value.environment),
    purpose: Object.freeze({
      kind: value.purpose.kind,
      resourceId: canonical(
        value.purpose.resourceId,
        'Environment purpose resourceId'
      ),
      ...(value.purpose.adapterId !== undefined
        ? {
            adapterId: canonical(
              value.purpose.adapterId,
              'Environment purpose adapterId'
            ),
          }
        : {}),
    }),
    bindings: Object.freeze(bindings),
  });
};

/** Secret resolution is allowed only in an explicitly authorized isolated server-side class. */
export const canResolveExecutionSecret = (
  request: Pick<
    ExecutionEnvironmentResolutionRequest,
    'runtimeZone' | 'providerIsolation' | 'executionClass'
  >
): boolean => {
  if (
    request.providerIsolation !== 'sandboxed' &&
    request.providerIsolation !== 'remote-isolated'
  )
    return false;
  if (request.runtimeZone === 'worker')
    return (
      request.executionClass === 'isolated-runner' &&
      request.providerIsolation === 'remote-isolated'
    );
  if (request.runtimeZone === 'test')
    return request.executionClass === 'isolated-runner';
  if (request.runtimeZone === 'server' || request.runtimeZone === 'edge')
    return (
      request.executionClass === 'trusted-service' ||
      request.executionClass === 'isolated-runner'
    );
  return false;
};

/** Creates the transport-neutral resolution boundary; implementations own stores and authorization. */
export const createExecutionEnvironmentResolutionService = (input: {
  snapshots: ExecutionEnvironmentSnapshotPort;
  permissions: ExecutionEnvironmentPermissionPort;
  secrets: ExecutionSecretMaterialPort;
  now?: () => number;
  maxLeaseDurationMs?: number;
  publishAudit?(event: ExecutionEnvironmentResolutionAuditEvent): void;
}): ExecutionEnvironmentResolutionService => {
  const maxLeaseDurationMs = finiteTimestamp(
    input.maxLeaseDurationMs ?? MAX_ENVIRONMENT_LEASE_DURATION_MS,
    'Environment maximum lease duration'
  );
  if (maxLeaseDurationMs < 1)
    throw new TypeError('Environment maximum lease duration must be positive.');
  const now = input.now ?? Date.now;
  return Object.freeze({
    async resolve(rawRequest) {
      const request = normalizeRequest(rawRequest);
      const loaded = await input.snapshots.load(
        request.environment.environmentId
      );
      if (!loaded)
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.snapshotMissing
        );
      const snapshot = normalizeSnapshot(loaded);
      if (snapshot.revision !== request.environment.revision)
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.revisionMismatch
        );
      if (snapshot.mode !== request.environment.mode)
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.modeMismatch
        );
      for (const binding of request.bindings) {
        const isPublic = Object.prototype.hasOwnProperty.call(
          snapshot.publicBindingsById,
          binding.bindingId
        );
        const isSecret = snapshot.secretBindingIds.includes(binding.bindingId);
        if (!isPublic && !isSecret)
          throw new ExecutionEnvironmentResolutionError(
            EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.bindingMissing
          );
        if (
          (binding.kind === 'public' && !isPublic) ||
          (binding.kind === 'secret' && !isSecret)
        )
          throw new ExecutionEnvironmentResolutionError(
            EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.bindingKindMismatch
          );
      }
      if (
        request.bindings.some((binding) => binding.kind === 'secret') &&
        !canResolveExecutionSecret(request)
      )
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.secretZoneDenied
        );
      const decision = await input.permissions.authorize(request);
      if (!decision.allowed)
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.permissionDenied
        );
      const issuedAt = finiteTimestamp(now(), 'Environment lease issuedAt');
      const permissionExpiresAt = finiteTimestamp(
        decision.expiresAt,
        'Environment permission expiresAt'
      );
      const expiresAt = Math.min(
        permissionExpiresAt,
        issuedAt + maxLeaseDurationMs
      );
      if (expiresAt <= issuedAt)
        throw new ExecutionEnvironmentResolutionError(
          EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.leaseExpired
        );
      const grantId = canonical(decision.grantId, 'Environment grantId');
      const permissionRevision = canonical(
        decision.permissionRevision,
        'Environment permission revision'
      );
      const metadata = Object.freeze({
        leaseId: request.leaseId,
        principal: request.principal,
        environment: request.environment,
        grantId,
        permissionRevision,
        expiresAt,
      });
      let revoked = false;
      const active = (): boolean => !revoked && now() < expiresAt;
      const requireActive = (): void => {
        if (revoked)
          throw new ExecutionEnvironmentResolutionError(
            EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.leaseRevoked
          );
        if (now() >= expiresAt)
          throw new ExecutionEnvironmentResolutionError(
            EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.leaseExpired
          );
      };
      const audit = (
        kind: ExecutionEnvironmentResolutionAuditEvent['kind'],
        binding?: ExecutionEnvironmentBindingRequest
      ): void =>
        input.publishAudit?.(
          Object.freeze({
            kind,
            occurredAt: finiteTimestamp(now(), 'Environment audit occurredAt'),
            leaseId: request.leaseId,
            workspaceId: request.workspaceId,
            principalId: request.principal.principalId,
            sessionId: request.principal.sessionId,
            providerId: request.providerId,
            environmentId: request.environment.environmentId,
            environmentRevision: request.environment.revision,
            permissionRevision,
            purposeKind: request.purpose.kind,
            resourceId: request.purpose.resourceId,
            ...(binding
              ? { bindingId: binding.bindingId, field: binding.field }
              : {}),
          })
        );
      const requestedBinding = (
        bindingId: string,
        kind: ExecutionEnvironmentBindingRequest['kind'],
        field: string
      ): ExecutionEnvironmentBindingRequest => {
        const normalizedField = canonical(field, 'Environment binding field');
        const binding = request.bindings.find(
          (candidate) =>
            candidate.bindingId === bindingId &&
            candidate.kind === kind &&
            candidate.field === normalizedField
        );
        if (!binding)
          throw new ExecutionEnvironmentResolutionError(
            EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.bindingMissing
          );
        return binding;
      };
      const lease: ExecutionEnvironmentResolutionLease = Object.freeze({
        metadata,
        isActive: active,
        readPublicBinding(reference, field) {
          requireActive();
          const normalizedReference =
            createEnvironmentBindingReference(reference);
          const binding = requestedBinding(
            normalizedReference.bindingId,
            'public',
            field
          );
          const value = snapshot.publicBindingsById[binding.bindingId];
          if (value === undefined)
            throw new ExecutionEnvironmentResolutionError(
              EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.bindingMissing
            );
          audit('public-binding-read', binding);
          return cloneExecutionValue(value);
        },
        async useSecret(reference, field, consumer) {
          requireActive();
          if (typeof consumer !== 'function')
            throw new TypeError(
              'Environment Secret consumer must be a function.'
            );
          const normalizedReference = createSecretRef(reference);
          const binding = requestedBinding(
            normalizedReference.bindingId,
            'secret',
            field
          );
          const material = await input.secrets.read({
            request,
            bindingId: binding.bindingId,
            grantId,
          });
          requireActive();
          if (typeof material !== 'string' || !material)
            throw new ExecutionEnvironmentResolutionError(
              EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.secretUnavailable
            );
          await consumer(material);
          requireActive();
          audit('secret-binding-used', binding);
        },
        revoke() {
          if (revoked) return;
          revoked = true;
          audit('lease-revoked');
        },
      });
      audit('lease-issued');
      return lease;
    },
  });
};
