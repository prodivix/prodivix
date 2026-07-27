import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestBehaviorValue } from './behaviorCanonical';
import type {
  BehaviorRegistryContribution,
  BehaviorRegistryDescriptor,
} from './behavior.types';

export type BehaviorRegistryCategory = 'trigger' | 'action' | 'observation';

export type BehaviorRegisteredDescriptor = Readonly<{
  category: BehaviorRegistryCategory;
  contributorId: string;
  descriptor: BehaviorRegistryDescriptor;
}>;

export type BehaviorRegistry = Readonly<{
  digest: string;
  contributions: readonly BehaviorRegistryContribution[];
  descriptors: readonly BehaviorRegisteredDescriptor[];
  get(
    category: BehaviorRegistryCategory,
    kind: string
  ): BehaviorRegisteredDescriptor | null;
  findByTargetCapability(
    category: BehaviorRegistryCategory,
    capability: string
  ): readonly BehaviorRegisteredDescriptor[];
}>;

export type BehaviorRegistryIssue = Readonly<{
  code: 'duplicate-contributor' | 'duplicate-descriptor' | 'invalid-descriptor';
  path: string;
  message: string;
}>;

export type CreateBehaviorRegistryResult =
  | Readonly<{ ok: true; registry: BehaviorRegistry }>
  | Readonly<{ ok: false; issues: readonly BehaviorRegistryIssue[] }>;

const compareDescriptors = (
  left: BehaviorRegisteredDescriptor,
  right: BehaviorRegisteredDescriptor
): number =>
  compareUnicodeCodePoints(left.category, right.category) ||
  compareUnicodeCodePoints(left.descriptor.kind, right.descriptor.kind) ||
  compareUnicodeCodePoints(left.contributorId, right.contributorId);

const freezeContribution = (
  contribution: BehaviorRegistryContribution
): BehaviorRegistryContribution =>
  Object.freeze({
    contributorId: contribution.contributorId,
    triggers: Object.freeze(
      [...contribution.triggers].sort((left, right) =>
        compareUnicodeCodePoints(left.kind, right.kind)
      )
    ),
    actions: Object.freeze(
      [...contribution.actions].sort((left, right) =>
        compareUnicodeCodePoints(left.kind, right.kind)
      )
    ),
    observations: Object.freeze(
      [...contribution.observations].sort((left, right) =>
        compareUnicodeCodePoints(left.kind, right.kind)
      )
    ),
  });

const descriptorEntries = (
  contribution: BehaviorRegistryContribution
): BehaviorRegisteredDescriptor[] => [
  ...contribution.triggers.map((descriptor) => ({
    category: 'trigger' as const,
    contributorId: contribution.contributorId,
    descriptor,
  })),
  ...contribution.actions.map((descriptor) => ({
    category: 'action' as const,
    contributorId: contribution.contributorId,
    descriptor,
  })),
  ...contribution.observations.map((descriptor) => ({
    category: 'observation' as const,
    contributorId: contribution.contributorId,
    descriptor,
  })),
];

const validateDescriptor = (
  entry: BehaviorRegisteredDescriptor,
  index: number
): BehaviorRegistryIssue[] => {
  const path = `/descriptors/${index}`;
  const descriptor = entry.descriptor;
  const issues: BehaviorRegistryIssue[] = [];
  if (
    !descriptor.kind.trim() ||
    !descriptor.owner.trim() ||
    !descriptor.targetCapability.trim()
  ) {
    issues.push({
      code: 'invalid-descriptor',
      path,
      message:
        'Behavior descriptors require kind, owner, and target capability.',
    });
  }
  if (!descriptor.runtimeZones.length) {
    issues.push({
      code: 'invalid-descriptor',
      path: `${path}/runtimeZones`,
      message: 'Behavior descriptors require at least one runtime zone.',
    });
  }
  return issues;
};

/**
 * Composes domain-owned contributions into one deterministic registry. The
 * registry owns no domain execution and rejects ambiguous descriptor kinds.
 */
export const createBehaviorRegistry = (
  contributions: readonly BehaviorRegistryContribution[]
): CreateBehaviorRegistryResult => {
  const normalized = [...contributions]
    .map(freezeContribution)
    .sort((left, right) =>
      compareUnicodeCodePoints(left.contributorId, right.contributorId)
    );
  const issues: BehaviorRegistryIssue[] = [];
  const contributorIds = new Set<string>();
  normalized.forEach((contribution, index) => {
    if (contributorIds.has(contribution.contributorId)) {
      issues.push({
        code: 'duplicate-contributor',
        path: `/contributions/${index}/contributorId`,
        message: `Duplicate Behavior contributor: ${contribution.contributorId}.`,
      });
    }
    contributorIds.add(contribution.contributorId);
  });

  const descriptors = normalized
    .flatMap(descriptorEntries)
    .sort(compareDescriptors);
  const descriptorKeys = new Set<string>();
  descriptors.forEach((entry, index) => {
    issues.push(...validateDescriptor(entry, index));
    const key = `${entry.category}:${entry.descriptor.kind}`;
    if (descriptorKeys.has(key)) {
      issues.push({
        code: 'duplicate-descriptor',
        path: `/descriptors/${index}/kind`,
        message: `Duplicate Behavior ${entry.category} descriptor: ${entry.descriptor.kind}.`,
      });
    }
    descriptorKeys.add(key);
  });
  if (issues.length) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }

  const descriptorMap = new Map(
    descriptors.map((entry) => [
      `${entry.category}:${entry.descriptor.kind}`,
      Object.freeze(entry),
    ])
  );
  const frozenDescriptors = Object.freeze(
    descriptors.map((entry) => Object.freeze(entry))
  );
  const frozenContributions = Object.freeze(normalized);
  const registry: BehaviorRegistry = Object.freeze({
    digest: digestBehaviorValue(frozenContributions),
    contributions: frozenContributions,
    descriptors: frozenDescriptors,
    get(category, kind) {
      return descriptorMap.get(`${category}:${kind}`) ?? null;
    },
    findByTargetCapability(category, capability) {
      return Object.freeze(
        frozenDescriptors.filter(
          (entry) =>
            entry.category === category &&
            entry.descriptor.targetCapability === capability
        )
      );
    },
  });
  return Object.freeze({ ok: true, registry });
};

export const BEHAVIOR_EMPTY_SCHEMA_DIGEST =
  'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Core contributes only Scenario orchestration; domain kinds stay external. */
export const BEHAVIOR_CORE_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.behavior',
    triggers: Object.freeze([
      Object.freeze({
        kind: 'scenario.manual',
        owner: 'behavior',
        inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
        outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
        targetCapability: 'behavior:scenario:manual',
        runtimeZones: Object.freeze(['client', 'test'] as const),
        effect: 'none',
        cancellation: 'none',
        determinism: 'deterministic',
        sourceTraceResolverId: 'behavior.scenario-source',
        redactionPolicyId: 'behavior.no-input',
      }),
    ]),
    actions: Object.freeze([]),
    observations: Object.freeze([]),
  });
