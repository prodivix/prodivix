import {
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  resolveAgentCapabilityProbePublicResource,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
  AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES,
} from './productionOwnerAuthoritySidecarEnvironment';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient,
} from './productionHostedRetrievalRuntimeResourceLifecycleSidecar';

const STARTED_AT_MS = Date.parse('2026-08-12T00:00:00.000Z');
const REPOSITORY_COMMIT = 'b'.repeat(40);
const NAMESPACE_ID = 'namespace.hosted-lifecycle-sidecar-timeout';
const SERVICE_TOKEN = 'sidecar-claim-expiry-token-value';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({
    test: 'production-hosted-lifecycle-sidecar-claim-expiry',
    label,
  });

const registrationFixture = () => {
  const planDigest = digest('plan');
  const frozenRunDigest = digest('frozen-run');
  const runConfigArtifactBindingDigest = digest('run-config-binding');
  const providerConfigurationId = 'provider.openai.sidecar-timeout';
  const providerConfigurationDigest = digest('provider-configuration');
  const modelId = 'model.openai.sidecar-timeout';
  const modelLineageDigest = digest('model-lineage');
  const adapterDigest = digest('adapter');
  const capabilityProfileId = 'g4-provider-hosted-retrieval-core' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  const material = resolveAgentCapabilityProbePublicResource(program);
  if (material === null) throw new TypeError('missing public test material');
  const registrationIntent =
    createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily: 'openai-responses',
      modelId,
      modelLineageDigest,
      adapterDigest,
      capabilityProfileId,
      capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    });
  const budgetReservationAuthority =
    createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
      namespaceId: NAMESPACE_ID,
      planDigest,
      reservePolicyDigest: digest('budget-reserve-policy'),
      budgetDigest: digest('budget'),
      reservationId: 'budget-reservation.sidecar-timeout',
      ledgerRevision: 1,
      demandDigest: digest('budget-demand'),
      demandBytesDigest: digest('budget-demand-bytes'),
      reservedAt: new Date(STARTED_AT_MS).toISOString() as Instant,
    });
  const networkPolicyAuthority =
    createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
      namespaceId: NAMESPACE_ID,
      repositoryCommit: REPOSITORY_COMMIT,
      planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily: 'openai-responses',
    });
  const request = createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
    namespaceId: NAMESPACE_ID,
    repositoryCommit: REPOSITORY_COMMIT,
    planDigest,
    frozenRunDigest,
    runConfigArtifactBindingDigest,
    runtimeResourceSetId: 'runtime-resource-set.sidecar-timeout',
    registrationIntent,
    registrationIntentDigest: registrationIntent.intentDigest,
    providerConfigurationId,
    providerConfigurationDigest,
    protocolFamily: 'openai-responses',
    modelId,
    modelLineageDigest,
    adapterDigest,
    capabilityProfileId,
    capabilityProfileDigest,
    probeProgramDigest: program.programDigest,
    publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    budgetReservationAuthority,
    budgetReservationAuthorityDigest:
      budgetReservationAuthority.authorityDigest,
    networkPolicyAuthority,
    networkPolicyAuthorityDigest: networkPolicyAuthority.authorityDigest,
    minimumExpiresAt: new Date(
      STARTED_AT_MS + 600_000
    ).toISOString() as Instant,
  });
  return Object.freeze({ request, program, material });
};

describe('production hosted retrieval lifecycle Sidecar mutation timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT_MS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('passes an aborting 110-second hard-cap signal to the injected mutation fetch', async () => {
    const timeoutDurations: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      timeoutDurations.push(milliseconds);
      const controller = new AbortController();
      setTimeout(
        () =>
          controller.abort(
            new DOMException(
              'sidecar mutation hard cap reached',
              'TimeoutError'
            )
          ),
        milliseconds
      );
      return controller.signal;
    });
    let resolveObserved!: (signal: AbortSignal) => void;
    const observed = new Promise<AbortSignal>((resolve) => {
      resolveObserved = resolve;
    });
    const fetcher: typeof fetch = async (_url, init) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) {
        throw new TypeError('missing sidecar mutation signal');
      }
      resolveObserved(signal);
      return new Promise<never>((_resolve, reject) => {
        const rejectAborted = () =>
          reject(signal.reason ?? new Error('sidecar mutation aborted'));
        if (signal.aborted) {
          rejectAborted();
          return;
        }
        signal.addEventListener('abort', rejectAborted, { once: true });
      });
    };
    const client =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient(
        {
          environment: Object.freeze({
            [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.baseUrl]:
              AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
            [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken]:
              SERVICE_TOKEN,
          }),
          fetch: fetcher,
        }
      );
    const fixture = registrationFixture();
    const settled = client
      .createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
      .then(
        () => null,
        (error: unknown) => error
      );
    const mutationSignal = await observed;

    expect(timeoutDurations).toEqual([
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS,
    ]);
    await vi.advanceTimersByTimeAsync(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS -
        1
    );
    expect(mutationSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(mutationSignal.aborted).toBe(true);
    expect(Date.now()).toBe(
      STARTED_AT_MS +
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS
    );
    expect(await settled).toBeInstanceOf(DOMException);
  });
});
