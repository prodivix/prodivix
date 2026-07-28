import {
  compareVerificationText,
  digestVerificationValue,
  evaluateVerificationClosure,
  hasSameVerificationEvidenceSupersessionLineage,
  isVerificationArtifactJsonMediaType,
  uniqueVerificationText,
} from '@prodivix/verification';
import type {
  VerificationCellStatus,
  VerificationClosure,
  VerificationPlan,
} from '@prodivix/verification';
import type { ExecutionSourceTrace } from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceExecutionSnapshotId } from '@/editor/features/execution/workspaceExecutionIdentity';
import type {
  VerificationEvidenceArtifactDescriptor,
  VerificationEvidencePartitionRevisions,
  VerificationEvidenceTransportRecord,
  VerificationEvidenceVerifiedView,
  VerificationEvidenceVerifiedViewRecord,
} from './verificationEvidenceCodec';

export type VerificationEvidenceProjection = Readonly<{
  workspaceId: string;
  workspaceRevision: number;
  partitionRevisions: VerificationEvidencePartitionRevisions;
  planDigest: string;
  records: readonly VerificationEvidenceTransportRecord[];
  verifiedEvidenceView: VerificationEvidenceVerifiedView;
  loadedAt: number;
}>;

export type VerificationEvidenceAttemptTimeline = Readonly<{
  cellId: string;
  checkId: string;
  status: VerificationCellStatus;
  records: readonly VerificationEvidenceTransportRecord[];
}>;

export type VerificationEvidenceResourceModel =
  | Readonly<{
      status: 'missing' | 'stale' | 'invalid';
      message: string;
    }>
  | Readonly<{
      status: 'ready';
      records: readonly VerificationEvidenceTransportRecord[];
      timelines: readonly VerificationEvidenceAttemptTimeline[];
      verifiedEvidenceView: VerificationEvidenceVerifiedView;
      closure: VerificationClosure;
    }>;

const currentPartitionRevisions = (
  workspace: WorkspaceSnapshot
): VerificationEvidencePartitionRevisions => {
  const documentRevisions: Record<
    string,
    Readonly<{ contentRev: number; metaRev: number }>
  > = Object.create(null);
  for (const document of Object.values(workspace.docsById)) {
    documentRevisions[document.id] = Object.freeze({
      contentRev: document.contentRev,
      metaRev: document.metaRev,
    });
  }
  return Object.freeze({
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    documentRevisions: Object.freeze(documentRevisions),
  });
};

const evidenceOrder = (
  left: VerificationEvidenceTransportRecord,
  right: VerificationEvidenceTransportRecord
): number =>
  Date.parse(left.evidence.timing.completedAt) -
    Date.parse(right.evidence.timing.completedAt) ||
  compareVerificationText(left.evidence.attemptId, right.evidence.attemptId) ||
  compareVerificationText(left.evidence.id, right.evidence.id);

const artifactDescriptorMatchesManifest = (
  descriptor: VerificationEvidenceArtifactDescriptor,
  manifest: VerificationEvidenceTransportRecord['evidence']['artifacts'][number]
): boolean =>
  descriptor.id === manifest.id &&
  descriptor.path === manifest.path &&
  descriptor.kind === manifest.kind &&
  descriptor.digest === manifest.digest &&
  descriptor.normalizedDigest === manifest.normalizedDigest &&
  descriptor.sourceTraceDigest === manifest.sourceTraceDigest &&
  descriptor.size === manifest.size &&
  descriptor.mediaType === manifest.mediaType;

const artifactsAreCorrelated = (
  record: VerificationEvidenceTransportRecord
): boolean => {
  if (record.artifacts.length !== record.evidence.artifacts.length)
    return false;
  const manifestsById = new Map(
    record.evidence.artifacts.map((manifest) => [manifest.id, manifest])
  );
  return record.artifacts.every((descriptor) => {
    const manifest = manifestsById.get(descriptor.id);
    return Boolean(
      manifest && artifactDescriptorMatchesManifest(descriptor, manifest)
    );
  });
};

const verifiedViewRecordMatches = (
  viewRecord: VerificationEvidenceVerifiedViewRecord,
  record: VerificationEvidenceTransportRecord
): boolean => {
  return (
    sameCanonicalJson(viewRecord, record.verifiedView) &&
    viewRecord.materializedEvidenceDigest ===
      digestVerificationValue(record.evidence)
  );
};

const verifiedEvidenceViewMatchesRecords = (
  projection: VerificationEvidenceProjection,
  records: readonly VerificationEvidenceTransportRecord[]
): boolean => {
  if (projection.verifiedEvidenceView.records.length !== records.length)
    return false;
  const recordsById = new Map(
    records.map((record) => [record.evidence.id, record])
  );
  const { viewDigest, ...viewWithoutDigest } = projection.verifiedEvidenceView;
  return (
    projection.verifiedEvidenceView.records.every((viewRecord) => {
      const record = recordsById.get(viewRecord.evidenceId);
      return Boolean(record && verifiedViewRecordMatches(viewRecord, record));
    }) && viewDigest === digestVerificationValue(viewWithoutDigest)
  );
};

export const isVerificationEvidenceForPlan = (
  record: VerificationEvidenceTransportRecord,
  workspace: WorkspaceSnapshot,
  plan: VerificationPlan
): boolean => {
  const evidence = record.evidence;
  const cell = plan.cells.find(({ id }) => id === evidence.cellId);
  return (
    plan.workspaceId === workspace.id &&
    plan.targetRevision === workspace.workspaceRev &&
    sameCanonicalJson(
      plan.targetPartitionRevisions,
      currentPartitionRevisions(workspace)
    ) &&
    evidence.workspaceId === workspace.id &&
    evidence.workspaceRevision === plan.targetRevision &&
    sameCanonicalJson(
      evidence.partitionRevisions,
      plan.targetPartitionRevisions
    ) &&
    evidence.policyRevision === plan.policyRevision &&
    evidence.policyDigest === plan.policyDigest &&
    evidence.impactDigest === plan.impactDigest &&
    evidence.planDigest === plan.planDigest &&
    evidence.policyEvaluationInstant === plan.policyEvaluationInstant &&
    cell?.checkId === evidence.checkId &&
    (cell.scenarioId === undefined ||
      cell.scenarioId === evidence.scenario?.id) &&
    artifactsAreCorrelated(record)
  );
};

export const resolveVerificationEvidenceSourceTraces = (
  record: VerificationEvidenceTransportRecord,
  workspace: WorkspaceSnapshot,
  plan: VerificationPlan
):
  | Readonly<{
      status: 'ready';
      snapshotId: string;
      sourceTraces: readonly ExecutionSourceTrace[];
    }>
  | Readonly<{
      status: 'unavailable';
      reason: 'stale-revision' | 'source-unavailable';
    }> => {
  if (!isVerificationEvidenceForPlan(record, workspace, plan)) {
    return Object.freeze({ status: 'unavailable', reason: 'stale-revision' });
  }
  return Object.freeze({
    status: 'ready',
    snapshotId: createWorkspaceExecutionSnapshotId(workspace),
    sourceTraces: record.evidence.sourceTraces,
  });
};

export const resolveVerificationArtifactSourceTrace = (
  artifact: VerificationEvidenceArtifactDescriptor,
  sourceTraces: readonly ExecutionSourceTrace[]
): ExecutionSourceTrace | undefined => {
  if (!artifact.sourceTraceDigest) return undefined;
  return sourceTraces.find(
    (sourceTrace) =>
      digestVerificationValue(sourceTrace) === artifact.sourceTraceDigest
  );
};

export type VerificationArtifactPresentation =
  'text-preview' | 'raster-preview' | 'attachment-only';

/**
 * Mirrors the Backend promotion allowlist without inferring safety from a MIME
 * type alone. Any kind/media drift remains downloadable but is never inlined.
 */
export const getVerificationArtifactPresentation = (
  artifact: VerificationEvidenceArtifactDescriptor
): VerificationArtifactPresentation => {
  if (
    (artifact.kind === 'screenshot' || artifact.kind === 'visual-diff') &&
    (artifact.mediaType === 'image/png' || artifact.mediaType === 'image/jpeg')
  ) {
    return 'raster-preview';
  }
  if (artifact.kind === 'build-log' && artifact.mediaType === 'text/plain') {
    return 'text-preview';
  }
  if (
    (artifact.kind === 'accessibility-report' ||
      artifact.kind === 'trace' ||
      artifact.kind === 'network-summary' ||
      artifact.kind === 'console-summary' ||
      artifact.kind === 'coverage-summary' ||
      artifact.kind === 'performance-profile' ||
      artifact.kind === 'security-report' ||
      artifact.kind === 'replay-record') &&
    isVerificationArtifactJsonMediaType(artifact.mediaType)
  ) {
    return 'text-preview';
  }
  return 'attachment-only';
};

/**
 * Exposes only Backend-compatible lineage candidates for an explicit
 * supersession. The selected record remains the old/source Evidence.
 */
export const getVerificationEvidenceSupersessionCandidates = (
  selected: VerificationEvidenceTransportRecord,
  records: readonly VerificationEvidenceTransportRecord[]
): readonly VerificationEvidenceTransportRecord[] => {
  if (
    selected.verifiedView.retentionState !== 'active' ||
    selected.verifiedView.supersededByEvidenceId
  ) {
    return Object.freeze([]);
  }
  const source = selected.evidence;
  const sourceCompletedAt = Date.parse(source.timing.completedAt);
  return Object.freeze(
    records.filter(({ evidence: target, verifiedView }) => {
      return (
        target.id !== source.id &&
        hasSameVerificationEvidenceSupersessionLineage(source, target) &&
        target.attemptId !== source.attemptId &&
        Date.parse(target.timing.completedAt) >= sourceCompletedAt &&
        verifiedView.retentionState === 'active' &&
        !verifiedView.supersededByEvidenceId
      );
    })
  );
};

export const buildVerificationEvidenceResourceModel = (
  workspace: WorkspaceSnapshot | null | undefined,
  plan: VerificationPlan | undefined,
  projection: VerificationEvidenceProjection | undefined
): VerificationEvidenceResourceModel => {
  if (!workspace || !plan || !projection) {
    return Object.freeze({
      status: 'missing',
      message: 'No durable Evidence projection is loaded.',
    });
  }
  const partitionRevisions = currentPartitionRevisions(workspace);
  if (
    projection.workspaceId !== workspace.id ||
    projection.workspaceRevision !== workspace.workspaceRev ||
    projection.planDigest !== plan.planDigest ||
    plan.workspaceId !== workspace.id ||
    plan.targetRevision !== workspace.workspaceRev ||
    !sameCanonicalJson(projection.partitionRevisions, partitionRevisions) ||
    !sameCanonicalJson(plan.targetPartitionRevisions, partitionRevisions)
  ) {
    return Object.freeze({
      status: 'stale',
      message:
        'Durable Evidence belongs to another Workspace revision or Plan.',
    });
  }

  const records = [...projection.records].sort(evidenceOrder);
  const evidenceIds = records.map(({ evidence }) => evidence.id);
  const attemptKeys = records.map(
    ({ evidence }) => `${evidence.cellId}\u0000${evidence.attemptId}`
  );
  if (
    new Set(evidenceIds).size !== evidenceIds.length ||
    new Set(attemptKeys).size !== attemptKeys.length ||
    records.some(
      (record) => !isVerificationEvidenceForPlan(record, workspace, plan)
    ) ||
    !verifiedEvidenceViewMatchesRecords(projection, records)
  ) {
    return Object.freeze({
      status: 'invalid',
      message:
        'Durable Evidence contains duplicate attempts or an incompatible identity chain.',
    });
  }

  const closureResult = evaluateVerificationClosure({
    plan,
    evidence: Object.freeze(records.map(({ evidence }) => evidence)),
    verifiedEvidenceView: projection.verifiedEvidenceView,
    closureEvaluationInstant:
      projection.verifiedEvidenceView.closureEvaluationInstant,
    targetRevision: plan.targetRevision,
    targetPartitionRevisions: plan.targetPartitionRevisions,
    scenarioRegistryDigest: plan.scenarioRegistryDigest,
    semanticSchemaDigest: plan.semanticSchemaDigest,
    providerSetDigest: plan.providerSetDigest,
    adapterRegistryDigest: plan.adapterRegistryDigest,
    impactDigest: plan.impactDigest,
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    compilerDigest: plan.compilerDigest,
    plannerDigest: plan.plannerDigest,
    baselineSetDigests: uniqueVerificationText(
      plan.cells.flatMap((cell) =>
        cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        plan.cells.map((cell) => cell.adapter.toolchainDigest)
      )
    ),
    revocationRecordDigest:
      projection.verifiedEvidenceView.revocationRecordDigest,
    revokedEvidenceIds: uniqueVerificationText(
      projection.verifiedEvidenceView.records.flatMap((record) =>
        record.trustStatus === 'revoked' ? [record.evidenceId] : []
      )
    ),
  });
  if (closureResult.status === 'invalid') {
    return Object.freeze({
      status: 'invalid',
      message: closureResult.message,
    });
  }

  const recordsByCell = new Map<
    string,
    VerificationEvidenceTransportRecord[]
  >();
  for (const record of records) {
    const current = recordsByCell.get(record.evidence.cellId) ?? [];
    current.push(record);
    recordsByCell.set(record.evidence.cellId, current);
  }
  const timelines = plan.cells.flatMap(
    (cell): readonly VerificationEvidenceAttemptTimeline[] => {
      const cellRecords = recordsByCell.get(cell.id);
      return cellRecords?.length
        ? [
            Object.freeze({
              cellId: cell.id,
              checkId: cell.checkId,
              status: closureResult.closure.cellStatuses[cell.id]!,
              records: Object.freeze(cellRecords),
            }),
          ]
        : [];
    }
  );
  return Object.freeze({
    status: 'ready',
    records: Object.freeze(records),
    timelines: Object.freeze(timelines),
    verifiedEvidenceView: projection.verifiedEvidenceView,
    closure: closureResult.closure,
  });
};
