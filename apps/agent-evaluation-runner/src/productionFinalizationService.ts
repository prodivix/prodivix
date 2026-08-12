import {
  digestAgentCanonicalValue,
  isAgentEvaluationValidatedHumanReviewArtifact,
  isAgentEvaluationValidatedHumanMetricObservation,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
  type AgentEvaluationValidatedHumanReviewArtifact,
  type AgentHoldoutExecutionReceipt,
  type AgentHumanReviewReport,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentEvaluationCoordinatorFinalizationService,
  AgentEvaluationCoordinatorHoldoutSealer,
  AgentEvaluationFinalizationIntent,
  AgentEvaluationFinalizationInspection,
  AgentEvaluationFinalizationReport,
} from './coordinator';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type AgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

type EnvironmentLedgerInput = Omit<
  CreateEnvironmentAgentEvaluationLedgerClientInput,
  'planDigest'
>;

const missingFactPattern = /^[a-z0-9][a-z0-9-]{0,127}$/u;

const fail = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const isCanonicalInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isMissingFacts = (
  value: unknown,
  allowEmpty: boolean
): value is string[] =>
  Array.isArray(value) &&
  value.length <= 128 &&
  (allowEmpty || value.length > 0) &&
  value.every(
    (entry) => typeof entry === 'string' && missingFactPattern.test(entry)
  ) &&
  new Set(value).size === value.length &&
  sameCanonicalJson(value, [...value].sort(compareUnicodeCodePoints));

const clientFor = (
  plan: AgentModelEvaluationPlan,
  input: EnvironmentLedgerInput
): AgentEvaluationLedgerClient => {
  const client = createEnvironmentAgentEvaluationLedgerClient({
    ...input,
    planDigest: plan.planDigest,
  });
  if (
    client.scope.planDigest !== plan.planDigest ||
    client.scope.repositoryCommit !== plan.repositoryCommit
  ) {
    return fail();
  }
  return client;
};

const decodeInspection = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): AgentEvaluationFinalizationInspection => {
  const humanReviewReport = isPlainObject(value)
    ? (value.humanReviewReport as AgentHumanReviewReport | undefined)
    : undefined;
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'repositoryCommit',
        'missingFacts',
        'reviewedAttempts',
        'validatedHumanReviewArtifacts',
        'validatedHumanMetricObservations',
        'inspectionDigest',
      ],
      ['humanReviewReport']
    ) ||
    value.format !== 'prodivix.g4-model-evaluation-finalization-inspection' ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !isMissingFacts(value.missingFacts, true) ||
    !Array.isArray(value.reviewedAttempts) ||
    value.reviewedAttempts.length > 18 ||
    !value.reviewedAttempts.every(isAgentModelEvaluationAttempt) ||
    !Array.isArray(value.validatedHumanReviewArtifacts) ||
    value.validatedHumanReviewArtifacts.length > 1 ||
    (humanReviewReport !== undefined &&
      !isAgentHumanReviewReport(humanReviewReport)) ||
    !value.validatedHumanReviewArtifacts.every((artifact) =>
      isAgentEvaluationValidatedHumanReviewArtifact(
        artifact as AgentEvaluationValidatedHumanReviewArtifact,
        humanReviewReport
      )
    ) ||
    !Array.isArray(value.validatedHumanMetricObservations) ||
    !value.validatedHumanMetricObservations.every(
      isAgentEvaluationValidatedHumanMetricObservation
    ) ||
    typeof value.inspectionDigest !== 'string'
  ) {
    return fail();
  }
  const { inspectionDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== inspectionDigest) return fail();
  return value as AgentEvaluationFinalizationInspection;
};

const decodeFinalization = (
  value: unknown,
  plan: AgentModelEvaluationPlan,
  completedAt: string
): AgentEvaluationFinalizationReport => {
  const manifest = isPlainObject(value)
    ? (value.manifest as AgentModelEvaluationManifest | undefined)
    : undefined;
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'repositoryCommit',
        'outcome',
        'missingFacts',
        'completedAt',
        'reportDigest',
      ],
      ['manifest']
    ) ||
    value.format !== 'prodivix.g4-model-evaluation-finalization' ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    value.completedAt !== completedAt ||
    !isCanonicalInstant(value.completedAt) ||
    !isMissingFacts(value.missingFacts, manifest !== undefined) ||
    typeof value.reportDigest !== 'string'
  ) {
    return fail();
  }
  if (manifest === undefined) {
    if (value.outcome !== 'incomplete' || value.missingFacts.length === 0) {
      return fail();
    }
  } else if (
    !isAgentModelEvaluationManifest(manifest) ||
    manifest.planDigest !== plan.planDigest ||
    manifest.completedAt !== completedAt ||
    value.outcome !== manifest.outcome ||
    value.missingFacts.length !== 0
  ) {
    return fail();
  }
  const { reportDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== reportDigest) return fail();
  return value as AgentEvaluationFinalizationReport;
};

const decodeFinalizationIntent = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): AgentEvaluationFinalizationIntent => {
  if (
    !exactKeys(value, [
      'planDigest',
      'repositoryCommit',
      'completedAt',
      'intentDigest',
      'replayed',
    ]) ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !isCanonicalInstant(value.completedAt) ||
    typeof value.intentDigest !== 'string' ||
    typeof value.replayed !== 'boolean' ||
    value.intentDigest !==
      digestAgentCanonicalValue({
        format: 'prodivix.g4-model-evaluation-finalization-intent',
        version: 1,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        completedAt: value.completedAt,
      })
  ) {
    return fail();
  }
  return value as AgentEvaluationFinalizationIntent;
};

const decodeHoldoutClosure = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): 'pending' | 'sealed' => {
  if (exactKeys(value, ['status', 'missingFacts'])) {
    if (
      value.status !== 'pending' ||
      !isMissingFacts(value.missingFacts, false)
    ) {
      return fail();
    }
    return 'pending';
  }
  if (!exactKeys(value, ['status', 'receipt']) || value.status !== 'sealed') {
    return fail();
  }
  const receipt = value.receipt as AgentHoldoutExecutionReceipt;
  if (
    !isAgentHoldoutExecutionReceipt(receipt) ||
    receipt.planDigest !== plan.planDigest
  ) {
    return fail();
  }
  return 'sealed';
};

/** Uses the Backend-owned protected-evidence transaction and returns no facts. */
export const createEnvironmentAgentEvaluationCoordinatorHoldoutSealer = (
  input: EnvironmentLedgerInput = {}
): AgentEvaluationCoordinatorHoldoutSealer =>
  Object.freeze({
    sealIfComplete: async ({
      plan,
    }: Parameters<
      AgentEvaluationCoordinatorHoldoutSealer['sealIfComplete']
    >[0]) =>
      decodeHoldoutClosure(
        await clientFor(plan, input).sealHoldoutClosure(
          Object.freeze({ plan })
        ),
        plan
      ),
  });

/** Uses bounded Backend inspection and atomic final report construction. */
export const createEnvironmentAgentEvaluationCoordinatorFinalizationService = (
  input: EnvironmentLedgerInput = {}
): AgentEvaluationCoordinatorFinalizationService =>
  Object.freeze({
    resolveIntent: async ({
      plan,
      proposedCompletedAt,
    }: Parameters<
      AgentEvaluationCoordinatorFinalizationService['resolveIntent']
    >[0]) => {
      if (!isCanonicalInstant(proposedCompletedAt)) return fail();
      const client = clientFor(plan, input);
      try {
        return decodeFinalizationIntent(
          await client.putFinalizationIntent(
            Object.freeze({ plan, completedAt: proposedCompletedAt })
          ),
          plan
        );
      } catch (putFailure) {
        try {
          return decodeFinalizationIntent(
            await client.getFinalizationIntent(),
            plan
          );
        } catch {
          throw putFailure;
        }
      }
    },
    inspect: async ({
      plan,
    }: Parameters<
      AgentEvaluationCoordinatorFinalizationService['inspect']
    >[0]) =>
      decodeInspection(
        await clientFor(plan, input).inspectFinalization(
          Object.freeze({ plan })
        ),
        plan
      ),
    finalize: async ({
      plan,
      completedAt,
      reviewLeaseDigest,
      validatedHumanReviewArtifactDigest,
      validatedHumanMetricObservationSetDigest,
    }: Parameters<
      AgentEvaluationCoordinatorFinalizationService['finalize']
    >[0]) =>
      decodeFinalization(
        await clientFor(plan, input).putFinalization(
          Object.freeze({
            plan,
            completedAt,
            reviewLeaseDigest,
            validatedHumanReviewArtifactDigest,
            validatedHumanMetricObservationSetDigest,
          })
        ),
        plan,
        completedAt
      ),
  });
