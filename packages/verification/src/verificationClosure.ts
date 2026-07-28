import {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import {
  assessVerificationEvidenceAcceptance,
  validateVerificationEvidenceSupersessions,
  validateVerificationEvidenceVerifiedView,
  type VerificationEvidenceAcceptance,
  type VerificationEvidenceVerifiedViewRecord,
} from './verificationRetention';
import { compareVerificationEvidenceCompatibility } from './verificationComparison';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  EvaluateVerificationClosureInput,
  VerificationAttemptOutcome,
  VerificationCellStatus,
  VerificationClosure,
  VerificationClosureIssue,
  VerificationClosureResult,
  VerificationEvidence,
  VerificationPlan,
  VerificationPlanCell,
} from './verification.types';

type VerifiedEvidenceContext = Readonly<{
  acceptanceByEvidenceId: ReadonlyMap<string, VerificationEvidenceAcceptance>;
  viewRecordByEvidenceId: ReadonlyMap<
    string,
    VerificationEvidenceVerifiedViewRecord
  >;
}>;

type VerifiedEvidencePreparation =
  | Readonly<{ status: 'ready'; context: VerifiedEvidenceContext }>
  | Readonly<{ status: 'invalid'; message: string }>;

const evidenceOrder = (
  left: VerificationEvidence,
  right: VerificationEvidence
): number => {
  const leftTime = parseVerificationInstant(left.timing.completedAt) ?? -1;
  const rightTime = parseVerificationInstant(right.timing.completedAt) ?? -1;
  return (
    leftTime - rightTime ||
    compareVerificationText(left.attemptId, right.attemptId) ||
    compareVerificationText(left.id, right.id)
  );
};

const sameTextSet = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  sameCanonicalJson(
    uniqueVerificationText(left),
    uniqueVerificationText(right)
  );

const prepareVerifiedEvidence = (
  input: EvaluateVerificationClosureInput
): VerifiedEvidencePreparation => {
  if (!input.verifiedEvidenceView) {
    return input.evidence.length === 0
      ? Object.freeze({
          status: 'ready',
          context: Object.freeze({
            acceptanceByEvidenceId: new Map(),
            viewRecordByEvidenceId: new Map(),
          }),
        })
      : Object.freeze({
          status: 'invalid',
          message:
            'Verification Evidence requires a Backend-verified trust, retention, revocation, and artifact availability view.',
        });
  }
  const validated = validateVerificationEvidenceVerifiedView(
    input.verifiedEvidenceView
  );
  if (validated.status === 'invalid') {
    return Object.freeze({
      status: 'invalid',
      message: validated.message,
    });
  }
  const view = validated.view;
  if (
    view.closureEvaluationInstant !== input.closureEvaluationInstant ||
    view.revocationRecordDigest !== input.revocationRecordDigest
  ) {
    return Object.freeze({
      status: 'invalid',
      message:
        'Verification Evidence view is not bound to the Closure evaluation or revocation input.',
    });
  }
  const evidenceById = new Map(
    input.evidence.map((candidate) => [candidate.id, candidate] as const)
  );
  const viewRecordByEvidenceId = new Map(
    view.records.map((record) => [record.evidenceId, record] as const)
  );
  if (
    evidenceById.size !== input.evidence.length ||
    viewRecordByEvidenceId.size !== input.evidence.length ||
    input.evidence.some(
      (candidate) =>
        viewRecordByEvidenceId.get(candidate.id)?.manifestDigest !==
        candidate.manifestDigest
    )
  ) {
    return Object.freeze({
      status: 'invalid',
      message:
        'Verification Evidence view must exactly cover the supplied immutable manifests.',
    });
  }
  const revokedEvidenceIds = view.records
    .filter((record) => record.trustStatus === 'revoked')
    .map((record) => record.evidenceId);
  if (
    new Set(input.revokedEvidenceIds).size !==
      input.revokedEvidenceIds.length ||
    !sameTextSet(revokedEvidenceIds, input.revokedEvidenceIds)
  ) {
    return Object.freeze({
      status: 'invalid',
      message:
        'Verification Evidence revoked ids do not match the verified revocation view.',
    });
  }
  const supersessionIssue = validateVerificationEvidenceSupersessions(
    input.evidence,
    view
  );
  if (supersessionIssue) {
    return Object.freeze({
      status: 'invalid',
      message: supersessionIssue,
    });
  }
  const acceptanceByEvidenceId = new Map<
    string,
    VerificationEvidenceAcceptance
  >();
  for (const candidate of input.evidence) {
    const record = viewRecordByEvidenceId.get(candidate.id)!;
    const acceptance = assessVerificationEvidenceAcceptance(
      candidate,
      record,
      input.closureEvaluationInstant
    );
    if (acceptance.status === 'invalid') {
      return Object.freeze({
        status: 'invalid',
        message:
          acceptance.message ??
          `Verification Evidence "${candidate.id}" verified view is invalid.`,
      });
    }
    acceptanceByEvidenceId.set(candidate.id, acceptance);
  }
  return Object.freeze({
    status: 'ready',
    context: Object.freeze({
      acceptanceByEvidenceId,
      viewRecordByEvidenceId,
    }),
  });
};

const expectedBaselineSetDigests = (
  cells: readonly VerificationPlanCell[]
): readonly string[] =>
  uniqueVerificationText(
    cells.flatMap((cell) =>
      cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
    )
  );

const expectedToolchainSetDigest = (
  cells: readonly VerificationPlanCell[]
): string =>
  digestVerificationValue(
    uniqueVerificationText(cells.map((cell) => cell.adapter.toolchainDigest))
  );

/** Checks the complete revision/tool/policy identity before rendering Closure. */
export const isVerificationClosureForPlan = (
  closure: VerificationClosure,
  plan: VerificationPlan
): boolean =>
  closure.workspaceId === plan.workspaceId &&
  closure.targetRevision === plan.targetRevision &&
  sameCanonicalJson(
    closure.targetPartitionRevisions,
    plan.targetPartitionRevisions
  ) &&
  closure.scenarioRegistryDigest === plan.scenarioRegistryDigest &&
  closure.semanticSchemaDigest === plan.semanticSchemaDigest &&
  closure.providerSetDigest === plan.providerSetDigest &&
  closure.adapterRegistryDigest === plan.adapterRegistryDigest &&
  closure.impactDigest === plan.impactDigest &&
  closure.policyRevision === plan.policyRevision &&
  closure.policyDigest === plan.policyDigest &&
  closure.policyEvaluationInstant === plan.policyEvaluationInstant &&
  closure.compilerDigest === plan.compilerDigest &&
  closure.plannerDigest === plan.plannerDigest &&
  closure.planDigest === plan.planDigest &&
  sameTextSet(
    closure.baselineSetDigests,
    expectedBaselineSetDigests(plan.cells)
  ) &&
  closure.toolchainSetDigest === expectedToolchainSetDigest(plan.cells) &&
  sameTextSet(
    Object.keys(closure.cellStatuses),
    plan.cells.map(({ id }) => id)
  );

const outcomeStatus = (
  outcome: VerificationAttemptOutcome
): VerificationCellStatus => {
  switch (outcome) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    case 'infrastructure-error':
      return 'infrastructure-error';
  }
};

const statusIssue = (
  cell: VerificationPlanCell,
  status: VerificationCellStatus,
  message: string,
  evidence: readonly VerificationEvidence[]
): VerificationClosureIssue =>
  Object.freeze({
    cellId: cell.id,
    status,
    message,
    evidenceIds: Object.freeze(evidence.map((candidate) => candidate.id)),
  });

type CellEvaluation = Readonly<{
  status: VerificationCellStatus;
  acceptableEvidence: readonly VerificationEvidence[];
  issues: readonly VerificationClosureIssue[];
}>;

const evaluateCell = (
  input: EvaluateVerificationClosureInput,
  cell: VerificationPlanCell,
  instant: number,
  verified: VerifiedEvidenceContext
): CellEvaluation => {
  if (cell.preflight.status !== 'supported') {
    const status = cell.preflight.status;
    return Object.freeze({
      status,
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(cell, status, cell.preflight.message, Object.freeze([])),
      ]),
    });
  }

  const all = input.evidence
    .filter((candidate) => candidate.cellId === cell.id)
    .sort(evidenceOrder);
  if (all.length === 0) {
    const running = input.runningCellIds?.includes(cell.id) ?? false;
    const status: VerificationCellStatus = running
      ? 'running'
      : cell.requirement === 'required'
        ? 'missing'
        : 'pending';
    return Object.freeze({
      status,
      acceptableEvidence: Object.freeze([]),
      issues:
        status === 'pending' || status === 'running'
          ? Object.freeze([])
          : Object.freeze([
              statusIssue(
                cell,
                status,
                'The required cell has no Evidence.',
                Object.freeze([])
              ),
            ]),
    });
  }

  const identityCompatible = all.filter(
    (candidate) =>
      candidate.workspaceId === input.plan.workspaceId &&
      candidate.workspaceRevision === input.plan.targetRevision &&
      sameCanonicalJson(
        candidate.partitionRevisions,
        input.plan.targetPartitionRevisions
      ) &&
      candidate.policyRevision === input.plan.policyRevision &&
      candidate.policyDigest === input.plan.policyDigest &&
      candidate.impactDigest === input.plan.impactDigest &&
      candidate.planDigest === input.plan.planDigest &&
      candidate.policyEvaluationInstant ===
        input.plan.policyEvaluationInstant &&
      candidate.checkId === cell.checkId &&
      candidate.checkKind === cell.checkKind &&
      candidate.targetId === cell.targetId &&
      candidate.scenario?.id === cell.scenarioId
  );
  if (identityCompatible.length === 0) {
    return Object.freeze({
      status: 'stale',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'stale',
          'Evidence exists but is bound to another revision, impact, policy, or plan.',
          all
        ),
      ]),
    });
  }

  const attemptIds = new Set<string>();
  const duplicateAttempt = identityCompatible.find((candidate) => {
    if (attemptIds.has(candidate.attemptId)) return true;
    attemptIds.add(candidate.attemptId);
    return false;
  });
  if (duplicateAttempt) {
    return Object.freeze({
      status: 'incompatible',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'incompatible',
          `Attempt id "${duplicateAttempt.attemptId}" is duplicated for one cell.`,
          identityCompatible
        ),
      ]),
    });
  }
  if (identityCompatible.length > cell.retryPolicy.maximumAttempts) {
    return Object.freeze({
      status: 'incompatible',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'incompatible',
          'Evidence attempts exceed the bounded retry policy.',
          identityCompatible
        ),
      ]),
    });
  }

  const verifiedAcceptable = identityCompatible.filter(
    (candidate) =>
      verified.acceptanceByEvidenceId.get(candidate.id)?.status === 'acceptable'
  );
  if (verifiedAcceptable.length === 0) {
    const unverified = identityCompatible.some(
      (candidate) =>
        verified.acceptanceByEvidenceId.get(candidate.id)?.status ===
        'unverified'
    );
    return Object.freeze({
      status: unverified ? 'incompatible' : 'stale',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          unverified ? 'incompatible' : 'stale',
          unverified
            ? 'Matching Evidence has no Backend-verified trust.'
            : 'All matching Evidence is revoked, tombstoned, superseded, expired, or missing a durable artifact.',
          identityCompatible
        ),
      ]),
    });
  }
  const fresh = verifiedAcceptable.filter((candidate) => {
    const completedAt = parseVerificationInstant(candidate.timing.completedAt);
    const issuedAt = parseVerificationInstant(candidate.provenance.issuedAt);
    const expiresAt = candidate.provenance.expiresAt
      ? parseVerificationInstant(candidate.provenance.expiresAt)
      : undefined;
    return (
      completedAt !== undefined &&
      issuedAt !== undefined &&
      completedAt <= instant &&
      issuedAt <= instant &&
      instant - completedAt <= cell.evidenceRequirements.maximumAgeMs &&
      (candidate.provenance.expiresAt === undefined ||
        (expiresAt !== undefined && instant < expiresAt))
    );
  });
  if (fresh.length === 0) {
    return Object.freeze({
      status: 'stale',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'stale',
          'All matching Evidence is expired, revoked, future-dated, or older than the Policy limit.',
          identityCompatible
        ),
      ]),
    });
  }

  const expectedArtifactKinds = uniqueVerificationText([
    ...cell.artifactKinds,
    ...cell.evidenceRequirements.requiredArtifactKinds,
  ]);
  const compatible = fresh.filter(
    (candidate) =>
      candidate.inputs.inputDigest === cell.inputDigest &&
      candidate.executableSnapshotDigest ===
        candidate.inputs.executableSnapshotDigest &&
      (!cell.inputKinds.includes('scenario-program') ||
        (Boolean(candidate.inputs.scenarioProgramDigest) &&
          candidate.inputs.scenarioProgramDigest ===
            candidate.scenario?.programDigest)) &&
      candidate.toolchain.toolchainDigest === cell.adapter.toolchainDigest &&
      candidate.run.surface === cell.surface &&
      candidate.run.frameworkTarget === cell.frameworkTarget &&
      candidate.run.browserEngine === cell.browserEngine &&
      sameCanonicalJson(candidate.run.viewport, cell.viewport) &&
      candidate.run.colorScheme === cell.colorScheme &&
      candidate.run.motion === cell.motion &&
      candidate.run.locale === cell.locale &&
      Number.isFinite(candidate.run.devicePixelRatio) &&
      candidate.run.devicePixelRatio > 0 &&
      Boolean(candidate.run.timezone.trim()) &&
      Boolean(candidate.run.fontSetDigest.trim()) &&
      Boolean(candidate.normalization.packageName.trim()) &&
      Boolean(candidate.normalization.packageVersion.trim()) &&
      Boolean(candidate.normalization.buildDigest.trim()) &&
      Boolean(candidate.normalization.toolchainDigest.trim()) &&
      Boolean(candidate.normalization.schemaDigest.trim()) &&
      candidate.targetPolicy.authority === 'verification-policy' &&
      candidate.targetPolicy.policyDigest === input.plan.policyDigest &&
      candidate.targetPolicy.semanticTargetId === cell.targetId &&
      (!candidate.artifacts.some(
        ({ kind }) => kind === 'screenshot' || kind === 'visual-diff'
      ) ||
        candidate.targetPolicy.capture !== 'forbidden-sensitive') &&
      (cell.controlProfileRef.digest === undefined ||
        candidate.controls.profileDigest === cell.controlProfileRef.digest) &&
      (cell.fixtureSetRef?.digest === undefined
        ? candidate.inputs.fixtureSetDigests.length === 0
        : sameTextSet(candidate.inputs.fixtureSetDigests, [
            cell.fixtureSetRef.digest,
          ])) &&
      candidate.inputs.baselineSetDigest === cell.baselineSetRef?.digest &&
      sameTextSet(
        candidate.result.appliedExemptionIds,
        cell.appliedExemptionIds
      ) &&
      cell.evidenceRequirements.acceptedTrust.includes(
        verified.acceptanceByEvidenceId.get(candidate.id)!.effectiveTrust!
      ) &&
      (!cell.evidenceRequirements.requireAttestation ||
        Boolean(
          verified.viewRecordByEvidenceId.get(candidate.id)?.attestationDigest
        )) &&
      expectedArtifactKinds.every((kind) =>
        candidate.artifacts.some((artifact) => artifact.kind === kind)
      )
  );
  if (compatible.length === 0) {
    return Object.freeze({
      status: 'incompatible',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'incompatible',
          'Evidence does not satisfy input, toolchain, trust, attestation, or artifact requirements.',
          fresh
        ),
      ]),
    });
  }
  const comparisonAnchor = compatible[0]!;
  if (
    compatible
      .slice(1)
      .some(
        (candidate) =>
          compareVerificationEvidenceCompatibility(comparisonAnchor, candidate)
            .compatibility !== 'exact-compatible'
      )
  ) {
    return Object.freeze({
      status: 'incompatible',
      acceptableEvidence: Object.freeze([]),
      issues: Object.freeze([
        statusIssue(
          cell,
          'incompatible',
          'Evidence attempts do not share one exact matrix and normalization identity.',
          compatible
        ),
      ]),
    });
  }

  const substantive = compatible.filter(
    (candidate) =>
      !(
        candidate.result.outcome === 'infrastructure-error' &&
        cell.retryPolicy.retryableOutcomes.includes(candidate.result.outcome)
      )
  );
  const substantiveOutcomes = new Set(
    substantive.map((candidate) => candidate.result.outcome)
  );
  if (substantiveOutcomes.size > 1) {
    return Object.freeze({
      status: 'unstable',
      acceptableEvidence: Object.freeze(compatible),
      issues: Object.freeze([
        statusIssue(
          cell,
          'unstable',
          'Attempts with the same cell input produced inconsistent outcomes.',
          compatible
        ),
      ]),
    });
  }

  const latest = compatible[compatible.length - 1]!;
  const latestSubstantive = substantive[substantive.length - 1];
  if (!latestSubstantive) {
    if (
      latest.result.outcome === 'infrastructure-error' &&
      cell.retryPolicy.retryableOutcomes.includes('infrastructure-error') &&
      compatible.length < cell.retryPolicy.maximumAttempts
    ) {
      return Object.freeze({
        status: 'pending',
        acceptableEvidence: Object.freeze(compatible),
        issues: Object.freeze([]),
      });
    }
    const status = outcomeStatus(latest.result.outcome);
    return Object.freeze({
      status,
      acceptableEvidence: Object.freeze(compatible),
      issues: Object.freeze([
        statusIssue(
          cell,
          status,
          `Latest acceptable attempt is ${latest.result.outcome}.`,
          compatible
        ),
      ]),
    });
  }
  if (
    latestSubstantive.result.outcome === 'passed' &&
    compatible.filter((candidate) => candidate.result.outcome === 'passed')
      .length < cell.retryPolicy.stabilitySamples
  ) {
    return Object.freeze({
      status: 'missing',
      acceptableEvidence: Object.freeze(compatible),
      issues: Object.freeze([
        statusIssue(
          cell,
          'missing',
          'The required number of stable passing samples is not available.',
          compatible
        ),
      ]),
    });
  }
  const status = outcomeStatus(latestSubstantive.result.outcome);
  return Object.freeze({
    status,
    acceptableEvidence: Object.freeze(compatible),
    issues:
      status === 'passed'
        ? Object.freeze([])
        : Object.freeze([
            statusIssue(
              cell,
              status,
              `Latest substantive attempt is ${latestSubstantive.result.outcome}.`,
              compatible
            ),
          ]),
  });
};

const inputIsStale = (input: EvaluateVerificationClosureInput): boolean =>
  input.targetRevision !== input.plan.targetRevision ||
  !sameCanonicalJson(
    input.targetPartitionRevisions,
    input.plan.targetPartitionRevisions
  ) ||
  input.scenarioRegistryDigest !== input.plan.scenarioRegistryDigest ||
  input.semanticSchemaDigest !== input.plan.semanticSchemaDigest ||
  input.providerSetDigest !== input.plan.providerSetDigest ||
  input.adapterRegistryDigest !== input.plan.adapterRegistryDigest ||
  input.impactDigest !== input.plan.impactDigest ||
  input.policyRevision !== input.plan.policyRevision ||
  input.policyDigest !== input.plan.policyDigest ||
  input.compilerDigest !== input.plan.compilerDigest ||
  input.plannerDigest !== input.plan.plannerDigest ||
  !sameTextSet(
    input.baselineSetDigests,
    expectedBaselineSetDigests(input.plan.cells)
  ) ||
  input.toolchainSetDigest !== expectedToolchainSetDigest(input.plan.cells);

/**
 * Recomputes Closure from immutable Plan/Evidence inputs. It does not persist,
 * approve, retry, or consult a clock.
 */
export const evaluateVerificationClosure = (
  input: EvaluateVerificationClosureInput
): VerificationClosureResult => {
  const instant = parseVerificationInstant(input.closureEvaluationInstant);
  if (instant === undefined) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-6002',
      message:
        'closureEvaluationInstant must be an explicit UTC RFC 3339 instant.',
    });
  }
  const { planDigest: _planDigest, ...planWithoutDigest } = input.plan;
  if (digestVerificationValue(planWithoutDigest) !== input.plan.planDigest) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-6002',
      message: 'VerificationPlan digest does not match its canonical content.',
    });
  }
  const evidenceIds = input.evidence.map((candidate) => candidate.id);
  if (
    evidenceIds.some((id) => !id.trim()) ||
    new Set(evidenceIds).size !== evidenceIds.length
  ) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-6002',
      message: 'Evidence ids must be non-empty and unique.',
    });
  }
  const verifiedEvidence = prepareVerifiedEvidence(input);
  if (verifiedEvidence.status === 'invalid') {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-6002',
      message: verifiedEvidence.message,
    });
  }

  const staleInput = inputIsStale(input);
  const statuses: Record<string, VerificationCellStatus> = Object.create(null);
  const issues: VerificationClosureIssue[] = staleInput
    ? [
        Object.freeze({
          status: 'closure-stale',
          message:
            'Closure inputs do not match the exact immutable Plan identity.',
          evidenceIds: Object.freeze([]),
        }),
      ]
    : [];
  const acceptableEvidence: VerificationEvidence[] = [];
  for (const cell of input.plan.cells) {
    const evaluation = evaluateCell(
      input,
      cell,
      instant,
      verifiedEvidence.context
    );
    statuses[cell.id] = evaluation.status;
    issues.push(...evaluation.issues);
    acceptableEvidence.push(...evaluation.acceptableEvidence);
  }

  const requiredStatuses = input.plan.cells
    .filter((cell) => cell.requirement === 'required')
    .map((cell) => statuses[cell.id]!);
  const verdict =
    staleInput || requiredStatuses.includes('stale')
      ? 'stale'
      : input.plan.status === 'ready' &&
          requiredStatuses.every((status) => status === 'passed')
        ? 'satisfied'
        : 'unsatisfied';
  const evidenceDigests = uniqueVerificationText(
    acceptableEvidence.map((candidate) => candidate.manifestDigest)
  );
  const appliedExemptionIds = uniqueVerificationText([
    ...input.plan.cells.flatMap((cell) => [...cell.appliedExemptionIds]),
    ...acceptableEvidence.flatMap((candidate) => [
      ...candidate.result.appliedExemptionIds,
    ]),
  ]);
  const evidenceSetDigest = digestVerificationValue(
    Object.freeze({
      verifiedViewDigest: input.verifiedEvidenceView?.viewDigest ?? null,
      evidence: [...input.evidence].sort(evidenceOrder).map((candidate) => ({
        id: candidate.id,
        manifestDigest: candidate.manifestDigest,
        verifiedViewRecordDigest:
          verifiedEvidence.context.viewRecordByEvidenceId.get(candidate.id)
            ?.recordDigest ?? null,
      })),
    })
  );
  const normalizedIssues = Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareVerificationText(left.cellId ?? '', right.cellId ?? '') ||
        compareVerificationText(left.status, right.status) ||
        compareVerificationText(left.message, right.message)
    )
  );
  const closureWithoutDigest = Object.freeze({
    workspaceId: input.plan.workspaceId,
    targetRevision: input.plan.targetRevision,
    targetPartitionRevisions: input.plan.targetPartitionRevisions,
    scenarioRegistryDigest: input.plan.scenarioRegistryDigest,
    semanticSchemaDigest: input.plan.semanticSchemaDigest,
    providerSetDigest: input.plan.providerSetDigest,
    adapterRegistryDigest: input.adapterRegistryDigest,
    impactDigest: input.plan.impactDigest,
    policyRevision: input.plan.policyRevision,
    policyDigest: input.plan.policyDigest,
    compilerDigest: input.plan.compilerDigest,
    plannerDigest: input.plan.plannerDigest,
    policyEvaluationInstant: input.plan.policyEvaluationInstant,
    planDigest: input.plan.planDigest,
    closureEvaluationInstant: input.closureEvaluationInstant,
    evidenceSetDigest,
    revocationRecordDigest: input.revocationRecordDigest,
    baselineSetDigests: uniqueVerificationText(input.baselineSetDigests),
    toolchainSetDigest: input.toolchainSetDigest,
    verdict,
    cellStatuses: Object.freeze(statuses),
    evidenceDigests,
    appliedExemptionIds,
    issues: normalizedIssues,
  });
  const closure: VerificationClosure = Object.freeze({
    ...closureWithoutDigest,
    closureDigest: digestVerificationValue(closureWithoutDigest),
  });
  return Object.freeze({ status: 'ready', closure });
};
