import {
  compareVerificationText,
  digestVerificationValue,
  serializeVerificationValue,
  uniqueVerificationText,
} from './verificationCanonical';
import type {
  CreateVerificationImpactSetInput,
  VerificationImpactCompleteness,
  VerificationImpactPath,
  VerificationImpactReason,
  VerificationImpactSet,
  VerificationImpactSetResult,
  VerificationPartitionRevisions,
} from './verification.types';
import type { SourceSpan } from '@prodivix/diagnostics';

const completenessRank: Readonly<
  Record<VerificationImpactCompleteness, number>
> = Object.freeze({
  complete: 0,
  conservative: 1,
  unknown: 2,
});

const worstCompleteness = (
  values: readonly VerificationImpactCompleteness[]
): VerificationImpactCompleteness =>
  values.reduce<VerificationImpactCompleteness>(
    (worst, value) =>
      completenessRank[value] > completenessRank[worst] ? value : worst,
    'complete'
  );

const compareImpactPath = (
  left: VerificationImpactPath,
  right: VerificationImpactPath
): number =>
  compareVerificationText(left.id, right.id) ||
  compareVerificationText(left.contributorId, right.contributorId) ||
  compareVerificationText(left.fromId, right.fromId) ||
  compareVerificationText(left.toId, right.toId);

const compareImpactReason = (
  left: VerificationImpactReason,
  right: VerificationImpactReason
): number =>
  compareVerificationText(left.id, right.id) ||
  compareVerificationText(left.contributorId, right.contributorId) ||
  compareVerificationText(left.kind, right.kind) ||
  compareVerificationText(left.sourceId ?? '', right.sourceId ?? '') ||
  compareVerificationText(left.targetId ?? '', right.targetId ?? '');

const uniqueById = <T extends Readonly<{ id: string }>>(
  values: readonly T[],
  compare: (left: T, right: T) => number
): readonly T[] => {
  const byId = new Map<string, T>();
  for (const value of [...values].sort(compare)) {
    if (!byId.has(value.id)) byId.set(value.id, value);
  }
  return Object.freeze([...byId.values()]);
};

const conflictingDuplicateId = <T extends Readonly<{ id: string }>>(
  values: readonly T[]
): string | undefined => {
  const canonicalById = new Map<string, string>();
  for (const value of values) {
    const canonical = serializeVerificationValue(value);
    const previous = canonicalById.get(value.id);
    if (previous !== undefined && previous !== canonical) return value.id;
    canonicalById.set(value.id, canonical);
  }
  return undefined;
};

const partitionIsValid = (
  value: VerificationPartitionRevisions,
  workspaceRevision: number
): boolean =>
  value.workspaceRev === workspaceRevision &&
  [value.workspaceRev, value.routeRev, value.opSeq].every(
    (revision) => Number.isSafeInteger(revision) && revision >= 0
  ) &&
  Object.values(value.documentRevisions).every(
    ({ contentRev, metaRev }) =>
      Number.isSafeInteger(contentRev) &&
      contentRev >= 0 &&
      Number.isSafeInteger(metaRev) &&
      metaRev >= 0
  );

const partitionAscends = (
  before: VerificationPartitionRevisions,
  after: VerificationPartitionRevisions
): boolean =>
  before.workspaceRev <= after.workspaceRev &&
  before.routeRev <= after.routeRev &&
  before.opSeq <= after.opSeq &&
  Object.entries(before.documentRevisions).every(([documentId, revision]) => {
    const target = after.documentRevisions[documentId];
    return (
      target === undefined ||
      (revision.contentRev <= target.contentRev &&
        revision.metaRev <= target.metaRev)
    );
  });

const compareSourceSpan = (left: SourceSpan, right: SourceSpan): number =>
  compareVerificationText(left.artifactId, right.artifactId) ||
  left.startLine - right.startLine ||
  left.startColumn - right.startColumn ||
  left.endLine - right.endLine ||
  left.endColumn - right.endColumn;

const uniqueSourceSpans = (
  values: readonly SourceSpan[]
): readonly SourceSpan[] =>
  Object.freeze([
    ...new Map(
      [...values]
        .sort(compareSourceSpan)
        .map((span) => [serializeVerificationValue(span), span])
    ).values(),
  ]);

const invalidIdentity = (
  input: CreateVerificationImpactSetInput
): string | null => {
  if (!input.workspaceId.trim()) return 'workspaceId must be non-empty.';
  if (!Number.isSafeInteger(input.targetRevision) || input.targetRevision < 0) {
    return 'targetRevision must be a non-negative safe integer.';
  }
  if (
    input.baseRevision !== undefined &&
    (!Number.isSafeInteger(input.baseRevision) ||
      input.baseRevision < 0 ||
      input.baseRevision > input.targetRevision)
  ) {
    return 'baseRevision must be a non-negative safe integer no newer than targetRevision.';
  }
  if (!partitionIsValid(input.targetPartitionRevisions, input.targetRevision)) {
    return 'targetPartitionRevisions must be valid and match targetRevision.';
  }
  if (
    input.baseRevision === undefined
      ? input.basePartitionRevisions !== undefined
      : input.basePartitionRevisions === undefined ||
        !partitionIsValid(input.basePartitionRevisions, input.baseRevision) ||
        !partitionAscends(
          input.basePartitionRevisions,
          input.targetPartitionRevisions
        )
  ) {
    return 'basePartitionRevisions must match baseRevision and form an ascending revision vector.';
  }
  if (!input.semanticSchemaDigest.trim() || !input.providerSetDigest.trim()) {
    return 'semanticSchemaDigest and providerSetDigest must be non-empty.';
  }
  if (input.contributions.length === 0) {
    return 'At least one semantic impact contribution is required.';
  }
  if (input.operationIds.some((id) => !id.trim())) {
    return 'Impact operation ids must be non-empty.';
  }
  const contributorIds = input.contributions.map(
    (contribution) => contribution.contributorId
  );
  if (
    contributorIds.some((id) => !id.trim()) ||
    new Set(contributorIds).size !== contributorIds.length
  ) {
    return 'Impact contributor ids must be non-empty and unique.';
  }
  const paths = input.contributions.flatMap((contribution) => [
    ...(contribution.impactPaths ?? []),
  ]);
  const reasons = input.contributions.flatMap((contribution) => [
    ...(contribution.reasons ?? []),
  ]);
  const conflictingPathId = conflictingDuplicateId(paths);
  const conflictingReasonId = conflictingDuplicateId(reasons);
  if (conflictingPathId || conflictingReasonId) {
    return `Impact contributions contain conflicting duplicate id "${
      conflictingPathId ?? conflictingReasonId
    }".`;
  }
  return null;
};

/**
 * Merges domain-neutral impact contributions and applies the fail-closed
 * conservative scope expansion before hashing the projection.
 */
export const createVerificationImpactSet = (
  input: CreateVerificationImpactSetInput
): VerificationImpactSetResult => {
  const invalid = invalidIdentity(input);
  if (invalid) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message: invalid,
    });
  }

  const completeness = worstCompleteness([
    ...(input.baseRevision === undefined ? (['conservative'] as const) : []),
    ...input.contributions.map((contribution) => contribution.completeness),
  ]);
  const broaden = completeness !== 'complete';
  const conservativeScope = input.conservativeScope;
  if (
    broaden &&
    (!conservativeScope ||
      [
        conservativeScope.scenarioIds,
        conservativeScope.domains,
        conservativeScope.frameworkTargets,
        conservativeScope.runtimeZones,
        conservativeScope.capabilityIds,
        conservativeScope.riskFlags,
      ].every((values) => values.length === 0))
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message:
        'Incomplete semantic impact requires an explicit conservative scope.',
    });
  }

  const collect = (
    select: (
      contribution: CreateVerificationImpactSetInput['contributions'][number]
    ) => readonly string[] | undefined,
    fallback: readonly string[] = []
  ): readonly string[] =>
    uniqueVerificationText([
      ...input.contributions.flatMap(
        (contribution) => select(contribution) ?? []
      ),
      ...(broaden ? fallback : []),
    ]);

  const reasons: VerificationImpactReason[] = input.contributions.flatMap(
    (contribution) => [...(contribution.reasons ?? [])]
  );
  if (input.baseRevision === undefined) {
    reasons.push({
      id: 'impact:missing-before',
      kind: 'missing-before',
      message:
        'The before revision is unavailable; verification scope was conservatively expanded.',
      contributorId: 'core.semantic-diff',
    });
  }
  if (broaden) {
    reasons.push({
      id: 'impact:conservative-expansion',
      kind: 'conservative-expansion',
      message:
        'At least one impact input is incomplete; project-level conservative scope is included.',
      contributorId: 'core.impact-merger',
    });
  }
  const conflictingReasonId = conflictingDuplicateId(reasons);
  if (conflictingReasonId) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message: `Impact reasons contain conflicting duplicate id "${conflictingReasonId}".`,
    });
  }

  const impactWithoutDigest = Object.freeze({
    workspaceId: input.workspaceId,
    ...(input.baseRevision === undefined
      ? {}
      : {
          baseRevision: input.baseRevision,
          basePartitionRevisions: input.basePartitionRevisions!,
        }),
    targetRevision: input.targetRevision,
    targetPartitionRevisions: input.targetPartitionRevisions,
    semanticSchemaDigest: input.semanticSchemaDigest,
    providerSetDigest: input.providerSetDigest,
    operationIds: uniqueVerificationText(input.operationIds),
    contributorIds: uniqueVerificationText(
      input.contributions.map((contribution) => contribution.contributorId)
    ),
    changedDocumentIds: collect(
      (contribution) => contribution.changedDocumentIds
    ),
    changedSymbolIds: collect((contribution) => contribution.changedSymbolIds),
    changedSourceSpans: uniqueSourceSpans(
      input.contributions.flatMap((contribution) => [
        ...(contribution.changedSourceSpans ?? []),
      ])
    ),
    impactedSymbolIds: collect(
      (contribution) => contribution.impactedSymbolIds
    ),
    impactedScenarioIds: collect(
      (contribution) => contribution.impactedScenarioIds,
      conservativeScope?.scenarioIds
    ),
    impactedDomains: collect(
      (contribution) => contribution.impactedDomains,
      conservativeScope?.domains
    ),
    frameworkTargets: collect(
      (contribution) => contribution.frameworkTargets,
      conservativeScope?.frameworkTargets
    ),
    runtimeZones: collect(
      (contribution) => contribution.runtimeZones,
      conservativeScope?.runtimeZones
    ),
    capabilityIds: collect(
      (contribution) => contribution.capabilityIds,
      conservativeScope?.capabilityIds
    ),
    riskFlags: collect(
      (contribution) => contribution.riskFlags,
      conservativeScope?.riskFlags
    ),
    impactPaths: uniqueById(
      input.contributions.flatMap((contribution) => [
        ...(contribution.impactPaths ?? []),
      ]),
      compareImpactPath
    ),
    completeness,
    reasons: uniqueById(reasons, compareImpactReason),
  });

  const impactSet: VerificationImpactSet = Object.freeze({
    ...impactWithoutDigest,
    impactDigest: digestVerificationValue(impactWithoutDigest),
  });
  return Object.freeze({ status: 'ready', impactSet });
};
