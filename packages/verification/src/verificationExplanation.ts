import {
  compareOptionalVerificationText,
  compareVerificationText,
  digestVerificationValue,
} from './verificationCanonical';
import { isVerificationClosureForPlan } from './verificationClosure';
import type {
  VerificationClosure,
  VerificationPlan,
  VerificationPlanExplanation,
} from './verification.types';

/**
 * Projects the exact shared JSON contract consumed by Web, CLI, and CI.
 * Consumers may group or render it, but do not reselect cells.
 */
export const projectVerificationPlanExplanation = (
  plan: VerificationPlan,
  closure?: VerificationClosure
): VerificationPlanExplanation => {
  const { planDigest: _planDigest, ...planWithoutDigest } = plan;
  if (digestVerificationValue(planWithoutDigest) !== plan.planDigest) {
    throw new Error(
      'VerificationPlan digest does not match its canonical content.'
    );
  }
  if (closure && !isVerificationClosureForPlan(closure, plan)) {
    throw new Error(
      'VerificationClosure identity does not match the supplied VerificationPlan.'
    );
  }
  if (closure) {
    const { closureDigest: _closureDigest, ...closureWithoutDigest } = closure;
    if (
      digestVerificationValue(closureWithoutDigest) !== closure.closureDigest
    ) {
      throw new Error(
        'VerificationClosure digest does not match its canonical content.'
      );
    }
  }
  const impactPathsByCell = new Map<string, readonly string[]>();
  for (const explanation of plan.explanations) {
    if (explanation.status !== 'selected' || !explanation.cellId) continue;
    impactPathsByCell.set(explanation.cellId, explanation.impactPathIds);
  }
  const cells = Object.freeze(
    plan.cells
      .map((cell) =>
        Object.freeze({
          id: cell.id,
          checkId: cell.checkId,
          checkKind: cell.checkKind,
          ...(cell.scenarioId ? { scenarioId: cell.scenarioId } : {}),
          targetId: cell.targetId,
          frameworkTarget: cell.frameworkTarget,
          surface: cell.surface,
          ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
          viewportId: cell.viewport.id,
          colorScheme: cell.colorScheme,
          motion: cell.motion,
          locale: cell.locale,
          requirement: cell.requirement,
          preflight: cell.preflight,
          policyRuleIds: cell.policyRuleIds,
          impactPathIds: impactPathsByCell.get(cell.id) ?? Object.freeze([]),
          dependencyCellIds: cell.dependencyCellIds,
          inputKinds: cell.inputKinds,
          artifactKinds: cell.artifactKinds,
        })
      )
      .sort(
        (left, right) =>
          compareVerificationText(left.checkId, right.checkId) ||
          compareOptionalVerificationText(left.scenarioId, right.scenarioId) ||
          compareVerificationText(left.targetId, right.targetId) ||
          compareVerificationText(
            left.frameworkTarget,
            right.frameworkTarget
          ) ||
          compareVerificationText(left.id, right.id)
      )
  );
  return Object.freeze({
    schema: 'prodivix.verification-plan-explain.v1',
    planDigest: plan.planDigest,
    status: plan.status,
    identity: Object.freeze({
      workspaceId: plan.workspaceId,
      targetRevision: plan.targetRevision,
      targetPartitionRevisions: plan.targetPartitionRevisions,
      impactDigest: plan.impactDigest,
      policyDigest: plan.policyDigest,
      policyRevision: plan.policyRevision,
      policyEvaluationInstant: plan.policyEvaluationInstant,
      scenarioRegistryDigest: plan.scenarioRegistryDigest,
      semanticSchemaDigest: plan.semanticSchemaDigest,
      providerSetDigest: plan.providerSetDigest,
      adapterRegistryDigest: plan.adapterRegistryDigest,
      compilerDigest: plan.compilerDigest,
      plannerDigest: plan.plannerDigest,
    }),
    summary: Object.freeze({
      requiredCells: cells.filter((cell) => cell.requirement === 'required')
        .length,
      advisoryCells: cells.filter((cell) => cell.requirement === 'advisory')
        .length,
      blockedCells: cells.filter((cell) => cell.preflight.status === 'blocked')
        .length,
      unsupportedCells: cells.filter(
        (cell) => cell.preflight.status === 'unsupported'
      ).length,
      selectedChecks: new Set(cells.map((cell) => cell.checkId)).size,
      selectedScenarios: new Set(
        cells.flatMap((cell) => (cell.scenarioId ? [cell.scenarioId] : []))
      ).size,
    }),
    budget: plan.budget,
    issues: plan.issues,
    selections: plan.explanations,
    cells,
    ...(closure
      ? {
          closure: Object.freeze({
            closureDigest: closure.closureDigest,
            verdict: closure.verdict,
            cellStatuses: closure.cellStatuses,
            issues: closure.issues,
          }),
        }
      : {}),
  });
};
