import {
  digestVerificationValue,
  isVerificationClosureForPlan,
  parseVerificationInstant,
  projectVerificationPlanExplanation,
} from '@prodivix/verification';
import type {
  VerificationPlanExplanation,
  VerificationPolicy,
} from '@prodivix/verification';
import {
  createWorkspaceVerificationImpactSet,
  decodeWorkspaceBehaviorVerificationDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { VerificationProjection } from '@/editor/store/useEditorStore';

export type VerificationPolicyResourceDocument =
  | Readonly<{
      status: 'ready';
      documentId: string;
      path: string;
      policy: VerificationPolicy;
      exemptions: readonly Readonly<{
        id: string;
        targetId: string;
        issueRef: string;
        status: 'active' | 'expired' | 'not-yet-active' | 'unevaluated';
      }>[];
    }>
  | Readonly<{
      status: 'invalid';
      documentId: string;
      path: string;
      issueCount: number;
    }>;

export type VerificationResourceModel = Readonly<{
  impact:
    | Readonly<{
        status: 'ready';
        source: 'planner' | 'conservative-current';
        workspaceRevision: number;
        completeness: 'complete' | 'conservative' | 'unknown';
        digest: string;
        changedDocumentIds: readonly string[];
        impactedScenarioIds: readonly string[];
        impactedDomains: readonly string[];
        capabilityIds: readonly string[];
        riskFlags: readonly string[];
        reasons: readonly Readonly<{
          id: string;
          kind: string;
          message: string;
        }>[];
        paths: readonly Readonly<{
          id: string;
          relationship: string;
          fromId: string;
          toId: string;
          nodes: readonly string[];
        }>[];
      }>
    | Readonly<{ status: 'blocked'; message: string }>;
  projectionStatus: 'ready' | 'missing' | 'stale';
  explanation?: VerificationPlanExplanation;
  policies: readonly VerificationPolicyResourceDocument[];
}>;

const exemptionStatus = (
  createdAt: string,
  expiresAt: string,
  policyEvaluationInstant: string | undefined
): 'active' | 'expired' | 'not-yet-active' | 'unevaluated' => {
  if (!policyEvaluationInstant) return 'unevaluated';
  const instant = parseVerificationInstant(policyEvaluationInstant);
  const created = parseVerificationInstant(createdAt);
  const expires = parseVerificationInstant(expiresAt);
  if (instant === undefined || created === undefined || expires === undefined) {
    return 'unevaluated';
  }
  if (instant < created) return 'not-yet-active';
  return instant < expires ? 'active' : 'expired';
};

const currentPartitionRevisions = (workspace: WorkspaceSnapshot) => {
  const documentRevisions: Record<
    string,
    Readonly<{ contentRev: number; metaRev: number }>
  > = Object.create(null);
  for (const document of Object.values(workspace.docsById)) {
    documentRevisions[document.id] = {
      contentRev: document.contentRev,
      metaRev: document.metaRev,
    };
  }
  return {
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    documentRevisions,
  };
};

const projectionDigestIsValid = (
  value: Readonly<Record<string, unknown>>,
  digestKey: 'impactDigest' | 'planDigest' | 'closureDigest'
): boolean => {
  const { [digestKey]: digest, ...withoutDigest } = value;
  return (
    typeof digest === 'string' &&
    digestVerificationValue(withoutDigest) === digest
  );
};

export const buildVerificationResourceModel = (
  workspace: WorkspaceSnapshot | null | undefined,
  projection: VerificationProjection | undefined
): VerificationResourceModel => {
  if (!workspace) {
    return Object.freeze({
      impact: Object.freeze({
        status: 'blocked',
        message: 'Workspace is unavailable.',
      }),
      projectionStatus: 'missing',
      policies: Object.freeze([]),
    });
  }
  const currentPartition = currentPartitionRevisions(workspace);
  const impactProjectionStatus =
    projection?.impactSet.workspaceId !== workspace.id
      ? 'missing'
      : projection.impactSet.targetRevision !== workspace.workspaceRev ||
          !projectionDigestIsValid(
            projection.impactSet as unknown as Readonly<
              Record<string, unknown>
            >,
            'impactDigest'
          ) ||
          !sameCanonicalJson(
            projection.impactSet.targetPartitionRevisions,
            currentPartition
          )
        ? 'stale'
        : 'ready';
  const activeImpactProjection =
    impactProjectionStatus === 'ready' ? projection : undefined;
  const planIsCurrent =
    !activeImpactProjection?.plan ||
    (activeImpactProjection.plan.workspaceId === workspace.id &&
      activeImpactProjection.plan.targetRevision === workspace.workspaceRev &&
      sameCanonicalJson(
        activeImpactProjection.plan.targetPartitionRevisions,
        currentPartition
      ) &&
      activeImpactProjection.plan.impactDigest ===
        activeImpactProjection.impactSet.impactDigest &&
      projectionDigestIsValid(
        activeImpactProjection.plan as unknown as Readonly<
          Record<string, unknown>
        >,
        'planDigest'
      ));
  const activePlan =
    activeImpactProjection?.plan && planIsCurrent
      ? activeImpactProjection.plan
      : undefined;
  const closureIsCurrent =
    !activeImpactProjection?.closure ||
    (activePlan !== undefined &&
      isVerificationClosureForPlan(
        activeImpactProjection.closure,
        activePlan
      ) &&
      projectionDigestIsValid(
        activeImpactProjection.closure as unknown as Readonly<
          Record<string, unknown>
        >,
        'closureDigest'
      ));
  const activeClosure =
    activeImpactProjection?.closure && closureIsCurrent
      ? activeImpactProjection.closure
      : undefined;
  const projectionStatus =
    impactProjectionStatus !== 'ready'
      ? impactProjectionStatus
      : planIsCurrent && closureIsCurrent
        ? 'ready'
        : 'stale';
  const fallback = activeImpactProjection
    ? undefined
    : createWorkspaceVerificationImpactSet({
        after: workspace,
        operationIds: [],
        frameworkTargets: ['react-vite', 'vue-vite'],
        runtimeZones: ['browser', 'client', 'server'],
      });
  const impactSet =
    activeImpactProjection?.impactSet ??
    (fallback?.status === 'ready' ? fallback.impactSet : undefined);
  const impact = impactSet
    ? Object.freeze({
        status: 'ready' as const,
        source: activeImpactProjection
          ? ('planner' as const)
          : ('conservative-current' as const),
        workspaceRevision: impactSet.targetRevision,
        completeness: impactSet.completeness,
        digest: impactSet.impactDigest,
        changedDocumentIds: impactSet.changedDocumentIds,
        impactedScenarioIds: impactSet.impactedScenarioIds,
        impactedDomains: impactSet.impactedDomains,
        capabilityIds: impactSet.capabilityIds,
        riskFlags: impactSet.riskFlags,
        reasons: Object.freeze(
          impactSet.reasons.map(({ id, kind, message }) =>
            Object.freeze({ id, kind, message })
          )
        ),
        paths: Object.freeze(
          impactSet.impactPaths.map(
            ({ id, relationship, fromId, toId, nodes }) =>
              Object.freeze({
                id,
                relationship,
                fromId,
                toId,
                nodes,
              })
          )
        ),
      })
    : Object.freeze({
        status: 'blocked' as const,
        message:
          fallback?.status === 'blocked'
            ? fallback.message
            : 'Impact projection is unavailable.',
      });
  const policyEvaluationInstant = activePlan?.policyEvaluationInstant;
  const policies = Object.values(workspace.docsById)
    .filter((document) => document.type === 'verification-policy')
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((document): VerificationPolicyResourceDocument => {
      const decoded = decodeWorkspaceBehaviorVerificationDocument(
        document,
        'verification-policy'
      );
      if (decoded.status !== 'valid') {
        return Object.freeze({
          status: 'invalid',
          documentId: document.id,
          path: document.path,
          issueCount: decoded.status === 'invalid' ? decoded.issues.length : 1,
        });
      }
      return Object.freeze({
        status: 'ready',
        documentId: document.id,
        path: document.path,
        policy: decoded.decodedContent,
        exemptions: Object.freeze(
          decoded.decodedContent.exemptions.map((exemption) =>
            Object.freeze({
              id: exemption.id,
              targetId: exemption.targetId,
              issueRef: exemption.issueRef,
              status: exemptionStatus(
                exemption.createdAt,
                exemption.expiresAt,
                policyEvaluationInstant
              ),
            })
          )
        ),
      });
    });
  return Object.freeze({
    impact,
    projectionStatus,
    ...(activePlan
      ? {
          explanation: projectVerificationPlanExplanation(
            activePlan,
            activeClosure
          ),
        }
      : {}),
    policies: Object.freeze(policies),
  });
};
