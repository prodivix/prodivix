import { lookup } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import net from 'node:net';

const listenPort = Number(process.env.PRODIVIX_INSTALL_PROXY_PORT ?? 8080);
if (!Number.isSafeInteger(listenPort) || listenPort < 1 || listenPort > 65_535)
  throw new TypeError('Install proxy port is invalid.');
const maximumTraceIdLength = 128;

const canonicalHost = (value) => {
  const host = domainToASCII(String(value).trim().toLowerCase().replace(/\.$/u, ''));
  if (
    !host ||
    host.length > 253 ||
    net.isIP(host) !== 0 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
      host
    )
  )
    throw new TypeError('Install proxy host is invalid.');
  return host;
};

const allowlist = Object.freeze(
  [...new Set((process.env.PRODIVIX_INSTALL_EGRESS_ALLOWLIST ?? '').split(','))]
    .filter(Boolean)
    .map((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized.startsWith('*.')
        ? `*.${canonicalHost(normalized.slice(2))}`
        : canonicalHost(normalized);
    })
    .sort()
);
if (!allowlist.length) throw new TypeError('Install proxy allowlist is required.');

const allowedHost = (host) =>
  allowlist.some((entry) =>
    entry.startsWith('*.')
      ? host.endsWith(entry.slice(1)) && host !== entry.slice(2)
      : host === entry
  );

const traceId = (request) => {
  const authorization = request.headers['proxy-authorization'];
  if (typeof authorization !== 'string' || !authorization.startsWith('Basic '))
    return undefined;
  let decoded;
  try {
    decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  } catch {
    return undefined;
  }
  const value = decoded.split(':', 1)[0];
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{7,127}$/u.test(value) &&
    value.length <= maximumTraceIdLength
    ? value
    : undefined;
};

const isPublicAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  return !(
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:')
  );
};

const publicAddress = async (host) => {
  const addresses = await lookup(host, { all: true, verbatim: true });
  const selected = addresses.find((entry) => isPublicAddress(entry.address));
  if (!selected) throw new Error('Install proxy destination is not public.');
  return selected;
};

const emit = (trace) => {
  process.stdout.write(`${JSON.stringify(trace)}\n`);
};

const deny = (socket, requestId, host, startedAt, status = 403) => {
  const completedAt = Date.now();
  socket.end(
    `HTTP/1.1 ${status} ${status === 407 ? 'Proxy Authentication Required' : 'Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
  );
  if (requestId)
    emit({
      protocol: 'prodivix.install-egress-trace.v1',
      requestId,
      method: 'CONNECT',
      host,
      port: 443,
      startedAt,
      completedAt,
      outcome: 'denied',
      status,
      requestBytes: 0,
      responseBytes: 0,
    });
};

const server = net.createServer((socket) => {
  const startedAt = Date.now();
  let buffered = Buffer.alloc(0);
  socket.setTimeout(120_000, () => socket.destroy());
  const handleHead = async (head) => {
    const headerEnd = head.indexOf('\r\n\r\n');
    if (headerEnd < 0 || headerEnd > 32 * 1024)
      return deny(socket, undefined, '', startedAt);
    const headerText = head.subarray(0, headerEnd).toString('latin1');
    const lines = headerText.split('\r\n');
    const [method, authority] = lines[0]?.split(' ') ?? [];
    const headers = Object.fromEntries(
      lines.slice(1).flatMap((line) => {
        const separator = line.indexOf(':');
        return separator < 1
          ? []
          : [[line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]];
      })
    );
    const request = { headers };
    const requestId = traceId(request);
    let host = '';
    let port = 0;
    try {
      const match = /^(.*):(\d+)$/u.exec(authority ?? '');
      if (!match) throw new TypeError('Install proxy authority is invalid.');
      host = canonicalHost(match[1]);
      port = Number(match[2]);
    } catch {
      return deny(socket, requestId, host, startedAt);
    }
    if (!requestId) return deny(socket, undefined, host, startedAt, 407);
    if (method !== 'CONNECT' || port !== 443 || !allowedHost(host))
      return deny(socket, requestId, host, startedAt);

    let upstream;
    let connected = false;
    let finished = false;
    let requestBytes = Math.max(0, head.byteLength - headerEnd - 4);
    let responseBytes = 0;
    const finish = (outcome, status) => {
      if (finished) return;
      finished = true;
      emit({
        protocol: 'prodivix.install-egress-trace.v1',
        requestId,
        method: 'CONNECT',
        host,
        port,
        startedAt,
        completedAt: Date.now(),
        outcome,
        status,
        requestBytes,
        responseBytes,
      });
    };
    try {
      const destination = await publicAddress(host);
      upstream = net.connect({
        host: destination.address,
        port,
        family: destination.family,
      });
      upstream.setTimeout(120_000, () => upstream.destroy());
      upstream.once('connect', () => {
        connected = true;
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const remaining = head.subarray(headerEnd + 4);
        if (remaining.byteLength) upstream.write(remaining);
        socket.on('data', (chunk) => {
          requestBytes += chunk.byteLength;
        });
        upstream.on('data', (chunk) => {
          responseBytes += chunk.byteLength;
        });
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      upstream.once('error', () => {
        if (!connected)
          socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        else socket.destroy();
        finish('failed', 502);
      });
      upstream.once('close', () => finish(connected ? 'allowed' : 'failed', connected ? 200 : 502));
      socket.once('error', () => {
        upstream?.destroy();
        finish('failed', 502);
      });
      socket.once('close', () => {
        upstream?.destroy();
        finish(connected ? 'allowed' : 'failed', connected ? 200 : 502);
      });
    } catch {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      finish('failed', 502);
    }
  };
  const collectHead = (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    const headerEnd = buffered.indexOf('\r\n\r\n');
    if (buffered.byteLength > 32 * 1024 && headerEnd < 0) {
      socket.off('data', collectHead);
      deny(socket, undefined, '', startedAt);
      return;
    }
    if (headerEnd < 0) return;
    socket.off('data', collectHead);
    void handleHead(buffered);
  };
  socket.on('data', collectHead);
});

server.listen(listenPort, '0.0.0.0');
const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
