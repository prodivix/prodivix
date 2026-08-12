import {
  assertAgentModelEvaluationEvidenceArchiveFamilyPage,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentEvaluationExecutionReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationReviewCandidateRef,
  isAgentEvaluationReviewRasterScanReceipt,
  isAgentModelEvaluationAttempt,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationEvidenceArchiveFamily,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationInvocationTurnSetReceipt,
  type AgentEvaluationReviewCandidateRef,
  type AgentEvaluationReviewRasterScanReceipt,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES,
  AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANONICAL_BYTES,
  type AgentEvaluationCoordinatorReviewLeaseSource,
  type AgentEvaluationReviewLeaseEvidence,
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

const REVIEW_LEASE_FORMAT =
  'prodivix.g4-model-evaluation-review-lease' as const;
const REVIEW_LEASE_VERSION = 1 as const;
const maximumTurnsPerAttempt = 256;
const maximumLeaseDurationMs = 2 * 60 * 60 * 1_000;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const cursorPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

const REVIEW_LEASE_FAMILIES = Object.freeze([
  'attempts',
  'invocationTurnReceipts',
  'invocationTurnSetReceipts',
  'executionReceipts',
  'reviewRasterScanReceipts',
  'reviewCandidateRefs',
] as const satisfies readonly AgentEvaluationEvidenceArchiveFamily[]);

type ReviewLeaseFamily = (typeof REVIEW_LEASE_FAMILIES)[number];
type EnvironmentLedgerInput = Omit<
  CreateEnvironmentAgentEvaluationLedgerClientInput,
  'planDigest'
>;

type ReviewFamilyCommitment = Readonly<{
  family: ReviewLeaseFamily;
  familyIndex: number;
  expectedRecordCount: number;
  expectedRecordSetDigest: string;
  expectedSemanticDigest: string;
  expectedTotalBytes: number;
  firstOrderKey: string | null;
  lastOrderKey: string | null;
}>;

type ReviewLease = Readonly<{
  leaseId: string;
  reviewLeaseDigest: string;
  blindReviewMappingSetDigest: string;
  families: readonly ReviewFamilyCommitment[];
}>;

const fail = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const guarded = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return fail();
  }
};

const exactKeys = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.keys(value).length === required.length &&
  required.every((key) => Object.hasOwn(value, key));

const isCanonicalInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isCount = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const isOrderKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 8_192 &&
  value === value.trim();

const eligibleAttemptCount = (plan: AgentModelEvaluationPlan): number => {
  const subjectiveCaseIds = new Set(
    plan.concreteCases
      .filter(
        ({ access, subjectiveVisualQuality }) =>
          access === 'public' && subjectiveVisualQuality
      )
      .map(({ caseId }) => caseId)
  );
  const descriptors = planAgentModelEvaluationAttempts(plan).filter(
    ({ caseId }) => subjectiveCaseIds.has(caseId)
  );
  const caseTargetKeys = descriptors.map(
    ({ caseId, targetId }) => `${caseId}\u0000${targetId}`
  );
  if (
    descriptors.length < 1 ||
    descriptors.length > AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES ||
    new Set(caseTargetKeys).size !== descriptors.length
  ) {
    return fail();
  }
  return descriptors.length;
};

const rootForFamily = (
  family: ReviewLeaseFamily,
  value: Record<string, unknown>
): unknown => {
  switch (family) {
    case 'attempts':
      return value.eligibleAttemptSetDigest;
    case 'invocationTurnReceipts':
      return value.invocationTurnReceiptSetDigest;
    case 'invocationTurnSetReceipts':
      return value.invocationTurnSetReceiptSetDigest;
    case 'executionReceipts':
      return value.executionReceiptSetDigest;
    case 'reviewRasterScanReceipts':
      return value.reviewRasterScanReceiptSetDigest;
    case 'reviewCandidateRefs':
      return value.reviewCandidateRefSetDigest;
  }
};

const decodeFamily = (
  value: unknown,
  familyIndex: number,
  expectedAttempts: number,
  lease: Record<string, unknown>
): ReviewFamilyCommitment => {
  const family = REVIEW_LEASE_FAMILIES[familyIndex];
  if (
    family === undefined ||
    !exactKeys(value, [
      'family',
      'familyIndex',
      'expectedRecordCount',
      'expectedRecordSetDigest',
      'expectedSemanticDigest',
      'expectedTotalBytes',
      'firstOrderKey',
      'lastOrderKey',
    ]) ||
    value.family !== family ||
    value.familyIndex !== familyIndex ||
    !isCount(
      value.expectedRecordCount,
      family === 'invocationTurnReceipts'
        ? expectedAttempts * maximumTurnsPerAttempt
        : expectedAttempts
    ) ||
    (family === 'invocationTurnReceipts'
      ? value.expectedRecordCount < expectedAttempts
      : value.expectedRecordCount !== expectedAttempts) ||
    !isAgentCanonicalDigest(value.expectedRecordSetDigest) ||
    !isAgentCanonicalDigest(value.expectedSemanticDigest) ||
    value.expectedSemanticDigest !== rootForFamily(family, lease) ||
    !isCount(
      value.expectedTotalBytes,
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANONICAL_BYTES
    ) ||
    (value.expectedRecordCount === 0
      ? value.firstOrderKey !== null || value.lastOrderKey !== null
      : !isOrderKey(value.firstOrderKey) ||
        !isOrderKey(value.lastOrderKey) ||
        compareUnicodeCodePoints(value.firstOrderKey, value.lastOrderKey) > 0)
  ) {
    return fail();
  }
  return Object.freeze({
    family,
    familyIndex,
    expectedRecordCount: value.expectedRecordCount,
    expectedRecordSetDigest: value.expectedRecordSetDigest,
    expectedSemanticDigest: value.expectedSemanticDigest,
    expectedTotalBytes: value.expectedTotalBytes,
    firstOrderKey: value.firstOrderKey as string | null,
    lastOrderKey: value.lastOrderKey as string | null,
  });
};

const decodeLease = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): ReviewLease => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'leaseId',
      'planDigest',
      'repositoryCommit',
      'reviewLeaseDigest',
      'machinePhaseDigest',
      'eligibleAttemptSetDigest',
      'invocationTurnReceiptSetDigest',
      'invocationTurnSetReceiptSetDigest',
      'executionReceiptSetDigest',
      'reviewRasterScanReceiptSetDigest',
      'reviewCandidateRefSetDigest',
      'blindReviewMappingSetDigest',
      'randomizedPresentationPolicyDigest',
      'families',
      'totalRecordCount',
      'totalRecordBytes',
      'createdAt',
      'expiresAt',
      'replayed',
    ]) ||
    value.format !== REVIEW_LEASE_FORMAT ||
    value.version !== REVIEW_LEASE_VERSION ||
    typeof value.leaseId !== 'string' ||
    !identityPattern.test(value.leaseId) ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !isAgentCanonicalDigest(value.reviewLeaseDigest) ||
    !isAgentCanonicalDigest(value.machinePhaseDigest) ||
    !isAgentCanonicalDigest(value.eligibleAttemptSetDigest) ||
    !isAgentCanonicalDigest(value.invocationTurnReceiptSetDigest) ||
    !isAgentCanonicalDigest(value.invocationTurnSetReceiptSetDigest) ||
    !isAgentCanonicalDigest(value.executionReceiptSetDigest) ||
    !isAgentCanonicalDigest(value.reviewRasterScanReceiptSetDigest) ||
    !isAgentCanonicalDigest(value.reviewCandidateRefSetDigest) ||
    !isAgentCanonicalDigest(value.blindReviewMappingSetDigest) ||
    value.randomizedPresentationPolicyDigest !==
      plan.graderPlan.randomizedPresentationPolicyDigest ||
    !Array.isArray(value.families) ||
    value.families.length !== REVIEW_LEASE_FAMILIES.length ||
    !isCount(
      value.totalRecordCount,
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES *
        (maximumTurnsPerAttempt + REVIEW_LEASE_FAMILIES.length - 1)
    ) ||
    !isCount(
      value.totalRecordBytes,
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANONICAL_BYTES
    ) ||
    !isCanonicalInstant(value.createdAt) ||
    !isCanonicalInstant(value.expiresAt) ||
    typeof value.replayed !== 'boolean'
  ) {
    return fail();
  }
  const createdAtMs = Date.parse(value.createdAt);
  const expiresAtMs = Date.parse(value.expiresAt);
  if (
    createdAtMs < Date.parse(plan.plannedAt) ||
    createdAtMs > Date.parse(plan.expiresAt) ||
    expiresAtMs <= createdAtMs ||
    expiresAtMs > Date.parse(plan.expiresAt) ||
    expiresAtMs - createdAtMs > maximumLeaseDurationMs
  ) {
    return fail();
  }
  const digestBase = Object.freeze({
    format: value.format,
    version: value.version,
    planDigest: value.planDigest,
    repositoryCommit: value.repositoryCommit,
    machinePhaseDigest: value.machinePhaseDigest,
    eligibleAttemptSetDigest: value.eligibleAttemptSetDigest,
    invocationTurnReceiptSetDigest: value.invocationTurnReceiptSetDigest,
    invocationTurnSetReceiptSetDigest: value.invocationTurnSetReceiptSetDigest,
    executionReceiptSetDigest: value.executionReceiptSetDigest,
    reviewRasterScanReceiptSetDigest: value.reviewRasterScanReceiptSetDigest,
    reviewCandidateRefSetDigest: value.reviewCandidateRefSetDigest,
    blindReviewMappingSetDigest: value.blindReviewMappingSetDigest,
    randomizedPresentationPolicyDigest:
      value.randomizedPresentationPolicyDigest,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  });
  if (digestAgentCanonicalValue(digestBase) !== value.reviewLeaseDigest) {
    return fail();
  }
  const expectedAttempts = eligibleAttemptCount(plan);
  const families = Object.freeze(
    value.families.map((family, index) =>
      decodeFamily(family, index, expectedAttempts, value)
    )
  );
  if (
    families.reduce(
      (total, family) => total + family.expectedRecordCount,
      0
    ) !== value.totalRecordCount ||
    families.reduce((total, family) => total + family.expectedTotalBytes, 0) !==
      value.totalRecordBytes
  ) {
    return fail();
  }
  return Object.freeze({
    leaseId: value.leaseId,
    reviewLeaseDigest: value.reviewLeaseDigest,
    blindReviewMappingSetDigest: value.blindReviewMappingSetDigest,
    families,
  });
};

const readFamily = async (
  client: AgentEvaluationLedgerClient,
  lease: ReviewLease,
  commitment: ReviewFamilyCommitment
): Promise<readonly unknown[]> => {
  const values: unknown[] = [];
  const recordSet =
    createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
  const semantic =
    createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
      commitment.family
    );
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pageOrdinal = 0;
  let firstRecordOrdinal = 0;
  let totalBytes = 0;
  let previousOrderKey: string | null = null;
  do {
    const raw = await client.getReviewLeaseFamilyPage(
      lease.leaseId,
      commitment.family,
      cursor
    );
    if (raw === null) {
      if (commitment.expectedRecordCount !== 0 || firstRecordOrdinal !== 0) {
        return fail();
      }
      break;
    }
    const page = guarded(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        raw,
        lease.leaseId,
        commitment.family,
        pageOrdinal,
        firstRecordOrdinal,
        previousOrderKey
      )
    );
    for (const record of page.records) {
      values.push(record.value);
      recordSet.append(record.recordDigest);
      semantic.append(record.value);
      totalBytes += record.byteLength;
    }
    firstRecordOrdinal += page.recordCount;
    if (
      firstRecordOrdinal > commitment.expectedRecordCount ||
      totalBytes > commitment.expectedTotalBytes ||
      (pageOrdinal === 0 &&
        page.records[0]!.orderKey !== commitment.firstOrderKey) ||
      (page.nextCursor === undefined &&
        (firstRecordOrdinal !== commitment.expectedRecordCount ||
          page.records.at(-1)!.orderKey !== commitment.lastOrderKey))
    ) {
      return fail();
    }
    previousOrderKey = page.records.at(-1)!.orderKey;
    cursor = page.nextCursor;
    if (
      cursor !== undefined &&
      (!cursorPattern.test(cursor) || seenCursors.has(cursor))
    ) {
      return fail();
    }
    if (cursor !== undefined) seenCursors.add(cursor);
    pageOrdinal += 1;
  } while (cursor !== undefined);
  if (
    values.length !== commitment.expectedRecordCount ||
    totalBytes !== commitment.expectedTotalBytes ||
    recordSet.finalize() !== commitment.expectedRecordSetDigest ||
    guarded(() => semantic.finalize()) !== commitment.expectedSemanticDigest
  ) {
    return fail();
  }
  return Object.freeze(values);
};

const typedValues = <T>(
  values: readonly unknown[],
  guard: (value: unknown) => boolean
): readonly T[] => {
  if (!values.every(guard)) return fail();
  return values as readonly T[];
};

const loadEvidence = async (
  client: AgentEvaluationLedgerClient,
  plan: AgentModelEvaluationPlan,
  lease: ReviewLease
): Promise<AgentEvaluationReviewLeaseEvidence> => {
  const values = new Map<ReviewLeaseFamily, readonly unknown[]>();
  for (const commitment of lease.families) {
    values.set(commitment.family, await readFamily(client, lease, commitment));
  }
  if (values.size !== REVIEW_LEASE_FAMILIES.length) return fail();
  return Object.freeze({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    reviewLeaseDigest: lease.reviewLeaseDigest,
    blindReviewMappingSetDigest: lease.blindReviewMappingSetDigest,
    attempts: typedValues<AgentModelEvaluationAttempt>(
      values.get('attempts')!,
      isAgentModelEvaluationAttempt
    ),
    invocationTurnReceipts: typedValues<AgentEvaluationInvocationTurnReceipt>(
      values.get('invocationTurnReceipts')!,
      isAgentEvaluationInvocationTurnReceipt
    ),
    invocationTurnSetReceipts:
      typedValues<AgentEvaluationInvocationTurnSetReceipt>(
        values.get('invocationTurnSetReceipts')!,
        isAgentEvaluationInvocationTurnSetReceipt
      ),
    executionReceipts: typedValues<AgentEvaluationExecutionReceipt>(
      values.get('executionReceipts')!,
      isAgentEvaluationExecutionReceipt
    ),
    reviewRasterScanReceipts:
      typedValues<AgentEvaluationReviewRasterScanReceipt>(
        values.get('reviewRasterScanReceipts')!,
        (value) =>
          isAgentEvaluationReviewRasterScanReceipt(
            value as AgentEvaluationReviewRasterScanReceipt
          )
      ),
    reviewCandidateRefs: typedValues<AgentEvaluationReviewCandidateRef>(
      values.get('reviewCandidateRefs')!,
      (value) =>
        isAgentEvaluationReviewCandidateRef(
          value as AgentEvaluationReviewCandidateRef
        )
    ),
  });
};

const openClient = (
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

/** Loads only the immutable, server-sealed public subjective review phase. */
export const createEnvironmentAgentEvaluationCoordinatorReviewLeaseSource = (
  input: EnvironmentLedgerInput = {}
): AgentEvaluationCoordinatorReviewLeaseSource =>
  Object.freeze({
    open: async ({
      plan,
      expectedReviewLeaseDigest,
    }: Parameters<AgentEvaluationCoordinatorReviewLeaseSource['open']>[0]) => {
      const client = openClient(plan, input);
      const lease = decodeLease(await client.openReviewLease(), plan);
      if (
        expectedReviewLeaseDigest !== undefined &&
        (!isAgentCanonicalDigest(expectedReviewLeaseDigest) ||
          lease.reviewLeaseDigest !== expectedReviewLeaseDigest)
      ) {
        return fail();
      }
      const evidence = await loadEvidence(client, plan, lease);
      if (
        !sameCanonicalJson(
          Object.keys(evidence).sort(compareUnicodeCodePoints),
          [
            'attempts',
            'blindReviewMappingSetDigest',
            'executionReceipts',
            'invocationTurnReceipts',
            'invocationTurnSetReceipts',
            'planDigest',
            'repositoryCommit',
            'reviewCandidateRefs',
            'reviewLeaseDigest',
            'reviewRasterScanReceipts',
          ].sort(compareUnicodeCodePoints)
        )
      ) {
        return fail();
      }
      return evidence;
    },
  });
