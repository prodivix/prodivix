import {
  createAgentCapabilityProbeProgram,
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
  createAgentProviderCacheReceipt,
  digestAgentCanonicalValue,
  digestAgentCapabilityProbeProfile,
  type AgentEvaluationProviderCapabilityObservedFact,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_DISPATCH_ACK_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_RECEIPT_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
  AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_READ_FORMAT,
  createAgentEvaluationOptionalCapabilityFactSourceRequest,
  createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient,
  decodeAgentEvaluationNativeOptionalCapabilityBootstrapSourceRead,
  digestAgentEvaluationOptionalCapabilityFactDispatchAck,
  digestAgentEvaluationOptionalCapabilityFactSourceRequest,
  digestAgentEvaluationOptionalCapabilityFactStage,
  type AgentEvaluationOptionalCapabilityFactSourceRequest,
} from './optionalCapabilityFactAuthorityClient';

const digest = (value: unknown) => digestAgentCanonicalValue(value);
const namespaceId = 'evaluation.optional-fact.client';
const planDigest = digest('optional-fact-plan');
const repositoryCommit = 'a'.repeat(40);
const serviceToken = 's'.repeat(32);
const observedAt = '2026-08-09T02:00:00.000Z';
const sealedAt = '2026-08-09T02:00:01.000Z';
const secretCanary = 'secret-canary-optional-client';
const protectedCanary = 'protected-canary-optional-client';
const ownerRequestDigest = digest('optional-effect-owner-request');
const ownerReceiptDigest = digest('optional-effect-owner-receipt');
const ownerStageDigest = digest('optional-effect-owner-stage');
const ownerDispatchAckDigest = digest('optional-effect-owner-ack');
const preEffectIntentDigest = digest('optional-pre-effect-intent');
const effectSourceReceiptDigest = digest('optional-effect-source-receipt');
const providerRuntimeJournalResultRecordDigest = digest(
  'optional-provider-runtime-journal-result-record'
);
const providerRuntimeResultSealReceiptDigest = digest(
  'optional-provider-runtime-result-seal-receipt'
);
const effectTransportReceiptDigest = digest('optional-effect-transport');
const effectResultSpoolReceiptDigest = digest('optional-effect-spool');
const effectNormalizedEventSetDigest = digest('optional-effect-normalized');
const businessResultDigest = digest('optional-effect-business-result');
const nativeBootstrapSourceRequestDigest = digest(
  'optional-native-bootstrap-source-request'
);
const nativeBootstrapSourceReceiptDigest = digest(
  'optional-native-bootstrap-source-receipt'
);
const nativeProviderSourceReceiptDigest = digest(
  'optional-native-provider-source-receipt'
);
const nativeProviderSourceDigest = digest('optional-native-provider-source');
const sanitization = Object.freeze({
  protectedMaterialCanaries: Object.freeze([protectedCanary]),
  secretCanaries: Object.freeze([secretCanary]),
});

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: repositoryCommit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: serviceToken,
});

const requestIdentity = Object.freeze({
  attemptId: 'attempt.optional-fact.client.1',
  descriptorDigest: digest('optional-fact-descriptor'),
  targetId: 'target.optional-fact.client.1',
  targetDigest: digest('optional-fact-target'),
  capabilityProfileId: 'profile.optional-fact.cache',
  capabilityProfileDigest: digest('optional-fact-profile'),
  capabilityDescriptorDigest: digest('optional-fact-capability-descriptor'),
  capabilityId: 'provider.isolated-cache' as const,
  supportExpectation: 'required' as const,
  turnIndex: 2,
  invocationId: 'invocation.optional-fact.client.1',
  protocolFamily: 'openai-responses' as const,
  providerConfigurationId: 'provider.optional-fact.client.1',
  modelId: 'model.optional-fact.client.1',
  modelLineageDigest: digest('optional-fact-model-lineage'),
  adapterDigest: digest('optional-fact-adapter'),
  providerRequestDigest: digest('optional-fact-provider-request'),
  responseDigest: digest('optional-fact-response'),
  dispatchIntentDigest: digest('optional-fact-dispatch-intent'),
  transportReceiptDigest: digest('optional-fact-transport'),
  resultSpoolReceiptDigest: digest('optional-fact-spool'),
});

const requestFixture = (
  observed: boolean,
  modelId: string = requestIdentity.modelId
): Readonly<{
  request: AgentEvaluationOptionalCapabilityFactSourceRequest;
  observedFact?: AgentEvaluationProviderCapabilityObservedFact;
}> => {
  const cache = createAgentProviderCacheReceipt({
    receipt: {
      cacheMode: 'prompt',
      cacheScope: 'task',
      prefixOrItemDigests: Object.freeze([digest('optional-cache-prefix')]),
      usageRef: 'usage.optional-fact.client.1',
    },
    isolation: 'task',
  });
  const request = createAgentEvaluationOptionalCapabilityFactSourceRequest({
    ...requestIdentity,
    modelId,
    normalizedEventSetDigest: digest('optional-normalized-event-set'),
    source: Object.freeze({
      kind: 'sealed-provider-response-metadata' as const,
      ownerRequestDigest,
      ownerReceiptDigest,
      effectSourceReceiptDigest,
    }),
  });
  return Object.freeze({
    request,
    ...(observed
      ? {
          observedFact: Object.freeze({
            factKind: 'provider-cache-receipt' as const,
            factDigest: cache.receiptDigest,
            value: cache,
          }),
        }
      : {}),
  });
};

const nativeBootstrapRequestFixture = (
  observed: boolean
): ReturnType<typeof requestFixture> => {
  const base = requestFixture(observed);
  const {
    format: _format,
    version: _version,
    source: _source,
    ...input
  } = base.request;
  return Object.freeze({
    request: createAgentEvaluationOptionalCapabilityFactSourceRequest({
      ...input,
      turnIndex: 0,
      source: Object.freeze({
        kind: 'sealed-provider-response-metadata' as const,
        nativeBootstrapSourceRequestDigest,
      }),
    }),
    ...(base.observedFact === undefined
      ? {}
      : { observedFact: base.observedFact }),
  });
};

type TamperMode =
  | 'ack'
  | 'canary'
  | 'effect-fact'
  | 'effect-source'
  | 'native-bootstrap-request'
  | 'native-evidence-null'
  | 'native-transport'
  | 'owner-ack'
  | 'owner-stage'
  | 'registration-ack'
  | 'registration-stage'
  | 'source-fence'
  | 'stage-fence';

const createBackend = (
  fixture: ReturnType<typeof requestFixture>,
  options: Readonly<{ ackLoss?: boolean; tamper?: TamperMode }> = {}
) => {
  const requests: Array<Readonly<{ path: string; init: RequestInit }>> = [];
  let sourceReceipt: Record<string, unknown> | undefined;
  let stageResponse: Record<string, unknown> | undefined;
  let authorityResponse: Record<string, unknown> | undefined;
  let sealExecutions = 0;
  let reconciliations = 0;

  const jsonResponse = (value: unknown): Response =>
    new Response(canonicalJsonText(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  const createSourceReceipt = (
    request: AgentEvaluationOptionalCapabilityFactSourceRequest
  ): Record<string, unknown> => {
    const outcome =
      fixture.observedFact === undefined ? 'unavailable' : 'observed';
    const receiptBase: Record<string, unknown> = {
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_RECEIPT_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      namespaceId,
      planDigest,
      repositoryCommit,
      attemptId: request.attemptId,
      descriptorDigest: request.descriptorDigest,
      targetId: request.targetId,
      targetDigest: request.targetDigest,
      capabilityProfileId: request.capabilityProfileId,
      capabilityProfileDigest: request.capabilityProfileDigest,
      capabilityDescriptorDigest: request.capabilityDescriptorDigest,
      capabilityId: request.capabilityId,
      supportExpectation: request.supportExpectation,
      turnIndex: request.turnIndex,
      invocationId: request.invocationId,
      protocolFamily: request.protocolFamily,
      providerConfigurationId: request.providerConfigurationId,
      modelId: request.modelId,
      modelLineageDigest: request.modelLineageDigest,
      adapterDigest: request.adapterDigest,
      providerRequestDigest: request.providerRequestDigest,
      responseDigest: request.responseDigest,
      dispatchIntentDigest: request.dispatchIntentDigest,
      transportReceiptDigest: request.transportReceiptDigest,
      resultSpoolReceiptDigest: request.resultSpoolReceiptDigest,
      normalizedEventSetDigest: request.normalizedEventSetDigest,
      targetAuthorityDigest: digest('optional-fact-target-authority'),
      sourceAuthorityId:
        options.tamper === 'canary'
          ? secretCanary
          : 'authority.optional-fact.client.1',
      sourceAuthorityImplementationDigest: digest(
        'optional-fact-source-implementation'
      ),
      sourceAuthorityRouteBinding: 'optional-capability-fact-authority',
      registrationAuthorityIssuerId: 'authority.evaluation-ledger.1',
      registrationReceiptDigest: digest(
        'optional-fact-source-registration-receipt'
      ),
      sourceKind: request.source.kind,
      sourceRequestDigest:
        digestAgentEvaluationOptionalCapabilityFactSourceRequest(request),
      outcome,
      observedAt,
      sealedAt,
      ownerStageDigest,
      ownerDispatchAckDigest,
      ...(fixture.observedFact === undefined
        ? {}
        : {
            fact: fixture.observedFact,
          }),
    };
    if (request.source.nativeBootstrapSourceRequestDigest !== undefined) {
      const boundBootstrapRequestDigest =
        options.tamper === 'native-bootstrap-request'
          ? digest('swapped-native-bootstrap-source-request')
          : request.source.nativeBootstrapSourceRequestDigest;
      const providerReceiptDigest =
        fixture.observedFact === undefined
          ? null
          : nativeProviderSourceReceiptDigest;
      const providerSourceDigest =
        fixture.observedFact === undefined ||
        options.tamper === 'native-evidence-null'
          ? null
          : nativeProviderSourceDigest;
      const providerFactDigest = fixture.observedFact?.factDigest ?? null;
      const sourceBase = {
        kind: request.source.kind,
        planDigest,
        repositoryCommit,
        attemptId: request.attemptId,
        descriptorDigest: request.descriptorDigest,
        turnIndex: request.turnIndex,
        invocationId: request.invocationId,
        providerRequestDigest: request.providerRequestDigest,
        responseDigest: request.responseDigest,
        dispatchIntentDigest: request.dispatchIntentDigest,
        transportReceiptDigest: request.transportReceiptDigest,
        resultSpoolReceiptDigest: request.resultSpoolReceiptDigest,
        normalizedEventSetDigest: request.normalizedEventSetDigest,
        nativeBootstrapSourceRequestDigest: boundBootstrapRequestDigest,
        nativeBootstrapSourceReceiptDigest,
        ownerStageDigest,
        ownerDispatchAckDigest,
        nativeProviderSourceReceiptDigest: providerReceiptDigest,
        nativeProviderSourceDigest: providerSourceDigest,
        nativeProviderSourceFactDigest: providerFactDigest,
        outcome,
      };
      Object.assign(receiptBase, {
        sourceDigest: digest(sourceBase),
        nativeBootstrapSourceRequestDigest: boundBootstrapRequestDigest,
        nativeBootstrapSourceReceiptDigest,
        nativeProviderSourceReceiptDigest: providerReceiptDigest,
        nativeProviderSourceDigest: providerSourceDigest,
        nativeProviderSourceFactDigest: providerFactDigest,
      });
    } else {
      Object.assign(receiptBase, {
        sourceDigest: digest('optional-fact-source'),
        ownerRequestDigest,
        ownerReceiptDigest,
        preEffectIntentDigest,
        providerRuntimeJournalResultRecordDigest,
        providerRuntimeResultSealReceiptDigest,
        effectSourceReceiptDigest:
          options.tamper === 'effect-source'
            ? digest('swapped-effect-source-receipt')
            : effectSourceReceiptDigest,
        effectSourceFactDigest:
          options.tamper === 'effect-fact'
            ? digest('swapped-effect-source-fact')
            : (fixture.observedFact?.factDigest ?? null),
        businessResultDigest,
      });
    }
    return {
      ...receiptBase,
      sourceSealDigest:
        options.tamper === 'source-fence'
          ? digest('swapped-source-fence')
          : digest(receiptBase),
    };
  };

  const createStage = (
    request: Readonly<Record<string, unknown>>
  ): Record<string, unknown> => {
    if (!sourceReceipt) throw new Error('source receipt missing');
    const authorityRequestDigest = digest(request);
    const stageBase = {
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      authorityRequestDigest,
      targetAuthorityDigest: sourceReceipt.targetAuthorityDigest,
      sourceAuthorityId: sourceReceipt.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        sourceReceipt.sourceAuthorityImplementationDigest,
      sourceAuthorityRouteBinding: sourceReceipt.sourceAuthorityRouteBinding,
      registrationAuthorityIssuerId:
        sourceReceipt.registrationAuthorityIssuerId,
      registrationReceiptDigest: sourceReceipt.registrationReceiptDigest,
      sourceKind: sourceReceipt.sourceKind,
      sourceDigest: sourceReceipt.sourceDigest,
    };
    if (options.tamper === 'registration-stage') {
      delete (stageBase as Partial<typeof stageBase>).registrationReceiptDigest;
    }
    const stageDigest = digest(stageBase);
    return {
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      authorityRequestDigest,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      stageDigest:
        options.tamper === 'stage-fence'
          ? digest('swapped-stage-fence')
          : stageDigest,
      replayed: false,
    };
  };

  const createAuthorityResponse = (): Record<string, unknown> => {
    if (!sourceReceipt || !stageResponse) {
      throw new Error('authority fixture missing');
    }
    const ackBase: Record<string, unknown> = {
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_DISPATCH_ACK_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      authorityRequestDigest: stageResponse.authorityRequestDigest,
      stageDigest: stageResponse.stageDigest,
      targetAuthorityDigest: sourceReceipt.targetAuthorityDigest,
      sourceAuthorityId: sourceReceipt.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        sourceReceipt.sourceAuthorityImplementationDigest,
      sourceAuthorityRouteBinding: sourceReceipt.sourceAuthorityRouteBinding,
      registrationAuthorityIssuerId:
        sourceReceipt.registrationAuthorityIssuerId,
      registrationReceiptDigest: sourceReceipt.registrationReceiptDigest,
      sourceKind: sourceReceipt.sourceKind,
      sourceDigest: sourceReceipt.sourceDigest,
      outcome: sourceReceipt.outcome,
      observedAt: sourceReceipt.observedAt,
      ...(fixture.observedFact === undefined
        ? {}
        : {
            factKind: fixture.observedFact.factKind,
            factDigest: fixture.observedFact.factDigest,
          }),
    };
    if (options.tamper === 'registration-ack') {
      delete ackBase.registrationReceiptDigest;
    }
    const dispatchAckDigest =
      options.tamper === 'ack'
        ? digest('swapped-dispatch-ack')
        : digest(ackBase);
    const nativeBootstrapReceipt = Object.hasOwn(
      sourceReceipt,
      'nativeBootstrapSourceRequestDigest'
    );
    const fixtureResultSpoolReceiptDigest =
      fixture.request.resultSpoolReceiptDigest;
    if (fixtureResultSpoolReceiptDigest === null) {
      throw new Error('authority fixture result spool is missing');
    }
    const runtimeFactEnvelopes =
      fixture.observedFact === undefined
        ? Object.freeze([])
        : Object.freeze([
            createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
              {
                sourceAuthorityKind: 'shared-durable-capability',
                sourceAuthorityId: String(sourceReceipt.sourceAuthorityId),
                sourceAuthorityImplementationDigest: String(
                  sourceReceipt.sourceAuthorityImplementationDigest
                ),
                sourceKind: String(sourceReceipt.sourceKind) as
                  | 'sealed-hosted-owner-result'
                  | 'sealed-provider-response-metadata',
                routeBinding: String(sourceReceipt.sourceAuthorityRouteBinding),
                registrationAuthorityIssuerId: String(
                  sourceReceipt.registrationAuthorityIssuerId
                ),
                registrationReceiptDigest: String(
                  sourceReceipt.registrationReceiptDigest
                ),
                runtimeFactSourceAuthorityDigest: String(
                  sourceReceipt.targetAuthorityDigest
                ),
                stageDigest:
                  options.tamper === 'owner-stage'
                    ? digest('swapped-owner-stage')
                    : ownerStageDigest,
                dispatchAckDigest:
                  options.tamper === 'owner-ack'
                    ? digest('swapped-owner-ack')
                    : ownerDispatchAckDigest,
                planDigest,
                repositoryCommit,
                attemptId: fixture.request.attemptId,
                descriptorDigest: fixture.request.descriptorDigest,
                turnIndex: fixture.request.turnIndex,
                invocationId: fixture.request.invocationId,
                requestDigest: fixture.request.providerRequestDigest,
                responseDigest: fixture.request.responseDigest,
                protocolFamily: fixture.request.protocolFamily,
                providerConfigurationId:
                  fixture.request.providerConfigurationId,
                modelLineageDigest: fixture.request.modelLineageDigest,
                adapterDigest: fixture.request.adapterDigest,
                dispatchIntentDigest: fixture.request.dispatchIntentDigest,
                transportReceiptDigest: nativeBootstrapReceipt
                  ? options.tamper === 'native-transport'
                    ? digest('swapped-native-transport')
                    : fixture.request.transportReceiptDigest
                  : effectTransportReceiptDigest,
                resultSpoolReceiptDigest: nativeBootstrapReceipt
                  ? fixtureResultSpoolReceiptDigest
                  : effectResultSpoolReceiptDigest,
                normalizedEventSetDigest: nativeBootstrapReceipt
                  ? fixture.request.normalizedEventSetDigest
                  : effectNormalizedEventSetDigest,
                observedAt,
                fact: fixture.observedFact,
              },
              sanitization
            ),
          ]);
    const factAuthorities = Object.freeze(
      runtimeFactEnvelopes.map((envelope) =>
        createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
          envelope,
          sanitization
        )
      )
    );
    const responseBase = {
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      outcome: sourceReceipt.outcome,
      authorityRequestDigest: stageResponse.authorityRequestDigest,
      sourceAuthorityId: sourceReceipt.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        sourceReceipt.sourceAuthorityImplementationDigest,
      stageDigest: stageResponse.stageDigest,
      dispatchAckDigest,
      runtimeFactEnvelopes,
      factAuthorities,
    };
    return { ...responseBase, resultDigest: digest(responseBase) };
  };

  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    requests.push(Object.freeze({ path, init: { ...init } }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${serviceToken}`);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.cache).toBe('no-store');
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect(init?.referrerPolicy).toBe('no-referrer');
    if (path.endsWith('/optional-capability-fact-sources/seal')) {
      expect(headers.get('Idempotency-Key')).toBe(
        digestAgentEvaluationOptionalCapabilityFactSourceRequest(
          fixture.request
        )
      );
      sourceReceipt = createSourceReceipt(
        body as unknown as AgentEvaluationOptionalCapabilityFactSourceRequest
      );
      return jsonResponse({
        sourceSealReceipt: sourceReceipt,
        replayed: false,
      });
    }
    if (path.endsWith('/optional-capability-facts/stage')) {
      expect(headers.get('Idempotency-Key')).toBe(digest(body));
      stageResponse = createStage(body);
      return jsonResponse(stageResponse);
    }
    if (path.endsWith('/optional-capability-facts/seal')) {
      sealExecutions += 1;
      expect(headers.get('Idempotency-Key')).toBe(body.authorityRequestDigest);
      authorityResponse = createAuthorityResponse();
      if (options.ackLoss) throw new TypeError('simulated ack loss');
      return jsonResponse({ authorityResponse, replayed: false });
    }
    if (path.endsWith('/optional-capability-facts/reconcile')) {
      reconciliations += 1;
      expect(headers.get('Idempotency-Key')).toBe(body.authorityRequestDigest);
      authorityResponse ??= createAuthorityResponse();
      return jsonResponse({ authorityResponse, replayed: true });
    }
    return new Response(null, { status: 404 });
  });
  return Object.freeze({
    fetch,
    requests,
    sealExecutions: () => sealExecutions,
    reconciliations: () => reconciliations,
  });
};

const createClient = (fetch: typeof globalThis.fetch) =>
  createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient({
    namespaceId,
    planDigest,
    repositoryCommit,
    environment,
    fetch,
    forbiddenCanaries: () => Object.freeze([secretCanary, protectedCanary]),
    sanitization: () => sanitization,
  });

describe('environment optional capability fact authority client', () => {
  it('matches the Go stage and dispatch acknowledgement digest vector', () => {
    const receipt = Object.freeze({
      targetAuthorityDigest: `sha256-${'2'.repeat(64)}`,
      sourceAuthorityId: 'owner/runtime/cache/1',
      sourceAuthorityImplementationDigest: `sha256-${'3'.repeat(64)}`,
      sourceAuthorityRouteBinding: 'provider/cache/runtime/execute',
      registrationAuthorityIssuerId: 'prodivix.g4-model-evaluation-ledger',
      registrationReceiptDigest: `sha256-${'4'.repeat(64)}`,
      sourceKind: 'sealed-provider-response-metadata' as const,
      sourceDigest: `sha256-${'5'.repeat(64)}`,
      outcome: 'observed' as const,
      observedAt: '2026-08-09T06:00:00.000Z',
      fact: Object.freeze({
        factKind: 'provider-cache-receipt' as const,
        factDigest: `sha256-${'6'.repeat(64)}`,
        value: createAgentProviderCacheReceipt({
          receipt: {
            cacheMode: 'prompt',
            cacheScope: 'task',
            prefixOrItemDigests: Object.freeze([digest('vector-cache-prefix')]),
            usageRef: 'usage.optional-fact.vector.1',
          },
          isolation: 'task',
        }),
      }),
    });
    const authorityRequestDigest = `sha256-${'1'.repeat(64)}`;
    const stageDigest = digestAgentEvaluationOptionalCapabilityFactStage(
      authorityRequestDigest,
      receipt
    );
    expect(stageDigest).toBe(
      'sha256-8a8d010509340b1dca6fa500a7c58611d1df512799c81659c0f5c047b658cca0'
    );
    expect(
      digestAgentEvaluationOptionalCapabilityFactDispatchAck(receipt, {
        authorityRequestDigest,
        stageDigest,
      })
    ).toBe(
      'sha256-44973b7804b22ca27882334b12b1fc38840bfd11696d313408921a631300fcdb'
    );
  });

  it('seals one real native optional fact through the 8790 authority chain', async () => {
    const fixture = requestFixture(true);
    const backend = createBackend(fixture);
    const result = await createClient(backend.fetch).observe(fixture.request);

    expect(result.authorityResponse.outcome).toBe('observed');
    expect(result.authorityResponse.runtimeFactEnvelopes).toHaveLength(1);
    expect(result.authorityResponse.factAuthorities).toHaveLength(1);
    expect(
      result.authorityResponse.runtimeFactEnvelopes[0]?.fact.factKind
    ).toBe('provider-cache-receipt');
    expect(result.authorityResponse.runtimeFactEnvelopes[0]).toMatchObject({
      sourceKind: 'sealed-provider-response-metadata',
      routeBinding: 'optional-capability-fact-authority',
      registrationAuthorityIssuerId: 'authority.evaluation-ledger.1',
      registrationReceiptDigest: digest(
        'optional-fact-source-registration-receipt'
      ),
      runtimeFactSourceAuthorityDigest: digest(
        'optional-fact-target-authority'
      ),
      stageDigest: ownerStageDigest,
      dispatchAckDigest: ownerDispatchAckDigest,
      transportReceiptDigest: effectTransportReceiptDigest,
      resultSpoolReceiptDigest: effectResultSpoolReceiptDigest,
      normalizedEventSetDigest: effectNormalizedEventSetDigest,
    });
    expect(result.authorityResponse.stageDigest).not.toBe(ownerStageDigest);
    expect(result.authorityResponse.dispatchAckDigest).not.toBe(
      ownerDispatchAckDigest
    );
    expect(backend.sealExecutions()).toBe(1);
    expect(backend.reconciliations()).toBe(0);
    expect(
      backend.requests.map(({ path }) => path.slice(path.lastIndexOf('/')))
    ).toEqual(['/seal', '/stage', '/seal']);
  });

  it('preserves a real unavailable result as an empty authority projection', async () => {
    const fixture = requestFixture(false);
    const backend = createBackend(fixture);
    const result = await createClient(backend.fetch).observe(fixture.request);

    expect(result.authorityResponse).toMatchObject({
      outcome: 'unavailable',
      runtimeFactEnvelopes: [],
      factAuthorities: [],
    });
  });

  it('seals a turn-zero native bootstrap source through the shared authority', async () => {
    const fixture = nativeBootstrapRequestFixture(true);
    const backend = createBackend(fixture);
    const result = await createClient(backend.fetch).observe(fixture.request);

    expect(fixture.request.turnIndex).toBe(0);
    expect(Object.keys(fixture.request.source)).toEqual([
      'kind',
      'nativeBootstrapSourceRequestDigest',
    ]);
    expect(result.sourceSealReceipt).toMatchObject({
      sourceKind: 'sealed-provider-response-metadata',
      nativeBootstrapSourceRequestDigest,
      nativeBootstrapSourceReceiptDigest,
      nativeProviderSourceReceiptDigest,
      nativeProviderSourceDigest,
      nativeProviderSourceFactDigest: fixture.observedFact?.factDigest,
    });
    expect(result.sourceSealReceipt).not.toHaveProperty('ownerRequestDigest');
    expect(result.sourceSealReceipt).not.toHaveProperty(
      'effectSourceReceiptDigest'
    );
    expect(result.authorityResponse.runtimeFactEnvelopes).toHaveLength(1);
    expect(result.authorityResponse.runtimeFactEnvelopes[0]).toMatchObject({
      stageDigest: ownerStageDigest,
      dispatchAckDigest: ownerDispatchAckDigest,
      transportReceiptDigest: fixture.request.transportReceiptDigest,
      resultSpoolReceiptDigest: fixture.request.resultSpoolReceiptDigest,
      normalizedEventSetDigest: fixture.request.normalizedEventSetDigest,
    });
  });

  it('preserves native bootstrap unavailable as explicit null evidence', async () => {
    const fixture = nativeBootstrapRequestFixture(false);
    const backend = createBackend(fixture);
    const result = await createClient(backend.fetch).observe(fixture.request);

    expect(result.sourceSealReceipt).toMatchObject({
      outcome: 'unavailable',
      nativeProviderSourceReceiptDigest: null,
      nativeProviderSourceDigest: null,
      nativeProviderSourceFactDigest: null,
    });
    expect(result.sourceSealReceipt).not.toHaveProperty('fact');
    expect(result.authorityResponse).toMatchObject({
      outcome: 'unavailable',
      runtimeFactEnvelopes: [],
      factAuthorities: [],
    });
  });

  it('rejects the native bootstrap source discriminant after turn zero', () => {
    const request = nativeBootstrapRequestFixture(true).request;
    const { format: _format, version: _version, ...input } = request;
    expect(() =>
      createAgentEvaluationOptionalCapabilityFactSourceRequest({
        ...input,
        turnIndex: 1,
      })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
  });

  it('decodes the bounded durable bootstrap read used after close ACK loss', () => {
    const program = createAgentCapabilityProbeProgram({
      capabilityProfileId: 'g4-provider-background-job',
      capabilityProfileDigest: digestAgentCapabilityProbeProfile(
        'g4-provider-background-job'
      ),
    });
    const runtimeAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
      kind: 'shared-durable-capability',
      sourceKind: 'sealed-provider-response-metadata',
      sourceAuthorityId: 'authority.native-bootstrap.client.1',
      sourceAuthorityImplementationDigest: digest(
        'native-bootstrap-client-implementation'
      ),
      routeBinding: 'route.native-bootstrap.client.1',
      capabilityProfileId: program.profileProjection.capabilityProfileId,
      capabilityProfileDigest:
        program.profileProjection.capabilityProfileDigest,
      capabilityId: 'provider.background-job',
      protocolFamily: 'openai-responses',
      providerConfigurationId: requestIdentity.providerConfigurationId,
      modelId: requestIdentity.modelId,
      modelLineageDigest: requestIdentity.modelLineageDigest,
      adapterDigest: requestIdentity.adapterDigest,
      registrationAuthorityIssuerId: 'authority.evaluation-ledger.1',
      registrationReceiptDigest: digest('native-bootstrap-client-registration'),
    });
    const nativeReceipt =
      createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
        protocolFamily: 'openai-responses',
        capabilityProfileDigest:
          program.profileProjection.capabilityProfileDigest,
        invocationId: requestIdentity.invocationId,
        requestDigest: requestIdentity.providerRequestDigest,
        responseDigest: requestIdentity.responseDigest,
        providerConfigurationId: requestIdentity.providerConfigurationId,
        modelLineageDigest: requestIdentity.modelLineageDigest,
        adapterDigest: requestIdentity.adapterDigest,
        executionIdentityAuthority:
          createAgentNativeProviderExecutionIdentityAuthority({
            invocationId: requestIdentity.invocationId,
            taskId: 'task.native-bootstrap.client.1',
            runId: 'run.native-bootstrap.client.1',
            generation: 1,
          }),
        source: Object.freeze({
          sourceKind: 'provider-job-terminal-status',
          providerStateReferenceDigest: digest(
            'native-bootstrap-client-job-state'
          ),
          opaqueProviderStateRef:
            'provider-state.native-bootstrap-client-job-state',
          stateVaultAuthorityDigest: digest(
            'native-bootstrap-client-state-vault-authority'
          ),
          stateVaultSealRequestDigest: digest(
            'native-bootstrap-client-state-vault-seal-request'
          ),
          stateVaultSealReceiptDigest: digest(
            'native-bootstrap-client-state-vault-seal-receipt'
          ),
          taskId: 'task.native-bootstrap.client.1',
          runId: 'run.native-bootstrap.client.1',
          generation: 1,
          providerStatus: 'completed',
        }),
        observedAt,
      });
    const sourceRequest =
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        {
          namespaceId,
          planDigest,
          repositoryCommit,
          attemptId: requestIdentity.attemptId,
          descriptorDigest: requestIdentity.descriptorDigest,
          turnIndex: 0,
          invocationId: requestIdentity.invocationId,
          providerRequestDigest: requestIdentity.providerRequestDigest,
          providerResponseDigest: requestIdentity.responseDigest,
          protocolFamily: 'openai-responses',
          providerConfigurationId: requestIdentity.providerConfigurationId,
          modelLineageDigest: requestIdentity.modelLineageDigest,
          adapterDigest: requestIdentity.adapterDigest,
          dispatchIntentDigest: requestIdentity.dispatchIntentDigest,
          transportReceiptDigest: requestIdentity.transportReceiptDigest,
          resultSpoolReceiptDigest: requestIdentity.resultSpoolReceiptDigest,
          normalizedEventSetDigest: digest('optional-normalized-event-set'),
          transportCompletedAt: '2026-08-09T01:59:59.000Z',
          runtimeFactSourceAuthority: runtimeAuthority,
          outcome: 'observed',
          nativeSourceReceipt: nativeReceipt,
          observedAt,
        }
      );
    const sourceReceipt =
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        { sourceRequest, sealedAt }
      );
    const readBase = {
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_READ_FORMAT,
      version: 1 as const,
      attemptId: sourceRequest.attemptId,
      turnIndex: 0 as const,
      sourceRequestDigest: sourceRequest.requestDigest,
      sourceReceiptDigest: sourceReceipt.receiptDigest,
      sourceReceipt,
    };
    const read = { ...readBase, readDigest: digest(readBase) };

    expect(
      decodeAgentEvaluationNativeOptionalCapabilityBootstrapSourceRead(read, {
        program,
        attemptId: sourceRequest.attemptId,
      })
    ).toEqual(read);

    const swappedBase = {
      ...readBase,
      attemptId: 'attempt.native-bootstrap.client.swapped',
    };
    expect(() =>
      decodeAgentEvaluationNativeOptionalCapabilityBootstrapSourceRead(
        { ...swappedBase, readDigest: digest(swappedBase) },
        { program, attemptId: swappedBase.attemptId }
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
  });

  it('uses the same exact three sealed owner references for effect sources', () => {
    const provider = requestFixture(true).request;
    const {
      format: _format,
      version: _version,
      source: _source,
      ...input
    } = provider;
    const hosted = createAgentEvaluationOptionalCapabilityFactSourceRequest({
      ...input,
      source: Object.freeze({
        kind: 'sealed-hosted-owner-result' as const,
        ownerRequestDigest,
        ownerReceiptDigest,
        effectSourceReceiptDigest,
      }),
    });

    expect(Object.keys(provider.source)).toEqual([
      'kind',
      'ownerRequestDigest',
      'ownerReceiptDigest',
      'effectSourceReceiptDigest',
    ]);
    expect(Object.keys(hosted.source)).toEqual(Object.keys(provider.source));
    expect(() =>
      createAgentEvaluationOptionalCapabilityFactSourceRequest({
        ...input,
        source: {
          kind: 'sealed-provider-response-metadata',
          ownerRequestDigest,
          ownerReceiptDigest,
        } as never,
      })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
  });

  it.each([
    'native-bootstrap-request',
    'native-evidence-null',
    'native-transport',
  ] as const)(
    'rejects a recomputed native bootstrap %s swap',
    async (tamper) => {
      const fixture = nativeBootstrapRequestFixture(true);
      const backend = createBackend(fixture, { tamper });
      await expect(
        createClient(backend.fetch).observe(fixture.request)
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      });
    }
  );

  it('reconciles an ambiguous seal ACK loss without a second effect execution', async () => {
    const fixture = requestFixture(true);
    const backend = createBackend(fixture, { ackLoss: true });
    const result = await createClient(backend.fetch).observe(fixture.request);

    expect(result.authorityResponse.outcome).toBe('observed');
    expect(backend.sealExecutions()).toBe(1);
    expect(backend.reconciliations()).toBe(1);
  });

  it.each([
    'ack',
    'effect-fact',
    'effect-source',
    'owner-ack',
    'owner-stage',
    'registration-ack',
    'registration-stage',
    'source-fence',
    'stage-fence',
  ] as const)('rejects a recomputed %s authority swap', async (tamper) => {
    const fixture = requestFixture(true);
    const backend = createBackend(fixture, { tamper });
    await expect(
      createClient(backend.fetch).observe(fixture.request)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('rejects callback-bound canary material before dispatch', async () => {
    const fixture = requestFixture(true, protectedCanary);
    const backend = createBackend(fixture);
    await expect(
      createClient(backend.fetch).observe(fixture.request)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    expect(backend.fetch).not.toHaveBeenCalled();
  });
});
