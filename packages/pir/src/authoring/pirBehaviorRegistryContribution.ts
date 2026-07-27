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
    owner: 'pir',
    inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    targetCapability,
    runtimeZones: Object.freeze(['client', 'test'] as const),
    effect,
    cancellation: 'none',
    determinism: 'controlled',
    sourceTraceResolverId: 'pir.node-source',
    redactionPolicyId:
      kind === 'pir.input' ? 'pir.secret-input' : 'pir.public-ui',
  });

export const PIR_BEHAVIOR_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.pir',
    triggers: Object.freeze([
      descriptor('pir.mounted', 'behavior:pir:lifecycle', 'read'),
      descriptor('pir.event', 'behavior:pir:event', 'read'),
    ]),
    actions: Object.freeze([
      descriptor('pir.click', 'behavior:pir:click', 'none'),
      descriptor('pir.input', 'behavior:pir:input', 'write'),
    ]),
    observations: Object.freeze([
      descriptor('pir.visible', 'behavior:pir:visible', 'read'),
      descriptor('pir.value', 'behavior:pir:value', 'read'),
    ]),
  });
