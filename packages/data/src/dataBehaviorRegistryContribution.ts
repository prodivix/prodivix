import {
  BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  type BehaviorRegistryContribution,
  type BehaviorRegistryDescriptor,
} from '@prodivix/behavior';

const descriptor = (
  kind: string,
  targetCapability: string,
  effect: BehaviorRegistryDescriptor['effect']
): BehaviorRegistryDescriptor =>
  Object.freeze({
    kind,
    owner: 'data',
    inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    targetCapability,
    runtimeZones: Object.freeze(['client', 'server', 'test'] as const),
    effect,
    cancellation: 'cooperative',
    determinism: 'controlled',
    sourceTraceResolverId: 'data.operation-source',
    redactionPolicyId: 'data.operation-redaction',
  });

export const DATA_BEHAVIOR_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.data',
    triggers: Object.freeze([
      descriptor('data.lifecycle', 'behavior:data:lifecycle', 'read'),
    ]),
    actions: Object.freeze([
      descriptor('data.dispatch', 'behavior:data:dispatch', 'write'),
    ]),
    observations: Object.freeze([
      descriptor('data.data-lifecycle', 'behavior:data:lifecycle', 'read'),
    ]),
  });
