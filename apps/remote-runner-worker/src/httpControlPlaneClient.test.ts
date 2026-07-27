import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteWorkerHttpControlPlaneClient } from './httpControlPlaneClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote worker HTTP Control Plane client', () => {
  it('hard-cuts an oversized Secret envelope response under a request timeout', async () => {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(400 * 1024));
        chunks += 1;
        if (chunks > 2) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteWorkerHttpControlPlaneClient({
      baseUrl: 'http://127.0.0.1:8080/',
      workerToken: 'worker-token-canary',
    });

    await expect(
      client.resolveServerFunctionSecrets!({
        executionId: 'execution-secret',
        workerId: 'worker-1',
        leaseToken: 'lease-token-canary',
        recipientPublicKey: Buffer.alloc(32, 0x11).toString('base64url'),
      })
    ).rejects.toThrow('Remote worker response is invalid.');
    expect(cancelled).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('transmits the complete artifact descriptor alongside the artifact contents', async () => {
    let framed = new Uint8Array();
    let descriptorBytes = 0;
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      descriptorBytes = Number(
        (init?.headers as Record<string, string>)[
          'x-prodivix-artifact-descriptor-bytes'
        ]
      );
      framed = new Uint8Array(init?.body as Uint8Array);
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteWorkerHttpControlPlaneClient({
      baseUrl: 'http://127.0.0.1:8080/',
      workerToken: 'worker-token-canary',
    });
    const contents = new TextEncoder().encode('<html>preview</html>');
    const descriptor = Object.freeze({
      artifactId: 'preview-bundle',
      kind: 'bundle' as const,
      label: 'Remote static preview',
      mediaType: 'application/zip',
      size: contents.byteLength,
      digest: `sha256-${'a'.repeat(64)}`,
      expiresAt: 60_000,
      authorizationScope: 'execution:execution-1',
      sourceTrace: Object.freeze([
        Object.freeze({
          sourceRef: Object.freeze({
            kind: 'workspace' as const,
            workspaceId: 'workspace-1',
          }),
          label: 'Remote static preview',
        }),
      ]),
      metadata: Object.freeze({
        readiness: 'ready',
        health: 'healthy',
        entryFilePath: 'index.html',
        snapshotDigest: 'sha256-snapshot',
      }),
    });

    await expect(
      client.uploadArtifact({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: 'lease-token-canary',
        workerEventId: '1:artifact:0:preview-bundle',
        descriptor,
        contents,
      })
    ).resolves.toBe('stored');
    expect(
      JSON.parse(
        Buffer.from(framed.subarray(0, descriptorBytes)).toString('utf8')
      )
    ).toEqual(descriptor);
    expect(framed.subarray(descriptorBytes)).toEqual(contents);
  });

  it('fails closed instead of transmitting an over-sized artifact descriptor', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteWorkerHttpControlPlaneClient({
      baseUrl: 'http://127.0.0.1:8080/',
      workerToken: 'worker-token-canary',
    });

    await expect(
      client.uploadArtifact({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: 'lease-token-canary',
        workerEventId: '1:artifact:0:preview-bundle',
        descriptor: {
          artifactId: 'preview-bundle',
          kind: 'bundle',
          mediaType: 'application/zip',
          size: 1,
          digest: `sha256-${'a'.repeat(64)}`,
          expiresAt: 60_000,
          authorizationScope: 'execution:execution-1',
          metadata: { oversized: 'x'.repeat(128 * 1024) },
        },
        contents: new Uint8Array([1]),
      })
    ).rejects.toThrow('Remote worker artifact descriptor is invalid.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
