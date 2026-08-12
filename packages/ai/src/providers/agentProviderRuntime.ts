import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { AgentJsonValue, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { scanAgentArtifactForSecretCanaries } from '../security/agentSecurity';
import { createAgentProviderEvent } from './agentInvocation';
import type { AgentProviderEvent } from './agentProvider.types';
import type { AgentProviderAdapterInvocationRequest } from './agentProviderAdapter';

export const AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_BYTES = 2_097_152;
export const AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_DEPTH = 48;
export const AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_NODES = 100_000;

export type AgentProviderRuntimePayloadPolicy = Readonly<{
  maximumBytes?: number;
  secretCanaries?: readonly string[];
}>;

/**
 * Runtime-only payload paired with the exact digest-only fact that may cross a
 * durable boundary. Provider payload bodies intentionally have no wire codec.
 */
export type AgentProviderRuntimeEvent = Readonly<{
  durableEvent: AgentProviderEvent;
  payload: AgentJsonValue;
}>;

export type AgentProviderRuntimeEventInput = Readonly<{
  eventId: string;
  invocationId: string;
  sequence: number;
  type: AgentProviderEvent['type'];
  payload: unknown;
  occurredAt: string;
}>;

export type AgentProviderInvocationMaterialLease<TMaterial> = Readonly<{
  leaseId: string;
  invocationId: string;
  requestDigest: CanonicalDigest;
  value: TMaterial;
  secretCanaries?: readonly string[];
  release: () => void | Promise<void>;
}>;

export type AgentProviderInvocationMaterialLoader<TMaterial> = (
  request: AgentProviderAdapterInvocationRequest
) =>
  | AgentProviderInvocationMaterialLease<TMaterial>
  | Promise<AgentProviderInvocationMaterialLease<TMaterial>>;

const providerEventTypes = new Set<AgentProviderEvent['type']>([
  'output-delta',
  'tool-call',
  'usage',
  'refusal',
  'safety-block',
  'truncation',
  'cancelled',
  'timed-out',
  'partial',
  'completed',
  'failed',
]);

const assertExactDataRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${label} must be a plain data object.`);
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.getOwnPropertyNames(value);
  if (
    requiredKeys.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => isUnsafeObjectKey(key) || !allowed.has(key)) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor?.enumerable || !('value' in descriptor);
    })
  ) {
    throw new TypeError(`${label} has an invalid data shape.`);
  }
  return value;
};

const assertSafeRuntimeJson = (value: unknown, maximumBytes: number): void => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new TypeError('Provider runtime payload byte limit is invalid.');
  }
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (
      nodes > AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_NODES ||
      depth > AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_DEPTH
    ) {
      throw new TypeError(
        'Provider runtime payload exceeds its safe envelope.'
      );
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        throw new TypeError('Provider runtime payload numbers must be finite.');
      }
      return;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      throw new TypeError('Provider runtime payload must be acyclic JSON.');
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        if (
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index)) ||
          Object.getOwnPropertySymbols(candidate).length > 0 ||
          keys.some((key) => {
            const descriptor = descriptors[key];
            return !descriptor?.enumerable || !('value' in descriptor);
          })
        ) {
          throw new TypeError(
            'Provider runtime payload arrays must be dense data arrays.'
          );
        }
        for (const key of keys) {
          visit(descriptors[key]!.value, depth + 1);
        }
        return;
      }
      if (!isPlainObject(candidate)) {
        throw new TypeError('Provider runtime payload must use plain objects.');
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        throw new TypeError('Provider runtime payload keys must be strings.');
      }
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const descriptor = descriptors[key];
        if (
          isUnsafeObjectKey(key) ||
          !descriptor?.enumerable ||
          !('value' in descriptor)
        ) {
          throw new TypeError('Provider runtime payload contains unsafe data.');
        }
        visit(descriptor.value, depth + 1);
      }
    } finally {
      ancestors.delete(candidate);
    }
  };

  visit(value, 0);
  if (
    new TextEncoder().encode(canonicalJsonText(value)).byteLength > maximumBytes
  ) {
    throw new TypeError('Provider runtime payload exceeds its byte limit.');
  }
};

const cloneAndFreezeRuntimeJson = (value: AgentJsonValue): AgentJsonValue => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreezeRuntimeJson));
  }
  if (isPlainObject(value)) {
    const result: Record<string, AgentJsonValue> = Object.create(
      null
    ) as Record<string, AgentJsonValue>;
    for (const key of Object.keys(value).sort(compareUnicodeCodePoints)) {
      if (isUnsafeObjectKey(key)) {
        throw new TypeError('Provider runtime payload contains an unsafe key.');
      }
      result[key] = cloneAndFreezeRuntimeJson(value[key] as AgentJsonValue);
    }
    return Object.freeze(result);
  }
  return value;
};

export const normalizeAgentProviderRuntimePayload = (
  value: unknown,
  policy: AgentProviderRuntimePayloadPolicy = {}
): AgentJsonValue => {
  assertSafeRuntimeJson(
    value,
    policy.maximumBytes ?? AGENT_PROVIDER_RUNTIME_MAXIMUM_PAYLOAD_BYTES
  );
  if (
    policy.secretCanaries &&
    policy.secretCanaries.length > 0 &&
    scanAgentArtifactForSecretCanaries(value, policy.secretCanaries).length > 0
  ) {
    throw new Error('Provider runtime payload failed the no-leak invariant.');
  }
  return cloneAndFreezeRuntimeJson(value as AgentJsonValue);
};

export const createAgentProviderRuntimeEvent = (
  input: AgentProviderRuntimeEventInput,
  policy: AgentProviderRuntimePayloadPolicy = {}
): AgentProviderRuntimeEvent => {
  const record = assertExactDataRecord(
    input,
    ['eventId', 'invocationId', 'sequence', 'type', 'payload', 'occurredAt'],
    [],
    'Provider runtime event input'
  );
  if (
    typeof record.eventId !== 'string' ||
    typeof record.invocationId !== 'string' ||
    !record.invocationId.trim() ||
    !Number.isSafeInteger(record.sequence) ||
    Number(record.sequence) < 0 ||
    !providerEventTypes.has(record.type as AgentProviderEvent['type']) ||
    typeof record.occurredAt !== 'string' ||
    !isAgentControlInstant(record.occurredAt)
  ) {
    throw new TypeError('Provider runtime event identity is invalid.');
  }
  const payload = normalizeAgentProviderRuntimePayload(record.payload, policy);
  const durableEvent = createAgentProviderEvent({
    eventId: record.eventId,
    invocationId: record.invocationId,
    sequence: record.sequence as number,
    type: record.type as AgentProviderEvent['type'],
    payloadDigest: digestAgentCanonicalValue(payload),
    occurredAt: record.occurredAt,
  });
  return Object.freeze({ durableEvent, payload });
};

/** Validates both payloadDigest and eventDigest before returning a safe clone. */
export const validateAgentProviderRuntimeEventBinding = (
  value: unknown,
  policy: AgentProviderRuntimePayloadPolicy = {}
): AgentProviderRuntimeEvent => {
  const binding = assertExactDataRecord(
    value,
    ['durableEvent', 'payload'],
    [],
    'Provider runtime event binding'
  );
  const event = assertExactDataRecord(
    binding.durableEvent,
    [
      'eventId',
      'invocationId',
      'sequence',
      'type',
      'payloadDigest',
      'occurredAt',
      'eventDigest',
    ],
    [],
    'Durable provider event'
  );
  const payload = normalizeAgentProviderRuntimePayload(binding.payload, policy);
  const payloadDigest = digestAgentCanonicalValue(payload);
  if (
    !isAgentCanonicalDigest(event.payloadDigest) ||
    event.payloadDigest !== payloadDigest
  ) {
    throw new Error('Provider runtime event payload digest mismatch.');
  }
  const expected = createAgentProviderRuntimeEvent(
    {
      eventId: event.eventId as string,
      invocationId: event.invocationId as string,
      sequence: event.sequence as number,
      type: event.type as AgentProviderEvent['type'],
      payload,
      occurredAt: event.occurredAt as string,
    },
    policy
  );
  if (!sameCanonicalJson(expected.durableEvent, binding.durableEvent)) {
    throw new Error('Provider runtime event durable digest mismatch.');
  }
  return expected;
};

const normalizeInvocationRequest = (
  value: AgentProviderAdapterInvocationRequest
): AgentProviderAdapterInvocationRequest => {
  const record = assertExactDataRecord(
    value,
    [
      'invocationId',
      'requestDigest',
      'providerConfigurationId',
      'modelLineageDigest',
      'capabilityProfileDigest',
      'inferenceConfigurationDigest',
      'contextPackDigest',
    ],
    ['multimodalContextManifestDigest', 'providerMediaBlockManifestDigest'],
    'Provider invocation material request'
  );
  const requiredDigests = [
    record.requestDigest,
    record.modelLineageDigest,
    record.capabilityProfileDigest,
    record.inferenceConfigurationDigest,
    record.contextPackDigest,
  ];
  const optionalDigests = [
    record.multimodalContextManifestDigest,
    record.providerMediaBlockManifestDigest,
  ].filter((entry) => entry !== undefined);
  if (
    !isAgentControlIdentity(record.invocationId) ||
    !isAgentControlIdentity(record.providerConfigurationId) ||
    [...requiredDigests, ...optionalDigests].some(
      (entry) => !isAgentCanonicalDigest(entry)
    )
  ) {
    throw new TypeError('Provider invocation material request is invalid.');
  }
  return Object.freeze({
    invocationId: record.invocationId,
    requestDigest: record.requestDigest as CanonicalDigest,
    providerConfigurationId: record.providerConfigurationId,
    modelLineageDigest: record.modelLineageDigest as CanonicalDigest,
    capabilityProfileDigest: record.capabilityProfileDigest as CanonicalDigest,
    inferenceConfigurationDigest:
      record.inferenceConfigurationDigest as CanonicalDigest,
    contextPackDigest: record.contextPackDigest as CanonicalDigest,
    ...(record.multimodalContextManifestDigest === undefined
      ? {}
      : {
          multimodalContextManifestDigest:
            record.multimodalContextManifestDigest as CanonicalDigest,
        }),
    ...(record.providerMediaBlockManifestDigest === undefined
      ? {}
      : {
          providerMediaBlockManifestDigest:
            record.providerMediaBlockManifestDigest as CanonicalDigest,
        }),
  });
};

/**
 * Resolves plaintext invocation material only for one callback, fences replay,
 * releases the lease on every exit, and blocks registered Secret canaries from
 * escaping through the callback result.
 */
export class CallbackBoundAgentProviderInvocationMaterialResolver<TMaterial> {
  readonly #usedLeaseIds = new Set<string>();

  constructor(
    private readonly loader: AgentProviderInvocationMaterialLoader<TMaterial>
  ) {}

  async use<TResult>(input: {
    request: AgentProviderAdapterInvocationRequest;
    callback: (material: TMaterial) => TResult | Promise<TResult>;
  }): Promise<TResult> {
    const request = normalizeInvocationRequest(input.request);
    const rawLease = await this.loader(request);
    const releaseDescriptor = isPlainObject(rawLease)
      ? Object.getOwnPropertyDescriptor(rawLease, 'release')
      : undefined;
    const release =
      releaseDescriptor && 'value' in releaseDescriptor
        ? releaseDescriptor.value
        : undefined;
    try {
      const lease = assertExactDataRecord(
        rawLease,
        ['leaseId', 'invocationId', 'requestDigest', 'value', 'release'],
        ['secretCanaries'],
        'Provider invocation material lease'
      );
      if (
        !isAgentControlIdentity(lease.leaseId) ||
        lease.invocationId !== request.invocationId ||
        lease.requestDigest !== request.requestDigest ||
        typeof lease.release !== 'function' ||
        this.#usedLeaseIds.has(lease.leaseId)
      ) {
        throw new Error(
          'Provider invocation material lease is mismatched or replayed.'
        );
      }
      const canaries = lease.secretCanaries;
      if (
        canaries !== undefined &&
        (!Array.isArray(canaries) ||
          canaries.some((entry) => typeof entry !== 'string'))
      ) {
        throw new TypeError(
          'Provider invocation material canaries are invalid.'
        );
      }
      if (canaries && canaries.length > 0) {
        scanAgentArtifactForSecretCanaries(null, canaries);
      }
      this.#usedLeaseIds.add(lease.leaseId);
      const result = await input.callback(lease.value as TMaterial);
      if (
        canaries &&
        canaries.length > 0 &&
        scanAgentArtifactForSecretCanaries(result, canaries).length > 0
      ) {
        throw new Error(
          'Provider invocation material callback failed the no-leak invariant.'
        );
      }
      return result;
    } finally {
      if (typeof release === 'function') await release.call(rawLease);
    }
  }
}
