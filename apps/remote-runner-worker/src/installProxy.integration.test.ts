import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reservePort = async (): Promise<number> =>
  new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Could not reserve an install proxy port.'));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });

const requestDeniedOrigin = async (
  port: number,
  authorization: string,
  attempts = 20
): Promise<string> => {
  try {
    return await new Promise<string>((resolveResponse, rejectResponse) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let response = '';
      socket.once('connect', () => {
        socket.write('CONNECT example.com:443 HTTP/1.1\r\n');
        setImmediate(() =>
          socket.write(
            `Host: example.com:443\r\nProxy-Authorization: Basic ${authorization}\r\n\r\n`
          )
        );
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.once('end', () => resolveResponse(response));
      socket.once('error', rejectResponse);
    });
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    return requestDeniedOrigin(port, authorization, attempts - 1);
  }
};

describe('install egress proxy integration', () => {
  it('denies non-allowlisted CONNECT and logs only sanitized origin metadata', async () => {
    const port = await reservePort();
    const proxy = spawn(
      process.execPath,
      [resolve(import.meta.dirname, '../install-proxy/entry.mjs')],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          PRODIVIX_INSTALL_EGRESS_ALLOWLIST: 'registry.npmjs.org',
          PRODIVIX_INSTALL_PROXY_PORT: String(port),
        },
      }
    );
    let output = '';
    proxy.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    try {
      const traceId = 'install-test-1234';
      const response = await requestDeniedOrigin(
        port,
        Buffer.from(`${traceId}:`).toString('base64')
      );
      expect(response).toContain('403 Forbidden');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      const trace = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(trace).toMatchObject({
        protocol: 'prodivix.install-egress-trace.v1',
        requestId: traceId,
        method: 'CONNECT',
        host: 'example.com',
        port: 443,
        outcome: 'denied',
        status: 403,
      });
      expect(trace).not.toHaveProperty('headers');
      expect(trace).not.toHaveProperty('path');
      expect(trace).not.toHaveProperty('query');
    } finally {
      proxy.kill('SIGTERM');
      await new Promise<void>((resolveClose) =>
        proxy.once('close', () => resolveClose())
      );
    }
  });
});
