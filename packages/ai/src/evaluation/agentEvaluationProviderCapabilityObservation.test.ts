import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
  createAgentProviderEvent,
} from '../providers/agentInvocationFacts';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  createAgentEvaluationCapabilityOwnerFact,
  createAgentEvaluationCapabilitySpecificReceipt,
  digestAgentEvaluationCapabilitySpecificAuthoritySemantic,
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificAuthority,
  type AgentEvaluationCapabilitySpecificReceiptKind,
} from './agentEvaluationCapabilitySpecificReceipt';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_ARCHIVE_BYTES,
  createAgentEvaluationCapabilitySpecificProviderObservationProjection,
  createAgentEvaluationProviderCapabilityFactAuthority,
  createAgentEvaluationProviderCapabilityObservationProjection,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  digestAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderCapabilityObservationReceiptSet,
  matchAgentEvaluationCapabilitySpecificProviderObservation,
  matchAgentEvaluationCapabilitySpecificProviderObservationProjection,
  matchAgentEvaluationProviderCapabilityObservationFactPolicy,
  selectAgentEvaluationProviderCapabilityObservationFacts,
  type CreateAgentEvaluationProviderCapabilityObservationReceiptInput,
} from './agentEvaluationProviderCapabilityObservation';

const digest = (value: string) => digestAgentCanonicalValue({ value });
const observedAt = '2026-08-08T08:00:00.000Z';
const sanitization = Object.freeze({
  protectedMaterialCanaries: Object.freeze([
    'protected-observation-canary-9f86d081884c',
  ]),
  secretCanaries: Object.freeze(['secret-observation-canary-a665a4592042']),
});
const terminal = createAgentProviderEvent({
  eventId: 'event.provider-capability-observation.completed',
  invocationId: 'invocation.provider-capability-observation',
  sequence: 2,
  type: 'completed',
  payloadDigest: digest('terminal-payload'),
  occurredAt: observedAt,
});
const usage = createAgentUsageVector([
  {
    unit: 'text-token-input',
    logicalAmount: '3',
    billableAmount: '3',
    confidence: 'reported',
  },
  {
    unit: 'text-token-output',
    logicalAmount: '2',
    billableAmount: '2',
    confidence: 'reported',
  },
]);

const runtimeSourceAuthorityForFact = (
  factKind: Extract<
    CreateAgentEvaluationProviderCapabilityObservationReceiptInput['facts'][number]['factKind'],
    | 'opaque-continuation'
    | 'provider-cache-receipt'
    | 'provider-job-receipt'
    | 'retrieval-query-receipt'
  >,
  binding: Readonly<{
    protocolFamily:
      'openai-responses' | 'anthropic-messages' | 'gemini-interactions';
    providerConfigurationId: string;
    modelLineageDigest: ReturnType<typeof digest>;
    adapterDigest: ReturnType<typeof digest>;
  }>
) => {
  const capabilityIdByFactKind = {
    'opaque-continuation': 'provider.reasoning-continuation',
    'provider-cache-receipt': 'provider.isolated-cache',
    'provider-job-receipt': 'provider.background-job',
    'retrieval-query-receipt': 'provider.hosted-retrieval',
  } as const;
  const capabilityId = capabilityIdByFactKind[factKind];
  return createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind:
      capabilityId === 'provider.hosted-retrieval'
        ? 'sealed-hosted-owner-result'
        : 'sealed-provider-response-metadata',
    sourceAuthorityId: `authority.${capabilityId}.test`,
    sourceAuthorityImplementationDigest: digest(
      `runtime-source-implementation.${capabilityId}`
    ),
    routeBinding: `route.${capabilityId}.test`,
    capabilityProfileId: `capability-profile.${capabilityId}.core`,
    capabilityProfileDigest: digest(`capability-profile.${capabilityId}.core`),
    capabilityId,
    protocolFamily: binding.protocolFamily,
    providerConfigurationId: binding.providerConfigurationId,
    modelId: 'model.provider-capability-observation.test',
    modelLineageDigest: binding.modelLineageDigest,
    adapterDigest: binding.adapterDigest,
    registrationAuthorityIssuerId: 'authority.backend-8790.test',
    registrationReceiptDigest: digest(`registration.${capabilityId}.test`),
    ...(capabilityId === 'provider.hosted-retrieval'
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest: digest(
            'hosted-retrieval-registration-intent.test'
          ),
        }
      : {}),
  });
};

const input = (
  overrides: Partial<CreateAgentEvaluationProviderCapabilityObservationReceiptInput> = {}
): CreateAgentEvaluationProviderCapabilityObservationReceiptInput => {
  const defaultFacts = Object.freeze([
    Object.freeze({
      factKind: 'provider-event' as const,
      factDigest: terminal.eventDigest,
      value: terminal,
    }),
    Object.freeze({
      factKind: 'usage-vector' as const,
      factDigest: usage.vectorDigest,
      value: usage,
    }),
  ]);
  const facts = overrides.facts ?? defaultFacts;
  const transportReceiptDigest =
    overrides.transportReceiptDigest ?? digest('transport-receipt');
  const resultSpoolReceiptDigest =
    overrides.resultSpoolReceiptDigest ?? digest('result-spool-receipt');
  const normalizedEventSetDigest =
    overrides.normalizedEventSetDigest ?? digest('normalized-event-set');
  const providerConfigurationId =
    overrides.providerConfigurationId ?? 'provider.openai-responses.production';
  const adapterDigest = overrides.adapterDigest ?? digest('adapter');
  const dispatchIntentDigest =
    overrides.dispatchIntentDigest ?? digest('dispatch-intent');
  const planDigest = overrides.planDigest ?? digest('plan');
  const repositoryCommit =
    overrides.repositoryCommit ?? '0123456789abcdef0123456789abcdef01234567';
  const attemptId =
    overrides.attemptId ?? 'attempt.provider-capability-observation';
  const descriptorDigest = overrides.descriptorDigest ?? digest('descriptor');
  const turnIndex = overrides.turnIndex ?? 2;
  const invocationId = overrides.invocationId ?? terminal.invocationId;
  const requestDigest = overrides.requestDigest ?? digest('request');
  const responseDigest = overrides.responseDigest ?? digest('response');
  const protocolFamily = overrides.protocolFamily ?? 'openai-responses';
  const modelLineageDigest =
    overrides.modelLineageDigest ?? digest('model-lineage');
  const observedAtValue = overrides.observedAt ?? observedAt;
  const factAuthorities =
    overrides.factAuthorities ??
    Object.freeze(
      facts.map((fact) => {
        const nativeFact =
          fact.factKind === 'provider-event' ||
          fact.factKind === 'usage-vector';
        const runtimeSourceAuthority = nativeFact
          ? null
          : runtimeSourceAuthorityForFact(fact.factKind, {
              protocolFamily,
              providerConfigurationId,
              modelLineageDigest,
              adapterDigest,
            });
        const sourceAuthorityKind = nativeFact
          ? ('native-provider-transport' as const)
          : ('shared-durable-capability' as const);
        const sourceAuthorityId = nativeFact
          ? providerConfigurationId
          : runtimeSourceAuthority!.sourceAuthorityId;
        const sourceAuthorityImplementationDigest = nativeFact
          ? adapterDigest
          : runtimeSourceAuthority!.sourceAuthorityImplementationDigest;
        const stageDigest = nativeFact
          ? dispatchIntentDigest
          : digest(`stage.${fact.factKind}`);
        const dispatchAckDigest = nativeFact
          ? transportReceiptDigest
          : digest(`dispatch-ack.${fact.factKind}`);
        const sourceTransportReceiptDigest = nativeFact
          ? transportReceiptDigest
          : digest(`shared-transport.${fact.factKind}`);
        const sourceResultSpoolReceiptDigest = nativeFact
          ? resultSpoolReceiptDigest
          : digest(`shared-result-spool.${fact.factKind}`);
        const sourceNormalizedEventSetDigest = nativeFact
          ? normalizedEventSetDigest
          : digest(`shared-normalized-event-set.${fact.factKind}`);
        const runtimeFactEnvelopeDigest =
          digestAgentEvaluationProviderCapabilityRuntimeFactEnvelope({
            sourceAuthorityKind,
            sourceAuthorityId,
            sourceAuthorityImplementationDigest,
            sourceKind: runtimeSourceAuthority?.sourceKind,
            routeBinding: runtimeSourceAuthority?.routeBinding,
            registrationAuthorityIssuerId:
              runtimeSourceAuthority?.registrationAuthorityIssuerId,
            registrationReceiptDigest:
              runtimeSourceAuthority?.registrationReceiptDigest,
            runtimeFactSourceAuthorityDigest:
              runtimeSourceAuthority?.authorityDigest,
            stageDigest,
            dispatchAckDigest,
            planDigest,
            repositoryCommit,
            attemptId,
            descriptorDigest,
            turnIndex,
            invocationId,
            requestDigest,
            responseDigest,
            protocolFamily,
            providerConfigurationId,
            modelLineageDigest,
            adapterDigest,
            dispatchIntentDigest,
            transportReceiptDigest: sourceTransportReceiptDigest,
            resultSpoolReceiptDigest: sourceResultSpoolReceiptDigest,
            normalizedEventSetDigest: sourceNormalizedEventSetDigest,
            observedAt: observedAtValue,
            fact,
          });
        return createAgentEvaluationProviderCapabilityFactAuthority({
          factKind: fact.factKind,
          factDigest: fact.factDigest,
          sourceAuthorityKind,
          sourceAuthorityId,
          sourceAuthorityImplementationDigest,
          sourceKind: runtimeSourceAuthority?.sourceKind,
          routeBinding: runtimeSourceAuthority?.routeBinding,
          registrationAuthorityIssuerId:
            runtimeSourceAuthority?.registrationAuthorityIssuerId,
          registrationReceiptDigest:
            runtimeSourceAuthority?.registrationReceiptDigest,
          runtimeFactSourceAuthorityDigest:
            runtimeSourceAuthority?.authorityDigest,
          stageDigest,
          dispatchAckDigest,
          transportReceiptDigest: sourceTransportReceiptDigest,
          resultSpoolReceiptDigest: sourceResultSpoolReceiptDigest,
          normalizedEventSetDigest: sourceNormalizedEventSetDigest,
          runtimeFactEnvelopeDigest,
        });
      })
    );
  return Object.freeze({
    observationReceiptId: 'observation.provider-capability.test',
    planDigest,
    repositoryCommit,
    attemptId,
    descriptorDigest,
    turnIndex,
    invocationId,
    requestDigest,
    responseDigest,
    protocolFamily,
    providerConfigurationId,
    modelLineageDigest,
    adapterDigest,
    dispatchIntentDigest,
    transportReceiptDigest,
    resultSpoolReceiptDigest,
    normalizedEventSetDigest,
    facts,
    factAuthorities,
    observedAt: observedAtValue,
    ...overrides,
  });
};

const runtimeEnvelopeFromObservationFact = (
  observation: ReturnType<
    typeof createAgentEvaluationProviderCapabilityObservationReceipt
  >,
  fact: ReturnType<
    typeof createAgentEvaluationProviderCapabilityObservationReceipt
  >['facts'][number]
) => {
  const authority = observation.factAuthorities.find(
    (candidate) =>
      candidate.factKind === fact.factKind &&
      candidate.factDigest === fact.factDigest
  );
  if (authority === undefined) {
    throw new TypeError('Observation fact authority is missing.');
  }
  return createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
    {
      sourceAuthorityKind: authority.sourceAuthorityKind,
      sourceAuthorityId: authority.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        authority.sourceAuthorityImplementationDigest,
      sourceKind: authority.sourceKind,
      routeBinding: authority.routeBinding,
      registrationAuthorityIssuerId: authority.registrationAuthorityIssuerId,
      registrationReceiptDigest: authority.registrationReceiptDigest,
      runtimeFactSourceAuthorityDigest:
        authority.runtimeFactSourceAuthorityDigest,
      stageDigest: authority.stageDigest,
      dispatchAckDigest: authority.dispatchAckDigest,
      planDigest: observation.planDigest,
      repositoryCommit: observation.repositoryCommit,
      attemptId: observation.attemptId,
      descriptorDigest: observation.descriptorDigest,
      turnIndex: observation.turnIndex,
      invocationId: observation.invocationId,
      requestDigest: observation.requestDigest,
      responseDigest: observation.responseDigest,
      protocolFamily: observation.protocolFamily,
      providerConfigurationId: observation.providerConfigurationId,
      modelLineageDigest: observation.modelLineageDigest,
      adapterDigest: observation.adapterDigest,
      dispatchIntentDigest: observation.dispatchIntentDigest,
      transportReceiptDigest: authority.transportReceiptDigest,
      resultSpoolReceiptDigest: authority.resultSpoolReceiptDigest,
      normalizedEventSetDigest: authority.normalizedEventSetDigest,
      observedAt: observation.observedAt,
      fact,
    },
    sanitization
  );
};

const capabilityDenialSpecificReceipt = (
  observation: ReturnType<
    typeof createAgentEvaluationProviderCapabilityObservationReceipt
  >,
  receiptKind: Extract<
    AgentEvaluationCapabilitySpecificReceiptKind,
    'authority-denial-receipt' | 'capability-unavailable-receipt'
  >
): ReturnType<typeof createAgentEvaluationCapabilitySpecificReceipt> => {
  const fact = createAgentEvaluationCapabilityOwnerFact({
    authorityKind: 'capability-denial',
    category: receiptKind,
    authorityId: `authority.${receiptKind}`,
    authorityImplementationDigest: digest('capability-denial-implementation'),
    policyDigest: digest('capability-denial-policy'),
    authorityRequestDigest: digest('capability-denial-request'),
    authorityResultDigest: observation.responseDigest,
    reasonCode:
      receiptKind === 'capability-unavailable-receipt'
        ? 'native-observation-unavailable'
        : 'provider-capability-denied',
    decisionDigest: observation.responseDigest,
    observedAt: observation.observedAt,
  });
  return createAgentEvaluationCapabilitySpecificReceipt({
    receiptId: `capability-specific.${receiptKind}`,
    receiptKind,
    planDigest: observation.planDigest,
    repositoryCommit: observation.repositoryCommit,
    attemptId: observation.attemptId,
    descriptorDigest: observation.descriptorDigest,
    caseId: 'case.provider-capability-observation',
    materialDigest: digest('material'),
    capabilityDescriptorDigest: digest('capability-descriptor'),
    turnIndex: observation.turnIndex,
    invocationId: observation.invocationId,
    providerCapabilityObservationReceiptDigest: observation.receiptDigest,
    requestDigest: observation.requestDigest,
    resultDigest: observation.responseDigest,
    startedAt: observation.observedAt,
    completedAt: observation.observedAt,
    authority: Object.freeze({
      authorityKind: 'capability-denial' as const,
      receiptKind,
      factDigest: fact.factDigest,
      semanticDigest: digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
        authorityKind: 'capability-denial',
        receiptKind,
        factDigest: fact.factDigest,
      }),
      fact,
    }),
  });
};

const providerSpecificReceipt = (
  observation: ReturnType<
    typeof createAgentEvaluationProviderCapabilityObservationReceipt
  >,
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind,
  authority: AgentEvaluationCapabilitySpecificAuthority
) =>
  createAgentEvaluationCapabilitySpecificReceipt({
    receiptId: `capability-specific.${receiptKind}.projection-test`,
    receiptKind,
    planDigest: observation.planDigest,
    repositoryCommit: observation.repositoryCommit,
    attemptId: observation.attemptId,
    descriptorDigest: observation.descriptorDigest,
    caseId: 'case.provider-capability-observation',
    materialDigest: digest('material'),
    capabilityDescriptorDigest: digest('capability-descriptor'),
    turnIndex: observation.turnIndex,
    invocationId: observation.invocationId,
    providerCapabilityObservationReceiptDigest: observation.receiptDigest,
    requestDigest: observation.requestDigest,
    resultDigest: observation.responseDigest,
    startedAt: observation.observedAt,
    completedAt: observation.observedAt,
    authority,
  });

describe('AgentEvaluationProviderCapabilityObservationReceipt', () => {
  it('binds one bounded native turn observation to transport and encrypted spool facts', () => {
    const receipt = createAgentEvaluationProviderCapabilityObservationReceipt(
      input(),
      sanitization
    );

    expect(isAgentEvaluationProviderCapabilityObservationReceipt(receipt)).toBe(
      true
    );
    expect(receipt.facts.map(({ factKind }) => factKind)).toEqual([
      'provider-event',
      'usage-vector',
    ]);
    expect(receipt.observationDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(
      digestAgentEvaluationProviderCapabilityObservationReceiptSet([receipt])
    ).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_ARCHIVE_BYTES
    ).toBe(1_610_219_520);
  });

  it('selects only owner-sealed transport-neutral facts with one exact turn binding', () => {
    const observation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input(),
        sanitization
      );
    const envelopeInput = (
      fact: (typeof observation.facts)[number],
      overrides: Partial<
        Parameters<
          typeof createAgentEvaluationProviderCapabilityRuntimeFactEnvelope
        >[0]
      > = {}
    ) => ({
      sourceAuthorityKind: 'native-provider-transport' as const,
      sourceAuthorityId: observation.providerConfigurationId,
      sourceAuthorityImplementationDigest: observation.adapterDigest,
      stageDigest: observation.dispatchIntentDigest,
      dispatchAckDigest: observation.transportReceiptDigest,
      planDigest: observation.planDigest,
      repositoryCommit: observation.repositoryCommit,
      attemptId: observation.attemptId,
      descriptorDigest: observation.descriptorDigest,
      turnIndex: observation.turnIndex,
      invocationId: observation.invocationId,
      requestDigest: observation.requestDigest,
      responseDigest: observation.responseDigest,
      protocolFamily: observation.protocolFamily,
      providerConfigurationId: observation.providerConfigurationId,
      modelLineageDigest: observation.modelLineageDigest,
      adapterDigest: observation.adapterDigest,
      dispatchIntentDigest: observation.dispatchIntentDigest,
      transportReceiptDigest: observation.transportReceiptDigest,
      resultSpoolReceiptDigest: observation.resultSpoolReceiptDigest,
      normalizedEventSetDigest: observation.normalizedEventSetDigest,
      observedAt: observation.observedAt,
      fact,
      ...overrides,
    });
    const emptyApplicableCanaries = Object.freeze({
      protectedMaterialCanaries: Object.freeze([]),
      secretCanaries: Object.freeze([]),
    });
    const envelopes = observation.facts.map((fact) =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        envelopeInput(fact),
        emptyApplicableCanaries
      )
    );
    const admittedSourceAuthorities = Object.freeze([
      Object.freeze({
        sourceAuthorityKind: 'native-provider-transport' as const,
        sourceAuthorityId: observation.providerConfigurationId,
        sourceAuthorityImplementationDigest: observation.adapterDigest,
      }),
    ]);

    expect(
      envelopes.every((envelope) =>
        isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
          envelope,
          emptyApplicableCanaries
        )
      )
    ).toBe(true);
    expect(
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes,
        requiredFactKinds: Object.freeze(['usage-vector']),
        admittedSourceAuthorities,
        sanitization: emptyApplicableCanaries,
      }).facts.map(({ factKind }) => factKind)
    ).toEqual(['usage-vector']);
    expect(
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes,
        requiredFactKinds: Object.freeze(['retrieval-query-receipt']),
        admittedSourceAuthorities,
        sanitization: emptyApplicableCanaries,
      }).facts
    ).toEqual([]);

    const swapped = createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      envelopeInput(observation.facts[1]!, {
        descriptorDigest: digest('swapped-runtime-descriptor'),
      }),
      emptyApplicableCanaries
    );
    expect(() =>
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes: Object.freeze([envelopes[0]!, swapped]),
        requiredFactKinds: Object.freeze(['provider-event', 'usage-vector']),
        admittedSourceAuthorities,
        sanitization: emptyApplicableCanaries,
      })
    ).toThrow(/binding drifted/u);
    expect(() =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        envelopeInput(observation.facts[0]!, {
          sourceAuthorityKind: 'shared-durable-capability',
        }),
        emptyApplicableCanaries
      )
    ).toThrow(/authority is invalid/u);
    expect(() =>
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes,
        requiredFactKinds: Object.freeze(['provider-event']),
        admittedSourceAuthorities: Object.freeze([
          Object.freeze({
            ...admittedSourceAuthorities[0]!,
            sourceAuthorityId: 'authority.native-provider-transport.unknown',
          }),
        ]),
        sanitization: emptyApplicableCanaries,
      })
    ).toThrow(/selection is invalid/u);
  });

  it('joins a native terminal with an independently sealed shared job fact', () => {
    const jobBase = Object.freeze({
      providerJobId: 'job.provider-capability.shared-source',
      taskId: 'task.provider-capability-observation',
      runId: 'run.provider-capability-observation',
      generation: 1,
      invocationId: terminal.invocationId,
      phase: 'terminal' as const,
      outcome: 'completed' as const,
      callbackAuthority: 'revoked' as const,
    });
    const job = Object.freeze({
      ...jobBase,
      receiptDigest: digestAgentCanonicalValue(jobBase),
    });
    const jobFact = Object.freeze({
      factKind: 'provider-job-receipt' as const,
      factDigest: job.receiptDigest,
      value: job,
    });
    const terminalFact = input().facts[0]!;
    const observation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([jobFact, terminalFact]) }),
        sanitization
      );
    const runtimeSourceAuthority = runtimeSourceAuthorityForFact(
      'provider-job-receipt',
      {
        protocolFamily: observation.protocolFamily,
        providerConfigurationId: observation.providerConfigurationId,
        modelLineageDigest: observation.modelLineageDigest,
        adapterDigest: observation.adapterDigest,
      }
    );
    const sharedAuthority = observation.factAuthorities.find(
      ({ factKind }) => factKind === 'provider-job-receipt'
    )!;
    expect(sharedAuthority.transportReceiptDigest).not.toBe(
      observation.transportReceiptDigest
    );
    expect(sharedAuthority.resultSpoolReceiptDigest).not.toBe(
      observation.resultSpoolReceiptDigest
    );
    expect(sharedAuthority.normalizedEventSetDigest).not.toBe(
      observation.normalizedEventSetDigest
    );

    const selection = selectAgentEvaluationProviderCapabilityObservationFacts({
      envelopes: Object.freeze(
        observation.facts.map((fact) =>
          runtimeEnvelopeFromObservationFact(observation, fact)
        )
      ),
      requiredFactKinds: Object.freeze([
        'provider-event',
        'provider-job-receipt',
      ]),
      admittedSourceAuthorities: Object.freeze([
        Object.freeze({
          sourceAuthorityKind: 'native-provider-transport' as const,
          sourceAuthorityId: observation.providerConfigurationId,
          sourceAuthorityImplementationDigest: observation.adapterDigest,
        }),
        Object.freeze({
          sourceAuthorityKind: 'shared-durable-capability' as const,
          runtimeFactSourceAuthority: runtimeSourceAuthority,
        }),
      ]),
      sanitization,
    });
    expect(selection.facts.map(({ factKind }) => factKind)).toEqual([
      'provider-event',
      'provider-job-receipt',
    ]);
    const selectedObservation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          facts: selection.facts,
          factAuthorities: selection.factAuthorities,
        }),
        sanitization
      );
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        selectedObservation,
        Object.freeze({
          capabilityId: 'provider.background-job',
          supportExpectation: 'required' as const,
          expectedToolIds: Object.freeze(['provider.background-job.poll']),
          expectedReceiptKinds: Object.freeze([
            'background-job-receipt',
            'reconciliation-receipt',
          ]),
          descriptorDigest: digest('required-background-job-descriptor'),
        }),
        runtimeSourceAuthority
      )
    ).toBe(true);

    const {
      format: _format,
      version: _version,
      authorityDigest: _authorityDigest,
      ...sharedAuthorityInput
    } = sharedAuthority;
    void _format;
    void _version;
    void _authorityDigest;
    for (const field of [
      'stageDigest',
      'dispatchAckDigest',
      'transportReceiptDigest',
      'resultSpoolReceiptDigest',
      'normalizedEventSetDigest',
    ] as const) {
      const swappedAuthority =
        createAgentEvaluationProviderCapabilityFactAuthority({
          ...sharedAuthorityInput,
          [field]: digest(`swapped-shared-source.${field}`),
        });
      expect(() =>
        createAgentEvaluationProviderCapabilityObservationReceipt(
          input({
            facts: observation.facts,
            factAuthorities: Object.freeze(
              observation.factAuthorities.map((authority) =>
                authority.factKind === 'provider-job-receipt'
                  ? swappedAuthority
                  : authority
              )
            ),
          }),
          sanitization
        )
      ).toThrow(/receipt authority is invalid/u);
    }
  });

  it('admits required cache only as the exact cache plus usage two-fact policy', () => {
    const cache = createAgentProviderCacheReceipt({
      receipt: {
        cacheMode: 'prompt',
        cacheScope: 'task',
        prefixOrItemDigests: Object.freeze([digest('cache-policy-prefix')]),
        usageRef: 'usage.provider-capability.cache-policy',
      },
      isolation: 'task',
    });
    const cacheFact = Object.freeze({
      factKind: 'provider-cache-receipt' as const,
      factDigest: cache.receiptDigest,
      value: cache,
    });
    const usageFact = input().facts[1]!;
    const descriptor = Object.freeze({
      capabilityId: 'provider.isolated-cache',
      supportExpectation: 'required' as const,
      expectedToolIds: Object.freeze(['provider.cache.inspect']),
      expectedReceiptKinds: Object.freeze([
        'cache-lineage-receipt',
        'usage-receipt',
      ]),
      descriptorDigest: digest('required-cache-descriptor'),
    });
    const runtimeSourceAuthority = runtimeSourceAuthorityForFact(
      'provider-cache-receipt',
      {
        protocolFamily: 'openai-responses',
        providerConfigurationId: 'provider.openai-responses.production',
        modelLineageDigest: digest('model-lineage'),
        adapterDigest: digest('adapter'),
      }
    );
    const observation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([cacheFact, usageFact]) }),
        sanitization
      );
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        observation,
        descriptor,
        runtimeSourceAuthority
      )
    ).toBe(true);
    const cacheAuthority = observation.factAuthorities.find(
      ({ factKind }) => factKind === 'provider-cache-receipt'
    )!;
    const usageAuthority = observation.factAuthorities.find(
      ({ factKind }) => factKind === 'usage-vector'
    )!;
    expect(cacheAuthority.transportReceiptDigest).not.toBe(
      observation.transportReceiptDigest
    );
    expect(cacheAuthority.resultSpoolReceiptDigest).not.toBe(
      observation.resultSpoolReceiptDigest
    );
    expect(cacheAuthority.normalizedEventSetDigest).not.toBe(
      observation.normalizedEventSetDigest
    );
    expect(usageAuthority.transportReceiptDigest).toBe(
      observation.transportReceiptDigest
    );
    const unavailableObservation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input(),
        sanitization
      );
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        unavailableObservation,
        descriptor,
        runtimeSourceAuthority
      )
    ).toBe(true);

    const droppedUsage =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([cacheFact]) }),
        sanitization
      );
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        droppedUsage,
        descriptor,
        runtimeSourceAuthority
      )
    ).toBe(false);
    const swappedUsage =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([cacheFact, input().facts[0]!]) }),
        sanitization
      );
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        swappedUsage,
        descriptor,
        runtimeSourceAuthority
      )
    ).toBe(false);

    const { authorityDigest: _authorityDigest, ...authorityBase } =
      runtimeSourceAuthority;
    const swappedRuntimeSource =
      createAgentEvaluationRuntimeFactSourceAuthority({
        ...authorityBase,
        registrationReceiptDigest: digest('swapped-cache-registration'),
      });
    expect(
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        observation,
        descriptor,
        swappedRuntimeSource
      )
    ).toBe(false);
  });

  it('rejects a self-recomputed authority with a swapped runtime envelope digest', () => {
    const receiptInput = input();
    const authority = receiptInput.factAuthorities[0]!;
    const {
      format: _format,
      version: _version,
      authorityDigest: _authorityDigest,
      ...authorityInput
    } = authority;
    void _format;
    void _version;
    void _authorityDigest;
    const swappedAuthority =
      createAgentEvaluationProviderCapabilityFactAuthority({
        ...authorityInput,
        runtimeFactEnvelopeDigest: digest('swapped-runtime-envelope'),
      });
    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          factAuthorities: Object.freeze([
            swappedAuthority,
            receiptInput.factAuthorities[1]!,
          ]),
        }),
        sanitization
      )
    ).toThrow(/receipt authority is invalid/u);
  });

  it('matches compact projections for every provider-backed authority kind', () => {
    const assertProjectionMatch = (
      observedFact: CreateAgentEvaluationProviderCapabilityObservationReceiptInput['facts'][number],
      receiptKind: AgentEvaluationCapabilitySpecificReceiptKind,
      authority: AgentEvaluationCapabilitySpecificAuthority
    ) => {
      const observation =
        createAgentEvaluationProviderCapabilityObservationReceipt(
          input({ facts: Object.freeze([observedFact]) }),
          sanitization
        );
      const receipt = providerSpecificReceipt(
        observation,
        receiptKind,
        authority
      );
      const observationProjection =
        createAgentEvaluationProviderCapabilityObservationProjection(
          observation
        );
      const specificProjection =
        createAgentEvaluationCapabilitySpecificProviderObservationProjection(
          receipt
        );
      expect(
        matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
          specificProjection,
          observationProjection
        )
      ).toBe(true);
      expect(observationProjection.facts[0]).not.toHaveProperty('value');
      expect(
        matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
          specificProjection,
          Object.freeze({
            ...observationProjection,
            sourceAuthoritySetDigest: digest('swapped-source-authority-set'),
          })
        )
      ).toBe(false);
    };

    const jobBase = Object.freeze({
      providerJobId: 'job.provider-capability.projection',
      taskId: 'task.provider-capability-observation',
      runId: 'run.provider-capability-observation',
      generation: 1,
      invocationId: terminal.invocationId,
      phase: 'terminal' as const,
      outcome: 'completed' as const,
      callbackAuthority: 'revoked' as const,
    });
    const job = Object.freeze({
      ...jobBase,
      receiptDigest: digestAgentCanonicalValue(jobBase),
    });
    assertProjectionMatch(
      Object.freeze({
        factKind: 'provider-job-receipt' as const,
        factDigest: job.receiptDigest,
        value: job,
      }),
      'background-job-receipt',
      Object.freeze({
        authorityKind: 'provider-job' as const,
        receiptKind: 'background-job-receipt' as const,
        factDigest: job.receiptDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'provider-job',
            receiptKind: 'background-job-receipt',
            factDigest: job.receiptDigest,
          }),
        fact: job,
      })
    );

    const cache = createAgentProviderCacheReceipt({
      receipt: {
        cacheMode: 'prompt',
        cacheScope: 'task',
        prefixOrItemDigests: Object.freeze([digest('cache-prefix')]),
        usageRef: 'usage.provider-capability.projection',
      },
      isolation: 'task',
    });
    assertProjectionMatch(
      Object.freeze({
        factKind: 'provider-cache-receipt' as const,
        factDigest: cache.receiptDigest,
        value: cache,
      }),
      'cache-lineage-receipt',
      Object.freeze({
        authorityKind: 'provider-cache' as const,
        receiptKind: 'cache-lineage-receipt' as const,
        factDigest: cache.receiptDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'provider-cache',
            receiptKind: 'cache-lineage-receipt',
            factDigest: cache.receiptDigest,
          }),
        fact: cache,
      })
    );

    const continuation = createAgentOpaqueContinuation({
      continuationId: 'continuation.provider-capability.projection',
      encryptedBlobRef: 'encrypted-ref.provider-capability.projection',
      providerConfigurationId: 'provider.openai-responses.production',
      modelLineageDigest: digest('model-lineage'),
      taskId: 'task.provider-capability-observation',
      runId: 'run.provider-capability-observation',
      generation: 1,
      parentInvocationId: terminal.invocationId,
      purpose: 'provider-tool-loop-continuation',
      createdAt: observedAt,
      expiresAt: '2026-08-08T08:05:00.000Z',
    });
    assertProjectionMatch(
      Object.freeze({
        factKind: 'opaque-continuation' as const,
        factDigest: continuation.continuationDigest,
        value: continuation,
      }),
      'continuation-receipt',
      Object.freeze({
        authorityKind: 'opaque-continuation' as const,
        receiptKind: 'continuation-receipt' as const,
        factDigest: continuation.continuationDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'opaque-continuation',
            receiptKind: 'continuation-receipt',
            factDigest: continuation.continuationDigest,
          }),
        fact: continuation,
      })
    );

    const retrievalBase = Object.freeze({
      queryId: 'retrieval-query.provider-capability.projection',
      toolDescriptorDigest: digest('retrieval-tool'),
      queryDigest: digest('retrieval-query'),
      purpose: 'public-research' as const,
      networkPolicyDigest: digest('retrieval-network-policy'),
      sourceResultRefs: Object.freeze([
        'source.provider-capability.projection',
      ]),
      sourceResultDigests: Object.freeze([digest('retrieval-source')]),
      usageRef: 'usage.retrieval.projection',
      startedAt: observedAt,
      completedAt: observedAt,
    });
    const retrieval = Object.freeze({
      ...retrievalBase,
      receiptDigest: digestAgentCanonicalValue(retrievalBase),
    });
    assertProjectionMatch(
      Object.freeze({
        factKind: 'retrieval-query-receipt' as const,
        factDigest: retrieval.receiptDigest,
        value: retrieval,
      }),
      'retrieval-citation-receipt',
      Object.freeze({
        authorityKind: 'retrieval-query' as const,
        receiptKind: 'retrieval-citation-receipt' as const,
        factDigest: retrieval.receiptDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'retrieval-query',
            receiptKind: 'retrieval-citation-receipt',
            factDigest: retrieval.receiptDigest,
          }),
        fact: retrieval,
      })
    );

    assertProjectionMatch(
      input().facts[1]!,
      'usage-receipt',
      Object.freeze({
        authorityKind: 'usage-vector' as const,
        receiptKind: 'usage-receipt' as const,
        factDigest: usage.vectorDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'usage-vector',
            receiptKind: 'usage-receipt',
            factDigest: usage.vectorDigest,
          }),
        fact: usage,
      })
    );

    const refusal = createAgentProviderEvent({
      eventId: 'event.provider-capability-observation.projection-refusal',
      invocationId: terminal.invocationId,
      sequence: 2,
      type: 'refusal',
      payloadDigest: digest('projection-refusal-payload'),
      occurredAt: observedAt,
    });
    const refusalObservedFact = Object.freeze({
      factKind: 'provider-event' as const,
      factDigest: refusal.eventDigest,
      value: refusal,
    });
    const terminalObservation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          responseDigest: refusal.eventDigest,
          facts: Object.freeze([refusalObservedFact]),
        }),
        sanitization
      );
    const terminalOwnerFact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'terminal-normalization',
      category: 'refusal-receipt',
      authorityId: 'authority.terminal-normalization.projection',
      authorityImplementationDigest: digest(
        'terminal-normalization-implementation'
      ),
      authorityRequestDigest: digest('terminal-normalization-request'),
      authorityResultDigest: refusal.eventDigest,
      terminalEventDigest: refusal.eventDigest,
      normalizedOutcome: 'refused',
      normalizationPolicyDigest: digest('terminal-normalization-policy'),
      observedAt,
    });
    const terminalSpecific = providerSpecificReceipt(
      terminalObservation,
      'refusal-receipt',
      Object.freeze({
        authorityKind: 'terminal-normalization' as const,
        receiptKind: 'refusal-receipt' as const,
        factDigest: terminalOwnerFact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'terminal-normalization',
            receiptKind: 'refusal-receipt',
            factDigest: terminalOwnerFact.factDigest,
          }),
        fact: terminalOwnerFact,
      })
    );
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
        createAgentEvaluationCapabilitySpecificProviderObservationProjection(
          terminalSpecific
        ),
        createAgentEvaluationProviderCapabilityObservationProjection(
          terminalObservation
        )
      )
    ).toBe(true);

    const optionalFacts = Object.freeze([
      Object.freeze({
        factKind: 'provider-job-receipt' as const,
        factDigest: job.receiptDigest,
        value: job,
      }),
      Object.freeze({
        factKind: 'provider-cache-receipt' as const,
        factDigest: cache.receiptDigest,
        value: cache,
      }),
      Object.freeze({
        factKind: 'opaque-continuation' as const,
        factDigest: continuation.continuationDigest,
        value: continuation,
      }),
      Object.freeze({
        factKind: 'retrieval-query-receipt' as const,
        factDigest: retrieval.receiptDigest,
        value: retrieval,
      }),
    ]);
    for (const optionalFact of optionalFacts) {
      const denialObservation =
        createAgentEvaluationProviderCapabilityObservationReceipt(
          input({
            responseDigest: digest(`denial.${optionalFact.factKind}`),
            facts: Object.freeze([refusalObservedFact, optionalFact]),
          }),
          sanitization
        );
      const denialSpecific = capabilityDenialSpecificReceipt(
        denialObservation,
        'authority-denial-receipt'
      );
      expect(
        matchAgentEvaluationCapabilitySpecificProviderObservation(
          denialSpecific,
          denialObservation
        )
      ).toBe(false);
      expect(
        matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
          createAgentEvaluationCapabilitySpecificProviderObservationProjection(
            denialSpecific
          ),
          createAgentEvaluationProviderCapabilityObservationProjection(
            denialObservation
          )
        )
      ).toBe(false);
    }
  });

  it('accepts zero through two facts and rejects overflow or duplicate fact kinds', () => {
    for (const facts of [
      Object.freeze([]),
      Object.freeze([
        Object.freeze({
          factKind: 'provider-event' as const,
          factDigest: terminal.eventDigest,
          value: terminal,
        }),
      ]),
      input().facts,
    ]) {
      expect(
        createAgentEvaluationProviderCapabilityObservationReceipt(
          input({ facts }),
          sanitization
        ).facts
      ).toHaveLength(facts.length);
    }

    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([...input().facts, input().facts[0]!]) }),
        sanitization
      )
    ).toThrow(/observation receipt authority/u);
    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({ facts: Object.freeze([input().facts[0]!, input().facts[0]!]) }),
        sanitization
      )
    ).toThrow(/observation receipt authority/u);
  });

  it('admits zero or one observation per turn and rejects a same-turn swap', () => {
    const first = createAgentEvaluationProviderCapabilityObservationReceipt(
      input({ turnIndex: 0 }),
      sanitization
    );
    const secondTerminal = createAgentProviderEvent({
      eventId: 'event.provider-capability-observation.second',
      invocationId: 'invocation.provider-capability-observation.second',
      sequence: 1,
      type: 'completed',
      payloadDigest: digest('second-terminal-payload'),
      occurredAt: observedAt,
    });
    const second = createAgentEvaluationProviderCapabilityObservationReceipt(
      input({
        observationReceiptId: 'observation.provider-capability.second',
        turnIndex: 1,
        invocationId: secondTerminal.invocationId,
        facts: Object.freeze([
          Object.freeze({
            factKind: 'provider-event' as const,
            factDigest: secondTerminal.eventDigest,
            value: secondTerminal,
          }),
        ]),
      }),
      sanitization
    );
    const binding = Object.freeze({
      planDigest: first.planDigest,
      repositoryCommit: first.repositoryCommit,
      attemptId: first.attemptId,
      descriptorDigest: first.descriptorDigest,
      maximumTurnCount: 2,
    });
    expect(
      isAgentEvaluationProviderCapabilityObservationReceiptSet([], binding)
    ).toBe(true);
    expect(
      isAgentEvaluationProviderCapabilityObservationReceiptSet(
        [first, second],
        binding
      )
    ).toBe(true);
    expect(
      isAgentEvaluationProviderCapabilityObservationReceiptSet(
        [
          first,
          createAgentEvaluationProviderCapabilityObservationReceipt(
            input({
              observationReceiptId:
                'observation.provider-capability.same-turn-swap',
              turnIndex: 0,
              invocationId: secondTerminal.invocationId,
              facts: second.facts,
            }),
            sanitization
          ),
        ],
        binding
      )
    ).toBe(false);
  });

  it('rejects transport, fact-digest, and non-terminal event drift', () => {
    const receipt = createAgentEvaluationProviderCapabilityObservationReceipt(
      input(),
      sanitization
    );
    expect(
      isAgentEvaluationProviderCapabilityObservationReceipt({
        ...receipt,
        transportReceiptDigest: digest('swapped-transport'),
      })
    ).toBe(false);

    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          facts: Object.freeze([
            Object.freeze({
              factKind: 'provider-event' as const,
              factDigest: digest('forged-event'),
              value: terminal,
            }),
          ]),
        }),
        sanitization
      )
    ).toThrow(/observation receipt authority/u);

    const nonTerminal = createAgentProviderEvent({
      eventId: 'event.provider-capability-observation.delta',
      invocationId: terminal.invocationId,
      sequence: 0,
      type: 'output-delta',
      payloadDigest: digest('output'),
      occurredAt: observedAt,
    });
    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          facts: Object.freeze([
            Object.freeze({
              factKind: 'provider-event' as const,
              factDigest: nonTerminal.eventDigest,
              value: nonTerminal,
            }),
          ]),
        }),
        sanitization
      )
    ).toThrow(/observation receipt authority/u);
  });

  it('exactly binds unavailable and denial specifics to observed response semantics', () => {
    const unavailableObservation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input(),
        sanitization
      );
    const unavailableReceipt = capabilityDenialSpecificReceipt(
      unavailableObservation,
      'capability-unavailable-receipt'
    );
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        unavailableReceipt,
        unavailableObservation
      )
    ).toBe(true);
    const unavailableSpecificProjection =
      createAgentEvaluationCapabilitySpecificProviderObservationProjection(
        unavailableReceipt
      );
    const unavailableObservationProjection =
      createAgentEvaluationProviderCapabilityObservationProjection(
        unavailableObservation
      );
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
        unavailableSpecificProjection,
        unavailableObservationProjection
      )
    ).toBe(true);
    expect(unavailableObservationProjection.facts[0]).not.toHaveProperty(
      'value'
    );

    const refusal = createAgentProviderEvent({
      eventId: 'event.provider-capability-observation.refusal',
      invocationId: terminal.invocationId,
      sequence: 2,
      type: 'refusal',
      payloadDigest: digest('refusal-payload'),
      occurredAt: observedAt,
    });
    const denialObservation =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          responseDigest: digest('denial-response'),
          facts: Object.freeze([
            Object.freeze({
              factKind: 'provider-event' as const,
              factDigest: refusal.eventDigest,
              value: refusal,
            }),
            input().facts[1]!,
          ]),
        }),
        sanitization
      );
    const denialReceipt = capabilityDenialSpecificReceipt(
      denialObservation,
      'authority-denial-receipt'
    );
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        denialReceipt,
        denialObservation
      )
    ).toBe(true);
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
        createAgentEvaluationCapabilitySpecificProviderObservationProjection(
          denialReceipt
        ),
        createAgentEvaluationProviderCapabilityObservationProjection(
          denialObservation
        )
      )
    ).toBe(true);
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
        createAgentEvaluationCapabilitySpecificProviderObservationProjection(
          denialReceipt
        ),
        Object.freeze({
          ...createAgentEvaluationProviderCapabilityObservationProjection(
            denialObservation
          ),
          responseDigest: digest('swapped-projection-response'),
        })
      )
    ).toBe(false);

    const { receiptDigest: _receiptDigest, ...unavailableSpecificBase } =
      unavailableReceipt;
    const swappedObservationBase = Object.freeze({
      ...unavailableSpecificBase,
      providerCapabilityObservationReceiptDigest:
        denialObservation.receiptDigest,
    });
    const swappedObservationReceipt = Object.freeze({
      ...swappedObservationBase,
      receiptDigest: digestAgentCanonicalValue(swappedObservationBase),
    });
    expect(
      isAgentEvaluationCapabilitySpecificReceipt(swappedObservationReceipt)
    ).toBe(true);
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        swappedObservationReceipt,
        denialObservation
      )
    ).toBe(false);

    const continuation = createAgentOpaqueContinuation({
      continuationId: 'continuation.provider-capability.unavailable-mismatch',
      encryptedBlobRef: 'encrypted-ref.unavailable-mismatch',
      providerConfigurationId: unavailableObservation.providerConfigurationId,
      modelLineageDigest: unavailableObservation.modelLineageDigest,
      taskId: 'task.provider-capability-observation',
      runId: 'run.provider-capability-observation',
      generation: 1,
      parentInvocationId: unavailableObservation.invocationId,
      purpose: 'provider-tool-loop-continuation',
      createdAt: observedAt,
      expiresAt: '2026-08-08T08:05:00.000Z',
    });
    const observedCapability =
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          responseDigest: digest('observed-capability-response'),
          facts: Object.freeze([
            input().facts[0]!,
            Object.freeze({
              factKind: 'opaque-continuation' as const,
              factDigest: continuation.continuationDigest,
              value: continuation,
            }),
          ]),
        }),
        sanitization
      );
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        capabilityDenialSpecificReceipt(
          observedCapability,
          'capability-unavailable-receipt'
        ),
        observedCapability
      )
    ).toBe(false);
    expect(
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        capabilityDenialSpecificReceipt(
          unavailableObservation,
          'authority-denial-receipt'
        ),
        unavailableObservation
      )
    ).toBe(false);
  });

  it('rejects secret-like oversized continuation material before persistence', () => {
    const continuation = createAgentOpaqueContinuation({
      continuationId: 'continuation.provider-capability-observation',
      encryptedBlobRef: `encrypted-ref.${'x'.repeat(17_000)}`,
      providerConfigurationId: 'provider.openai-responses.production',
      modelLineageDigest: digest('model-lineage'),
      taskId: 'task.provider-capability-observation',
      runId: 'run.provider-capability-observation',
      generation: 1,
      parentInvocationId: terminal.invocationId,
      purpose: 'provider-tool-loop-continuation',
      createdAt: observedAt,
      expiresAt: '2026-08-08T08:05:00.000Z',
    });
    expect(() =>
      createAgentEvaluationProviderCapabilityObservationReceipt(
        input({
          facts: Object.freeze([
            Object.freeze({
              factKind: 'opaque-continuation' as const,
              factDigest: continuation.continuationDigest,
              value: continuation,
            }),
          ]),
        }),
        sanitization
      )
    ).toThrow(/safety bound|byte limit/u);
  });

  it('rejects credential-like and registered canary material before persistence', () => {
    for (const encryptedBlobRef of [
      'sk-providerCapabilitySecret123456',
      `encrypted-ref.${sanitization.secretCanaries[0]}`,
      `encrypted-ref.${sanitization.protectedMaterialCanaries[0]}`,
    ]) {
      const continuation = createAgentOpaqueContinuation({
        continuationId: 'continuation.provider-capability.sanitization',
        encryptedBlobRef,
        providerConfigurationId: 'provider.openai-responses.production',
        modelLineageDigest: digest('model-lineage'),
        taskId: 'task.provider-capability-observation',
        runId: 'run.provider-capability-observation',
        generation: 1,
        parentInvocationId: terminal.invocationId,
        purpose: 'provider-tool-loop-continuation',
        createdAt: observedAt,
        expiresAt: '2026-08-08T08:05:00.000Z',
      });
      expect(() =>
        createAgentEvaluationProviderCapabilityObservationReceipt(
          input({
            facts: Object.freeze([
              Object.freeze({
                factKind: 'opaque-continuation' as const,
                factDigest: continuation.continuationDigest,
                value: continuation,
              }),
            ]),
          }),
          sanitization
        )
      ).toThrow(/not sanitized/u);
    }
  });
});
