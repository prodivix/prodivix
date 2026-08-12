import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  digestAgentCanonicalValue,
  resolveAgentCapabilityProbePublicResource,
  resolveAgentProductionEvaluationNativeProviderIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  digestAgentEvaluationCapabilityProbeProviderResourceStage,
} from './capabilityProbeProviderResourceClient';
import type { AgentEvaluationCapabilityProbeProviderResourceCleanupClient } from './capabilityProbeProviderResourceCleanupClient';
import {
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_IMPLEMENTATION_DIGEST,
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST,
  createAgentEvaluationCapabilityProbeProviderResourceHandle,
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport,
  createProductionAgentEvaluationCapabilityProbeProviderResourceOwner,
  type AgentEvaluationCapabilityProbeProviderResourceHandle,
  type AgentEvaluationCapabilityProbeProviderResourceTransport,
} from './productionCapabilityProbeProviderResourceOwner';
import { refreshAgentEvaluationTestMaterialCatalogDigests } from './runConfig.fixture';
import { decodeAgentEvaluationRunConfigQualificationTemplate } from './runConfig';
import type { AgentProviderSecretResolver } from './secretResolver';

const namespaceId = 'evaluation.probe-resource-owner.test';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const registeredAt = '2026-08-08T00:00:00.000Z';
const minimumExpiresAt = '2026-08-15T00:00:00.000Z';
const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const registrationRequest = (
  protocolFamily:
    'gemini-interactions' | 'openai-responses' = 'openai-responses'
) => {
  const value = JSON.parse(readFileSync(examplePath, 'utf8')) as Record<
    string,
    unknown
  >;
  refreshAgentEvaluationTestMaterialCatalogDigests(value);
  const template = decodeAgentEvaluationRunConfigQualificationTemplate(value);
  const identity = template.nativeIdentities.find(
    (candidate) => candidate.protocolFamily === protocolFamily
  )!;
  const { provider, model } =
    resolveAgentProductionEvaluationNativeProviderIdentity(identity);
  return createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
    {
      namespaceId,
      repositoryCommit,
      providerConfiguration: provider,
      modelLineage: model,
      probeProgram:
        identity.capabilityProbePrograms['g4-provider-hosted-retrieval-core'],
      minimumExpiresAt,
    }
  );
};

const response = (
  value: unknown,
  headers: Readonly<Record<string, string>> = {},
  status = 200
): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const initialHandle = (
  request: ReturnType<typeof registrationRequest>
): AgentEvaluationCapabilityProbeProviderResourceHandle =>
  createAgentEvaluationCapabilityProbeProviderResourceHandle({
    protocolFamily: request.providerConfiguration.adapter.protocolFamily as
      'gemini-interactions' | 'openai-responses',
    requestDigest: request.requestDigest,
    lifecycle: 'preparing',
    providerResourceId: null,
    auxiliaryResourceIds: Object.freeze([]),
    requestProjectionDigests: Object.freeze([]),
    responseProjectionDigests: Object.freeze([]),
    dispatchIntentDigest: null,
    transportReceiptDigest: null,
    responseSpoolDigest: null,
    uploadedAt: null,
  });

const testSecrets = (): AgentProviderSecretResolver =>
  Object.freeze({
    use: async <T>(
      _request: Parameters<AgentProviderSecretResolver['use']>[0],
      consumer: (material: Uint8Array) => Promise<T>
    ): Promise<T> =>
      consumer(new TextEncoder().encode('provider-test-secret-123456789')),
  });

const stageFor = (requestDigest: CanonicalDigest): CanonicalDigest =>
  digestAgentEvaluationCapabilityProbeProviderResourceStage(
    requestDigest,
    PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST
  );

const emptyCleanupClient =
  (): AgentEvaluationCapabilityProbeProviderResourceCleanupClient =>
    Object.freeze({
      list: async () =>
        Object.freeze({
          format:
            'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-list' as const,
          version: 1 as const,
          namespaceId,
          repositoryCommit,
          records: Object.freeze([]),
          listDigest: digestAgentCanonicalValue({
            format:
              'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-list',
            version: 1,
            namespaceId,
            repositoryCommit,
            records: Object.freeze([]),
          }),
        }),
      cleanup: async () => {
        throw new TypeError('unexpected cleanup');
      },
      storeResult: async () => {
        throw new TypeError('unexpected cleanup ingress');
      },
    });

const exchange = (suffix: string) =>
  Object.freeze({
    requestProjectionDigest: digestAgentCanonicalValue({ request: suffix }),
    responseProjectionDigest: digestAgentCanonicalValue({ response: suffix }),
  });

const preparingHandle = (
  source: AgentEvaluationCapabilityProbeProviderResourceHandle,
  suffix: string
): AgentEvaluationCapabilityProbeProviderResourceHandle => {
  const current = exchange(suffix);
  return createAgentEvaluationCapabilityProbeProviderResourceHandle({
    protocolFamily: source.protocolFamily,
    requestDigest: source.requestDigest,
    lifecycle: 'preparing',
    providerResourceId: 'provider-resource.openai.owner-test',
    auxiliaryResourceIds: Object.freeze(['provider-file.openai.owner-test']),
    requestProjectionDigests: Object.freeze([
      ...source.requestProjectionDigests,
      current.requestProjectionDigest,
    ]),
    responseProjectionDigests: Object.freeze([
      ...source.responseProjectionDigests,
      current.responseProjectionDigest,
    ]),
    dispatchIntentDigest: null,
    transportReceiptDigest: null,
    responseSpoolDigest: null,
    uploadedAt: null,
  });
};

const activeHandle = (
  source: AgentEvaluationCapabilityProbeProviderResourceHandle,
  suffix: string
): AgentEvaluationCapabilityProbeProviderResourceHandle => {
  const current = exchange(suffix);
  const requestProjectionDigests = Object.freeze([
    ...source.requestProjectionDigests,
    current.requestProjectionDigest,
  ]);
  const responseProjectionDigests = Object.freeze([
    ...source.responseProjectionDigests,
    current.responseProjectionDigest,
  ]);
  const exchanges = requestProjectionDigests.map(
    (requestProjectionDigest, index) =>
      Object.freeze({
        requestProjectionDigest,
        responseProjectionDigest: responseProjectionDigests[index]!,
      })
  );
  return createAgentEvaluationCapabilityProbeProviderResourceHandle({
    protocolFamily: source.protocolFamily,
    requestDigest: source.requestDigest,
    lifecycle: 'active',
    providerResourceId: source.providerResourceId,
    auxiliaryResourceIds: source.auxiliaryResourceIds,
    requestProjectionDigests,
    responseProjectionDigests,
    dispatchIntentDigest: digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-intents',
      version: 1,
      requestProjectionDigests,
    }),
    transportReceiptDigest: digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-transport-receipts',
      version: 1,
      responseProjectionDigests,
    }),
    responseSpoolDigest: digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-response-spool',
      version: 1,
      exchangeSetDigest: digestAgentCanonicalValue(exchanges),
    }),
    uploadedAt: registeredAt,
  });
};

const stateDirectory = async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'prodivix-provider-resource-owner-')
  );
  directories.push(directory);
  return join(directory, 'state');
};

describe('production capability probe provider resource owner', () => {
  it('persists one exact result, replays it, and retires the provider resource', async () => {
    const request = registrationRequest();
    const checkpoints: AgentEvaluationCapabilityProbeProviderResourceHandle[] =
      [];
    const register = vi.fn<
      AgentEvaluationCapabilityProbeProviderResourceTransport['register']
    >(async ({ existingHandle, checkpoint }) => {
      const preparing = preparingHandle(existingHandle, 'create');
      await checkpoint(preparing);
      checkpoints.push(preparing);
      const active = activeHandle(preparing, 'observe');
      await checkpoint(active);
      checkpoints.push(active);
      return Object.freeze({ handle: active });
    });
    const remove = vi.fn<
      AgentEvaluationCapabilityProbeProviderResourceTransport['delete']
    >(async () => undefined);
    const owner =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: await stateDirectory(),
          transport: Object.freeze({
            register,
            delete: remove,
            cleanup: async () => Object.freeze([]),
          }),
          cleanupClient: emptyCleanupClient(),
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );
    const input = Object.freeze({
      request,
      stageDigest: stageFor(request.requestDigest),
    });

    const first = await owner.port.execute(input);
    const replay = await owner.port.execute(input);

    expect(replay).toEqual(first);
    expect(register).toHaveBeenCalledOnce();
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[1]).toMatchObject({
      lifecycle: 'active',
      requestProjectionDigests: expect.any(Array),
      responseProjectionDigests: expect.any(Array),
    });
    expect(checkpoints[1]!.requestProjectionDigests).toHaveLength(2);
    expect(first.contentUploadReceipt).toMatchObject({
      dispatchIntentDigest: checkpoints[1]!.dispatchIntentDigest,
      transportReceiptDigest: checkpoints[1]!.transportReceiptDigest,
      responseSpoolDigest: checkpoints[1]!.responseSpoolDigest,
    });

    await expect(owner.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0]![0].handle).toEqual(checkpoints[1]);
  }, 15_000);

  it('resumes from a cross-host checkpoint without dropping prior exchanges', async () => {
    const request = registrationRequest();
    const directory = await stateDirectory();
    const firstTransport: AgentEvaluationCapabilityProbeProviderResourceTransport =
      Object.freeze({
        register: async ({ existingHandle, checkpoint }) => {
          await checkpoint(preparingHandle(existingHandle, 'host-one-create'));
          throw new TypeError('simulated host loss');
        },
        delete: async () => undefined,
        cleanup: async () => Object.freeze([]),
      });
    const firstOwner =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: directory,
          transport: firstTransport,
          cleanupClient: emptyCleanupClient(),
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );
    const input = Object.freeze({
      request,
      stageDigest: stageFor(request.requestDigest),
    });
    await expect(firstOwner.port.execute(input)).rejects.toThrow(
      'simulated host loss'
    );

    let resumedHandle:
      AgentEvaluationCapabilityProbeProviderResourceHandle | undefined;
    const remove = vi.fn<
      AgentEvaluationCapabilityProbeProviderResourceTransport['delete']
    >(async () => undefined);
    const secondOwner =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: directory,
          transport: Object.freeze({
            register: async ({ existingHandle, checkpoint }) => {
              expect(existingHandle.lifecycle).toBe('preparing');
              expect(existingHandle.requestProjectionDigests).toHaveLength(1);
              resumedHandle = activeHandle(existingHandle, 'host-two-observe');
              await checkpoint(resumedHandle);
              return Object.freeze({ handle: resumedHandle });
            },
            delete: remove,
            cleanup: async () => Object.freeze([]),
          }),
          cleanupClient: emptyCleanupClient(),
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );

    await expect(secondOwner.port.execute(input)).resolves.toMatchObject({
      requestDigest: request.requestDigest,
    });
    expect(resumedHandle?.requestProjectionDigests).toHaveLength(2);
    await secondOwner.close();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('adopts the sealed cleanup projection on an empty host and deletes every resource once', async () => {
    const request = registrationRequest();
    const firstOwner =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: await stateDirectory(),
          transport: Object.freeze({
            register: async ({ existingHandle, checkpoint }) => {
              const preparing = preparingHandle(existingHandle, 'create');
              await checkpoint(preparing);
              const active = activeHandle(preparing, 'observe');
              await checkpoint(active);
              return Object.freeze({ handle: active });
            },
            delete: async () => undefined,
            cleanup: async () => Object.freeze([]),
          }),
          cleanupClient: emptyCleanupClient(),
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );
    const resourceResult = await firstOwner.port.execute({
      request,
      stageDigest: stageFor(request.requestDigest),
    });
    const cleanupRequest =
      createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
        repositoryCommit,
        resourceRegistrationRequestDigest: request.requestDigest,
        deletionAuthorityReceiptDigest:
          resourceResult.deletionAuthorityReceipt
            .deletionAuthorityReceiptDigest,
      });
    const cleanupTransport = vi.fn<
      AgentEvaluationCapabilityProbeProviderResourceTransport['cleanup']
    >(async ({ deletionRequestProjection }) =>
      Object.freeze([
        createAgentCapabilityProbeProviderResourceCleanupResourceResult({
          resourceId: deletionRequestProjection.providerResourceId,
          resourceRole: 'primary',
          outcome: 'deleted',
          dispatchIntentDigest: digestAgentCanonicalValue({
            resource: deletionRequestProjection.providerResourceId,
            stage: 'dispatch',
          }),
          transportReceiptDigest: digestAgentCanonicalValue({
            resource: deletionRequestProjection.providerResourceId,
            stage: 'transport',
          }),
          completedAt: registeredAt,
        }),
        ...deletionRequestProjection.auxiliaryResourceIds.map((resourceId) =>
          createAgentCapabilityProbeProviderResourceCleanupResourceResult({
            resourceId,
            resourceRole: 'auxiliary',
            outcome: 'deleted',
            dispatchIntentDigest: digestAgentCanonicalValue({
              resource: resourceId,
              stage: 'dispatch',
            }),
            transportReceiptDigest: digestAgentCanonicalValue({
              resource: resourceId,
              stage: 'transport',
            }),
            completedAt: registeredAt,
          })
        ),
      ])
    );
    let cleanupResponse: ReturnType<
      typeof createAgentCapabilityProbeProviderResourceCleanupResponse
    > | null = null;
    let emptyHost:
      | Awaited<
          ReturnType<
            typeof createProductionAgentEvaluationCapabilityProbeProviderResourceOwner
          >
        >
      | undefined;
    const cleanupClient = Object.freeze({
      list: async () =>
        ({
          records: [
            {
              resourceRegistrationRequest: request,
              cleanupRequest,
              cleanupResponse,
            },
          ],
        }) as unknown as Awaited<
          ReturnType<
            AgentEvaluationCapabilityProbeProviderResourceCleanupClient['list']
          >
        >,
      cleanup: async () => {
        const cleanupReceipt = await emptyHost!.cleanupPort.execute({
          cleanupRequest,
          deletionAuthorityReceipt: resourceResult.deletionAuthorityReceipt,
        });
        cleanupResponse =
          createAgentCapabilityProbeProviderResourceCleanupResponse({
            repositoryCommit,
            resourceRegistrationRequestDigest: request.requestDigest,
            ownerImplementationDigest:
              PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_IMPLEMENTATION_DIGEST,
            cleanupReceipt,
          });
        return cleanupResponse;
      },
      storeResult: async () => {
        throw new TypeError('unexpected cleanup ingress');
      },
    }) satisfies AgentEvaluationCapabilityProbeProviderResourceCleanupClient;
    const localDelete = vi.fn(async () => undefined);
    emptyHost =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: await stateDirectory(),
          transport: Object.freeze({
            register: async () => {
              throw new TypeError('unexpected registration');
            },
            delete: localDelete,
            cleanup: cleanupTransport,
          }),
          cleanupClient,
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );

    await expect(emptyHost.close()).resolves.toMatchObject({ status: 'clean' });
    expect(cleanupTransport).toHaveBeenCalledOnce();
    expect(
      cleanupTransport.mock.calls[0]![0].deletionRequestProjection
    ).toEqual(
      resourceResult.deletionAuthorityReceipt.deletionRequestProjection
    );
    expect(localDelete).not.toHaveBeenCalled();
    expect(cleanupResponse).not.toBeNull();
  });

  it('rejects a stage swap before invoking the provider transport', async () => {
    const request = registrationRequest();
    const register =
      vi.fn<
        AgentEvaluationCapabilityProbeProviderResourceTransport['register']
      >();
    const owner =
      await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
        {
          stateDirectory: await stateDirectory(),
          transport: Object.freeze({
            register,
            delete: async () => undefined,
            cleanup: async () => Object.freeze([]),
          }),
          cleanupClient: emptyCleanupClient(),
          forbiddenCanaries: () => ['provider-owner-canary-123456789'],
          clock: () => registeredAt,
          allowTemporaryStateDirectory: true,
        }
      );

    await expect(
      owner.port.execute({
        request,
        stageDigest: digestAgentCanonicalValue({ swapped: true }),
      })
    ).rejects.toThrow('stage');
    expect(register).not.toHaveBeenCalled();
    await owner.close();
  });
});

describe('environment capability probe provider resource transport', () => {
  it('uploads, indexes, observes, and deletes one OpenAI vector store', async () => {
    const request = registrationRequest('openai-responses');
    const material = resolveAgentCapabilityProbePublicResource(
      request.probeProgram
    )!;
    const content = material.documentText ?? material.contentText;
    const calls: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = String(input);
        const method = init?.method ?? '';
        calls.push(`${method} ${new URL(endpoint).pathname}`);
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe(
          'Bearer provider-test-secret-123456789'
        );
        if (method === 'POST' && endpoint.endsWith('/v1/files')) {
          return response({
            object: 'file',
            id: 'file-probe-1',
            bytes: new TextEncoder().encode(content).byteLength,
            purpose: 'user_data',
          });
        }
        if (method === 'POST' && endpoint.endsWith('/v1/vector_stores')) {
          return response({ object: 'vector_store', id: 'vs-probe-1' });
        }
        if (method === 'GET') {
          return response({
            id: 'vs-probe-1',
            object: 'vector_store',
            status: 'completed',
            file_counts: {
              failed: 0,
              cancelled: 0,
              completed: 1,
              in_progress: 0,
              total: 1,
            },
          });
        }
        if (method === 'DELETE') {
          return endpoint.includes('/v1/files/')
            ? response({ deleted: false }, {}, 404)
            : response({ deleted: true });
        }
        throw new TypeError(`unexpected OpenAI request ${method} ${endpoint}`);
      }
    );
    const transport =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport({
        secrets: testSecrets(),
        fetch,
        resolveHost: async () => ['8.8.8.8'],
        clock: () => registeredAt,
        wait: async () => undefined,
      });
    const checkpoints: AgentEvaluationCapabilityProbeProviderResourceHandle[] =
      [];

    const registration = await transport.register({
      request,
      material,
      registeredAt,
      expiresAt: minimumExpiresAt,
      existingHandle: initialHandle(request),
      checkpoint: async (handle) => {
        checkpoints.push(handle);
      },
      signal: new AbortController().signal,
    });

    expect(registration.handle).toMatchObject({
      lifecycle: 'active',
      providerResourceId: 'vs-probe-1',
      auxiliaryResourceIds: ['file-probe-1'],
    });
    expect(registration.handle.requestProjectionDigests).toHaveLength(3);
    expect(checkpoints).toHaveLength(3);
    const cleanupResults = await transport.cleanup({
      deletionRequestProjection:
        createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
          requestDigest: request.requestDigest,
          protocolFamily: 'openai-responses',
          providerResourceId: registration.handle.providerResourceId!,
          auxiliaryResourceIds: registration.handle.auxiliaryResourceIds,
        }),
      signal: new AbortController().signal,
    });
    expect(cleanupResults).toMatchObject([
      { resourceRole: 'primary', outcome: 'deleted' },
      { resourceRole: 'auxiliary', outcome: 'already-absent' },
    ]);
    expect(calls).toEqual([
      'POST /v1/files',
      'POST /v1/vector_stores',
      'GET /v1/vector_stores/vs-probe-1',
      'DELETE /v1/vector_stores/vs-probe-1',
      'DELETE /v1/files/file-probe-1',
    ]);
  });

  it('reconciles, uploads, observes, and force-deletes one Gemini file-search store', async () => {
    const request = registrationRequest('gemini-interactions');
    const material = resolveAgentCapabilityProbePublicResource(
      request.probeProgram
    )!;
    const displayName = `prodivix-probe-${request.requestDigest.slice(7, 31)}`;
    const calls: string[] = [];
    let storeReads = 0;
    const uploadUrl =
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore?upload_id=upload_1&upload_protocol=resumable';
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = String(input);
        const url = new URL(endpoint);
        const method = init?.method ?? '';
        calls.push(`${method} ${url.pathname}${url.search}`);
        const headers = new Headers(init?.headers);
        expect(headers.get('x-goog-api-key')).toBe(
          'provider-test-secret-123456789'
        );
        if (method === 'GET' && url.pathname === '/v1/fileSearchStores') {
          return response({ fileSearchStores: [] });
        }
        if (method === 'POST' && url.pathname === '/v1/fileSearchStores') {
          return response({
            name: 'fileSearchStores/store-probe-1',
            displayName,
          });
        }
        if (
          method === 'GET' &&
          url.pathname === '/v1/fileSearchStores/store-probe-1'
        ) {
          storeReads += 1;
          return response({
            name: 'fileSearchStores/store-probe-1',
            activeDocumentsCount: storeReads === 1 ? 0 : 1,
            pendingDocumentsCount: 0,
            failedDocumentsCount: 0,
          });
        }
        if (
          method === 'POST' &&
          url.pathname.endsWith(':uploadToFileSearchStore') &&
          url.search === ''
        ) {
          return response({}, { 'x-goog-upload-url': uploadUrl });
        }
        if (method === 'POST' && endpoint === uploadUrl) {
          expect(init?.body).toBeInstanceOf(Uint8Array);
          return response({
            name: 'fileSearchStores/store-probe-1/upload/operations/op-probe-1',
          });
        }
        if (method === 'DELETE') return response({});
        throw new TypeError(`unexpected Gemini request ${method} ${endpoint}`);
      }
    );
    const transport =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport({
        secrets: testSecrets(),
        fetch,
        resolveHost: async () => ['8.8.8.8'],
        clock: () => registeredAt,
        wait: async () => undefined,
      });
    const checkpoints: AgentEvaluationCapabilityProbeProviderResourceHandle[] =
      [];

    const registration = await transport.register({
      request,
      material,
      registeredAt,
      expiresAt: minimumExpiresAt,
      existingHandle: initialHandle(request),
      checkpoint: async (handle) => {
        checkpoints.push(handle);
      },
      signal: new AbortController().signal,
    });

    expect(registration.handle).toMatchObject({
      lifecycle: 'active',
      providerResourceId: 'fileSearchStores/store-probe-1',
    });
    expect(registration.handle.requestProjectionDigests).toHaveLength(6);
    expect(checkpoints).toHaveLength(2);
    const cleanupResults = await transport.cleanup({
      deletionRequestProjection:
        createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
          requestDigest: request.requestDigest,
          protocolFamily: 'gemini-interactions',
          providerResourceId: registration.handle.providerResourceId!,
          auxiliaryResourceIds: Object.freeze([]),
        }),
      signal: new AbortController().signal,
    });
    expect(cleanupResults).toMatchObject([
      { resourceRole: 'primary', outcome: 'deleted' },
    ]);
    expect(calls).toEqual([
      'GET /v1/fileSearchStores?pageSize=20',
      'POST /v1/fileSearchStores',
      'GET /v1/fileSearchStores/store-probe-1',
      'POST /upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore',
      'POST /upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore?upload_id=upload_1&upload_protocol=resumable',
      'GET /v1/fileSearchStores/store-probe-1',
      'DELETE /v1/fileSearchStores/store-probe-1?force=true',
    ]);
  });

  it('adopts one uniquely named Gemini store after a lost create response', async () => {
    const request = registrationRequest('gemini-interactions');
    const material = resolveAgentCapabilityProbePublicResource(
      request.probeProgram
    )!;
    const displayName = `prodivix-probe-${request.requestDigest.slice(7, 31)}`;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const endpoint = new URL(String(input));
      if (endpoint.pathname === '/v1/fileSearchStores') {
        return response({
          fileSearchStores: [
            {
              name: 'fileSearchStores/store-recovered-1',
              displayName,
            },
          ],
        });
      }
      if (endpoint.pathname === '/v1/fileSearchStores/store-recovered-1') {
        return response({
          name: 'fileSearchStores/store-recovered-1',
          activeDocumentsCount: 1,
          pendingDocumentsCount: 0,
          failedDocumentsCount: 0,
        });
      }
      throw new TypeError(`unexpected recovered request ${endpoint.href}`);
    });
    const transport =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport({
        secrets: testSecrets(),
        fetch,
        resolveHost: async () => ['8.8.8.8'],
        clock: () => registeredAt,
        wait: async () => undefined,
      });

    const registration = await transport.register({
      request,
      material,
      registeredAt,
      expiresAt: minimumExpiresAt,
      existingHandle: initialHandle(request),
      checkpoint: async () => undefined,
      signal: new AbortController().signal,
    });

    expect(registration.handle.providerResourceId).toBe(
      'fileSearchStores/store-recovered-1'
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
