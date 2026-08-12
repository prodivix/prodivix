import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeResponseSpoolEncryptionProfile,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  type AgentCapabilityProbeProfileId,
  type Instant,
} from '@prodivix/ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
} from './capabilityProbeAdmissionClient';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import type { AgentEvaluationEgressBoundFetch } from './egressBoundFetch';
import type { AgentEvaluationCapabilityProbePhaseExecution } from './productionCapabilityProbeExecutor';
import { createProductionAgentEvaluationCapabilityProbePhaseTransport } from './productionCapabilityProbePhaseTransport';
import { AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME } from './capabilityProbeResponseSpoolKey';

const repositoryCommit = 'a'.repeat(40);
const startedAt = '2026-08-09T05:00:00.000Z' as Instant;
const minimumExpiresAt = '2026-08-16T05:00:00.000Z' as Instant;
const resourceExpiresAt = '2026-08-17T04:59:00.000Z' as Instant;
const forbiddenCanary = 'capability-probe-forbidden-canary-0123456789';
const keyBytes = Buffer.alloc(32, 0x37);
const keyBase64 = keyBytes.toString('base64');
const stateDirectories: string[] = [];

const digest = (label: string) => digestAgentCanonicalValue({ label });

const encryptionProfile =
  createAgentCapabilityProbeResponseSpoolEncryptionProfile({
    keyId: 'key.capability-probe.response-spool.v1',
    keyVersion: 1,
    keyEnvironmentName:
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
    keyRef: 'secret.capability-probe.response-spool.aes256gcm.v1',
  });

const environment = Object.freeze({
  [AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME]:
    keyBase64,
  [AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses']
    .secretEnvironmentName]: 'openai-capability-probe-secret-0123456789',
  [AGENT_EVALUATION_PROVIDER_DEFINITIONS['anthropic-messages']
    .secretEnvironmentName]: 'anthropic-capability-probe-secret-0123456789',
  [AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions']
    .secretEnvironmentName]: 'gemini-capability-probe-secret-0123456789',
});

const stateDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(
    join(tmpdir(), 'prodivix-capability-probe-phase-')
  );
  stateDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  vi.useRealTimers();
  while (stateDirectories.length > 0) {
    const directory = stateDirectories.pop();
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

const clock = (start: Instant = startedAt): (() => Instant) => {
  let offset = 0;
  return () => {
    const value = new Date(Date.parse(start) + offset).toISOString() as Instant;
    offset += 5;
    return value;
  };
};

const createRequest = (
  protocolFamily:
    'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
  capabilityProfileId: AgentCapabilityProbeProfileId
): AgentEvaluationCapabilityProbeAdmissionRequest => {
  const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: `adapter.capability-probe.${protocolFamily}`,
    adapterVersion: '1.0.0',
    protocolFamily,
    transportSchemaDigest: digest(`transport.${protocolFamily}`),
    eventNormalizationDigest: digest(`normalizer.${protocolFamily}`),
  });
  const providerConfiguration = createAgentProviderConfigurationIdentity({
    providerConfigurationId: definition.providerConfigurationId,
    providerOperatorId: `provider-operator.${protocolFamily}`,
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digest(`endpoint.${protocolFamily}`),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digest(`data-policy.${protocolFamily}`),
  });
  const modelLineage = createAgentModelLineage({
    modelId: `model.capability-probe.${protocolFamily}`,
    modelFamilyId: `model-family.capability-probe.${protocolFamily}`,
    modelFamilyOwnerId: `model-owner.capability-probe.${protocolFamily}`,
    immutableVersion: `model.capability-probe.${protocolFamily}.2026-08-09`,
  });
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  const retrieval =
    probeProgram.profileProjection.capabilityId ===
      'provider.hosted-retrieval' && protocolFamily !== 'anthropic-messages';
  const probeProviderResourceAuthority = retrieval
    ? createAgentCapabilityProbeProviderResourceAuthority(probeProgram, {
        protocolFamily,
        providerConfigurationId: providerConfiguration.providerConfigurationId,
        modelId: modelLineage.modelId,
        modelLineageDigest: modelLineage.lineageDigest,
        adapterDigest: adapter.adapterDigest,
        providerResourceId:
          protocolFamily === 'openai-responses'
            ? 'vs_capability_probe_phase_transport'
            : 'fileSearchStores/capability-probe-phase-transport',
        resourceManifestDigest: digest(`manifest.${protocolFamily}`),
        contentUploadReceiptDigest: digest(`upload.${protocolFamily}`),
        deletionAuthorityReceiptDigest: digest(`delete.${protocolFamily}`),
        registeredAt: '2026-08-09T04:59:00.000Z',
        expiresAt: resourceExpiresAt,
      })
    : null;
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId: `evaluation.capability-probe.${protocolFamily}`,
    repositoryCommit,
    providerConfiguration,
    modelLineage,
    qualificationCapabilityProfileId: capabilityProfileId,
    qualificationCapabilityProfileDigest: capabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: Object.freeze([capabilityProfileDigest]),
    probeProgram,
    probeProviderResourceAuthority,
    minimumExpiresAt,
  });
};

const openAIResponse = (
  id: string,
  input: Readonly<{
    status?: string;
    text?: string;
    cachedTokens?: number;
  }> = {}
) =>
  Object.freeze({
    object: 'response',
    id,
    status: input.status ?? 'completed',
    output: Object.freeze(
      input.text === undefined
        ? []
        : [
            Object.freeze({
              type: 'message',
              content: Object.freeze([
                Object.freeze({ type: 'output_text', text: input.text }),
              ]),
            }),
          ]
    ),
    usage: Object.freeze({
      input_tokens: 64,
      output_tokens: 8,
      input_tokens_details: Object.freeze({
        cached_tokens: input.cachedTokens ?? 0,
      }),
    }),
  });

const geminiResponse = (id: string, status: string, text = 'probe completed') =>
  Object.freeze({
    id,
    status,
    steps: Object.freeze([Object.freeze({ type: 'model_output', text })]),
    usage: Object.freeze({
      total_input_tokens: 64,
      total_output_tokens: 8,
      total_cached_tokens: 0,
    }),
  });

const anthropicParallelResponse = Object.freeze({
  type: 'message',
  id: 'msg_parallel_phase_transport',
  stop_reason: 'tool_use',
  content: Object.freeze([
    Object.freeze({
      type: 'tool_use',
      id: 'call_alpha',
      name: 'capability_probe_alpha',
      input: Object.freeze({ marker: 'prodivix-capability-probe-v1' }),
    }),
    Object.freeze({
      type: 'tool_use',
      id: 'call_beta',
      name: 'capability_probe_beta',
      input: Object.freeze({ marker: 'prodivix-capability-probe-v1' }),
    }),
  ]),
  usage: Object.freeze({ input_tokens: 64, output_tokens: 8 }),
});

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const sseResponse = (value: unknown): Response =>
  new Response(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });

const makeTransport = async (input: {
  directory: string;
  fetch: AgentEvaluationEgressBoundFetch;
  now?: () => Instant;
  canaries?: () => readonly string[];
}) =>
  createProductionAgentEvaluationCapabilityProbePhaseTransport({
    stateDirectory: input.directory,
    encryptionProfile,
    forbiddenCanaries:
      input.canaries ?? (() => Object.freeze([forbiddenCanary])),
    environment,
    fetch: input.fetch,
    resolveHost: async () => Object.freeze(['8.8.8.8']),
    clock: input.now ?? clock(),
    randomBytes: (size) => new Uint8Array(size).fill(0x21),
    allowTemporaryStateDirectory: true,
  });

const execute = async (
  transport: Awaited<ReturnType<typeof makeTransport>>,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  sequence: number,
  priorPhases: readonly AgentEvaluationCapabilityProbePhaseExecution[]
) => {
  const phase = resolveAgentCapabilityProbeNetworkRoundTripPhase(
    request.probeProgram,
    sequence
  );
  if (phase === null) throw new Error('test phase is unavailable');
  return transport.executePhase({ request, phase, sequence, priorPhases });
};

const normalize = (
  transport: Awaited<ReturnType<typeof makeTransport>>,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  phases: readonly AgentEvaluationCapabilityProbePhaseExecution[]
) =>
  transport.normalize({
    request,
    phases,
    requestReferenceDigest: digest('request-reference'),
    responseReferenceDigest: digest('response-reference'),
  });

describe('production capability-probe phase transport', () => {
  it('persists and normalizes an exact OpenAI JSON cache roundtrip', async () => {
    const directory = await stateDirectory();
    const request = createRequest(
      'openai-responses',
      'g4-provider-isolated-cache'
    );
    const responses = [
      openAIResponse('resp_cache_cold', { cachedTokens: 0 }),
      openAIResponse('resp_cache_warm', { cachedTokens: 12 }),
    ];
    let responseIndex = 0;
    const fetch = vi.fn<AgentEvaluationEgressBoundFetch>(
      async (_endpoint, init) => {
        expect((init?.headers as Headers).get('Authorization')).toMatch(
          /^Bearer /u
        );
        const response = responses[responseIndex];
        responseIndex += 1;
        return jsonResponse(response);
      }
    );
    const transport = await makeTransport({ directory, fetch });
    const cold = await execute(transport, request, 0, Object.freeze([]));
    const warm = await execute(transport, request, 1, Object.freeze([cold]));
    const result = await normalize(
      transport,
      request,
      Object.freeze([cold, warm])
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 'supported',
      denial: null,
      semanticProof: { proofKind: 'isolated-cache-roundtrip' },
      observedFacts: [
        { factKind: 'provider-cache-receipt' },
        { factKind: 'usage-vector' },
      ],
    });
    const phaseDirectory = join(directory, request.requestDigest);
    const files = await readdir(phaseDirectory);
    expect(files).toEqual(['phase-0.json', 'phase-1.json']);
    const persisted = await Promise.all(
      files.map((name) => readFile(join(phaseDirectory, name), 'utf8'))
    );
    expect(persisted.join('')).not.toContain('resp_cache_cold');
    expect(persisted.join('')).not.toContain('resp_cache_warm');
    expect(persisted.join('')).not.toContain(
      environment[
        AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses']
          .secretEnvironmentName
      ]
    );
    await expect(transport.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it('uses Gemini v1 JSON submit/poll state and replays on another host with zero redispatch', async () => {
    const directory = await stateDirectory();
    const request = createRequest(
      'gemini-interactions',
      'g4-provider-background-job'
    );
    const endpoints: string[] = [];
    const fetchA = vi.fn<AgentEvaluationEgressBoundFetch>(
      async (endpoint, init) => {
        endpoints.push(String(endpoint));
        expect((init?.headers as Headers).get('x-goog-api-key')).toBeTruthy();
        return jsonResponse(
          endpoints.length === 1
            ? geminiResponse('interaction_background_1', 'queued')
            : geminiResponse('interaction_background_1', 'completed')
        );
      }
    );
    const firstHost = await makeTransport({ directory, fetch: fetchA });
    const submitted = await execute(firstHost, request, 0, Object.freeze([]));
    const fetchB = vi.fn<AgentEvaluationEgressBoundFetch>(async () =>
      jsonResponse(geminiResponse('interaction_background_1', 'completed'))
    );
    const secondHost = await makeTransport({ directory, fetch: fetchB });
    const replayed = await execute(secondHost, request, 0, Object.freeze([]));
    expect(replayed).toEqual(submitted);
    expect(fetchB).not.toHaveBeenCalled();

    const completed = await execute(
      secondHost,
      request,
      1,
      Object.freeze([replayed])
    );
    const result = await normalize(
      secondHost,
      request,
      Object.freeze([replayed, completed])
    );
    expect(endpoints).toEqual([
      'https://generativelanguage.googleapis.com/v1/interactions?alt=json',
    ]);
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(String(fetchB.mock.calls[0]?.[0])).toBe(
      'https://generativelanguage.googleapis.com/v1/interactions/interaction_background_1?alt=json'
    );
    expect(result).toMatchObject({
      status: 'supported',
      semanticProof: { proofKind: 'background-job-lifecycle' },
    });
    await secondHost.close();
    await firstHost.close();
  });

  it('normalizes Anthropic SSE while unavailable Anthropic codecs fail before DNS or fetch', async () => {
    const directory = await stateDirectory();
    let credentialHeaders: Headers | undefined;
    const fetch = vi.fn<AgentEvaluationEgressBoundFetch>(
      async (_endpoint, init) => {
        credentialHeaders = init?.headers as Headers;
        expect(credentialHeaders.get('x-api-key')).toBeTruthy();
        expect(credentialHeaders.get('anthropic-version')).toBe('2023-06-01');
        return sseResponse(anthropicParallelResponse);
      }
    );
    const transport = await makeTransport({ directory, fetch });
    const parallel = createRequest(
      'anthropic-messages',
      'g4-provider-parallel-tool'
    );
    const phase = await execute(transport, parallel, 0, Object.freeze([]));
    await expect(
      normalize(transport, parallel, Object.freeze([phase]))
    ).resolves.toMatchObject({
      status: 'supported',
      semanticProof: { proofKind: 'parallel-tool-call-set' },
    });
    expect(credentialHeaders?.get('x-api-key')).toBeNull();

    const unavailable = createRequest(
      'anthropic-messages',
      'g4-provider-background-job'
    );
    await expect(
      execute(transport, unavailable, 0, Object.freeze([]))
    ).rejects.toThrow(/PHASE_TRANSPORT_INVALID|policy is invalid/u);
    expect(fetch).toHaveBeenCalledTimes(1);
    await transport.close();
  });

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'binds the sealed provider resource authority for %s retrieval',
    async (protocolFamily) => {
      const directory = await stateDirectory();
      const request = createRequest(
        protocolFamily,
        'g4-provider-hosted-retrieval-document'
      );
      const fetch = vi.fn<AgentEvaluationEgressBoundFetch>(
        async (_endpoint, init) => {
          const body = String(init?.body);
          expect(body).toContain(
            request.probeProviderResourceAuthority?.providerResourceId
          );
          return jsonResponse(
            protocolFamily === 'openai-responses'
              ? openAIResponse('resp_retrieval_phase', {
                  text: 'Source marker: prodivix-capability-probe-v1',
                })
              : geminiResponse(
                  'interaction_retrieval_phase',
                  'completed',
                  'Source marker: prodivix-capability-probe-v1'
                )
          );
        }
      );
      const transport = await makeTransport({ directory, fetch });
      const phase = await execute(transport, request, 0, Object.freeze([]));
      await expect(
        normalize(transport, request, Object.freeze([phase]))
      ).resolves.toMatchObject({
        status: 'supported',
        semanticProof: {
          proofKind: 'hosted-retrieval-public-document',
        },
      });
      await transport.close();
    }
  );

  it('converts a canary-bearing response to an encrypted fail-closed phase without persisting the canary', async () => {
    const directory = await stateDirectory();
    const request = createRequest(
      'openai-responses',
      'g4-provider-parallel-tool'
    );
    const fetch = vi.fn<AgentEvaluationEgressBoundFetch>(async () =>
      jsonResponse(
        openAIResponse('resp_canary', {
          text: `unsafe ${forbiddenCanary}`,
        })
      )
    );
    const transport = await makeTransport({ directory, fetch });
    const phase = await execute(transport, request, 0, Object.freeze([]));
    expect(phase).toMatchObject({ outcome: 'failed', programTerminal: true });
    await expect(
      normalize(transport, request, Object.freeze([phase]))
    ).rejects.toThrow(/normalize-inconclusive/u);
    const source = await readFile(
      join(directory, request.requestDigest, 'phase-0.json'),
      'utf8'
    );
    expect(source).not.toContain(forbiddenCanary);
    await transport.close();
  });

  it('keeps an ambiguous durable claim fail-closed on another host without redispatch', async () => {
    vi.useFakeTimers();
    const directory = await stateDirectory();
    const request = createRequest(
      'openai-responses',
      'g4-provider-parallel-tool'
    );
    const firstFetch = vi.fn<AgentEvaluationEgressBoundFetch>(
      async (_endpoint, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const firstHost = await makeTransport({
      directory,
      fetch: firstFetch,
    });
    const inFlight = execute(firstHost, request, 0, Object.freeze([]));
    await vi.waitFor(() => expect(firstFetch).toHaveBeenCalledTimes(1));

    const secondFetch = vi.fn<AgentEvaluationEgressBoundFetch>(async () =>
      sseResponse(anthropicParallelResponse)
    );
    const secondHost = await makeTransport({
      directory,
      fetch: secondFetch,
    });
    await expect(
      execute(secondHost, request, 0, Object.freeze([]))
    ).rejects.toThrow('G4_RUNNER_TRANSPORT_FAILED');
    expect(secondFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(
      request.probeProgram.hardLimits.maximumSingleDispatchMs
    );
    await expect(inFlight).resolves.toMatchObject({ outcome: 'timed-out' });
    await secondHost.close();
    await firstHost.close();
  });

  it('bounds Provider timeout and response size before durable normalization', async () => {
    vi.useFakeTimers();
    const timeoutDirectory = await stateDirectory();
    const timeoutRequest = createRequest(
      'openai-responses',
      'g4-provider-parallel-tool'
    );
    const timeoutFetch = vi.fn<AgentEvaluationEgressBoundFetch>(
      async (_endpoint, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const timeoutTransport = await makeTransport({
      directory: timeoutDirectory,
      fetch: timeoutFetch,
    });
    const pending = execute(
      timeoutTransport,
      timeoutRequest,
      0,
      Object.freeze([])
    );
    await vi.waitFor(() => expect(timeoutFetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(
      timeoutRequest.probeProgram.hardLimits.maximumSingleDispatchMs
    );
    await expect(pending).resolves.toMatchObject({
      outcome: 'timed-out',
      programTerminal: true,
    });
    await timeoutTransport.close();
    vi.useRealTimers();

    const sizeDirectory = await stateDirectory();
    const sizeRequest = createRequest(
      'openai-responses',
      'g4-provider-parallel-tool'
    );
    const oversized = 'x'.repeat(
      sizeRequest.probeProgram.hardLimits.maximumResponseBytes + 1
    );
    const sizeTransport = await makeTransport({
      directory: sizeDirectory,
      fetch: async () =>
        new Response(oversized, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(
      execute(sizeTransport, sizeRequest, 0, Object.freeze([]))
    ).resolves.toMatchObject({ outcome: 'failed', programTerminal: true });
    await sizeTransport.close();
  });

  it('rejects the ordinary result-spool key slot for the probe owner', async () => {
    const directory = await stateDirectory();
    const reused = createAgentCapabilityProbeResponseSpoolEncryptionProfile({
      keyId: 'key.reused-result-spool.v1',
      keyVersion: 1,
      keyEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64',
      keyRef: 'secret.reused-result-spool.v1',
    });
    await expect(
      createProductionAgentEvaluationCapabilityProbePhaseTransport({
        stateDirectory: directory,
        encryptionProfile: reused,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        environment,
        fetch: async () => jsonResponse({}),
        resolveHost: async () => Object.freeze(['8.8.8.8']),
        allowTemporaryStateDirectory: true,
      })
    ).rejects.toThrow(/composition/u);
  });
});
