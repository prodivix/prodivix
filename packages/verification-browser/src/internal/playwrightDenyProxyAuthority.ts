import { createServer, type Server, type Socket } from 'node:net';
import { digestVerificationValue } from '@prodivix/verification';

export type PlaywrightDenyProxyAuthoritySnapshot = Readonly<{
  endpoint: string;
  endpointDigest: string;
  connectionAttemptCount: number;
  activeConnectionCount: number;
  connectAttemptCount: number;
  httpRequestAttemptCount: number;
  unknownAttemptCount: number;
  faultCount: number;
  attemptLedgerDigest: string;
}>;

export type PlaywrightDenyProxyAuthority = Readonly<{
  endpoint: string;
  endpointDigest: string;
  snapshot(): PlaywrightDenyProxyAuthoritySnapshot;
  close(): Promise<void>;
}>;

type ProxyAttemptKind =
  'connection-opened' | 'connect-request' | 'http-request' | 'unknown-request';

const listen = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      rejectPromise(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({
      host: '127.0.0.1',
      port: 0,
      exclusive: true,
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });

/**
 * Creates a per-attempt loopback proxy authority. It never forwards bytes:
 * every attempted connection is recorded and denied, so terminal evidence
 * can distinguish author-layer denial from a browser transport fallback.
 */
export const createPlaywrightDenyProxyAuthority =
  async (): Promise<PlaywrightDenyProxyAuthority> => {
    const attempts: Array<
      Readonly<{ sequence: number; kind: ProxyAttemptKind }>
    > = [];
    const sockets = new Set<Socket>();
    let connectionAttemptCount = 0;
    let connectAttemptCount = 0;
    let httpRequestAttemptCount = 0;
    let unknownAttemptCount = 0;
    let faultCount = 0;
    let closed = false;
    const record = (kind: ProxyAttemptKind): void => {
      attempts.push(
        Object.freeze({
          sequence: attempts.length + 1,
          kind,
        })
      );
    };
    const server = createServer((socket) => {
      connectionAttemptCount += 1;
      record('connection-opened');
      sockets.add(socket);
      let classified = false;
      socket.once('data', (bytes) => {
        classified = true;
        const firstLine = (
          typeof bytes === 'string'
            ? bytes.slice(0, 1_024)
            : bytes.subarray(0, 1_024).toString('ascii')
        )
          .split(/\r?\n/u, 1)[0]!
          .trim();
        if (/^CONNECT\s+/u.test(firstLine)) {
          connectAttemptCount += 1;
          record('connect-request');
        } else if (/^[A-Z]+\s+\S+\s+HTTP\/1\.[01]$/u.test(firstLine)) {
          httpRequestAttemptCount += 1;
          record('http-request');
        } else {
          unknownAttemptCount += 1;
          record('unknown-request');
        }
        socket.destroy();
      });
      socket.once('error', () => {
        faultCount += 1;
      });
      socket.once('close', () => {
        sockets.delete(socket);
        if (!classified && !closed) {
          unknownAttemptCount += 1;
          record('unknown-request');
        }
      });
    });
    server.on('error', () => {
      faultCount += 1;
    });
    await listen(server);
    const address = server.address();
    if (
      address === null ||
      typeof address === 'string' ||
      address.address !== '127.0.0.1' ||
      !Number.isSafeInteger(address.port) ||
      address.port < 1
    ) {
      await closeServer(server).catch(() => undefined);
      throw new Error(
        'Playwright deny proxy did not bind an exact loopback endpoint.'
      );
    }
    const endpoint = `http://127.0.0.1:${address.port}`;
    const endpointDigest = digestVerificationValue({
      format: 'prodivix.playwright-deny-proxy-authority',
      version: 1,
      endpoint,
      policy: 'record-and-deny-all',
    });
    const snapshot = (): PlaywrightDenyProxyAuthoritySnapshot =>
      Object.freeze({
        endpoint,
        endpointDigest,
        connectionAttemptCount,
        activeConnectionCount: sockets.size,
        connectAttemptCount,
        httpRequestAttemptCount,
        unknownAttemptCount,
        faultCount,
        attemptLedgerDigest: digestVerificationValue(attempts),
      });
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      if (server.listening) await closeServer(server);
    };
    return Object.freeze({
      endpoint,
      endpointDigest,
      snapshot,
      close,
    });
  };
