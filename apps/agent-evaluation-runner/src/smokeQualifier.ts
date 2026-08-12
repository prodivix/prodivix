import {
  createAgentEvaluationEndpointSmokeDispatchIntent,
  createAgentEvaluationEndpointSmokeReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  createAgentEvaluationEndpointSmokeValidationFailureReceipt,
  createAgentEvaluationSourceReceipt,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  createUnknownAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationCostCalculationSource,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationEndpointSmokeDispatchIntentSet,
  digestAgentEvaluationEndpointSmokeReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet,
  digestAgentEvaluationEndpointSmokeTransportReceiptSet,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolAad,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportReceipt,
  matchAgentEvaluationEndpointSmokeAuthorityFacts,
  normalizeAgentCosts,
  qualifiesAgentEvaluationEndpointSmokeSet,
  priceAgentUsage,
  validateAgentEvaluationEndpointSmokeTargetBinding,
  validateAgentModelEvaluationPlan,
  type AgentBudgetDemand,
  type AgentBudgetReservation,
  type AgentBudgetSettlement,
  type AgentCost,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeFailureCategory,
  type AgentEvaluationEndpointSmokeReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolReceipt,
  type AgentEvaluationEndpointSmokeTarget,
  type AgentEvaluationEndpointSmokeValidationFailureReceipt,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationTransportReceipt,
  type AgentModelEvaluationPlan,
  type AgentUsageVector,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationCoordinatorSmokeQualifier,
  AgentEvaluationSmokeQualificationReport,
} from './coordinator';
import { createAgentEvaluationPlanPricingSourceReceipt } from './attemptAccounting';
import {
  decodeAgentEvaluationFrozenRunConfig,
  type AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile,
  type AgentEvaluationFrozenPricingAuthority,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';

export const AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_NORMALIZED_RESULT_BYTES =
  64 * 1_024;
export const AGENT_EVALUATION_ENDPOINT_SMOKE_ESTIMATED_INPUT_TOKENS = 128;
export const AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_OUTPUT_TOKENS = 16;
export const AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_ELAPSED_MS_PER_TARGET = 120_000;
const endpointSmokeExpectedText = 'PRODIVIX_G4_SMOKE_OK' as const;

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const safeCount = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const addCount = (left: number, right: number, label: string): number => {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} exceeded its safe-integer ceiling.`);
  }
  return value;
};

export type AgentEvaluationEndpointSmokeNormalizedResult = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-normalized-result';
  version: 1;
  smokeTargetId: string;
  invocationId: string;
  transportReceiptDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  outputText: typeof endpointSmokeExpectedText | string;
  resolvedModelId: string;
  resolvedModelVersion?: string;
  reportedUsage: AgentUsageVector;
  observedAt: Instant;
  resultDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationEndpointSmokeNormalizedResultInput = Omit<
  AgentEvaluationEndpointSmokeNormalizedResult,
  'format' | 'version' | 'resultDigest'
>;

export const createAgentEvaluationEndpointSmokeNormalizedResult = (
  input: CreateAgentEvaluationEndpointSmokeNormalizedResultInput
): AgentEvaluationEndpointSmokeNormalizedResult => {
  const reportedUsage = createAgentUsageVector(input.reportedUsage.amounts);
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-endpoint-smoke-normalized-result' as const,
    version: 1 as const,
    ...input,
    reportedUsage,
  });
  const result = Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationEndpointSmokeNormalizedResult(result)) {
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result is invalid.'
    );
  }
  return result;
};

export const isAgentEvaluationEndpointSmokeNormalizedResult = (
  value: unknown
): value is AgentEvaluationEndpointSmokeNormalizedResult => {
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'smokeTargetId',
        'invocationId',
        'transportReceiptDigest',
        'responseDigest',
        'normalizedEventSetDigest',
        'outputText',
        'resolvedModelId',
        'reportedUsage',
        'observedAt',
        'resultDigest',
      ],
      ['resolvedModelVersion']
    )
  ) {
    return false;
  }
  const result = value as AgentEvaluationEndpointSmokeNormalizedResult;
  const { resultDigest: _resultDigest, ...base } = result;
  try {
    return (
      result.format ===
        'prodivix.agent-evaluation-endpoint-smoke-normalized-result' &&
      result.version === 1 &&
      isAgentControlIdentity(result.smokeTargetId) &&
      isAgentControlIdentity(result.invocationId) &&
      isAgentCanonicalDigest(result.transportReceiptDigest) &&
      isAgentCanonicalDigest(result.responseDigest) &&
      isAgentCanonicalDigest(result.normalizedEventSetDigest) &&
      typeof result.outputText === 'string' &&
      result.outputText.length <= 256 &&
      isAgentControlIdentity(result.resolvedModelId) &&
      (result.resolvedModelVersion === undefined ||
        isAgentControlIdentity(result.resolvedModelVersion)) &&
      sameCanonicalJson(
        result.reportedUsage,
        createAgentUsageVector(result.reportedUsage.amounts)
      ) &&
      isAgentControlInstant(result.observedAt) &&
      result.resultDigest === digestAgentCanonicalValue(base)
    );
  } catch {
    return false;
  }
};

export const encodeAgentEvaluationEndpointSmokeNormalizedResult = (
  result: AgentEvaluationEndpointSmokeNormalizedResult
): Uint8Array => {
  if (!isAgentEvaluationEndpointSmokeNormalizedResult(result)) {
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result is invalid.'
    );
  }
  const bytes = new TextEncoder().encode(canonicalJsonText(result));
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength >
      AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_NORMALIZED_RESULT_BYTES
  ) {
    bytes.fill(0);
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result exceeded its byte ceiling.'
    );
  }
  return bytes;
};

export const decodeAgentEvaluationEndpointSmokeNormalizedResult = (
  bytes: Uint8Array
): AgentEvaluationEndpointSmokeNormalizedResult => {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 1 ||
    bytes.byteLength >
      AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_NORMALIZED_RESULT_BYTES
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result bytes are invalid.'
    );
  }
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
    if (canonicalJsonText(value) !== text) throw new TypeError('non-canonical');
  } catch {
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result bytes are invalid.'
    );
  }
  if (!isAgentEvaluationEndpointSmokeNormalizedResult(value)) {
    throw new TypeError(
      'Evaluation endpoint-smoke normalized result bytes are invalid.'
    );
  }
  return value;
};

export type AgentEvaluationEndpointSmokeTargetAuthority = Readonly<{
  target: AgentEvaluationEndpointSmokeTarget;
  pricing: AgentEvaluationFrozenPricingAuthority;
  expectedText: typeof endpointSmokeExpectedText;
  estimatedUsage: AgentUsageVector;
  maximumElapsedMs: number;
  authorityDigest: CanonicalDigest;
}>;

export type AgentEvaluationEndpointSmokeQualificationAuthority = Readonly<{
  configurationDigest: CanonicalDigest;
  configuration: AgentEvaluationProductionFrozenRunConfig;
  plan: AgentModelEvaluationPlan;
  targets: readonly AgentEvaluationEndpointSmokeTargetAuthority[];
  responseSpoolEncryption: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
  authorityDigest: CanonicalDigest;
}>;

export interface AgentEvaluationEndpointSmokeAuthorityResolver {
  resolve(
    input: Readonly<{ config: unknown; plan: AgentModelEvaluationPlan }>
  ):
    | AgentEvaluationEndpointSmokeQualificationAuthority
    | Promise<AgentEvaluationEndpointSmokeQualificationAuthority>;
}

export type AgentEvaluationEndpointSmokeTransportObservation =
  | Readonly<{
      kind: 'normalized';
      receipt: AgentEvaluationTransportReceipt;
      result: AgentEvaluationEndpointSmokeNormalizedResult;
    }>
  | Readonly<{
      kind: 'provider-response-invalid' | 'failed';
      receipt: AgentEvaluationTransportReceipt;
    }>;

export interface AgentEvaluationEndpointSmokePreparedTransport {
  readonly endpointId: string;
  readonly requestDigest: CanonicalDigest;
  readonly requestBodyDigest: CanonicalDigest;
  readonly requestBytes: number;
  execute(
    input: Readonly<{
      intent: AgentEvaluationEndpointSmokeDispatchIntent;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationEndpointSmokeTransportObservation>;
}

/**
 * Production implementations own callback-bound credentials and an
 * address-pinned HTTPS/local-loopback client. Preparation is pure and must not
 * resolve credentials or dispatch network traffic.
 */
export interface AgentEvaluationEndpointSmokeTransportFactory {
  prepare(
    input: Readonly<{
      config: AgentEvaluationProductionFrozenRunConfig;
      authority: AgentEvaluationEndpointSmokeTargetAuthority;
    }>
  ):
    | AgentEvaluationEndpointSmokePreparedTransport
    | Promise<AgentEvaluationEndpointSmokePreparedTransport>;
}

export interface AgentEvaluationEndpointSmokeResultSpoolCipher {
  encrypt(
    input: Readonly<{
      profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
      aad: AgentEvaluationEndpointSmokeResultSpoolAad;
      canonicalResultBytes: Uint8Array;
    }>
  ): Promise<AgentEvaluationProviderResultSpoolEnvelope>;
  useDecrypted<T>(
    input: Readonly<{
      profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
      aad: AgentEvaluationEndpointSmokeResultSpoolAad;
      envelope: AgentEvaluationProviderResultSpoolEnvelope;
    }>,
    callback: (canonicalResultBytes: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export type AgentEvaluationEndpointSmokeJournalTurn =
  | Readonly<{
      state: 'intent-recorded';
      intent: AgentEvaluationEndpointSmokeDispatchIntent;
      turnDigest: CanonicalDigest;
    }>
  | Readonly<{
      state: 'closed';
      intent: AgentEvaluationEndpointSmokeDispatchIntent;
      transportReceipt: AgentEvaluationTransportReceipt;
      resultSpoolReceipt?: AgentEvaluationEndpointSmokeResultSpoolReceipt;
      closedAt: Instant;
      turnDigest: CanonicalDigest;
    }>;

export type AgentEvaluationEndpointSmokeEncryptedResultSpool = Readonly<{
  aad: AgentEvaluationEndpointSmokeResultSpoolAad;
  envelope: AgentEvaluationProviderResultSpoolEnvelope;
  receipt: AgentEvaluationEndpointSmokeResultSpoolReceipt;
}>;

export type AgentEvaluationEndpointSmokeEvidenceCommit = Readonly<{
  configurationDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  reservation: AgentBudgetReservation;
  settlement: AgentBudgetSettlement;
  dispatchIntents: readonly AgentEvaluationEndpointSmokeDispatchIntent[];
  transportReceipts: readonly AgentEvaluationTransportReceipt[];
  resultSpoolReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[];
  resultSpoolDispositionReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[];
  endpointSmokeReceipts: readonly AgentEvaluationEndpointSmokeReceipt[];
  validationFailureReceipts: readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[];
  sourceReceipts: readonly AgentEvaluationSourceReceipt[];
  report: AgentEvaluationSmokeQualificationReport;
}>;

/** Backend/PG must implement every method with canonical same-value replay. */
export interface AgentEvaluationEndpointSmokeJournal {
  loadCommit(
    input: Readonly<{
      planDigest: CanonicalDigest;
      repositoryCommit: string;
    }>
  ): Promise<AgentEvaluationEndpointSmokeEvidenceCommit | undefined>;
  reserveBudget(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      reservationId: string;
      demand: AgentBudgetDemand;
      demandDigest: CanonicalDigest;
    }>
  ): Promise<AgentBudgetReservation>;
  listTurns(
    input: Readonly<{
      planDigest: CanonicalDigest;
      repositoryCommit: string;
    }>
  ): Promise<readonly AgentEvaluationEndpointSmokeJournalTurn[]>;
  putDispatchIntent(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      target: AgentEvaluationEndpointSmokeTarget;
      intent: AgentEvaluationEndpointSmokeDispatchIntent;
    }>
  ): Promise<AgentEvaluationEndpointSmokeJournalTurn>;
  closeTransport(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      target: AgentEvaluationEndpointSmokeTarget;
      intent: AgentEvaluationEndpointSmokeDispatchIntent;
      transportReceipt: AgentEvaluationTransportReceipt;
      encryptedResultSpool?: AgentEvaluationEndpointSmokeEncryptedResultSpool;
      closedAt: Instant;
    }>
  ): Promise<AgentEvaluationEndpointSmokeJournalTurn>;
  readEncryptedResultSpool(
    input: Readonly<{
      planDigest: CanonicalDigest;
      repositoryCommit: string;
      smokeTargetId: string;
      expectedSpoolReceiptDigest: CanonicalDigest;
    }>
  ): Promise<AgentEvaluationEndpointSmokeEncryptedResultSpool>;
  commitEvidence(
    input: AgentEvaluationEndpointSmokeEvidenceCommit
  ): Promise<AgentEvaluationEndpointSmokeEvidenceCommit>;
}

export type CreateAgentEvaluationEndpointSmokeQualifierInput = Readonly<{
  authorityResolver: AgentEvaluationEndpointSmokeAuthorityResolver;
  transportFactory: AgentEvaluationEndpointSmokeTransportFactory;
  spoolCipher: AgentEvaluationEndpointSmokeResultSpoolCipher;
  journal: AgentEvaluationEndpointSmokeJournal;
  now: () => Instant;
}>;

const estimatedUsageFor = (): AgentUsageVector =>
  createAgentUsageVector([
    {
      unit: 'text-token-input',
      logicalAmount: String(
        AGENT_EVALUATION_ENDPOINT_SMOKE_ESTIMATED_INPUT_TOKENS
      ),
      billableAmount: String(
        AGENT_EVALUATION_ENDPOINT_SMOKE_ESTIMATED_INPUT_TOKENS
      ),
      confidence: 'estimated',
    },
    {
      unit: 'text-token-output',
      logicalAmount: String(
        AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_OUTPUT_TOKENS
      ),
      billableAmount: String(
        AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_OUTPUT_TOKENS
      ),
      confidence: 'estimated',
    },
  ]);

export const createAgentEvaluationFrozenRunConfigSmokeAuthorityResolver = (
  input: Readonly<{
    maximumElapsedMsPerTarget?: number;
  }> = {}
): AgentEvaluationEndpointSmokeAuthorityResolver => {
  const maximumElapsedMs =
    input.maximumElapsedMsPerTarget ??
    AGENT_EVALUATION_ENDPOINT_SMOKE_MAXIMUM_ELAPSED_MS_PER_TARGET;
  if (!safeCount(maximumElapsedMs) || maximumElapsedMs < 1) {
    throw new TypeError(
      'Evaluation endpoint-smoke elapsed-time authority is invalid.'
    );
  }
  const resolver: AgentEvaluationEndpointSmokeAuthorityResolver = {
    resolve({
      config,
      plan,
    }: Readonly<{
      config: unknown;
      plan: AgentModelEvaluationPlan;
    }>) {
      if (validateAgentModelEvaluationPlan(plan).length > 0) {
        throw new TypeError('Evaluation endpoint-smoke plan is invalid.');
      }
      const decoded = decodeAgentEvaluationFrozenRunConfig(config, {
        clock: () => plan.plannedAt,
        expectedRepositoryCommit: plan.repositoryCommit,
      });
      if (
        decoded.purpose !== 'production' ||
        !sameCanonicalJson(decoded.plan, plan) ||
        plan.endpointSmokeTargets.length !== 5
      ) {
        throw new TypeError(
          'Evaluation endpoint-smoke production configuration drifted.'
        );
      }
      const frozen = decoded as AgentEvaluationProductionFrozenRunConfig;
      const pricingAuthorities = Object.values(frozen.pricingAuthorities);
      const estimatedUsage = estimatedUsageFor();
      const targets = Object.freeze(
        plan.endpointSmokeTargets
          .map((target): AgentEvaluationEndpointSmokeTargetAuthority => {
            const pricing = pricingAuthorities.find(
              ({ authorityDigest }) =>
                authorityDigest === target.pricingAuthorityDigest
            );
            const estimatedCost = pricing
              ? priceAgentUsage(estimatedUsage, pricing.snapshot)
              : [];
            if (
              !pricing ||
              pricing.providerConfigurationId !==
                target.providerConfigurationId ||
              pricing.modelId !== target.modelId ||
              pricing.immutableModelVersion !== target.immutableModelVersion ||
              pricing.snapshot.providerConfigurationId !==
                target.providerConfigurationId ||
              estimatedCost.length === 0 ||
              estimatedCost.some(
                ({ amount, confidence }) =>
                  amount === undefined || confidence === 'unknown'
              ) ||
              target.responseSpoolEncryptionPolicyDigest !==
                frozen.endpointSmokeResponseSpoolEncryption
                  .encryptionPolicyDigest
            ) {
              throw new TypeError(
                'Evaluation endpoint-smoke target pricing or spool authority drifted.'
              );
            }
            const base = Object.freeze({
              targetDigest: target.targetDigest,
              pricingAuthorityDigest: pricing.authorityDigest,
              responseSpoolEncryptionPolicyDigest:
                target.responseSpoolEncryptionPolicyDigest,
              expectedText: endpointSmokeExpectedText,
              estimatedUsageDigest: estimatedUsage.vectorDigest,
              maximumElapsedMs,
            });
            return Object.freeze({
              target,
              pricing,
              expectedText: endpointSmokeExpectedText,
              estimatedUsage,
              maximumElapsedMs,
              authorityDigest: digestAgentCanonicalValue(base),
            });
          })
          .sort((left, right) =>
            compareUnicodeCodePoints(
              left.target.smokeTargetId,
              right.target.smokeTargetId
            )
          )
      );
      const base = Object.freeze({
        configurationDigest: frozen.frozenRunDigest,
        planDigest: plan.planDigest,
        targetAuthorityDigests: Object.freeze(
          targets.map(({ authorityDigest }) => authorityDigest)
        ),
        responseSpoolEncryptionPolicyDigest:
          frozen.endpointSmokeResponseSpoolEncryption.encryptionPolicyDigest,
      });
      return Object.freeze({
        configurationDigest: frozen.frozenRunDigest,
        configuration: frozen,
        plan,
        targets,
        responseSpoolEncryption: frozen.endpointSmokeResponseSpoolEncryption,
        authorityDigest: digestAgentCanonicalValue(base),
      });
    },
  };
  return Object.freeze(resolver);
};

const estimatedDemandFor = (
  authority: AgentEvaluationEndpointSmokeQualificationAuthority
): AgentBudgetDemand => {
  const usage = createAgentUsageVector(
    authority.targets.flatMap(({ estimatedUsage }) => estimatedUsage.amounts)
  );
  const cost = normalizeAgentCosts(
    authority.targets.flatMap(({ estimatedUsage, pricing }) =>
      priceAgentUsage(estimatedUsage, pricing.snapshot)
    )
  );
  const elapsedMs = authority.targets.reduce(
    (total, { maximumElapsedMs }) =>
      addCount(
        total,
        maximumElapsedMs,
        'Evaluation endpoint-smoke estimated elapsed time'
      ),
    0
  );
  return Object.freeze({
    usage,
    cost,
    modelInvocations: authority.targets.length,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs,
  });
};

export type CreateAgentEvaluationEndpointSmokeJournalTurnInput =
  | Omit<
      Extract<
        AgentEvaluationEndpointSmokeJournalTurn,
        { state: 'intent-recorded' }
      >,
      'turnDigest'
    >
  | Omit<
      Extract<AgentEvaluationEndpointSmokeJournalTurn, { state: 'closed' }>,
      'turnDigest'
    >;

const journalTurnBase = (
  turn: CreateAgentEvaluationEndpointSmokeJournalTurnInput
) =>
  turn.state === 'intent-recorded'
    ? Object.freeze({
        state: turn.state,
        planDigest: turn.intent.planDigest,
        repositoryCommit: turn.intent.repositoryCommit,
        smokeTargetId: turn.intent.smokeTargetId,
        smokeTargetDigest: turn.intent.smokeTargetDigest,
        invocationId: turn.intent.invocationId,
        intentDigest: turn.intent.intentDigest,
      })
    : Object.freeze({
        state: turn.state,
        planDigest: turn.intent.planDigest,
        repositoryCommit: turn.intent.repositoryCommit,
        smokeTargetId: turn.intent.smokeTargetId,
        smokeTargetDigest: turn.intent.smokeTargetDigest,
        invocationId: turn.intent.invocationId,
        intentDigest: turn.intent.intentDigest,
        transportReceiptDigest: turn.transportReceipt.receiptDigest,
        ...(turn.resultSpoolReceipt
          ? { resultSpoolReceiptDigest: turn.resultSpoolReceipt.receiptDigest }
          : {}),
        closedAt: turn.closedAt,
      });

export const digestAgentEvaluationEndpointSmokeJournalTurn = (
  turn: CreateAgentEvaluationEndpointSmokeJournalTurnInput
): CanonicalDigest => digestAgentCanonicalValue(journalTurnBase(turn));

export const createAgentEvaluationEndpointSmokeJournalTurn = (
  turn: CreateAgentEvaluationEndpointSmokeJournalTurnInput
): AgentEvaluationEndpointSmokeJournalTurn =>
  Object.freeze({
    ...turn,
    turnDigest: digestAgentEvaluationEndpointSmokeJournalTurn(turn),
  }) as AgentEvaluationEndpointSmokeJournalTurn;

const isEndpointSmokeJournalTurn = (
  value: unknown
): value is AgentEvaluationEndpointSmokeJournalTurn => {
  if (
    !isPlainObject(value) ||
    !['intent-recorded', 'closed'].includes(String(value.state))
  ) {
    return false;
  }
  try {
    if (!isAgentEvaluationEndpointSmokeDispatchIntent(value.intent))
      return false;
    if (value.state === 'intent-recorded') {
      if (!exactKeys(value, ['state', 'intent', 'turnDigest'])) return false;
    } else {
      if (
        !exactKeys(
          value,
          ['state', 'intent', 'transportReceipt', 'closedAt', 'turnDigest'],
          ['resultSpoolReceipt']
        ) ||
        !isAgentEvaluationTransportReceipt(value.transportReceipt) ||
        (value.resultSpoolReceipt !== undefined &&
          !isAgentEvaluationEndpointSmokeResultSpoolReceipt(
            value.resultSpoolReceipt
          )) ||
        !isAgentControlInstant(value.closedAt)
      ) {
        return false;
      }
    }
    const { turnDigest, ...base } = value;
    return (
      isAgentCanonicalDigest(turnDigest) &&
      turnDigest ===
        digestAgentEvaluationEndpointSmokeJournalTurn(
          base as CreateAgentEvaluationEndpointSmokeJournalTurnInput
        )
    );
  } catch {
    return false;
  }
};

const deterministicIdentity = (prefix: string, value: unknown): string =>
  `${prefix}.${digestAgentCanonicalValue(value).slice('sha256-'.length)}`;

const instantAtOrAfter = (candidate: Instant, floor: Instant): Instant => {
  if (!isAgentControlInstant(candidate) || !isAgentControlInstant(floor)) {
    throw new TypeError(
      'Evaluation endpoint-smoke clock returned an invalid instant.'
    );
  }
  return Date.parse(candidate) >= Date.parse(floor) ? candidate : floor;
};

const elapsedBetween = (startedAt: Instant, completedAt: Instant): number => {
  const elapsed = Date.parse(completedAt) - Date.parse(startedAt);
  if (!safeCount(elapsed)) {
    throw new TypeError('Evaluation endpoint-smoke elapsed time is invalid.');
  }
  return elapsed;
};

const addRetention = (createdAt: Instant, maximumAgeMs: number): Instant => {
  const expires = Date.parse(createdAt) + maximumAgeMs;
  if (!Number.isSafeInteger(expires)) {
    throw new TypeError('Evaluation endpoint-smoke spool expiry is invalid.');
  }
  return new Date(expires).toISOString();
};

const assertTargetAuthority = (
  authority: AgentEvaluationEndpointSmokeQualificationAuthority,
  plan: AgentModelEvaluationPlan
): void => {
  if (
    validateAgentModelEvaluationPlan(plan).length > 0 ||
    authority.plan.planDigest !== plan.planDigest ||
    authority.plan.repositoryCommit !== plan.repositoryCommit ||
    !sameCanonicalJson(authority.plan, plan) ||
    authority.configuration.frozenRunDigest !== authority.configurationDigest ||
    authority.configuration.purpose !== 'production' ||
    authority.targets.length !== 5 ||
    authority.targets.some(({ target }) => {
      try {
        const planned = plan.endpointSmokeTargets.find(
          ({ smokeTargetId }) => smokeTargetId === target.smokeTargetId
        );
        return !planned || !sameCanonicalJson(planned, target);
      } catch {
        return true;
      }
    }) ||
    new Set(authority.targets.map(({ target }) => target.smokeTargetId))
      .size !== 5 ||
    authority.responseSpoolEncryption.encryptionPolicyDigest !==
      authority.configuration.endpointSmokeResponseSpoolEncryption
        .encryptionPolicyDigest
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke qualification authority drifted.'
    );
  }
};

const assertReservation = (
  reservation: AgentBudgetReservation,
  reservationId: string,
  demand: AgentBudgetDemand,
  demandDigest: CanonicalDigest
): AgentBudgetReservation => {
  if (
    reservation.reservationId !== reservationId ||
    reservation.demandDigest !== demandDigest ||
    !sameCanonicalJson(reservation.demand, demand) ||
    !isAgentControlInstant(reservation.reservedAt) ||
    !['reserved', 'settled'].includes(reservation.status) ||
    (reservation.status === 'reserved') !==
      (reservation.settlement === undefined)
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke budget reservation drifted.'
    );
  }
  return reservation;
};

const assertTransportBinding = (
  target: AgentEvaluationEndpointSmokeTarget,
  intent: AgentEvaluationEndpointSmokeDispatchIntent,
  receipt: AgentEvaluationTransportReceipt
): void => {
  validateAgentEvaluationEndpointSmokeTargetBinding(target, intent);
  if (
    !isAgentEvaluationTransportReceipt(receipt) ||
    receipt.protocolFamily !== intent.protocolFamily ||
    receipt.providerConfigurationId !== intent.providerConfigurationId ||
    receipt.invocationId !== intent.invocationId ||
    receipt.dispatchIntentDigest !== intent.intentDigest ||
    receipt.requestDigest !== intent.requestDigest ||
    receipt.endpointId !== intent.endpointId ||
    receipt.endpointClass !== intent.endpointClass ||
    receipt.requestBodyDigest !== intent.requestBodyDigest ||
    receipt.requestBytes !== intent.requestBytes
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke transport authority drifted.'
    );
  }
};

const assertTurnBinding = (
  plan: AgentModelEvaluationPlan,
  target: AgentEvaluationEndpointSmokeTarget,
  turn: AgentEvaluationEndpointSmokeJournalTurn
): void => {
  if (!isEndpointSmokeJournalTurn(turn)) {
    throw new TypeError('Evaluation endpoint-smoke journal turn is invalid.');
  }
  const { intent } = turn;
  validateAgentEvaluationEndpointSmokeTargetBinding(target, intent);
  if (
    intent.planDigest !== plan.planDigest ||
    intent.repositoryCommit !== plan.repositoryCommit
  ) {
    throw new TypeError('Evaluation endpoint-smoke journal turn drifted.');
  }
  if (turn.state === 'closed') {
    assertTransportBinding(target, intent, turn.transportReceipt);
    if (
      turn.resultSpoolReceipt &&
      (turn.resultSpoolReceipt.planDigest !== plan.planDigest ||
        turn.resultSpoolReceipt.repositoryCommit !== plan.repositoryCommit ||
        turn.resultSpoolReceipt.smokeTargetId !== target.smokeTargetId ||
        turn.resultSpoolReceipt.smokeTargetDigest !== target.targetDigest ||
        turn.resultSpoolReceipt.invocationId !== intent.invocationId ||
        turn.resultSpoolReceipt.dispatchIntentDigest !== intent.intentDigest ||
        turn.resultSpoolReceipt.transportReceiptDigest !==
          turn.transportReceipt.receiptDigest)
    ) {
      throw new TypeError('Evaluation endpoint-smoke journal spool drifted.');
    }
  }
};

const createUnknownTransportReceipt = (
  intent: AgentEvaluationEndpointSmokeDispatchIntent,
  completedAt: Instant
): AgentEvaluationTransportReceipt =>
  createAgentEvaluationTransportReceipt({
    receiptId: deterministicIdentity('endpoint-smoke-transport', {
      intentDigest: intent.intentDigest,
      outcome: 'post-dispatch-unknown',
    }),
    protocolFamily: intent.protocolFamily,
    providerConfigurationId: intent.providerConfigurationId,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    requestDigest: intent.requestDigest,
    endpointId: intent.endpointId,
    endpointClass: intent.endpointClass,
    requestBodyDigest: intent.requestBodyDigest,
    requestBytes: intent.requestBytes,
    responseBytes: 0,
    sseEventCount: 0,
    dispatchState: 'dispatched',
    outcome: 'post-dispatch-unknown',
    errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
    startedAt: intent.createdAt,
    completedAt: instantAtOrAfter(completedAt, intent.createdAt),
  });

const resultMatchesTransport = (
  result: AgentEvaluationEndpointSmokeNormalizedResult,
  target: AgentEvaluationEndpointSmokeTarget,
  intent: AgentEvaluationEndpointSmokeDispatchIntent,
  transport: AgentEvaluationTransportReceipt
): boolean =>
  result.smokeTargetId === target.smokeTargetId &&
  result.invocationId === intent.invocationId &&
  result.transportReceiptDigest === transport.receiptDigest &&
  transport.outcome === 'completed' &&
  transport.responseBodyDigest !== undefined &&
  transport.providerRequestId !== undefined &&
  transport.responseHeaderDigest !== undefined &&
  transport.resolvedModelId === result.resolvedModelId &&
  transport.resolvedModelVersion === result.resolvedModelVersion;

const modelMatchesTarget = (
  target: AgentEvaluationEndpointSmokeTarget,
  result: AgentEvaluationEndpointSmokeNormalizedResult
): boolean =>
  result.resolvedModelId === target.modelId &&
  (target.protocolFamily === 'gemini-interactions'
    ? result.resolvedModelVersion === target.immutableModelVersion
    : target.modelId === target.immutableModelVersion &&
      (result.resolvedModelVersion === undefined ||
        result.resolvedModelVersion === target.immutableModelVersion));

type EndpointSmokeUsageAccounting = Readonly<{
  usage: AgentUsageVector;
  usageSourceReceipt: AgentEvaluationSourceReceipt;
}>;

type EndpointSmokeAccounting = EndpointSmokeUsageAccounting &
  Readonly<{
    cost: readonly AgentCost[];
    costSourceReceipt: AgentEvaluationSourceReceipt;
    pricingSourceReceipt: AgentEvaluationSourceReceipt;
  }>;

const bindUsageSource = (
  usage: AgentUsageVector,
  sourceDigest: CanonicalDigest
): AgentUsageVector =>
  createAgentUsageVector(
    usage.amounts.map(({ sourceDigest: _sourceDigest, ...amount }) => ({
      ...amount,
      sourceDigest,
    }))
  );

const bindCostSource = (
  cost: readonly AgentCost[],
  sourceDigest: CanonicalDigest
): readonly AgentCost[] =>
  normalizeAgentCosts(
    cost.map(({ sourceDigest: _sourceDigest, ...amount }) => ({
      ...amount,
      sourceDigest,
    }))
  );

const createUsageAccounting = (
  plan: AgentModelEvaluationPlan,
  authority: AgentEvaluationEndpointSmokeTargetAuthority,
  transport: AgentEvaluationTransportReceipt,
  result: AgentEvaluationEndpointSmokeNormalizedResult
): EndpointSmokeUsageAccounting => {
  if (
    !transport.providerRequestId ||
    result.reportedUsage.amounts.length === 0 ||
    result.reportedUsage.amounts.some(
      ({ confidence, logicalAmount, billableAmount, cachedAmount }) =>
        confidence !== 'reported' ||
        (logicalAmount === undefined &&
          billableAmount === undefined &&
          cachedAmount === undefined)
    )
  ) {
    throw new TypeError('Evaluation endpoint-smoke usage is unavailable.');
  }
  const unboundUsage = createAgentUsageVector(
    result.reportedUsage.amounts.map(
      ({ sourceDigest: _sourceDigest, ...amount }) => amount
    )
  );
  const usageContentDigest = digestAgentCanonicalValue({
    sourceKind: 'provider-reported-usage',
    transportReceiptDigest: transport.receiptDigest,
    providerRequestId: transport.providerRequestId,
    reportedUsageDigest: unboundUsage.vectorDigest,
  });
  const usage = bindUsageSource(unboundUsage, usageContentDigest);
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: deterministicIdentity('endpoint-smoke-usage-source', {
      smokeTargetId: authority.target.smokeTargetId,
      transportReceiptDigest: transport.receiptDigest,
    }),
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: authority.target.providerConfigurationId,
    modelLineageDigest: authority.target.modelLineageDigest,
    providerRequestId: transport.providerRequestId,
    sourceContentDigest: usageContentDigest,
    inputUsageDigest: usage.vectorDigest,
    observedAt: result.observedAt,
  });
  if (!isAgentEvaluationSourceReceipt(usageSourceReceipt)) {
    throw new TypeError('Evaluation endpoint-smoke usage source is invalid.');
  }
  return Object.freeze({ usage, usageSourceReceipt });
};

const createAccounting = (
  plan: AgentModelEvaluationPlan,
  authority: AgentEvaluationEndpointSmokeTargetAuthority,
  transport: AgentEvaluationTransportReceipt,
  result: AgentEvaluationEndpointSmokeNormalizedResult,
  usageAccounting: EndpointSmokeUsageAccounting
): EndpointSmokeAccounting => {
  const { usage, usageSourceReceipt } = usageAccounting;
  const rawCost = priceAgentUsage(usage, authority.pricing.snapshot);
  if (
    rawCost.length === 0 ||
    rawCost.some(
      ({ amount, confidence }) =>
        amount === undefined || confidence === 'unknown'
    )
  ) {
    throw new TypeError('Evaluation endpoint-smoke cost is unavailable.');
  }
  const unboundCost = normalizeAgentCosts(
    rawCost.map(({ sourceDigest: _sourceDigest, ...amount }) => amount)
  );
  const outputCostDigest = digestAgentEvaluationCostValues(unboundCost);
  const costContentDigest = digestAgentEvaluationCostCalculationSource({
    providerConfigurationId: authority.target.providerConfigurationId,
    modelLineageDigest: authority.target.modelLineageDigest,
    providerRequestId: transport.providerRequestId,
    pricingSnapshotDigest: authority.pricing.snapshot.snapshotDigest,
    inputUsageDigest: usage.vectorDigest,
    outputCostDigest,
  });
  const cost = bindCostSource(unboundCost, costContentDigest);
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: deterministicIdentity('endpoint-smoke-cost-source', {
      smokeTargetId: authority.target.smokeTargetId,
      transportReceiptDigest: transport.receiptDigest,
    }),
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'cost-calculation',
    providerConfigurationId: authority.target.providerConfigurationId,
    modelLineageDigest: authority.target.modelLineageDigest,
    providerRequestId: transport.providerRequestId,
    sourceContentDigest: costContentDigest,
    pricingSnapshot: authority.pricing.snapshot,
    inputUsageDigest: usage.vectorDigest,
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: result.observedAt,
  });
  const pricingSourceReceipt = createAgentEvaluationPlanPricingSourceReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    modelLineageDigest: authority.target.modelLineageDigest,
    authority: authority.pricing,
  });
  for (const source of [
    usageSourceReceipt,
    costSourceReceipt,
    pricingSourceReceipt,
  ]) {
    if (!isAgentEvaluationSourceReceipt(source)) {
      throw new TypeError(
        'Evaluation endpoint-smoke accounting source is invalid.'
      );
    }
  }
  return Object.freeze({
    usage,
    cost,
    usageSourceReceipt,
    costSourceReceipt,
    pricingSourceReceipt,
  });
};

type ClosedTargetFact = Readonly<{
  authority: AgentEvaluationEndpointSmokeTargetAuthority;
  intent: AgentEvaluationEndpointSmokeDispatchIntent;
  transport: AgentEvaluationTransportReceipt;
  spool?: AgentEvaluationEndpointSmokeResultSpoolReceipt;
  result?: AgentEvaluationEndpointSmokeNormalizedResult;
}>;

const readClosedResult = async (
  dependencies: CreateAgentEvaluationEndpointSmokeQualifierInput,
  authority: AgentEvaluationEndpointSmokeQualificationAuthority,
  targetAuthority: AgentEvaluationEndpointSmokeTargetAuthority,
  turn: Extract<AgentEvaluationEndpointSmokeJournalTurn, { state: 'closed' }>
): Promise<AgentEvaluationEndpointSmokeNormalizedResult | undefined> => {
  if (!turn.resultSpoolReceipt) return undefined;
  const stored = await dependencies.journal.readEncryptedResultSpool({
    planDigest: authority.plan.planDigest,
    repositoryCommit: authority.plan.repositoryCommit,
    smokeTargetId: targetAuthority.target.smokeTargetId,
    expectedSpoolReceiptDigest: turn.resultSpoolReceipt.receiptDigest,
  });
  if (
    !isAgentEvaluationEndpointSmokeResultSpoolAad(stored.aad) ||
    !isAgentEvaluationEndpointSmokeResultSpoolReceipt(stored.receipt) ||
    !sameCanonicalJson(stored.receipt, turn.resultSpoolReceipt) ||
    stored.receipt.aadDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolAad(stored.aad) ||
    stored.receipt.envelopeDigest !== stored.envelope.envelopeDigest ||
    stored.aad.namespaceDigest !==
      authority.responseSpoolEncryption.namespaceDigest ||
    stored.aad.planDigest !== authority.plan.planDigest ||
    stored.aad.repositoryCommit !== authority.plan.repositoryCommit ||
    stored.aad.smokeTargetId !== targetAuthority.target.smokeTargetId ||
    stored.aad.smokeTargetDigest !== targetAuthority.target.targetDigest ||
    stored.aad.invocationId !== turn.intent.invocationId ||
    stored.aad.dispatchIntentDigest !== turn.intent.intentDigest ||
    stored.aad.transportReceiptDigest !== turn.transportReceipt.receiptDigest
  ) {
    throw new TypeError('Evaluation endpoint-smoke encrypted replay drifted.');
  }
  return dependencies.spoolCipher.useDecrypted(
    {
      profile: authority.responseSpoolEncryption,
      aad: stored.aad,
      envelope: stored.envelope,
    },
    async (bytes) => decodeAgentEvaluationEndpointSmokeNormalizedResult(bytes)
  );
};

const closeUnknown = async (
  dependencies: CreateAgentEvaluationEndpointSmokeQualifierInput,
  plan: AgentModelEvaluationPlan,
  target: AgentEvaluationEndpointSmokeTarget,
  intent: AgentEvaluationEndpointSmokeDispatchIntent
): Promise<
  Extract<AgentEvaluationEndpointSmokeJournalTurn, { state: 'closed' }>
> => {
  const completedAt = instantAtOrAfter(dependencies.now(), intent.createdAt);
  const receipt = createUnknownTransportReceipt(intent, completedAt);
  const closed = await dependencies.journal.closeTransport({
    plan,
    target,
    intent,
    transportReceipt: receipt,
    closedAt: completedAt,
  });
  assertTurnBinding(plan, target, closed);
  if (
    closed.state !== 'closed' ||
    !sameCanonicalJson(closed.transportReceipt, receipt)
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke close acknowledgement drifted.'
    );
  }
  return closed;
};

const closeFreshTarget = async (
  dependencies: CreateAgentEvaluationEndpointSmokeQualifierInput,
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority,
  targetAuthority: AgentEvaluationEndpointSmokeTargetAuthority,
  prepared: AgentEvaluationEndpointSmokePreparedTransport,
  intent: AgentEvaluationEndpointSmokeDispatchIntent
): Promise<ClosedTargetFact> => {
  let observation: AgentEvaluationEndpointSmokeTransportObservation;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    observation = await Promise.race([
      prepared.execute({ intent, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(
            new TypeError('Evaluation endpoint-smoke transport timed out.')
          );
        }, targetAuthority.maximumElapsedMs);
      }),
    ]);
  } catch {
    const turn = await closeUnknown(
      dependencies,
      qualification.plan,
      targetAuthority.target,
      intent
    );
    return Object.freeze({
      authority: targetAuthority,
      intent,
      transport: turn.transportReceipt,
    });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  assertTransportBinding(targetAuthority.target, intent, observation.receipt);
  if (
    observation.kind === 'normalized' &&
    (!isAgentEvaluationEndpointSmokeNormalizedResult(observation.result) ||
      !resultMatchesTransport(
        observation.result,
        targetAuthority.target,
        intent,
        observation.receipt
      ))
  ) {
    throw new TypeError('Evaluation endpoint-smoke normalized result drifted.');
  }
  if (
    observation.kind !== 'normalized' &&
    observation.receipt.outcome === 'completed'
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke completed transport requires a normalized result.'
    );
  }
  const closedAt = instantAtOrAfter(
    dependencies.now(),
    observation.receipt.completedAt
  );
  let encryptedResultSpool:
    AgentEvaluationEndpointSmokeEncryptedResultSpool | undefined;
  if (observation.kind === 'normalized') {
    const transport = observation.receipt;
    if (!transport.responseBodyDigest) {
      throw new TypeError(
        'Evaluation endpoint-smoke response body digest is missing.'
      );
    }
    const aad: AgentEvaluationEndpointSmokeResultSpoolAad = Object.freeze({
      format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad',
      version: 1,
      namespaceDigest: qualification.responseSpoolEncryption.namespaceDigest,
      planDigest: qualification.plan.planDigest,
      repositoryCommit: qualification.plan.repositoryCommit,
      smokeTargetId: targetAuthority.target.smokeTargetId,
      smokeTargetDigest: targetAuthority.target.targetDigest,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      responseBodyDigest: transport.responseBodyDigest,
      normalizedEventSetDigest: observation.result.normalizedEventSetDigest,
    });
    if (!isAgentEvaluationEndpointSmokeResultSpoolAad(aad)) {
      throw new TypeError(
        'Evaluation endpoint-smoke result spool AAD is invalid.'
      );
    }
    const bytes = encodeAgentEvaluationEndpointSmokeNormalizedResult(
      observation.result
    );
    let envelope: AgentEvaluationProviderResultSpoolEnvelope;
    try {
      envelope = await dependencies.spoolCipher.encrypt({
        profile: qualification.responseSpoolEncryption,
        aad,
        canonicalResultBytes: bytes,
      });
    } catch {
      const turn = await closeUnknown(
        dependencies,
        qualification.plan,
        targetAuthority.target,
        intent
      );
      return Object.freeze({
        authority: targetAuthority,
        intent,
        transport: turn.transportReceipt,
      });
    } finally {
      bytes.fill(0);
    }
    if (
      envelope.spoolId !==
        createAgentEvaluationEndpointSmokeResultSpoolId(aad) ||
      envelope.aadDigest !==
        digestAgentEvaluationEndpointSmokeResultSpoolAad(aad) ||
      envelope.keyId !== qualification.responseSpoolEncryption.keyId ||
      envelope.keyVersion !==
        qualification.responseSpoolEncryption.keyVersion ||
      envelope.keyRefDigest !==
        qualification.responseSpoolEncryption.keyRefDigest ||
      envelope.encryptionProfileDigest !==
        qualification.responseSpoolEncryption.encryptionProfileDigest ||
      envelope.ciphertextSizeBytes >
        qualification.responseSpoolEncryption.maximumPlaintextBytes
    ) {
      throw new TypeError(
        'Evaluation endpoint-smoke encrypted envelope drifted.'
      );
    }
    const receipt = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
      aad,
      envelope,
      responseDigest: observation.result.responseDigest,
      retentionPolicyDigest:
        qualification.responseSpoolEncryption.retention.retentionPolicyDigest,
      createdAt: closedAt,
      expiresAt: addRetention(
        closedAt,
        qualification.responseSpoolEncryption.retention.maximumAgeMs
      ),
    });
    encryptedResultSpool = Object.freeze({ aad, envelope, receipt });
  }
  const closed = await dependencies.journal.closeTransport({
    plan: qualification.plan,
    target: targetAuthority.target,
    intent,
    transportReceipt: observation.receipt,
    ...(encryptedResultSpool ? { encryptedResultSpool } : {}),
    closedAt,
  });
  assertTurnBinding(qualification.plan, targetAuthority.target, closed);
  if (
    closed.state !== 'closed' ||
    !sameCanonicalJson(closed.transportReceipt, observation.receipt) ||
    !sameCanonicalJson(closed.resultSpoolReceipt, encryptedResultSpool?.receipt)
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke close acknowledgement drifted.'
    );
  }
  return Object.freeze({
    authority: targetAuthority,
    intent,
    transport: closed.transportReceipt,
    ...(closed.resultSpoolReceipt ? { spool: closed.resultSpoolReceipt } : {}),
    ...(observation.kind === 'normalized'
      ? { result: observation.result }
      : {}),
  });
};

const recoverClosedTarget = async (
  dependencies: CreateAgentEvaluationEndpointSmokeQualifierInput,
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority,
  targetAuthority: AgentEvaluationEndpointSmokeTargetAuthority,
  turn: Extract<AgentEvaluationEndpointSmokeJournalTurn, { state: 'closed' }>
): Promise<ClosedTargetFact> => {
  const result = await readClosedResult(
    dependencies,
    qualification,
    targetAuthority,
    turn
  );
  if (turn.transportReceipt.outcome === 'completed' && !result) {
    throw new TypeError(
      'Evaluation endpoint-smoke completed transport is missing its encrypted replay result.'
    );
  }
  if (
    result &&
    !resultMatchesTransport(
      result,
      targetAuthority.target,
      turn.intent,
      turn.transportReceipt
    )
  ) {
    throw new TypeError('Evaluation endpoint-smoke replay result drifted.');
  }
  return Object.freeze({
    authority: targetAuthority,
    intent: turn.intent,
    transport: turn.transportReceipt,
    ...(turn.resultSpoolReceipt ? { spool: turn.resultSpoolReceipt } : {}),
    ...(result ? { result } : {}),
  });
};

const createIntent = (
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority,
  targetAuthority: AgentEvaluationEndpointSmokeTargetAuthority,
  prepared: AgentEvaluationEndpointSmokePreparedTransport,
  reservation: AgentBudgetReservation,
  demandDigest: CanonicalDigest,
  createdAt: Instant
): AgentEvaluationEndpointSmokeDispatchIntent => {
  const { target } = targetAuthority;
  if (
    !isAgentControlIdentity(prepared.endpointId) ||
    !isAgentCanonicalDigest(prepared.requestDigest) ||
    !isAgentCanonicalDigest(prepared.requestBodyDigest) ||
    !safeCount(prepared.requestBytes) ||
    prepared.requestBytes < 1
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke prepared request is invalid.'
    );
  }
  const invocationId = deterministicIdentity('endpoint-smoke-invocation', {
    planDigest: qualification.plan.planDigest,
    smokeTargetDigest: target.targetDigest,
  });
  return createAgentEvaluationEndpointSmokeDispatchIntent({
    intentId: deterministicIdentity('endpoint-smoke-intent', {
      planDigest: qualification.plan.planDigest,
      smokeTargetDigest: target.targetDigest,
      requestDigest: prepared.requestDigest,
    }),
    planDigest: qualification.plan.planDigest,
    repositoryCommit: qualification.plan.repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    endpointClass: target.endpointClass,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    immutableModelVersion: target.immutableModelVersion,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    adapterDigest: target.adapterDigest,
    pricingAuthorityDigest: target.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      target.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: target.smokeProfileDigest,
    invocationId,
    budgetReservationId: reservation.reservationId,
    demandDigest,
    requestDigest: prepared.requestDigest,
    endpointId: prepared.endpointId,
    requestBodyDigest: prepared.requestBodyDigest,
    requestBytes: prepared.requestBytes,
    createdAt,
  });
};

const actualDemandFor = (
  facts: readonly Readonly<{
    transport: AgentEvaluationTransportReceipt;
    usageAccounting?: EndpointSmokeUsageAccounting;
    accounting?: EndpointSmokeAccounting;
  }>[]
): AgentBudgetDemand => {
  const hasUnknownUsage = facts.some(
    ({ transport, usageAccounting }) =>
      transport.dispatchState === 'dispatched' && usageAccounting === undefined
  );
  const hasUnknownCost = facts.some(
    ({ transport, accounting }) =>
      transport.dispatchState === 'dispatched' && accounting === undefined
  );
  const knownUsage = facts.flatMap(({ usageAccounting }) =>
    usageAccounting ? usageAccounting.usage.amounts : []
  );
  const usage = createAgentUsageVector([
    ...knownUsage,
    ...(hasUnknownUsage
      ? createUnknownAgentUsageVector(['text-token-input', 'text-token-output'])
          .amounts
      : []),
  ]);
  const knownCost = facts.flatMap(({ accounting }) =>
    accounting ? accounting.cost : []
  );
  const cost = normalizeAgentCosts([
    ...knownCost,
    ...(hasUnknownCost
      ? ([{ currency: 'USD', confidence: 'unknown' as const }] as const)
      : []),
  ]);
  const modelInvocations = facts.filter(
    ({ transport }) => transport.dispatchState === 'dispatched'
  ).length;
  const elapsedMs = facts.reduce(
    (total, { transport }) =>
      addCount(
        total,
        elapsedBetween(transport.startedAt, transport.completedAt),
        'Evaluation endpoint-smoke actual elapsed time'
      ),
    0
  );
  return Object.freeze({
    usage,
    cost,
    modelInvocations,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs,
  });
};

const createSettlement = (
  reservation: AgentBudgetReservation,
  actual: AgentBudgetDemand,
  settledAt: Instant
): AgentBudgetSettlement => {
  const requiresReconciliation =
    actual.usage.amounts.some(({ confidence }) => confidence === 'unknown') ||
    actual.cost.some(
      ({ amount, confidence }) =>
        amount === undefined || confidence === 'unknown'
    );
  const base = Object.freeze({
    actual,
    charged: requiresReconciliation ? reservation.demand : actual,
    requiresReconciliation,
    ...(requiresReconciliation
      ? { reconciliationReason: 'usage-unknown' as const }
      : {}),
    settledAt,
  });
  return Object.freeze({
    ...base,
    settlementDigest: digestAgentCanonicalValue(base),
  });
};

const reportFor = (
  plan: AgentModelEvaluationPlan,
  reservationId: string,
  intents: readonly AgentEvaluationEndpointSmokeDispatchIntent[],
  transports: readonly AgentEvaluationTransportReceipt[],
  spools: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[],
  dispositions: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[],
  receipts: readonly AgentEvaluationEndpointSmokeReceipt[],
  completedAt: Instant
): AgentEvaluationSmokeQualificationReport => {
  const qualifiedTargetCount = receipts.filter(
    ({ outcome }) => outcome === 'passed'
  ).length;
  const completed = qualifiesAgentEvaluationEndpointSmokeSet(
    plan.endpointSmokeTargets,
    receipts
  );
  const base = Object.freeze({
    format: 'prodivix.g4-model-evaluation-smoke-qualification' as const,
    version: 2 as const,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    endpointSmokeDispatchIntentSetDigest:
      digestAgentEvaluationEndpointSmokeDispatchIntentSet(intents),
    endpointSmokeTransportReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeTransportReceiptSet(transports),
    endpointSmokeResultSpoolReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet(spools),
    endpointSmokeResultSpoolDispositionReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet(
        dispositions
      ),
    endpointSmokeReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeReceiptSet(receipts),
    qualifiedTargetCount,
    budgetReservationId: reservationId,
    outcome: completed ? ('completed' as const) : ('failed' as const),
    failureCode: completed ? null : 'endpoint-smoke-qualification-failed',
    completedAt,
  });
  return Object.freeze({
    ...base,
    reportDigest: digestAgentCanonicalValue(base),
  });
};

const reservationIdFor = (
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority,
  demandDigest: CanonicalDigest
): string =>
  deterministicIdentity('endpoint-smoke-reservation', {
    configurationDigest: qualification.configurationDigest,
    planDigest: qualification.plan.planDigest,
    endpointSmokeTargetDigests: qualification.targets.map(
      ({ target }) => target.targetDigest
    ),
    demandDigest,
  });

const demandFromCommittedFacts = (
  receipts: readonly AgentEvaluationEndpointSmokeReceipt[],
  transports: readonly AgentEvaluationTransportReceipt[]
): AgentBudgetDemand => {
  const receiptByInvocation = new Map(
    receipts.map((receipt) => [receipt.invocationId, receipt])
  );
  const hasUnknownUsage = transports.some((transport) => {
    const receipt = receiptByInvocation.get(transport.invocationId);
    return (
      transport.dispatchState === 'dispatched' && receipt?.usage === undefined
    );
  });
  const hasUnknownCost = transports.some((transport) => {
    const receipt = receiptByInvocation.get(transport.invocationId);
    return (
      transport.dispatchState === 'dispatched' && receipt?.cost === undefined
    );
  });
  const usage = createAgentUsageVector([
    ...receipts.flatMap((receipt) => receipt.usage?.amounts ?? []),
    ...(hasUnknownUsage
      ? createUnknownAgentUsageVector(['text-token-input', 'text-token-output'])
          .amounts
      : []),
  ]);
  const cost = normalizeAgentCosts([
    ...receipts.flatMap((receipt) => receipt.cost ?? []),
    ...(hasUnknownCost
      ? ([{ currency: 'USD', confidence: 'unknown' as const }] as const)
      : []),
  ]);
  return Object.freeze({
    usage,
    cost,
    modelInvocations: transports.filter(
      ({ dispatchState }) => dispatchState === 'dispatched'
    ).length,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: transports.reduce(
      (total, transport) =>
        addCount(
          total,
          elapsedBetween(transport.startedAt, transport.completedAt),
          'Evaluation endpoint-smoke committed elapsed time'
        ),
      0
    ),
  });
};

const sourceFactsMatch = (
  sourceReceipts: readonly AgentEvaluationSourceReceipt[],
  receipts: readonly AgentEvaluationEndpointSmokeReceipt[],
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority
): boolean => {
  if (
    sourceReceipts.some(
      (receipt) => !isAgentEvaluationSourceReceipt(receipt)
    ) ||
    new Set(sourceReceipts.map(({ sourceReceiptId }) => sourceReceiptId))
      .size !== sourceReceipts.length ||
    new Set(sourceReceipts.map(({ receiptDigest }) => receiptDigest)).size !==
      sourceReceipts.length ||
    new Set(
      sourceReceipts.map(({ sourceContentDigest }) => sourceContentDigest)
    ).size !== sourceReceipts.length
  ) {
    return false;
  }
  const byDigest = new Map(
    sourceReceipts.map((receipt) => [receipt.receiptDigest, receipt])
  );
  const pricingBySnapshotDigest = new Map(
    sourceReceipts
      .filter(
        (receipt) =>
          receipt.sourceKind === 'pricing-snapshot' && receipt.pricingSnapshot
      )
      .map((receipt) => [receipt.pricingSnapshot!.snapshotDigest, receipt])
  );
  const used = new Set<CanonicalDigest>();
  for (const receipt of receipts) {
    if (receipt.usage === undefined) continue;
    if (!receipt.usageSourceReceiptDigest || !receipt.providerRequestId) {
      return false;
    }
    const usageSource = byDigest.get(receipt.usageSourceReceiptDigest);
    if (
      !usageSource ||
      usageSource.sourceKind !== 'provider-reported-usage' ||
      usageSource.planDigest !== qualification.plan.planDigest ||
      usageSource.repositoryCommit !== qualification.plan.repositoryCommit ||
      usageSource.providerConfigurationId !== receipt.providerConfigurationId ||
      usageSource.providerRequestId !== receipt.providerRequestId ||
      usageSource.modelLineageDigest !== receipt.modelLineageDigest ||
      usageSource.inputUsageDigest !== receipt.usage.vectorDigest ||
      receipt.usage.amounts.some(
        ({ sourceDigest }) => sourceDigest !== usageSource.sourceContentDigest
      )
    ) {
      return false;
    }
    used.add(usageSource.receiptDigest);
    if (receipt.cost === undefined) continue;
    if (!receipt.costSourceReceiptDigest || !receipt.pricingSnapshotRef) {
      return false;
    }
    const costSource = byDigest.get(receipt.costSourceReceiptDigest);
    const targetAuthority = qualification.targets.find(
      ({ target }) => target.smokeTargetId === receipt.smokeTargetId
    );
    if (
      !costSource ||
      costSource.sourceKind !== 'cost-calculation' ||
      costSource.planDigest !== qualification.plan.planDigest ||
      costSource.repositoryCommit !== qualification.plan.repositoryCommit ||
      costSource.providerConfigurationId !== receipt.providerConfigurationId ||
      costSource.providerRequestId !== receipt.providerRequestId ||
      costSource.modelLineageDigest !== receipt.modelLineageDigest ||
      costSource.inputUsageDigest !== receipt.usage.vectorDigest ||
      costSource.outputCostDigest !==
        digestAgentEvaluationCostValues(receipt.cost) ||
      receipt.cost.some(
        ({ sourceDigest }) => sourceDigest !== costSource.sourceContentDigest
      ) ||
      !costSource.pricingSnapshot ||
      costSource.pricingSnapshot.pricingSnapshotId !==
        receipt.pricingSnapshotRef ||
      !targetAuthority ||
      !sameCanonicalJson(
        costSource.pricingSnapshot,
        targetAuthority.pricing.snapshot
      )
    ) {
      return false;
    }
    const pricingSource = pricingBySnapshotDigest.get(
      costSource.pricingSnapshot.snapshotDigest
    );
    if (
      !pricingSource ||
      pricingSource.planDigest !== qualification.plan.planDigest ||
      pricingSource.repositoryCommit !== qualification.plan.repositoryCommit ||
      pricingSource.providerConfigurationId !==
        receipt.providerConfigurationId ||
      pricingSource.modelLineageDigest !==
        targetAuthority.target.modelLineageDigest ||
      pricingSource.sourceContentDigest !==
        costSource.pricingSnapshot.snapshotDigest ||
      !sameCanonicalJson(
        pricingSource.pricingSnapshot,
        costSource.pricingSnapshot
      )
    ) {
      return false;
    }
    used.add(costSource.receiptDigest);
    used.add(pricingSource.receiptDigest);
  }
  return used.size === sourceReceipts.length;
};

const validateCommittedEvidence = (
  commit: AgentEvaluationEndpointSmokeEvidenceCommit,
  qualification: AgentEvaluationEndpointSmokeQualificationAuthority
): AgentEvaluationSmokeQualificationReport => {
  const { plan } = qualification;
  const estimatedDemand = estimatedDemandFor(qualification);
  const estimatedDemandDigest = digestAgentCanonicalValue(estimatedDemand);
  const expectedReservationId = reservationIdFor(
    qualification,
    estimatedDemandDigest
  );
  const targetById = new Map(
    plan.endpointSmokeTargets.map((target) => [target.smokeTargetId, target])
  );
  const intentByTarget = new Map(
    commit.dispatchIntents.map((intent) => [intent.smokeTargetId, intent])
  );
  const transportByInvocation = new Map(
    commit.transportReceipts.map((receipt) => [receipt.invocationId, receipt])
  );
  const spoolByTarget = new Map(
    commit.resultSpoolReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const dispositionByTarget = new Map(
    commit.resultSpoolDispositionReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const validationFailureByTarget = new Map(
    commit.validationFailureReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const expectedActual = demandFromCommittedFacts(
    commit.endpointSmokeReceipts,
    commit.transportReceipts
  );
  const expectedSettlement = createSettlement(
    commit.reservation,
    expectedActual,
    commit.settlement.settledAt
  );
  const latestFactCompletedAt = [
    ...commit.transportReceipts.map(({ completedAt }) => completedAt),
    ...commit.resultSpoolReceipts.map(({ createdAt }) => createdAt),
  ].reduce(
    (latest, candidate) =>
      Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
    commit.reservation.reservedAt
  );
  const expectedReport = reportFor(
    plan,
    commit.reservation.reservationId,
    commit.dispatchIntents,
    commit.transportReceipts,
    commit.resultSpoolReceipts,
    commit.resultSpoolDispositionReceipts,
    commit.endpointSmokeReceipts,
    commit.report.completedAt
  );
  if (
    commit.configurationDigest !== qualification.configurationDigest ||
    commit.planDigest !== plan.planDigest ||
    commit.repositoryCommit !== plan.repositoryCommit ||
    commit.reservation.status !== 'settled' ||
    !commit.reservation.settlement ||
    commit.reservation.reservationId !== expectedReservationId ||
    commit.reservation.demandDigest !== estimatedDemandDigest ||
    !sameCanonicalJson(commit.reservation.demand, estimatedDemand) ||
    !sameCanonicalJson(commit.reservation.settlement, commit.settlement) ||
    !sameCanonicalJson(commit.settlement, expectedSettlement) ||
    commit.settlement.settledAt !== commit.report.completedAt ||
    commit.report.completedAt !== latestFactCompletedAt ||
    commit.dispatchIntents.length !== 5 ||
    commit.transportReceipts.length !== 5 ||
    commit.endpointSmokeReceipts.length !== 5 ||
    commit.validationFailureReceipts.length !==
      commit.endpointSmokeReceipts.filter(
        (receipt) =>
          receipt.outcome === 'failed' &&
          receipt.failureCategory === 'provider-response-invalid'
      ).length ||
    new Set(commit.dispatchIntents.map(({ smokeTargetId }) => smokeTargetId))
      .size !== 5 ||
    new Set(commit.transportReceipts.map(({ invocationId }) => invocationId))
      .size !== 5 ||
    new Set(
      commit.endpointSmokeReceipts.map(({ smokeTargetId }) => smokeTargetId)
    ).size !== 5 ||
    new Set(
      commit.validationFailureReceipts.map(({ smokeTargetId }) => smokeTargetId)
    ).size !== commit.validationFailureReceipts.length ||
    commit.resultSpoolReceipts.length !==
      commit.resultSpoolDispositionReceipts.length ||
    commit.dispatchIntents.some(
      (intent) =>
        !isAgentEvaluationEndpointSmokeDispatchIntent(intent) ||
        intent.budgetReservationId !== expectedReservationId ||
        intent.demandDigest !== estimatedDemandDigest
    ) ||
    commit.transportReceipts.some(
      (receipt) => !isAgentEvaluationTransportReceipt(receipt)
    ) ||
    commit.resultSpoolReceipts.some(
      (receipt) => !isAgentEvaluationEndpointSmokeResultSpoolReceipt(receipt)
    ) ||
    commit.resultSpoolDispositionReceipts.some(
      (receipt) =>
        !isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt(receipt)
    ) ||
    commit.endpointSmokeReceipts.some(
      (receipt) => !isAgentEvaluationEndpointSmokeReceipt(receipt)
    ) ||
    commit.validationFailureReceipts.some(
      (receipt) =>
        !isAgentEvaluationEndpointSmokeValidationFailureReceipt(receipt)
    ) ||
    !sourceFactsMatch(
      commit.sourceReceipts,
      commit.endpointSmokeReceipts,
      qualification
    ) ||
    commit.endpointSmokeReceipts.some((receipt) => {
      const target = targetById.get(receipt.smokeTargetId);
      const intent = intentByTarget.get(receipt.smokeTargetId);
      const transport = intent
        ? transportByInvocation.get(intent.invocationId)
        : undefined;
      const spool = spoolByTarget.get(receipt.smokeTargetId);
      const disposition = dispositionByTarget.get(receipt.smokeTargetId);
      const validationFailure = validationFailureByTarget.get(
        receipt.smokeTargetId
      );
      return (
        !target ||
        !intent ||
        !transport ||
        !matchAgentEvaluationEndpointSmokeAuthorityFacts({
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          target,
          intent,
          transport,
          ...(spool ? { spool } : {}),
          ...(disposition ? { disposition } : {}),
          ...(validationFailure ? { validationFailure } : {}),
          receipt,
        })
      );
    }) ||
    !sameCanonicalJson(commit.report, expectedReport) ||
    commit.report.planDigest !== plan.planDigest ||
    commit.report.repositoryCommit !== plan.repositoryCommit ||
    commit.report.endpointSmokeDispatchIntentSetDigest !==
      digestAgentEvaluationEndpointSmokeDispatchIntentSet(
        commit.dispatchIntents
      ) ||
    commit.report.endpointSmokeTransportReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeTransportReceiptSet(
        commit.transportReceipts
      ) ||
    commit.report.endpointSmokeResultSpoolReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet(
        commit.resultSpoolReceipts
      ) ||
    commit.report.endpointSmokeResultSpoolDispositionReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet(
        commit.resultSpoolDispositionReceipts
      ) ||
    commit.report.endpointSmokeReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeReceiptSet(commit.endpointSmokeReceipts)
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke committed evidence drifted.'
    );
  }
  const { reportDigest: _reportDigest, ...reportBase } = commit.report;
  if (commit.report.reportDigest !== digestAgentCanonicalValue(reportBase)) {
    throw new TypeError(
      'Evaluation endpoint-smoke qualification report drifted.'
    );
  }
  return commit.report;
};

export const createAgentEvaluationEndpointSmokeQualifier = (
  dependencies: CreateAgentEvaluationEndpointSmokeQualifierInput
): AgentEvaluationCoordinatorSmokeQualifier => {
  if (typeof dependencies.now !== 'function') {
    throw new TypeError('Evaluation endpoint-smoke clock is required.');
  }
  const qualifier: AgentEvaluationCoordinatorSmokeQualifier = {
    async qualify({
      config,
      plan,
    }: Readonly<{
      config: unknown;
      plan: AgentModelEvaluationPlan;
    }>) {
      const qualification = await dependencies.authorityResolver.resolve({
        config,
        plan,
      });
      assertTargetAuthority(qualification, plan);
      const committed = await dependencies.journal.loadCommit({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
      });
      if (committed) return validateCommittedEvidence(committed, qualification);

      const demand = estimatedDemandFor(qualification);
      const demandDigest = digestAgentCanonicalValue(demand);
      const reservationId = reservationIdFor(qualification, demandDigest);
      const reservation = assertReservation(
        await dependencies.journal.reserveBudget({
          plan,
          reservationId,
          demand,
          demandDigest,
        }),
        reservationId,
        demand,
        demandDigest
      );
      if (reservation.status === 'settled') {
        throw new TypeError(
          'Evaluation endpoint-smoke settled reservation is missing its atomic evidence commit.'
        );
      }

      const existingTurns = await dependencies.journal.listTurns({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
      });
      if (
        existingTurns.length > 5 ||
        existingTurns.some((turn) => !isEndpointSmokeJournalTurn(turn))
      ) {
        throw new TypeError('Evaluation endpoint-smoke journal is invalid.');
      }
      const turnByTarget = new Map<
        string,
        AgentEvaluationEndpointSmokeJournalTurn
      >();
      for (const turn of existingTurns) {
        const targetAuthority = qualification.targets.find(
          ({ target }) => target.smokeTargetId === turn.intent.smokeTargetId
        );
        if (!targetAuthority || turnByTarget.has(turn.intent.smokeTargetId)) {
          throw new TypeError(
            'Evaluation endpoint-smoke journal target is invalid.'
          );
        }
        assertTurnBinding(plan, targetAuthority.target, turn);
        if (
          turn.intent.budgetReservationId !== reservationId ||
          turn.intent.demandDigest !== demandDigest
        ) {
          throw new TypeError(
            'Evaluation endpoint-smoke journal budget drifted.'
          );
        }
        turnByTarget.set(turn.intent.smokeTargetId, turn);
      }

      const facts: ClosedTargetFact[] = [];
      for (const targetAuthority of qualification.targets) {
        const existing = turnByTarget.get(targetAuthority.target.smokeTargetId);
        if (existing?.state === 'closed') {
          facts.push(
            await recoverClosedTarget(
              dependencies,
              qualification,
              targetAuthority,
              existing
            )
          );
          continue;
        }
        if (existing?.state === 'intent-recorded') {
          const closed = await closeUnknown(
            dependencies,
            plan,
            targetAuthority.target,
            existing.intent
          );
          facts.push(
            Object.freeze({
              authority: targetAuthority,
              intent: existing.intent,
              transport: closed.transportReceipt,
            })
          );
          continue;
        }

        const prepared = await dependencies.transportFactory.prepare({
          config: qualification.configuration,
          authority: targetAuthority,
        });
        const intent = createIntent(
          qualification,
          targetAuthority,
          prepared,
          reservation,
          demandDigest,
          instantAtOrAfter(dependencies.now(), reservation.reservedAt)
        );
        const acknowledged = await dependencies.journal.putDispatchIntent({
          plan,
          target: targetAuthority.target,
          intent,
        });
        assertTurnBinding(plan, targetAuthority.target, acknowledged);
        if (
          acknowledged.state !== 'intent-recorded' ||
          !sameCanonicalJson(acknowledged.intent, intent)
        ) {
          throw new TypeError(
            'Evaluation endpoint-smoke dispatch-intent acknowledgement drifted.'
          );
        }
        facts.push(
          await closeFreshTarget(
            dependencies,
            qualification,
            targetAuthority,
            prepared,
            intent
          )
        );
      }

      const classified = facts.map((fact) => {
        let usageAccounting: EndpointSmokeUsageAccounting | undefined;
        let accounting: EndpointSmokeAccounting | undefined;
        let failureCategory:
          AgentEvaluationEndpointSmokeFailureCategory | undefined;
        if (fact.transport.dispatchState === 'not-dispatched') {
          failureCategory = 'transport-not-dispatched';
        } else if (fact.transport.outcome === 'post-dispatch-unknown') {
          failureCategory = 'transport-post-dispatch-unknown';
        } else if (fact.transport.outcome === 'failed') {
          failureCategory = 'transport-failed';
        } else if (!fact.result || !fact.spool) {
          throw new TypeError(
            'Evaluation endpoint-smoke completed response is missing replay authority.'
          );
        } else if (!modelMatchesTarget(fact.authority.target, fact.result)) {
          failureCategory = 'model-identity-drift';
        } else {
          try {
            usageAccounting = createUsageAccounting(
              plan,
              fact.authority,
              fact.transport,
              fact.result
            );
          } catch {
            failureCategory = 'usage-unavailable';
          }
          if (usageAccounting) {
            try {
              accounting = createAccounting(
                plan,
                fact.authority,
                fact.transport,
                fact.result,
                usageAccounting
              );
            } catch {
              failureCategory = 'cost-unavailable';
            }
          }
          if (
            accounting &&
            fact.result.outputText !== fact.authority.expectedText
          ) {
            failureCategory = 'provider-response-invalid';
            usageAccounting = undefined;
            accounting = undefined;
          }
        }
        return Object.freeze({
          ...fact,
          ...(usageAccounting ? { usageAccounting } : {}),
          ...(accounting ? { accounting } : {}),
          ...(failureCategory ? { failureCategory } : {}),
        });
      });

      const actual = actualDemandFor(classified);
      const completedAt = classified.reduce((latest, { transport, spool }) => {
        const candidate =
          spool &&
          Date.parse(spool.createdAt) > Date.parse(transport.completedAt)
            ? spool.createdAt
            : transport.completedAt;
        return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
      }, reservation.reservedAt);
      const settlement = createSettlement(reservation, actual, completedAt);
      const settledReservation: AgentBudgetReservation = Object.freeze({
        ...reservation,
        status: 'settled',
        settlement,
      });

      const dispositions = classified.flatMap(({ spool, authority, intent }) =>
        spool
          ? [
              createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
                spoolRef: spool.spoolRef,
                spoolReceiptDigest: spool.receiptDigest,
                planDigest: plan.planDigest,
                repositoryCommit: plan.repositoryCommit,
                smokeTargetId: authority.target.smokeTargetId,
                smokeTargetDigest: authority.target.targetDigest,
                invocationId: intent.invocationId,
                disposition: 'consumed-and-destroyed',
                retentionPolicyDigest: spool.retentionPolicyDigest,
                disposedAt: completedAt,
              }),
            ]
          : []
      );
      const dispositionByTarget = new Map(
        dispositions.map((receipt) => [receipt.smokeTargetId, receipt])
      );
      const validationFailureReceipts = classified.flatMap((fact) => {
        if (fact.failureCategory !== 'provider-response-invalid') return [];
        if (!fact.spool || !fact.result) {
          throw new TypeError(
            'Evaluation endpoint-smoke invalid response is missing normalized replay authority.'
          );
        }
        return [
          createAgentEvaluationEndpointSmokeValidationFailureReceipt({
            receiptId: deterministicIdentity(
              'endpoint-smoke-validation-failure',
              {
                planDigest: plan.planDigest,
                smokeTargetDigest: fact.authority.target.targetDigest,
                transportReceiptDigest: fact.transport.receiptDigest,
              }
            ),
            planDigest: plan.planDigest,
            repositoryCommit: plan.repositoryCommit,
            smokeTargetId: fact.authority.target.smokeTargetId,
            smokeTargetDigest: fact.authority.target.targetDigest,
            invocationId: fact.intent.invocationId,
            dispatchIntentDigest: fact.intent.intentDigest,
            transportReceiptDigest: fact.transport.receiptDigest,
            spoolReceiptDigest: fact.spool.receiptDigest,
            validationCategory: 'expected-output-mismatch',
            findingDigest: digestAgentCanonicalValue({
              validationCategory: 'expected-output-mismatch',
              responseDigest: fact.result.responseDigest,
              normalizedEventSetDigest: fact.result.normalizedEventSetDigest,
            }),
            observedAt: fact.transport.completedAt,
          }),
        ];
      });
      const validationFailureByTarget = new Map(
        validationFailureReceipts.map((receipt) => [
          receipt.smokeTargetId,
          receipt,
        ])
      );
      const directSourceReceipts = classified.flatMap(
        ({ usageAccounting, accounting }) =>
          accounting
            ? [accounting.usageSourceReceipt, accounting.costSourceReceipt]
            : usageAccounting
              ? [usageAccounting.usageSourceReceipt]
              : []
      );
      const pricingSourceByContentDigest = new Map<
        CanonicalDigest,
        AgentEvaluationSourceReceipt
      >();
      for (const { accounting } of classified) {
        if (!accounting) continue;
        const existing = pricingSourceByContentDigest.get(
          accounting.pricingSourceReceipt.sourceContentDigest
        );
        if (
          existing &&
          !sameCanonicalJson(existing, accounting.pricingSourceReceipt)
        ) {
          throw new TypeError(
            'Evaluation endpoint-smoke pricing snapshot digest collided.'
          );
        }
        pricingSourceByContentDigest.set(
          accounting.pricingSourceReceipt.sourceContentDigest,
          existing ?? accounting.pricingSourceReceipt
        );
      }
      const sourceReceipts = [
        ...directSourceReceipts,
        ...pricingSourceByContentDigest.values(),
      ].sort((left, right) =>
        compareUnicodeCodePoints(left.sourceReceiptId, right.sourceReceiptId)
      );

      const endpointSmokeReceipts = classified.map((fact) => {
        const { target } = fact.authority;
        const disposition = dispositionByTarget.get(target.smokeTargetId);
        const common = Object.freeze({
          receiptId: deterministicIdentity('endpoint-smoke-receipt', {
            planDigest: plan.planDigest,
            smokeTargetDigest: target.targetDigest,
            transportReceiptDigest: fact.transport.receiptDigest,
          }),
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          smokeTargetId: target.smokeTargetId,
          smokeTargetDigest: target.targetDigest,
          endpointClass: target.endpointClass,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          modelId: target.modelId,
          immutableModelVersion: target.immutableModelVersion,
          modelLineageDigest: target.modelLineageDigest,
          inferenceConfigurationDigest: target.inferenceConfigurationDigest,
          adapterDigest: target.adapterDigest,
          pricingAuthorityDigest: target.pricingAuthorityDigest,
          responseSpoolEncryptionPolicyDigest:
            target.responseSpoolEncryptionPolicyDigest,
          smokeProfileDigest: target.smokeProfileDigest,
          invocationId: fact.intent.invocationId,
          budgetReservationId: reservationId,
          demandDigest,
          settlementDigest: settlement.settlementDigest,
          dispatchIntentDigest: fact.intent.intentDigest,
          transportReceiptDigest: fact.transport.receiptDigest,
          requestDigest: fact.intent.requestDigest,
          startedAt: fact.transport.startedAt,
          completedAt: fact.transport.completedAt,
        });
        const hasAnyResponseAuthority =
          fact.transport.providerRequestId !== undefined ||
          fact.transport.responseHeaderDigest !== undefined ||
          fact.transport.responseBodyDigest !== undefined;
        const hasCompleteResponseAuthority =
          fact.transport.providerRequestId !== undefined &&
          fact.transport.responseHeaderDigest !== undefined &&
          fact.transport.responseBodyDigest !== undefined;
        if (hasAnyResponseAuthority !== hasCompleteResponseAuthority) {
          throw new TypeError(
            'Evaluation endpoint-smoke response authority is incomplete.'
          );
        }
        const response = hasCompleteResponseAuthority
          ? {
              providerRequestId: fact.transport.providerRequestId!,
              responseHeaderDigest: fact.transport.responseHeaderDigest!,
              responseDigest:
                fact.result?.responseDigest ??
                fact.transport.responseBodyDigest!,
            }
          : {};
        const modelSource =
          fact.result ??
          (fact.transport.resolvedModelId
            ? {
                resolvedModelId: fact.transport.resolvedModelId,
                ...(fact.transport.resolvedModelVersion
                  ? {
                      resolvedModelVersion: fact.transport.resolvedModelVersion,
                    }
                  : {}),
              }
            : undefined);
        const model = modelSource
          ? {
              resolvedModelId: modelSource.resolvedModelId,
              ...(modelSource.resolvedModelVersion
                ? { resolvedModelVersion: modelSource.resolvedModelVersion }
                : {}),
            }
          : {};
        const spool =
          fact.spool && disposition
            ? {
                spoolReceiptDigest: fact.spool.receiptDigest,
                spoolDispositionReceiptDigest: disposition.receiptDigest,
              }
            : {};
        const accounting = fact.usageAccounting
          ? {
              usage: fact.usageAccounting.usage,
              usageSourceReceiptDigest:
                fact.usageAccounting.usageSourceReceipt.receiptDigest,
              ...(fact.accounting
                ? {
                    cost: fact.accounting.cost,
                    costSourceReceiptDigest:
                      fact.accounting.costSourceReceipt.receiptDigest,
                    pricingSnapshotRef:
                      fact.authority.pricing.snapshot.pricingSnapshotId,
                  }
                : {}),
            }
          : {};
        const validationFailure = validationFailureByTarget.get(
          target.smokeTargetId
        );
        return createAgentEvaluationEndpointSmokeReceipt(
          fact.failureCategory
            ? ({
                ...common,
                ...response,
                ...model,
                ...spool,
                ...accounting,
                outcome: 'failed',
                failureCategory: fact.failureCategory,
                ...(validationFailure
                  ? {
                      validationFailureReceiptDigest:
                        validationFailure.receiptDigest,
                    }
                  : {}),
              } as Parameters<
                typeof createAgentEvaluationEndpointSmokeReceipt
              >[0])
            : ({
                ...common,
                ...response,
                ...model,
                ...spool,
                ...accounting,
                outcome: 'passed',
              } as Parameters<
                typeof createAgentEvaluationEndpointSmokeReceipt
              >[0])
        );
      });

      const dispatchIntents = classified.map(({ intent }) => intent);
      const transportReceipts = classified.map(({ transport }) => transport);
      const resultSpoolReceipts = classified.flatMap(({ spool }) =>
        spool ? [spool] : []
      );
      const report = reportFor(
        plan,
        reservationId,
        dispatchIntents,
        transportReceipts,
        resultSpoolReceipts,
        dispositions,
        endpointSmokeReceipts,
        completedAt
      );
      for (const receipt of endpointSmokeReceipts) {
        const target = plan.endpointSmokeTargets.find(
          ({ smokeTargetId }) => smokeTargetId === receipt.smokeTargetId
        );
        const intent = dispatchIntents.find(
          ({ smokeTargetId }) => smokeTargetId === receipt.smokeTargetId
        );
        const transport = intent
          ? transportReceipts.find(
              ({ invocationId }) => invocationId === intent.invocationId
            )
          : undefined;
        const spool = resultSpoolReceipts.find(
          ({ smokeTargetId }) => smokeTargetId === receipt.smokeTargetId
        );
        const disposition = dispositions.find(
          ({ smokeTargetId }) => smokeTargetId === receipt.smokeTargetId
        );
        const validationFailure = validationFailureByTarget.get(
          receipt.smokeTargetId
        );
        if (
          !target ||
          !intent ||
          !transport ||
          !matchAgentEvaluationEndpointSmokeAuthorityFacts({
            planDigest: plan.planDigest,
            repositoryCommit: plan.repositoryCommit,
            target,
            intent,
            transport,
            ...(spool ? { spool } : {}),
            ...(disposition ? { disposition } : {}),
            ...(validationFailure ? { validationFailure } : {}),
            receipt,
          })
        ) {
          throw new TypeError(
            'Evaluation endpoint-smoke terminal authority facts drifted.'
          );
        }
      }
      const evidence: AgentEvaluationEndpointSmokeEvidenceCommit =
        Object.freeze({
          configurationDigest: qualification.configurationDigest,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          reservation: settledReservation,
          settlement,
          dispatchIntents: Object.freeze(dispatchIntents),
          transportReceipts: Object.freeze(transportReceipts),
          resultSpoolReceipts: Object.freeze(resultSpoolReceipts),
          resultSpoolDispositionReceipts: Object.freeze(dispositions),
          endpointSmokeReceipts: Object.freeze(endpointSmokeReceipts),
          validationFailureReceipts: Object.freeze(validationFailureReceipts),
          sourceReceipts: Object.freeze(sourceReceipts),
          report,
        });
      const acknowledged = await dependencies.journal.commitEvidence(evidence);
      if (!sameCanonicalJson(acknowledged, evidence)) {
        throw new TypeError(
          'Evaluation endpoint-smoke commit acknowledgement drifted.'
        );
      }
      return validateCommittedEvidence(acknowledged, qualification);
    },
  };
  return Object.freeze(qualifier);
};
