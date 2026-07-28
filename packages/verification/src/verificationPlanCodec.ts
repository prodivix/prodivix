import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  compareOptionalVerificationText,
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import {
  cloneCanonicalVerificationEvidenceWire,
  compileVerificationEvidenceWireSchema,
  verificationEvidenceWireSchemaFailure,
} from './verificationEvidenceWireCodec.shared';
import {
  compareVerificationPlanCell,
  compareVerificationPlanExplanation,
  MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
} from './verificationPlannerGraph';
import type {
  VerificationCheckKind,
  VerificationPlan,
  VerificationPlanBudgetSummary,
  VerificationPlanCell,
  VerificationPlanIssue,
} from './verification.types';
import {
  verificationPlanWireSchema,
  VERIFICATION_PLAN_WIRE_VERSION,
} from './wire';

export type VerificationPlanWire = VerificationPlan &
  Readonly<{ wireVersion: typeof VERIFICATION_PLAN_WIRE_VERSION }>;

export type VerificationPlanWireIssue = Readonly<{
  code: 'VER-5001';
  path: string;
  message: string;
}>;

export type VerificationPlanDecodeResult =
  | Readonly<{ ok: true; value: VerificationPlan }>
  | Readonly<{ ok: false; issues: readonly VerificationPlanWireIssue[] }>;

const CHECK_KINDS = Object.freeze([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
] as const satisfies readonly VerificationCheckKind[]);

const validateWire = compileVerificationEvidenceWireSchema(
  verificationPlanWireSchema
);

const invalid = (path: string, message: string): VerificationPlanDecodeResult =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code: 'VER-5001' as const, path, message }),
    ]),
  });

const sortedText = <T extends string>(values: readonly T[]): readonly T[] =>
  Object.freeze(
    [...values].sort((left, right) => compareUnicodeCodePoints(left, right))
  );

const normalizeCell = (cell: VerificationPlanCell): VerificationPlanCell =>
  Object.freeze({
    ...cell,
    targetPolicy: Object.freeze({ ...cell.targetPolicy }),
    viewport: Object.freeze({ ...cell.viewport }),
    controlProfileRef: Object.freeze({ ...cell.controlProfileRef }),
    ...(cell.fixtureSetRef
      ? { fixtureSetRef: Object.freeze({ ...cell.fixtureSetRef }) }
      : {}),
    ...(cell.baselineSetRef
      ? { baselineSetRef: Object.freeze({ ...cell.baselineSetRef }) }
      : {}),
    adapter: Object.freeze({ ...cell.adapter }),
    policyRuleIds: sortedText(cell.policyRuleIds),
    appliedExemptionIds: sortedText(cell.appliedExemptionIds),
    retryPolicy: Object.freeze({
      ...cell.retryPolicy,
      retryableOutcomes: sortedText(cell.retryPolicy.retryableOutcomes),
    }),
    evidenceRequirements: Object.freeze({
      ...cell.evidenceRequirements,
      acceptedTrust: sortedText(cell.evidenceRequirements.acceptedTrust),
      requiredArtifactKinds: sortedText(
        cell.evidenceRequirements.requiredArtifactKinds
      ),
    }),
    resources: Object.freeze(
      [...cell.resources]
        .map((resource) => Object.freeze({ ...resource }))
        .sort(
          (left, right) =>
            compareUnicodeCodePoints(left.key, right.key) ||
            compareUnicodeCodePoints(left.mode, right.mode)
        )
    ),
    inputKinds: sortedText(cell.inputKinds),
    artifactKinds: sortedText(cell.artifactKinds),
    estimatedCost: Object.freeze({ ...cell.estimatedCost }),
    preflight: Object.freeze({ ...cell.preflight }),
    dependencyCellIds: sortedText(cell.dependencyCellIds),
  });

const comparePlanIssue = (
  left: VerificationPlanIssue,
  right: VerificationPlanIssue
): number =>
  compareVerificationText(left.code, right.code) ||
  compareOptionalVerificationText(left.cellId, right.cellId) ||
  compareOptionalVerificationText(left.checkId, right.checkId) ||
  compareVerificationText(left.message, right.message);

const normalizeBudget = (
  budget: VerificationPlanBudgetSummary
): VerificationPlanBudgetSummary =>
  Object.freeze({
    ...budget,
    cellsByCheckKind: Object.freeze({ ...budget.cellsByCheckKind }),
    overBudgetDimensions: sortedText(budget.overBudgetDimensions),
  });

export const normalizeVerificationPlan = (
  plan: VerificationPlan
): VerificationPlan => {
  const cells = Object.freeze(
    [...plan.cells].map(normalizeCell).sort(compareVerificationPlanCell)
  );
  const issues = Object.freeze(
    [...plan.issues]
      .map((issue) =>
        Object.freeze({
          ...issue,
          relatedIds: sortedText(issue.relatedIds),
        })
      )
      .sort(comparePlanIssue)
  );
  const explanations = Object.freeze(
    [...plan.explanations]
      .map((explanation) =>
        Object.freeze({
          ...explanation,
          impactPathIds: sortedText(explanation.impactPathIds),
          policyRuleIds: sortedText(explanation.policyRuleIds),
          messages: Object.freeze([...explanation.messages]),
        })
      )
      .sort(compareVerificationPlanExplanation)
  );
  return Object.freeze({
    ...plan,
    targetPartitionRevisions: Object.freeze({
      ...plan.targetPartitionRevisions,
      documentRevisions: Object.freeze(
        Object.fromEntries(
          Object.entries(plan.targetPartitionRevisions.documentRevisions).map(
            ([documentId, revision]) => [
              documentId,
              Object.freeze({ ...revision }),
            ]
          )
        )
      ),
    }),
    retentionRequest: Object.freeze({ ...plan.retentionRequest }),
    cells,
    issues,
    explanations,
    budget: normalizeBudget(plan.budget),
  });
};

const hasUniqueText = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const cellSetArraysAreUnique = (cell: VerificationPlanCell): boolean =>
  hasUniqueText(cell.policyRuleIds) &&
  hasUniqueText(cell.appliedExemptionIds) &&
  hasUniqueText(cell.retryPolicy.retryableOutcomes) &&
  hasUniqueText(cell.evidenceRequirements.acceptedTrust) &&
  hasUniqueText(cell.evidenceRequirements.requiredArtifactKinds) &&
  hasUniqueText(cell.resources.map(({ key }) => key)) &&
  hasUniqueText(cell.inputKinds) &&
  hasUniqueText(cell.artifactKinds) &&
  hasUniqueText(cell.dependencyCellIds);

const planDependenciesAreAcyclic = (
  cells: readonly VerificationPlanCell[]
): boolean => {
  const byId = new Map(cells.map((cell) => [cell.id, cell] as const));
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (cellId: string): boolean => {
    if (complete.has(cellId)) return true;
    if (active.has(cellId)) return false;
    const cell = byId.get(cellId);
    if (!cell) return false;
    active.add(cellId);
    for (const dependencyId of cell.dependencyCellIds) {
      if (!visit(dependencyId)) return false;
    }
    active.delete(cellId);
    complete.add(cellId);
    return true;
  };
  return cells.every(({ id }) => visit(id));
};

const derivedBudget = (
  cells: readonly VerificationPlanCell[]
): Omit<
  VerificationPlanBudgetSummary,
  'maximumParallelism' | 'overBudgetDimensions'
> | null => {
  const cellsByCheckKind = Object.fromEntries(
    CHECK_KINDS.map((kind) => [kind, 0])
  ) as Record<VerificationCheckKind, number>;
  let closureEvidenceRecords = 0;
  let totalMs = 0;
  let artifactBytes = 0;
  let estimatedComputeUnits = 0;
  for (const cell of cells) {
    cellsByCheckKind[cell.checkKind] += 1;
    closureEvidenceRecords += cell.retryPolicy.maximumAttempts;
    totalMs += cell.estimatedCost.durationMs;
    artifactBytes += cell.estimatedCost.artifactBytes;
    estimatedComputeUnits += cell.estimatedCost.computeUnits;
    if (
      !Number.isSafeInteger(closureEvidenceRecords) ||
      !Number.isSafeInteger(totalMs) ||
      !Number.isSafeInteger(artifactBytes) ||
      !Number.isSafeInteger(estimatedComputeUnits)
    ) {
      return null;
    }
  }
  return Object.freeze({
    cells: cells.length,
    cellsByCheckKind: Object.freeze(cellsByCheckKind),
    targetExpansions: new Set(
      cells.map((cell) => `${cell.targetId}\u0000${cell.frameworkTarget}`)
    ).size,
    browserExpansions: new Set(
      cells.flatMap((cell) => (cell.browserEngine ? [cell.browserEngine] : []))
    ).size,
    closureEvidenceRecords,
    totalMs,
    artifactBytes,
    estimatedComputeUnits,
  });
};

const semanticValidation = (
  plan: VerificationPlan
): VerificationPlanDecodeResult => {
  if (parseVerificationInstant(plan.policyEvaluationInstant) === undefined) {
    return invalid(
      '/policyEvaluationInstant',
      'Verification Plan policy evaluation instant is invalid.'
    );
  }
  if (
    plan.cells.length > MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS ||
    new Set(plan.cells.map(({ id }) => id)).size !== plan.cells.length ||
    plan.cells.some(
      (cell) =>
        cell.targetPolicy.authority !== 'verification-policy' ||
        cell.targetPolicy.policyDigest !== plan.policyDigest ||
        cell.targetPolicy.semanticTargetId !== cell.targetId ||
        !cellSetArraysAreUnique(cell)
    ) ||
    !planDependenciesAreAcyclic(plan.cells)
  ) {
    return invalid(
      '/cells',
      'Verification Plan cells, policy grants, or dependencies are invalid.'
    );
  }
  const budget = derivedBudget(plan.cells);
  if (
    !budget ||
    budget.closureEvidenceRecords >
      MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS ||
    plan.budget.closureEvidenceRecords >
      MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS ||
    !sameCanonicalJson(budget, {
      cells: plan.budget.cells,
      cellsByCheckKind: plan.budget.cellsByCheckKind,
      targetExpansions: plan.budget.targetExpansions,
      browserExpansions: plan.budget.browserExpansions,
      closureEvidenceRecords: plan.budget.closureEvidenceRecords,
      totalMs: plan.budget.totalMs,
      artifactBytes: plan.budget.artifactBytes,
      estimatedComputeUnits: plan.budget.estimatedComputeUnits,
    })
  ) {
    return invalid('/budget', 'Verification Plan budget summary is invalid.');
  }
  if (
    (plan.issues.length === 0 && plan.status !== 'ready') ||
    (plan.issues.length > 0 && plan.status !== 'blocked')
  ) {
    return invalid('/status', 'Verification Plan status is invalid.');
  }
  const { planDigest, ...withoutDigest } = plan;
  if (digestVerificationValue(withoutDigest) !== planDigest) {
    return invalid('/planDigest', 'Verification Plan digest does not match.');
  }
  return Object.freeze({ ok: true, value: plan });
};

export const decodeVerificationPlan = (
  value: unknown
): VerificationPlanDecodeResult => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(validateWire.errors);
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  const normalized = normalizeVerificationPlan(
    current as unknown as VerificationPlan
  );
  if (!sameCanonicalJson(current, normalized)) {
    return invalid(
      '/',
      'Verification Plan wire arrays are not in canonical order.'
    );
  }
  return semanticValidation(normalized);
};

export const validateVerificationPlan = (
  value: unknown
): VerificationPlanDecodeResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return invalid(
      '/',
      'Verification Plan current model is not bounded or exposes a wire version.'
    );
  }
  try {
    const current = JSON.parse(canonicalJsonText(value)) as Readonly<
      Record<string, unknown>
    >;
    return decodeVerificationPlan({
      ...current,
      wireVersion: VERIFICATION_PLAN_WIRE_VERSION,
    });
  } catch {
    return invalid('/', 'Verification Plan current model cannot be encoded.');
  }
};

export const encodeVerificationPlan = (
  value: VerificationPlan
): VerificationPlanWire => {
  const validated = validateVerificationPlan(value);
  if (!validated.ok) {
    throw new TypeError(
      validated.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze({
    ...validated.value,
    wireVersion: VERIFICATION_PLAN_WIRE_VERSION,
  });
};
