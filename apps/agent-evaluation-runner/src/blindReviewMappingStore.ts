import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  type AgentEvaluationReviewCandidateRef,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationBlindReviewMapping,
  AgentEvaluationBlindReviewMappingStore,
} from './coordinator';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';

const mappingKeys = Object.freeze([
  'format',
  'version',
  'mappingId',
  'planDigest',
  'repositoryCommit',
  'candidateId',
  'attemptId',
  'candidateDigest',
  'bytesDigest',
  'rubricDigest',
  'randomizedPresentationPolicyDigest',
  'randomizedPresentationId',
  'createdAt',
  'mappingDigest',
] as const);

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const presentationPattern = /^blind-review:[A-Za-z0-9_-]{43}$/u;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const invalid = (): never => {
  throw new TypeError('Evaluation blind review mapping is invalid.');
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> => {
  if (!isPlainObject(value)) return invalid();
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some(isUnsafeObjectKey) ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    return invalid();
  }
  return value;
};

const canonicalInstant = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !instantPattern.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    return invalid();
  }
  return value;
};

const mappingFromFact = (value: unknown): AgentEvaluationBlindReviewMapping => {
  const source = exactRecord(value, mappingKeys);
  if (
    source.format !== 'prodivix.g4-model-evaluation-blind-review-mapping' ||
    source.version !== 1 ||
    typeof source.mappingId !== 'string' ||
    !identityPattern.test(source.mappingId) ||
    !isAgentCanonicalDigest(source.planDigest) ||
    typeof source.repositoryCommit !== 'string' ||
    !commitPattern.test(source.repositoryCommit) ||
    typeof source.candidateId !== 'string' ||
    !identityPattern.test(source.candidateId) ||
    typeof source.attemptId !== 'string' ||
    !identityPattern.test(source.attemptId) ||
    !isAgentCanonicalDigest(source.candidateDigest) ||
    !isAgentCanonicalDigest(source.bytesDigest) ||
    !isAgentCanonicalDigest(source.rubricDigest) ||
    !isAgentCanonicalDigest(source.randomizedPresentationPolicyDigest) ||
    typeof source.randomizedPresentationId !== 'string' ||
    !presentationPattern.test(source.randomizedPresentationId) ||
    !isAgentCanonicalDigest(source.mappingDigest)
  ) {
    return invalid();
  }
  canonicalInstant(source.createdAt);
  const { mappingDigest: _mappingDigest, ...base } = source;
  if (source.mappingDigest !== digestAgentCanonicalValue(base))
    return invalid();
  return Object.freeze(source) as AgentEvaluationBlindReviewMapping;
};

const mappingFromGetResponse = (
  value: unknown
): AgentEvaluationBlindReviewMapping => {
  const response = exactRecord(value, ['fact']);
  return mappingFromFact(response.fact);
};

const mappingFromCreateResponse = (
  value: unknown
): AgentEvaluationBlindReviewMapping => {
  const response = exactRecord(value, ['fact', 'replayed']);
  if (typeof response.replayed !== 'boolean') return invalid();
  return mappingFromFact(response.fact);
};

const validateBinding = (
  plan: AgentModelEvaluationPlan,
  candidateRef: AgentEvaluationReviewCandidateRef,
  rubricDigest: string,
  mapping: AgentEvaluationBlindReviewMapping
): AgentEvaluationBlindReviewMapping => {
  if (
    mapping.planDigest !== plan.planDigest ||
    mapping.repositoryCommit !== plan.repositoryCommit ||
    mapping.candidateId !== candidateRef.candidateId ||
    mapping.attemptId !== candidateRef.attemptId ||
    mapping.candidateDigest !== candidateRef.candidateDigest ||
    mapping.bytesDigest !== candidateRef.bytesDigest ||
    mapping.rubricDigest !== rubricDigest ||
    mapping.randomizedPresentationPolicyDigest !==
      plan.graderPlan.randomizedPresentationPolicyDigest ||
    Date.parse(mapping.createdAt) < Date.parse(candidateRef.generatedAt) ||
    Date.parse(mapping.createdAt) > Date.parse(plan.expiresAt)
  ) {
    return invalid();
  }
  return mapping;
};

/** Uses the Backend-owned CSPRNG mapping table without exposing its authority map. */
export class HttpAgentEvaluationBlindReviewMappingStore implements AgentEvaluationBlindReviewMappingStore {
  readonly #input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  >;

  constructor(
    input: Omit<
      CreateEnvironmentAgentEvaluationLedgerClientInput,
      'planDigest'
    > = {}
  ) {
    this.#input = input;
  }

  async getOrCreate(
    input: Parameters<AgentEvaluationBlindReviewMappingStore['getOrCreate']>[0]
  ): Promise<AgentEvaluationBlindReviewMapping> {
    canonicalInstant(input.createdAt);
    const client = this.#client(input.plan);
    const mapping = mappingFromCreateResponse(
      await client.createBlindReviewMapping(input.candidateRef.candidateId)
    );
    return validateBinding(
      input.plan,
      input.candidateRef,
      input.rubricDigest,
      mapping
    );
  }

  async load(
    input: Parameters<AgentEvaluationBlindReviewMappingStore['load']>[0]
  ): Promise<AgentEvaluationBlindReviewMapping> {
    const client = this.#client(input.plan);
    const mapping = mappingFromGetResponse(
      await client.getBlindReviewMappingByCandidate(
        input.candidateRef.candidateId
      )
    );
    return validateBinding(
      input.plan,
      input.candidateRef,
      input.rubricDigest,
      mapping
    );
  }

  #client(plan: AgentModelEvaluationPlan) {
    const client = createEnvironmentAgentEvaluationLedgerClient({
      ...this.#input,
      planDigest: plan.planDigest,
    });
    if (
      client.scope.planDigest !== plan.planDigest ||
      client.scope.repositoryCommit !== plan.repositoryCommit
    ) {
      return invalid();
    }
    return client;
  }
}

export const createEnvironmentAgentEvaluationBlindReviewMappingStore = (
  input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = {}
): HttpAgentEvaluationBlindReviewMappingStore =>
  new HttpAgentEvaluationBlindReviewMappingStore(input);
