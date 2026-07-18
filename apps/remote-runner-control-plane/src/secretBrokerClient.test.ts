import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
  REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
  type RemoteExecutionSecretEnvelopeIdentity,
} from '@prodivix/runtime-remote';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRemoteExecutionSecretBroker,
  isRemoteExecutionSecretResolutionLeaseEligible,
  REMOTE_EXECUTION_SECRET_RESOLUTION_REQUEST_FORMAT,
} from './secretBrokerClient';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
});

const listen = async (handler: RequestListener): Promise<string> => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/`;
};

const identity: RemoteExecutionSecretEnvelopeIdentity = Object.freeze({
  executionId: 'execution-secret',
  workerId: 'worker-1',
  workerAttempt: 2,
  workspaceId: 'workspace-1',
  snapshotId: 'snapshot-1',
  functionRef: Object.freeze({
    artifactId: 'code-secret',
    exportName: 'useSecret',
  }),
  invocationId: 'invocation-secret',
  recipientPublicKey: Buffer.alloc(32, 0x11).toString('base64url'),
});
const envelope = Object.freeze({
  format: REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
  algorithm: REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
  ...identity,
  ephemeralPublicKey: Buffer.alloc(32, 0x22).toString('base64url'),
  nonce: Buffer.alloc(12, 0x33).toString('base64url'),
  ciphertext: Buffer.alloc(17, 0x44).toString('base64url'),
  expiresAt: Date.now() + 30_000,
});

describe('remote execution Secret broker client', () => {
  it('accepts only the exact active starting or reclaimed running lease', () => {
    const lease = {
      workerId: 'worker-2',
      token: 'lease-2',
      attempt: 2,
      expiresAt: 2_000,
    } as const;
    for (const status of ['starting', 'running'] as const) {
      expect(
        isRemoteExecutionSecretResolutionLeaseEligible(
          { record: { status }, lease },
          { workerId: lease.workerId, leaseToken: lease.token },
          1_000
        )
      ).toBe(true);
    }
    for (const execution of [
      { record: { status: 'cancelling' }, lease },
      { record: { status: 'running' }, lease: { ...lease, attempt: 1 } },
      { record: { status: 'running' }, lease: { ...lease, attempt: 0 } },
      { record: { status: 'running' }, lease: { ...lease, expiresAt: 1_000 } },
      { record: { status: 'running' }, lease: { ...lease, workerId: 'stale' } },
      { record: { status: 'running' }, lease: { ...lease, token: 'stale' } },
    ]) {
      expect(
        isRemoteExecutionSecretResolutionLeaseEligible(
          execution,
          { workerId: lease.workerId, leaseToken: lease.token },
          1_000
        )
      ).toBe(false);
    }
  });

  it('requires an HTTPS or exact loopback service origin', () => {
    for (const baseUrl of [
      'http://backend.example.com/',
      'https://backend.example.com/unexpected-path',
      'https://user:password@backend.example.com/',
    ]) {
      expect(() =>
        createRemoteExecutionSecretBroker({
          baseUrl,
          token: 'backend-secret-broker-token',
          timeoutMs: 1_000,
        })
      ).toThrow('Remote execution Secret broker URL is invalid.');
    }
    expect(() =>
      createRemoteExecutionSecretBroker({
        baseUrl: 'http://[::1]:8080/',
        token: 'backend-secret-broker-token',
        timeoutMs: 1_000,
      })
    ).not.toThrow();
  });

  it('forwards only the exact worker identity and accepts a strict ciphertext envelope', async () => {
    const serviceToken = 'backend-secret-broker-token-canary';
    let requestBody: unknown;
    let authorization: string | undefined;
    const baseUrl = await listen(async (request, response) => {
      authorization = request.headers.authorization;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(
        JSON.stringify({
          envelope,
        })
      );
    });
    const broker = createRemoteExecutionSecretBroker({
      baseUrl,
      token: serviceToken,
      timeoutMs: 1_000,
    });

    await expect(broker.resolve(identity)).resolves.toMatchObject(identity);
    expect(authorization).toBe(`Bearer ${serviceToken}`);
    expect(requestBody).toEqual({
      format: REMOTE_EXECUTION_SECRET_RESOLUTION_REQUEST_FORMAT,
      ...identity,
    });
    expect(JSON.stringify(requestBody)).not.toContain(serviceToken);
  });

  it('hard-cuts a chunked response while it crosses the ciphertext budget', async () => {
    const baseUrl = await listen((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.write('x'.repeat(400 * 1024));
      response.end('x'.repeat(400 * 1024));
    });
    const broker = createRemoteExecutionSecretBroker({
      baseUrl,
      token: 'backend-secret-broker-token',
      timeoutMs: 1_000,
    });

    await expect(broker.resolve(identity)).rejects.toThrow(
      'Remote execution Secret broker response is invalid.'
    );
  });

  it('rejects a valid envelope when the broker omits no-store hardening', async () => {
    const baseUrl = await listen((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ envelope }));
    });
    const broker = createRemoteExecutionSecretBroker({
      baseUrl,
      token: 'backend-secret-broker-token',
      timeoutMs: 1_000,
    });

    await expect(broker.resolve(identity)).rejects.toThrow(
      'Remote execution Secret broker response is invalid.'
    );
  });
});
