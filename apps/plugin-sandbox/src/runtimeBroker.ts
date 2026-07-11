type RuntimeBootstrapMessage = Readonly<{
  kind: 'prodivix-runtime-bootstrap';
  nonce: string;
  frameId: string;
  workerBootstrapSource: string;
  workerBootstrapDigest: string;
  runtimeBytes: ArrayBuffer;
  runtimeDigest: string;
  supportedProtocolVersions: readonly string[];
  context: Readonly<{
    pluginId: string;
    pluginVersion: string;
    sessionToken: string;
    operationId: string;
  }>;
}>;

const fragment = new URLSearchParams(location.hash.slice(1));
const nonce = fragment.get('nonce');
const frameId = fragment.get('frameId');

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const digestSha256Bytes = async (bytes: BufferSource): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256-${encodeBase64(new Uint8Array(digest))}`;
};

const digestSha256Text = (source: string): Promise<string> =>
  digestSha256Bytes(new TextEncoder().encode(source));

const isBootstrapMessage = (
  value: unknown,
  expectedNonce: string,
  expectedFrameId: string
): value is RuntimeBootstrapMessage => {
  const record = asRecord(value);
  const context = asRecord(record?.context);
  return Boolean(
    record &&
    context &&
    record.kind === 'prodivix-runtime-bootstrap' &&
    record.nonce === expectedNonce &&
    record.frameId === expectedFrameId &&
    typeof record.workerBootstrapSource === 'string' &&
    typeof record.workerBootstrapDigest === 'string' &&
    record.runtimeBytes instanceof ArrayBuffer &&
    typeof record.runtimeDigest === 'string' &&
    Array.isArray(record.supportedProtocolVersions) &&
    record.supportedProtocolVersions.every(
      (version) => typeof version === 'string'
    ) &&
    typeof context.pluginId === 'string' &&
    typeof context.pluginVersion === 'string' &&
    typeof context.sessionToken === 'string' &&
    typeof context.operationId === 'string'
  );
};

if (!nonce || !frameId || window.parent === window) {
  throw new Error('Runtime broker requires a nonce-bound parent frame.');
}

let bootstrapped = false;
const onBootstrap = async (event: MessageEvent) => {
  if (
    bootstrapped ||
    event.source !== window.parent ||
    event.ports.length !== 1 ||
    !isBootstrapMessage(event.data, nonce, frameId)
  ) {
    return;
  }
  bootstrapped = true;
  window.removeEventListener('message', onBootstrap);
  const port = event.ports[0]!;
  const actualBootstrapDigest = await digestSha256Text(
    event.data.workerBootstrapSource
  );
  if (actualBootstrapDigest !== event.data.workerBootstrapDigest) {
    port.close();
    return;
  }
  const actualRuntimeDigest = await digestSha256Bytes(event.data.runtimeBytes);
  if (actualRuntimeDigest !== event.data.runtimeDigest) {
    port.close();
    return;
  }
  const workerUrl = URL.createObjectURL(
    new Blob([event.data.workerBootstrapSource], {
      type: 'text/javascript',
    })
  );
  let worker: Worker;
  try {
    worker = new Worker(workerUrl, {
      name: 'prodivix-plugin-runtime',
    });
  } catch {
    URL.revokeObjectURL(workerUrl);
    port.close();
    return;
  }
  let workerUrlReleased = false;
  const releaseWorkerUrl = () => {
    if (workerUrlReleased) return;
    workerUrlReleased = true;
    URL.revokeObjectURL(workerUrl);
  };
  const releaseTimer = setTimeout(releaseWorkerUrl, 30_000);
  worker.addEventListener('error', (workerError) => {
    clearTimeout(releaseTimer);
    releaseWorkerUrl();
    console.error(
      'Prodivix runtime Worker failed after bootstrap:',
      workerError.message
    );
  });
  window.addEventListener(
    'pagehide',
    () => {
      clearTimeout(releaseTimer);
      worker.terminate();
      releaseWorkerUrl();
    },
    { once: true }
  );
  try {
    worker.postMessage(
      {
        kind: 'prodivix-runtime-worker-bootstrap',
        runtimeBytes: event.data.runtimeBytes,
        runtimeDigest: event.data.runtimeDigest,
        supportedProtocolVersions: event.data.supportedProtocolVersions,
        context: event.data.context,
        port,
      },
      [port, event.data.runtimeBytes]
    );
  } catch {
    clearTimeout(releaseTimer);
    releaseWorkerUrl();
    console.error('Prodivix runtime Worker bootstrap transfer failed.');
    worker.terminate();
    port.close();
  }
};

window.addEventListener('message', onBootstrap);
window.parent.postMessage(
  {
    kind: 'prodivix-runtime-bootstrap-ready',
    nonce,
    frameId,
  },
  '*'
);
