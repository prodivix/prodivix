import { createHmac, randomBytes } from 'node:crypto';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  BrowserRuntimeControlExpectedWitness,
  BrowserRuntimeControlIdentifierNamespace,
} from '../browserRuntimeControlPort';

const DOCUMENT_BUDGET = 1_024;
const RANDOM_SAMPLE_BUDGET = 4_096;
const IDENTIFIER_SAMPLE_BUDGET = 256;

export type RuntimeCursorProjection = Readonly<{
  documentInitializationCount: number;
  randomSampleCount: number;
  identifierSampleCounts: Readonly<
    Record<BrowserRuntimeControlIdentifierNamespace, number>
  >;
  witnessCaptured: boolean;
}>;

export type RuntimeCursorTransition =
  | 'document-initialized'
  | 'random-consumed'
  | 'identifier-consumed'
  | 'witness-captured';

export type RuntimeReportEvent =
  | Readonly<{
      kind: 'cursor-transition';
      transition: RuntimeCursorTransition;
      namespace?: BrowserRuntimeControlIdentifierNamespace;
      cursor: RuntimeCursorProjection;
    }>
  | Readonly<{
      kind: 'activity';
      activity:
        | 'animation-created'
        | 'animation-frame-created'
        | 'crypto-random-created'
        | 'timer-created'
        | 'stream-created'
        | 'worker-created'
        | 'worker-denied'
        | 'request-denied'
        | 'author-request-created'
        | 'clock-control-attempted';
      policyDirective?: string;
    }>;

export type RuntimeCursorSealManifest = Readonly<{
  format: 'prodivix.browser-runtime-cursor-seals';
  version: 1;
  nonce: string;
  documentCountSeals: readonly string[];
  randomSampleCountSeals: readonly string[];
  identifierSampleCountSeals: Readonly<
    Record<BrowserRuntimeControlIdentifierNamespace, readonly string[]>
  >;
  witnessStateSeals: Readonly<{
    pending: string;
    captured: string;
  }>;
  expectedWitnessObservation: Readonly<{
    expectedRandomSample: number;
    observedRandomSample: number;
    expectedIdentifierSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
    observedIdentifierSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
    expectedOperationUuid: string;
    observedOperationUuid: string;
  }>;
}>;

export const createEmptyRuntimeCursorProjection = (): RuntimeCursorProjection =>
  Object.freeze({
    documentInitializationCount: 0,
    randomSampleCount: 0,
    identifierSampleCounts: Object.freeze({
      attempt: 0,
      step: 0,
      action: 0,
      operation: 0,
    }),
    witnessCaptured: false,
  });

const exactCursor = (value: unknown): RuntimeCursorProjection | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const cursor = value as Record<string, unknown>;
  if (
    Object.keys(cursor).sort().join('\u0000') !==
      [
        'documentInitializationCount',
        'identifierSampleCounts',
        'randomSampleCount',
        'witnessCaptured',
      ].join('\u0000') ||
    !Number.isSafeInteger(cursor['documentInitializationCount']) ||
    (cursor['documentInitializationCount'] as number) < 0 ||
    !Number.isSafeInteger(cursor['randomSampleCount']) ||
    (cursor['randomSampleCount'] as number) < 0 ||
    typeof cursor['witnessCaptured'] !== 'boolean'
  ) {
    return undefined;
  }
  const identifiers = cursor['identifierSampleCounts'];
  if (
    typeof identifiers !== 'object' ||
    identifiers === null ||
    Array.isArray(identifiers)
  ) {
    return undefined;
  }
  const samples = identifiers as Record<string, unknown>;
  if (
    Object.keys(samples).sort().join('\u0000') !==
      ['action', 'attempt', 'operation', 'step'].join('\u0000') ||
    Object.values(samples).some(
      (sample) => !Number.isSafeInteger(sample) || (sample as number) < 0
    )
  ) {
    return undefined;
  }
  return Object.freeze({
    documentInitializationCount: cursor[
      'documentInitializationCount'
    ] as number,
    randomSampleCount: cursor['randomSampleCount'] as number,
    identifierSampleCounts: Object.freeze({
      attempt: samples['attempt'] as number,
      step: samples['step'] as number,
      action: samples['action'] as number,
      operation: samples['operation'] as number,
    }),
    witnessCaptured: cursor['witnessCaptured'] as boolean,
  });
};

const identifierNamespaces = Object.freeze([
  'attempt',
  'step',
  'action',
  'operation',
] as const);

export const acceptRuntimeCursorTransition = (
  current: RuntimeCursorProjection,
  event: unknown
): RuntimeCursorProjection | undefined => {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return undefined;
  }
  const candidate = event as Record<string, unknown>;
  if (
    candidate['kind'] !== 'cursor-transition' ||
    typeof candidate['transition'] !== 'string'
  ) {
    return undefined;
  }
  const cursor = exactCursor(candidate['cursor']);
  if (!cursor) return undefined;
  const next = {
    documentInitializationCount: current.documentInitializationCount,
    randomSampleCount: current.randomSampleCount,
    identifierSampleCounts: {
      ...current.identifierSampleCounts,
    },
    witnessCaptured: current.witnessCaptured,
  };
  if (candidate['transition'] === 'document-initialized') {
    next.documentInitializationCount += 1;
  } else if (candidate['transition'] === 'random-consumed') {
    next.randomSampleCount += 1;
  } else if (candidate['transition'] === 'identifier-consumed') {
    const namespace = candidate['namespace'];
    if (
      typeof namespace !== 'string' ||
      !identifierNamespaces.includes(
        namespace as BrowserRuntimeControlIdentifierNamespace
      )
    ) {
      return undefined;
    }
    next.identifierSampleCounts[
      namespace as BrowserRuntimeControlIdentifierNamespace
    ] += 1;
  } else if (candidate['transition'] === 'witness-captured') {
    if (current.witnessCaptured) return undefined;
    next.witnessCaptured = true;
  } else {
    return undefined;
  }
  return sameCanonicalJson(cursor, next) ? cursor : undefined;
};

const createSealArray = (
  secret: Uint8Array,
  nonce: string,
  field: string,
  maximum: number
): readonly string[] =>
  Object.freeze(
    Array.from({ length: maximum + 1 }, (_, value) =>
      createHmac('sha256', secret)
        .update(`${nonce}\u0000${field}\u0000${value}`)
        .digest('hex')
    )
  );

export const createRuntimeCursorSealManifest = (
  witness: BrowserRuntimeControlExpectedWitness
): RuntimeCursorSealManifest => {
  const secret = randomBytes(32);
  const nonce = randomBytes(16).toString('hex');
  const seal = (field: string, value: string): string =>
    createHmac('sha256', secret)
      .update(`${nonce}\u0000${field}\u0000${value}`)
      .digest('hex');
  const expectedWitnessObservation = Object.freeze({
    expectedRandomSample: witness.randomSample,
    observedRandomSample: witness.randomSample,
    expectedIdentifierSamples: witness.identifierSamples,
    observedIdentifierSamples: witness.identifierSamples,
    expectedOperationUuid: witness.operationUuid,
    observedOperationUuid: witness.operationUuid,
  });
  return Object.freeze({
    format: 'prodivix.browser-runtime-cursor-seals',
    version: 1,
    nonce,
    documentCountSeals: createSealArray(
      secret,
      nonce,
      'document-count',
      DOCUMENT_BUDGET
    ),
    randomSampleCountSeals: createSealArray(
      secret,
      nonce,
      'random-sample-count',
      RANDOM_SAMPLE_BUDGET
    ),
    identifierSampleCountSeals: Object.freeze({
      attempt: createSealArray(
        secret,
        nonce,
        'identifier-attempt',
        IDENTIFIER_SAMPLE_BUDGET
      ),
      step: createSealArray(
        secret,
        nonce,
        'identifier-step',
        IDENTIFIER_SAMPLE_BUDGET
      ),
      action: createSealArray(
        secret,
        nonce,
        'identifier-action',
        IDENTIFIER_SAMPLE_BUDGET
      ),
      operation: createSealArray(
        secret,
        nonce,
        'identifier-operation',
        IDENTIFIER_SAMPLE_BUDGET
      ),
    }),
    witnessStateSeals: Object.freeze({
      pending: seal('witness-state', 'pending'),
      captured: seal(
        'witness-state',
        JSON.stringify(expectedWitnessObservation)
      ),
    }),
    expectedWitnessObservation,
  });
};
