import {
  compareOptionalVerificationText,
  compareVerificationText,
  digestVerificationValue,
  uniqueVerificationText,
} from './verificationCanonical';
import { validateVerificationDocument } from './verificationCodec';
import {
  compareVerificationPlanCell,
  compareVerificationPlanExplanation,
  hasVerificationDependencyCycle,
  summarizeVerificationPlanBudget,
  verificationDependencyClosure,
  verificationDependencyMatches,
  type MutableVerificationPlanCell,
} from './verificationPlannerGraph';
import {
  expandVerificationMatrix,
  intersectVerificationConstraints,
  MAXIMUM_ENUMERATED_VERIFICATION_CELLS,
  sortVerificationValues,
  type VerificationMatrixCoordinate,
} from './verificationPlannerMatrix';
import {
  hasBoundVerificationDigest,
  preflightVerificationCell,
  relevantVerificationImpactFacts,
  validateVerificationPlanningInput,
  verificationCheckIsImpacted,
  verificationCheckIsScenarioBound,
  verificationScenarioMatchesCheck,
} from './verificationPlannerValidation';
import { evaluateVerificationPolicy } from './verificationPolicyEvaluator';
import type {
  CreateVerificationPlanInput,
  VerificationCheckDefinition,
  VerificationPlan,
  VerificationPlanCell,
  VerificationPlanIssue,
  VerificationPlanResult,
  VerificationPlanSelectionExplanation,
  VerificationScenarioDescriptor,
} from './verification.types';

const cellIdentity = (
  input: CreateVerificationPlanInput,
  check: VerificationCheckDefinition,
  scenario: VerificationScenarioDescriptor | undefined,
  targetId: string,
  coordinate: VerificationMatrixCoordinate
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    workspaceId: input.impactSet.workspaceId,
    targetRevision: input.impactSet.targetRevision,
    impactDigest: input.impactSet.impactDigest,
    policyDigest: input.policyDigest,
    policyEvaluationInstant: input.policyEvaluationInstant,
    checkId: check.id,
    checkKind: check.kind,
    ...(scenario ? { scenarioId: scenario.id } : {}),
    targetId,
    ...coordinate,
  });

/**
 * Builds the immutable matrix/DAG projection. Required cells are never
 * trimmed; unsupported, dependency, conflict, and budget failures block it.
 */
export const createVerificationPlan = (
  input: CreateVerificationPlanInput
): VerificationPlanResult => {
  const issues: VerificationPlanIssue[] = [];
  const explanations: VerificationPlanSelectionExplanation[] = [];
  const cells: MutableVerificationPlanCell[] = [];
  const enumeratedCellsByRequirement = {
    required: 0,
    advisory: 0,
  };
  const policyValidation = validateVerificationDocument(
    'verification-policy',
    input.policy
  );
  const planningInput: CreateVerificationPlanInput = policyValidation.ok
    ? Object.freeze({ ...input, policy: policyValidation.value })
    : input;
  const invalid = validateVerificationPlanningInput(
    planningInput,
    policyValidation.ok
  );
  if (invalid) {
    issues.push({
      code: 'VER-2001',
      message: invalid,
      relatedIds: Object.freeze([]),
    });
  }

  const adapters = new Map(
    planningInput.adapters.map((registration) => [
      registration.identity.adapterId,
      registration,
    ])
  );
  const scenarios = [...planningInput.scenarios].sort((left, right) =>
    compareVerificationText(left.id, right.id)
  );
  const checks = [...planningInput.checks].sort((left, right) =>
    compareVerificationText(left.id, right.id)
  );

  if (!invalid) {
    for (const check of checks) {
      const matchingScenarios = scenarios.filter((scenario) =>
        verificationScenarioMatchesCheck(scenario, check)
      );
      const candidates: readonly (
        VerificationScenarioDescriptor | undefined
      )[] = verificationCheckIsScenarioBound(check)
        ? matchingScenarios
        : Object.freeze([undefined]);
      if (candidates.length === 0) {
        issues.push({
          code: 'VER-3001',
          message: `Check "${check.id}" requires a Scenario but none matched.`,
          checkId: check.id,
          relatedIds: Object.freeze(check.scenarioIds),
        });
        continue;
      }

      for (const scenario of candidates) {
        const targetConstraints = [
          ...(check.targetIds.length > 0 ? [check.targetIds] : []),
          ...(scenario?.targetIds.length ? [scenario.targetIds] : []),
        ];
        const targets =
          targetConstraints.length > 0
            ? intersectVerificationConstraints(targetConstraints)
            : Object.freeze(['workspace']);
        if (targets.length === 0) {
          explanations.push({
            checkId: check.id,
            ...(scenario ? { scenarioId: scenario.id } : {}),
            targetId:
              scenario?.targetIds[0] ?? check.targetIds[0] ?? 'workspace',
            status: 'not-applicable',
            impactPathIds: Object.freeze([]),
            policyRuleIds: Object.freeze([]),
            messages: Object.freeze([
              'The Scenario and check target constraints do not intersect.',
            ]),
          });
          continue;
        }
        const declaredDomains = uniqueVerificationText([
          ...check.impactedDomains,
          ...(scenario?.impactedDomains ?? []),
        ]);
        const declaredRiskFlags = uniqueVerificationText(check.riskFlags);
        const impactedDomains = relevantVerificationImpactFacts(
          declaredDomains,
          planningInput.impactSet.impactedDomains
        );
        const riskFlags = relevantVerificationImpactFacts(
          declaredRiskFlags,
          planningInput.impactSet.riskFlags
        );
        for (const targetId of targets) {
          if (!verificationCheckIsImpacted(planningInput, check, scenario)) {
            explanations.push({
              checkId: check.id,
              ...(scenario ? { scenarioId: scenario.id } : {}),
              targetId,
              status: 'not-applicable',
              impactPathIds: Object.freeze([]),
              policyRuleIds: Object.freeze([]),
              messages: Object.freeze([
                'The complete semantic ImpactSet does not reach this check.',
              ]),
            });
            continue;
          }
          const evaluation = evaluateVerificationPolicy(
            planningInput.policy,
            {
              checkId: check.id,
              checkKind: check.kind,
              ...(scenario ? { scenarioId: scenario.id } : {}),
              scenarioTags: scenario?.tags ?? Object.freeze([]),
              ...(scenario ? { criticality: scenario.criticality } : {}),
              impactedDomains,
              riskFlags,
              targetId,
            },
            planningInput.policyEvaluationInstant
          );
          if (evaluation.status === 'invalid') {
            issues.push({
              code: evaluation.reasonCode,
              message: evaluation.message,
              checkId: check.id,
              relatedIds: evaluation.conflictingRuleIds,
            });
            continue;
          }
          if (evaluation.evaluation.requirement === 'forbidden') {
            explanations.push({
              checkId: check.id,
              ...(scenario ? { scenarioId: scenario.id } : {}),
              targetId,
              status: 'forbidden',
              impactPathIds: Object.freeze([]),
              policyRuleIds: evaluation.evaluation.trace.winningRuleIds,
              messages: evaluation.evaluation.trace.messages,
            });
            continue;
          }
          const matrix = evaluation.evaluation.matrixProfile?.matrix;
          const retryPolicy = evaluation.evaluation.retryPolicy;
          const controlProfileRef =
            evaluation.evaluation.controlProfileRef ??
            scenario?.controlProfileRef;
          if (!matrix || !retryPolicy || !controlProfileRef) {
            issues.push({
              code: 'VER-2001',
              message: `Policy evaluation for "${check.id}" lacks matrix, retry, or control inputs.`,
              checkId: check.id,
              relatedIds: evaluation.evaluation.trace.winningRuleIds,
            });
            continue;
          }
          const requirement = evaluation.evaluation.requirement;
          const expansion = expandVerificationMatrix(
            matrix,
            check,
            scenario,
            planningInput.impactSet.frameworkTargets,
            Math.max(
              0,
              MAXIMUM_ENUMERATED_VERIFICATION_CELLS -
                enumeratedCellsByRequirement[requirement]
            )
          );
          enumeratedCellsByRequirement[requirement] +=
            expansion.coordinates.length;
          if (expansion.truncated) {
            const message = `Matrix expansion has ${expansion.totalCoordinates} coordinates and exceeds the bounded ${MAXIMUM_ENUMERATED_VERIFICATION_CELLS}-cell planner enumeration limit.`;
            if (evaluation.evaluation.requirement === 'required') {
              issues.push({
                code: 'VER-3004',
                message,
                checkId: check.id,
                relatedIds: evaluation.evaluation.trace.winningRuleIds,
              });
            } else {
              explanations.push({
                checkId: check.id,
                ...(scenario ? { scenarioId: scenario.id } : {}),
                targetId,
                status: 'trimmed-advisory',
                impactPathIds: Object.freeze([]),
                policyRuleIds: evaluation.evaluation.trace.winningRuleIds,
                messages: Object.freeze([message]),
              });
            }
          }
          if (expansion.coordinates.length === 0) {
            if (!expansion.truncated) {
              explanations.push({
                checkId: check.id,
                ...(scenario ? { scenarioId: scenario.id } : {}),
                targetId,
                status: 'not-applicable',
                impactPathIds: Object.freeze([]),
                policyRuleIds: evaluation.evaluation.trace.winningRuleIds,
                messages: Object.freeze([
                  'The selected matrix has no coordinate supported by the check definition.',
                ]),
              });
            }
            continue;
          }

          for (const coordinate of expansion.coordinates) {
            const identity = cellIdentity(
              planningInput,
              check,
              scenario,
              targetId,
              coordinate
            );
            const fixtureSetRef =
              evaluation.evaluation.fixtureSetRef ?? scenario?.fixtureSetRef;
            const baselineSetRef =
              evaluation.evaluation.baselineSetRef ?? scenario?.baselineSetRef;
            const inputKinds = sortVerificationValues(check.inputKinds);
            const artifactKinds = sortVerificationValues(check.artifactKinds);
            const inputDigest = digestVerificationValue({
              ...identity,
              controlProfileRef,
              ...(fixtureSetRef ? { fixtureSetRef } : {}),
              ...(baselineSetRef ? { baselineSetRef } : {}),
              adapterId: check.adapterId,
              checkInputs: inputKinds,
              checkArtifacts: artifactKinds,
            });
            const id = `cell:${digestVerificationValue(identity)}`;
            const registration = adapters.get(check.adapterId);
            let cellPreflight = preflightVerificationCell(
              check,
              coordinate,
              registration,
              evaluation.evaluation.evidenceRequirements
            );
            if (
              !hasBoundVerificationDigest(controlProfileRef) ||
              !hasBoundVerificationDigest(fixtureSetRef) ||
              !hasBoundVerificationDigest(baselineSetRef)
            ) {
              cellPreflight = Object.freeze({
                status: 'blocked',
                reasonCode: 'VER-3003',
                message:
                  'Control, fixture, and baseline references must be digest-bound before planning.',
              });
            } else if (
              check.inputKinds.includes('scenario-program') &&
              !scenario
            ) {
              cellPreflight = Object.freeze({
                status: 'blocked',
                reasonCode: 'VER-3003',
                message:
                  'A check requiring scenario-program input must bind a Scenario.',
              });
            } else if (
              check.inputKinds.includes('baseline-set') &&
              !baselineSetRef
            ) {
              cellPreflight = Object.freeze({
                status: 'blocked',
                reasonCode: 'VER-3003',
                message:
                  'A check requiring baseline-set input must bind a digest-bound baseline set.',
              });
            } else if (
              check.kind === 'visual' &&
              check.inputKinds.includes('baseline-set') &&
              planningInput.policy.baselinePolicy.visual === 'forbidden'
            ) {
              cellPreflight = Object.freeze({
                status: 'blocked',
                reasonCode: 'VER-3003',
                message:
                  'VerificationPolicy forbids visual baseline comparison.',
              });
            }
            const cell: MutableVerificationPlanCell = {
              id,
              checkId: check.id,
              checkKind: check.kind,
              ...(scenario ? { scenarioId: scenario.id } : {}),
              targetId,
              ...coordinate,
              controlProfileRef,
              ...(fixtureSetRef
                ? {
                    fixtureSetRef,
                  }
                : {}),
              ...(baselineSetRef
                ? {
                    baselineSetRef,
                  }
                : {}),
              adapter: registration?.identity ?? {
                adapterId: check.adapterId,
                toolchainDigest: 'missing',
                capabilityDigest: 'missing',
              },
              requirement,
              policyRuleIds: evaluation.evaluation.trace.winningRuleIds,
              appliedExemptionIds:
                evaluation.evaluation.trace.appliedExemptionIds,
              retryPolicy,
              evidenceRequirements: evaluation.evaluation.evidenceRequirements,
              resources: Object.freeze(
                [...check.resources].sort(
                  (left, right) =>
                    compareVerificationText(left.key, right.key) ||
                    compareVerificationText(left.mode, right.mode)
                )
              ),
              inputKinds,
              artifactKinds,
              estimatedCost: check.estimatedCost,
              preflight: cellPreflight,
              dependencyCellIds: [],
              inputDigest,
            };
            cells.push(cell);
            explanations.push({
              cellId: id,
              checkId: check.id,
              ...(scenario ? { scenarioId: scenario.id } : {}),
              targetId,
              status: 'selected',
              impactPathIds: uniqueVerificationText(
                planningInput.impactSet.impactPaths
                  .filter(
                    (path) =>
                      path.toId === scenario?.id ||
                      path.toId === check.id ||
                      path.toId === targetId
                  )
                  .map((path) => path.id)
              ),
              policyRuleIds: evaluation.evaluation.trace.winningRuleIds,
              messages: evaluation.evaluation.trace.messages,
            });
          }
        }
      }
    }
  }

  cells.sort(compareVerificationPlanCell);
  const cellsByCheck = new Map<string, MutableVerificationPlanCell[]>();
  for (const cell of cells) {
    const list = cellsByCheck.get(cell.checkId) ?? [];
    list.push(cell);
    cellsByCheck.set(cell.checkId, list);
  }
  const checksById = new Map(checks.map((check) => [check.id, check]));
  for (const cell of cells) {
    const definition = checksById.get(cell.checkId)!;
    for (const dependencyCheckId of sortVerificationValues(
      definition.dependencyCheckIds
    )) {
      const dependencyDefinition = checksById.get(dependencyCheckId);
      const candidates = dependencyDefinition
        ? (cellsByCheck.get(dependencyCheckId) ?? []).filter((candidate) =>
            verificationDependencyMatches(cell, candidate, dependencyDefinition)
          )
        : [];
      if (candidates.length === 0) {
        cell.preflight = Object.freeze({
          status: 'blocked',
          reasonCode: 'VER-3003',
          message: `Dependency check "${dependencyCheckId}" is unavailable.`,
        });
        if (cell.requirement === 'required') {
          issues.push({
            code: 'VER-3003',
            message: `Cell "${cell.id}" has no compatible "${dependencyCheckId}" dependency.`,
            cellId: cell.id,
            checkId: cell.checkId,
            relatedIds: Object.freeze([dependencyCheckId]),
          });
        }
        continue;
      }
      if (
        cell.requirement === 'required' &&
        candidates.some((candidate) => candidate.requirement !== 'required')
      ) {
        cell.preflight = Object.freeze({
          status: 'blocked',
          reasonCode: 'VER-3003',
          message: `Required cell depends on advisory check "${dependencyCheckId}".`,
        });
        issues.push({
          code: 'VER-3003',
          message: `Required dependency "${dependencyCheckId}" must also be required by Policy.`,
          cellId: cell.id,
          checkId: cell.checkId,
          relatedIds: Object.freeze(
            candidates.map((candidate) => candidate.id)
          ),
        });
      }
      cell.dependencyCellIds.push(
        ...candidates
          .sort(compareVerificationPlanCell)
          .map((candidate) => candidate.id)
      );
    }
    cell.dependencyCellIds = [
      ...uniqueVerificationText(cell.dependencyCellIds),
    ];
  }
  if (hasVerificationDependencyCycle(cells)) {
    issues.push({
      code: 'VER-3003',
      message: 'Verification check dependencies contain a cycle.',
      relatedIds: Object.freeze(cells.map((cell) => cell.id)),
    });
  }

  for (const cell of cells) {
    if (cell.requirement !== 'required') continue;
    if (cell.preflight.status === 'unsupported') {
      issues.push({
        code: 'VER-3002',
        message: cell.preflight.message,
        cellId: cell.id,
        checkId: cell.checkId,
        relatedIds: Object.freeze([cell.adapter.adapterId]),
      });
    } else if (cell.preflight.status === 'blocked') {
      if (
        !issues.some(
          (issue) => issue.code === 'VER-3003' && issue.cellId === cell.id
        )
      ) {
        issues.push({
          code: 'VER-3003',
          message: cell.preflight.message,
          cellId: cell.id,
          checkId: cell.checkId,
          relatedIds: Object.freeze(cell.dependencyCellIds),
        });
      }
    }
  }

  const requiredCells = cells.filter((cell) => cell.requirement === 'required');
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const requiredStructuralCells = verificationDependencyClosure(
    requiredCells,
    cellsById
  );
  const requiredBudget = summarizeVerificationPlanBudget(
    requiredStructuralCells as readonly VerificationPlanCell[],
    planningInput.policy.budgets
  );
  if (requiredBudget.overBudgetDimensions.length > 0) {
    issues.push({
      code: 'VER-3004',
      message: `Required cells exceed: ${requiredBudget.overBudgetDimensions.join(', ')}.`,
      relatedIds: requiredBudget.overBudgetDimensions,
    });
  }

  const retained: MutableVerificationPlanCell[] = [...requiredStructuralCells];
  const retainedIds = new Set(retained.map((cell) => cell.id));
  const advisoryCells = cells.filter(
    (cell) => cell.requirement === 'advisory' && !retainedIds.has(cell.id)
  );
  for (const advisory of advisoryCells) {
    if (retainedIds.has(advisory.id)) continue;
    const group = verificationDependencyClosure([advisory], cellsById).filter(
      (cell) => !retainedIds.has(cell.id)
    );
    const candidate = [...retained, ...group].sort(compareVerificationPlanCell);
    const budget = summarizeVerificationPlanBudget(
      candidate as readonly VerificationPlanCell[],
      planningInput.policy.budgets
    );
    if (budget.overBudgetDimensions.length === 0) {
      for (const cell of group) {
        retained.push(cell);
        retainedIds.add(cell.id);
      }
    }
  }
  retained.sort(compareVerificationPlanCell);
  for (let index = 0; index < explanations.length; index += 1) {
    const explanation = explanations[index]!;
    if (
      explanation.status !== 'selected' ||
      !explanation.cellId ||
      retainedIds.has(explanation.cellId)
    ) {
      continue;
    }
    const trimmedCell = cellsById.get(explanation.cellId);
    const group = trimmedCell
      ? verificationDependencyClosure([trimmedCell], cellsById).filter(
          (cell) => !retainedIds.has(cell.id)
        )
      : [];
    const budget = summarizeVerificationPlanBudget(
      [...retained, ...group] as readonly VerificationPlanCell[],
      planningInput.policy.budgets
    );
    explanations[index] = Object.freeze({
      ...explanation,
      status: 'trimmed-advisory',
      messages: Object.freeze([
        ...explanation.messages,
        `Advisory expansion was deterministically trimmed by ${budget.overBudgetDimensions.join(', ')}.`,
      ]),
    });
  }
  for (const cell of retained) {
    const missingRetainedDependency = cell.dependencyCellIds.find(
      (id) => !retainedIds.has(id)
    );
    if (missingRetainedDependency) {
      cell.preflight = Object.freeze({
        status: 'blocked',
        reasonCode: 'VER-3003',
        message: `Dependency cell "${missingRetainedDependency}" was not retained.`,
      });
    }
  }

  const frozenCells: readonly VerificationPlanCell[] = Object.freeze(
    retained.map((cell) =>
      Object.freeze({
        ...cell,
        dependencyCellIds: Object.freeze([...cell.dependencyCellIds]),
      })
    )
  );
  const finalBudget = summarizeVerificationPlanBudget(
    frozenCells,
    planningInput.policy.budgets
  );
  const normalizedIssues = Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareVerificationText(left.code, right.code) ||
        compareOptionalVerificationText(left.cellId, right.cellId) ||
        compareOptionalVerificationText(left.checkId, right.checkId) ||
        compareVerificationText(left.message, right.message)
    )
  );
  const normalizedExplanations = Object.freeze(
    [...explanations].sort(compareVerificationPlanExplanation)
  );
  const status = normalizedIssues.some((issue) =>
    [
      'VER-2001',
      'VER-2002',
      'VER-3001',
      'VER-3002',
      'VER-3003',
      'VER-3004',
    ].includes(issue.code)
  )
    ? 'blocked'
    : 'ready';
  const planWithoutDigest = Object.freeze({
    status,
    workspaceId: planningInput.impactSet.workspaceId,
    targetRevision: planningInput.impactSet.targetRevision,
    targetPartitionRevisions: planningInput.impactSet.targetPartitionRevisions,
    scenarioRegistryDigest: planningInput.scenarioRegistryDigest,
    policyRevision: planningInput.policyRevision,
    policyDigest: planningInput.policyDigest,
    policyEvaluationInstant: planningInput.policyEvaluationInstant,
    impactDigest: planningInput.impactSet.impactDigest,
    semanticSchemaDigest: planningInput.impactSet.semanticSchemaDigest,
    providerSetDigest: planningInput.impactSet.providerSetDigest,
    compilerDigest: planningInput.compilerDigest,
    plannerDigest: planningInput.plannerDigest,
    adapterRegistryDigest: planningInput.adapterRegistryDigest,
    cells: frozenCells,
    issues: normalizedIssues,
    explanations: normalizedExplanations,
    budget: finalBudget,
  });
  const plan: VerificationPlan = Object.freeze({
    ...planWithoutDigest,
    planDigest: digestVerificationValue(planWithoutDigest),
  });
  return Object.freeze({ status, plan });
};
