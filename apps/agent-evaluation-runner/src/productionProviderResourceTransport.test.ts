import { digestAgentCanonicalValue, type Instant } from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import type { AgentProviderSecretUseRequest } from './secretResolver';
import {
  createAgentEvaluationProviderResourceTransport,
  projectAgentEvaluationProviderResourceRequest,
  type AgentEvaluationProviderResourceTransportSession,
} from './productionProviderResourceTransport';

const NOW = '2026-08-12T00:00:00.000Z' as Instant;
const OPENAI_SECRET = 'openai-provider-secret-123456789';
const GEMINI_SECRET = 'gemini-provider-secret-123456789';

const response = (
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
  status = 200
): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
  });

const environment = (name: string): string | undefined => {
  if (name === 'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY') {
    return OPENAI_SECRET;
  }
  if (name === 'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY') {
    return GEMINI_SECRET;
  }
  return undefined;
};

const secretUse = (
  protocolFamily: 'gemini-interactions' | 'openai-responses',
  useId: string,
  purpose: AgentProviderSecretUseRequest['purpose'] = 'hosted-retrieval-resource-lifecycle'
): AgentProviderSecretUseRequest => {
  const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
  return Object.freeze({
    protocolFamily,
    providerConfigurationId: definition.providerConfigurationId,
    secretRef: definition.secretRef,
    purpose,
    runtimeZone: 'server',
    useId,
  });
};

const resolveHost = async (): Promise<readonly string[]> =>
  Object.freeze(['8.8.8.8']);

describe('production Provider resource transport', () => {
  it('binds exact canonical query entries, values, duplicate multiplicity, and body bytes', () => {
    const base = {
      protocolFamily: 'gemini-interactions' as const,
      method: 'POST' as const,
      body: '{"displayName":"fixture"}',
      headers: { 'idempotency-key': 'idempotency.fixture.0001' },
    };
    const first = projectAgentEvaluationProviderResourceRequest({
      ...base,
      endpoint:
        'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-1:uploadToFileSearchStore?upload_id=alpha&upload_protocol=resumable',
    });
    const reordered = projectAgentEvaluationProviderResourceRequest({
      ...base,
      endpoint:
        'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-1:uploadToFileSearchStore?upload_protocol=resumable&upload_id=alpha',
    });
    const swapped = projectAgentEvaluationProviderResourceRequest({
      ...base,
      endpoint:
        'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-1:uploadToFileSearchStore?upload_id=resumable&upload_protocol=alpha',
    });
    const duplicated = projectAgentEvaluationProviderResourceRequest({
      ...base,
      endpoint:
        'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-1:uploadToFileSearchStore?upload_id=alpha&upload_id=alpha&upload_protocol=resumable',
    });

    expect(first).toEqual(reordered);
    expect(digestAgentCanonicalValue(first)).not.toBe(
      digestAgentCanonicalValue(swapped)
    );
    expect(digestAgentCanonicalValue(first)).not.toBe(
      digestAgentCanonicalValue(duplicated)
    );
    expect(first.queryEntries).toEqual([
      {
        name: 'upload_id',
        valueDigest: digestAgentCanonicalValue('alpha'),
      },
      {
        name: 'upload_protocol',
        valueDigest: digestAgentCanonicalValue('resumable'),
      },
    ]);
  });

  it('injects OpenAI auth and idempotency while returning only secret-clean response projections', async () => {
    const requests: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = new URL(String(input));
        const headers = init?.headers;
        expect(headers).toBeInstanceOf(Headers);
        expect((headers as Headers).get('authorization')).toBe(
          `Bearer ${OPENAI_SECRET}`
        );
        expect((headers as Headers).get('idempotency-key')).toBe(
          'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.store'
        );
        requests.push(`${init?.method} ${endpoint.pathname}`);
        return response(
          { object: 'vector_store', id: 'vs-runtime-1' },
          {
            'x-request-id': 'request.openai.runtime.0001',
            'set-cookie': 'session=discarded-response-header',
          },
          201
        );
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    const result = await transport.use(
      secretUse('openai-responses', 'lifecycle.openai.create.0001'),
      (session) =>
        session.execute({
          protocolFamily: 'openai-responses',
          method: 'POST',
          endpoint: 'https://api.openai.com/v1/vector_stores',
          body: '{"file_ids":["file-runtime-1"]}',
          headers: {
            'content-type': 'application/json',
            'idempotency-key':
              'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.store',
          },
          signal: new AbortController().signal,
        })
    );

    expect(requests).toEqual(['POST /v1/vector_stores']);
    expect(result.status).toBe(201);
    expect(result.providerRequestId).toBe('request.openai.runtime.0001');
    expect(result.continuationEndpoint).toBeNull();
    expect(JSON.stringify(result)).not.toContain(OPENAI_SECRET);
    expect(JSON.stringify(result)).not.toContain('set-cookie');
    expect(JSON.stringify(result)).not.toContain('discarded-response-header');
    await expect(transport.close()).resolves.toMatchObject({
      status: 'clean',
      acceptedSessionCount: 1,
      completedSessionCount: 1,
      inFlightSessionCount: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the Gemini resumable continuation callback-bound and sends upload bytes with API-key auth', async () => {
    const uploadUrl =
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-runtime-1:uploadToFileSearchStore?upload_id=upload_1&upload_protocol=resumable';
    const requests: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = new URL(String(input));
        const headers = init?.headers as Headers;
        expect(headers.get('x-goog-api-key')).toBe(GEMINI_SECRET);
        requests.push(`${init?.method} ${endpoint.pathname}${endpoint.search}`);
        if (endpoint.search === '') {
          return response(
            {},
            {
              'x-goog-upload-url': uploadUrl,
              'x-goog-request-id': 'request.gemini.upload-start.0001',
            }
          );
        }
        expect(init?.body).toBeInstanceOf(Uint8Array);
        return response({
          name: 'fileSearchStores/store-runtime-1/upload/operations/op-1',
        });
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    const result = await transport.use(
      secretUse('gemini-interactions', 'lifecycle.gemini.upload.0001'),
      async (session) => {
        const started = await session.execute({
          protocolFamily: 'gemini-interactions',
          method: 'POST',
          endpoint:
            'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-runtime-1:uploadToFileSearchStore',
          body: '{"displayName":"runtime.txt","mimeType":"text/plain"}',
          headers: {
            'content-type': 'application/json',
            'x-goog-upload-command': 'start',
            'x-goog-upload-header-content-length': '7',
            'x-goog-upload-header-content-type': 'text/plain',
            'x-goog-upload-protocol': 'resumable',
          },
          signal: new AbortController().signal,
        });
        expect(started.continuationEndpoint).toBe(uploadUrl);
        return session.execute({
          protocolFamily: 'gemini-interactions',
          method: 'POST',
          endpoint: started.continuationEndpoint!,
          body: new TextEncoder().encode('fixture'),
          headers: {
            'content-length': '7',
            'content-type': 'text/plain',
            'x-goog-upload-command': 'upload, finalize',
            'x-goog-upload-offset': '0',
          },
          signal: new AbortController().signal,
        });
      }
    );

    expect(result.continuationEndpoint).toBeNull();
    expect(requests).toEqual([
      'POST /upload/v1/fileSearchStores/store-runtime-1:uploadToFileSearchStore',
      'POST /upload/v1/fileSearchStores/store-runtime-1:uploadToFileSearchStore?upload_id=upload_1&upload_protocol=resumable',
    ]);
    expect(JSON.stringify(result)).not.toContain(GEMINI_SECRET);
  });

  it('admits idempotent delete 404, rejects create 404, duplicate query keys, and invalid UTF-8', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const endpoint = new URL(String(input));
      if (endpoint.pathname.endsWith('/missing')) {
        return response({ deleted: false }, {}, 404);
      }
      if (endpoint.pathname === '/v1/vector_stores') {
        return response({ rejected: true }, {}, 404);
      }
      if (endpoint.searchParams.getAll('pageSize').length > 1) {
        return response({ fileSearchStores: [] });
      }
      return new Response(Uint8Array.from([0xff]), { status: 200 });
    });
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    const deleted = await transport.use(
      secretUse('openai-responses', 'lifecycle.openai.delete.0001'),
      (session) =>
        session.execute({
          protocolFamily: 'openai-responses',
          method: 'DELETE',
          endpoint: 'https://api.openai.com/v1/files/missing',
          signal: new AbortController().signal,
          acceptedStatuses: [200, 404],
        })
    );
    expect(deleted.status).toBe(404);

    await expect(
      transport.use(
        secretUse('openai-responses', 'lifecycle.openai.create.404'),
        (session) =>
          session.execute({
            protocolFamily: 'openai-responses',
            method: 'POST',
            endpoint: 'https://api.openai.com/v1/vector_stores',
            body: '{}',
            headers: {
              'idempotency-key': 'idempotency.openai.create.404',
            },
            signal: new AbortController().signal,
          })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected,
    });
    await expect(
      transport.use(
        secretUse('gemini-interactions', 'lifecycle.gemini.query.duplicate'),
        (session) =>
          session.execute({
            protocolFamily: 'gemini-interactions',
            method: 'GET',
            endpoint:
              'https://generativelanguage.googleapis.com/v1/fileSearchStores?pageSize=20&pageSize=20',
            signal: new AbortController().signal,
          })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
    });
    await expect(
      transport.use(
        secretUse('gemini-interactions', 'lifecycle.gemini.response.utf8'),
        (session) =>
          session.execute({
            protocolFamily: 'gemini-interactions',
            method: 'GET',
            endpoint:
              'https://generativelanguage.googleapis.com/v1/fileSearchStores?pageSize=20',
            signal: new AbortController().signal,
          })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it.each(['header', 'body'] as const)(
    'fails closed when a Provider copies the credential into the response %s',
    async (location) => {
      const fetch = vi.fn(async () =>
        location === 'header'
          ? response(
              { object: 'vector_store', id: 'vs-runtime-secret' },
              { 'x-debug-provider': OPENAI_SECRET },
              201
            )
          : response({ copiedCredential: OPENAI_SECRET }, {}, 201)
      );
      const transport = createAgentEvaluationProviderResourceTransport({
        environment,
        fetch,
        resolveHost,
        clock: () => NOW,
      });
      await expect(
        transport.use(
          secretUse(
            'openai-responses',
            `lifecycle.openai.secret-response.${location}`
          ),
          (session) =>
            session.execute({
              protocolFamily: 'openai-responses',
              method: 'POST',
              endpoint: 'https://api.openai.com/v1/vector_stores',
              body: '{}',
              headers: {
                'idempotency-key': `idempotency.secret-response.${location}`,
              },
              signal: new AbortController().signal,
            })
        )
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
      });
    }
  );

  it('enforces the exact secret purpose, one useId, callback lifetime, and close drain without Provider deletion', async () => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const methods: string[] = [];
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        methods.push(String(init?.method));
        await responseGate;
        return response(
          { object: 'vector_store', id: 'vs-close-drain' },
          {},
          201
        );
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });
    const request = secretUse(
      'openai-responses',
      'lifecycle.openai.close-drain.0001'
    );
    let escapedSession: AgentEvaluationProviderResourceTransportSession | null =
      null;
    const operation = transport.use(request, async (session) => {
      escapedSession = session;
      return session.execute({
        protocolFamily: 'openai-responses',
        method: 'POST',
        endpoint: 'https://api.openai.com/v1/vector_stores',
        body: '{}',
        headers: { 'idempotency-key': 'idempotency.close-drain.0001' },
        signal: new AbortController().signal,
      });
    });
    let closeSettled = false;
    const closing = transport.close().then((receipt) => {
      closeSettled = true;
      return receipt;
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    releaseResponse?.();
    await operation;
    await expect(closing).resolves.toMatchObject({
      status: 'clean',
      acceptedSessionCount: 1,
      completedSessionCount: 1,
      inFlightSessionCount: 0,
    });
    expect(methods).toEqual(['POST']);

    await expect(
      transport.use(request, async () => undefined)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      escapedSession!.execute({
        protocolFamily: 'openai-responses',
        method: 'DELETE',
        endpoint: 'https://api.openai.com/v1/vector_stores/vs-close-drain',
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });

    const purposeTransport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch: vi.fn(async () => response({}, {}, 201)),
      resolveHost,
      clock: () => NOW,
    });
    await expect(
      purposeTransport.use(
        {
          ...secretUse('openai-responses', 'lifecycle.invalid-purpose.0001'),
          purpose: 'caller-selected-purpose',
        } as unknown as AgentProviderSecretUseRequest,
        async () => undefined
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    await purposeTransport.use(
      secretUse('openai-responses', 'lifecycle.exact-purpose.0001'),
      async () => undefined
    );
    await expect(
      purposeTransport.use(
        secretUse('openai-responses', 'lifecycle.exact-purpose.0001'),
        async () => undefined
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
  });
});
