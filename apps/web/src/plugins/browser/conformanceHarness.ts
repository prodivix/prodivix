import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
  type PluginManifestV1,
} from '@prodivix/plugin-contracts';
import {
  createBrowserPluginRuntimeAdapter,
  createBrowserRuntimeSandboxFactory,
  createIndexedDbGatewayAuditStore,
  type BrowserGatewaySessionFactory,
  type GatewayAuditRecord,
} from '@prodivix/plugin-browser';
import {
  createPluginOwnerRef,
  pluginHostFailure,
  pluginHostSuccess,
  type HostContributionPointMap,
  type PluginRuntimeActivationInput,
} from '@prodivix/plugin-host';

type RuntimeMode = 'probe' | 'hang' | 'crash' | 'unhandled-rejection' | 'close';

type RuntimeConformanceResult = Readonly<{
  activated: boolean;
  diagnosticCodes: readonly string[];
  probe?: Readonly<Record<string, string>>;
  terminationReasonCode?: string;
  mainLoopTicks: number;
  elapsedMs: number;
}>;

type UiConformanceResult = Readonly<{
  parentDomBlocked: boolean;
  topNavigationBlocked: boolean;
  networkBlocked: boolean;
  storageBlocked: boolean;
  nestedWorkerBlocked: boolean;
  popupBlocked: boolean;
  permissionBlocked: boolean;
  formAndDownloadAttempted: boolean;
  sandboxTokens: readonly string[];
  hostLocationUnchanged: boolean;
}>;

type ConformanceApi = Readonly<{
  runRuntime(
    input: Readonly<{
      sandboxUrl: string;
      mode: RuntimeMode;
    }>
  ): Promise<RuntimeConformanceResult>;
  runUi(input: Readonly<{ sandboxUrl: string }>): Promise<UiConformanceResult>;
  runAudit(): Promise<
    Readonly<{
      eventIds: readonly string[];
      authorization: string | undefined;
    }>
  >;
}>;

declare global {
  interface Window {
    prodivixPluginSandboxConformance: ConformanceApi;
  }
}

const runtimeSource = (mode: RuntimeMode): string => `
export const version = '1.0.0';

export async function activate(context) {
  if (${JSON.stringify(mode)} === 'hang') {
    while (true) {}
  }
  if (${JSON.stringify(mode)} === 'crash') {
    throw new Error('Conformance crash');
  }
  if (${JSON.stringify(mode)} === 'unhandled-rejection') {
    setTimeout(() => {
      void Promise.reject(new Error('Conformance unhandled rejection'));
    }, 50);
  }
  if (${JSON.stringify(mode)} === 'close') {
    setTimeout(() => globalThis.close(), 50);
  }
  let remoteImportBlocked = false;
  try {
    await Promise.race([
      import('https://example.com/prodivix-plugin-escape.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 250)),
    ]);
  } catch {
    remoteImportBlocked = true;
  }
  const attributes = {
    parentDomBlocked: String(typeof document === 'undefined' && typeof parent === 'undefined'),
    networkBlocked: String(
      typeof fetch === 'undefined' &&
        typeof WebSocket === 'undefined' &&
        typeof EventSource === 'undefined' &&
        typeof XMLHttpRequest === 'undefined' &&
        remoteImportBlocked
    ),
    storageBlocked: String(typeof indexedDB === 'undefined' && typeof caches === 'undefined'),
    nestedWorkerBlocked: String(typeof Worker === 'undefined' && typeof SharedWorker === 'undefined'),
    topNavigationBlocked: String(typeof top === 'undefined' && typeof opener === 'undefined'),
  };
  await context.gateway.request('telemetry/emit', {
    name: 'sandbox.conformance',
    level: 'info',
    attributes,
  });
}

export async function deactivate() {}
`;

const digestSha256 = async (source: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source)
  );
  let binary = '';
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return `sha256-${btoa(binary)}`;
};

const createManifest = (): PluginManifestV1 => ({
  schemaVersion: '1.0',
  id: '@prodivix/conformance-runtime',
  displayName: 'Plugin sandbox conformance runtime',
  version: '1.0.0',
  publisher: 'prodivix',
  engines: { prodivix: '^0.1.0' },
  entrypoints: { runtime: { path: 'dist/runtime.js' } },
  capabilities: [
    {
      id: 'telemetry.emit',
      reason: 'Return bounded sandbox conformance results.',
    },
  ],
  contributes: [],
});

const runRuntime: ConformanceApi['runRuntime'] = async ({
  sandboxUrl,
  mode,
}) => {
  let probe: Record<string, string> | undefined;
  const gatewaySessionFactory: BrowserGatewaySessionFactory<HostContributionPointMap> =
    {
      create: async () =>
        pluginHostSuccess({
          dispatch: async (request) => {
            if (request.method !== 'telemetry/emit') {
              return pluginHostFailure([
                createPluginDiagnostic(
                  PLUGIN_DIAGNOSTIC_CODES.UNKNOWN_PROTOCOL_CONTRACT,
                  'Conformance Gateway only exposes telemetry/emit.'
                ),
              ]);
            }
            const payload = request.payload as {
              attributes?: Record<string, string>;
            };
            probe = payload.attributes;
            return pluginHostSuccess<JsonValue>({ accepted: true });
          },
          dispose: () => {},
        }),
    };
  const adapter = createBrowserPluginRuntimeAdapter({
    sandboxFactory: createBrowserRuntimeSandboxFactory({ sandboxUrl }),
    gatewaySessionFactory,
    quotaPolicy: {
      handshakeTimeoutMs: 8_000,
      lifecycleTimeoutMs: mode === 'hang' ? 500 : 5_000,
      heartbeatIntervalMs: 100,
      heartbeatMissLimit: 2,
    },
  });
  if (!adapter.ok) {
    return {
      activated: false,
      diagnosticCodes: adapter.diagnostics.map(({ code }) => code),
      mainLoopTicks: 0,
      elapsedMs: 0,
    };
  }
  const manifest = createManifest();
  const owner = createPluginOwnerRef(
    manifest.id,
    'conformance-installation',
    1
  );
  const source = runtimeSource(mode);
  const activation: PluginRuntimeActivationInput<HostContributionPointMap> = {
    owner,
    manifest,
    runtimeArtifact: {
      path: 'dist/runtime.js',
      bytes: new TextEncoder().encode(source),
      digest: await digestSha256(source),
      packageDigest: 'sha256-conformance-package',
    },
    event: { type: 'manual' },
    operationId: 'conformance-operation',
    sessionToken: `conformance-${mode}`,
    permission: {
      getSnapshot: () => undefined,
      isGranted: () => true,
      subscribe: () => ({ dispose: () => {} }),
    },
    contributions: {
      stage: () => pluginHostSuccess(undefined),
    },
  };
  let mainLoopTicks = 0;
  const tick = setInterval(() => {
    mainLoopTicks += 1;
  }, 10);
  const startedAt = performance.now();
  const result = await adapter.value.activate(
    activation,
    new AbortController().signal
  );
  let terminationReasonCode: string | undefined;
  if (result.ok && (mode === 'unhandled-rejection' || mode === 'close')) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const cleanupHandles: {
        timeout?: ReturnType<typeof setTimeout>;
        subscription?: { dispose(): void };
      } = {};
      const finish = () => {
        if (settled) return;
        settled = true;
        if (cleanupHandles.timeout !== undefined) {
          clearTimeout(cleanupHandles.timeout);
        }
        cleanupHandles.subscription?.dispose();
        resolve();
      };
      cleanupHandles.subscription = result.value.onDidTerminate(
        ({ reasonCode }) => {
          terminationReasonCode = reasonCode;
          finish();
        }
      );
      cleanupHandles.timeout = setTimeout(finish, 1_500);
    });
  }
  const elapsedMs = performance.now() - startedAt;
  clearInterval(tick);
  if (result.ok && !terminationReasonCode) {
    await result.value.deactivate('manual', new AbortController().signal);
  }
  return {
    activated: result.ok,
    diagnosticCodes: result.diagnostics.map(({ code }) => code),
    ...(probe ? { probe: Object.freeze({ ...probe }) } : {}),
    ...(terminationReasonCode ? { terminationReasonCode } : {}),
    mainLoopTicks,
    elapsedMs,
  };
};

const randomNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const runUi: ConformanceApi['runUi'] = ({ sandboxUrl }) => {
  const nonce = randomNonce();
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.sandbox.add('allow-scripts');
  iframe.referrerPolicy = 'no-referrer';
  iframe.setAttribute('allow', '');
  iframe.setAttribute('credentialless', '');
  const source = new URL(sandboxUrl);
  source.hash = new URLSearchParams({ nonce }).toString();
  iframe.src = source.href;
  const initialLocation = location.href;

  return new Promise<UiConformanceResult>((resolve, reject) => {
    let lastStage = 'broker-load';
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== iframe.contentWindow ||
        event.origin !== 'null' ||
        typeof event.data !== 'object' ||
        event.data === null ||
        event.data.nonce !== nonce
      ) {
        return;
      }
      if (
        event.data.kind === 'prodivix-ui-conformance-progress' &&
        typeof event.data.stage === 'string'
      ) {
        lastStage = event.data.stage;
        return;
      }
      if (event.data.kind !== 'prodivix-ui-conformance-result') return;
      const result = event.data.result as Omit<
        UiConformanceResult,
        'sandboxTokens' | 'hostLocationUnchanged'
      >;
      const resolved = {
        ...result,
        sandboxTokens: [...iframe.sandbox],
        hostLocationUnchanged: location.href === initialLocation,
      };
      cleanup();
      resolve(Object.freeze(resolved));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`UI sandbox conformance timed out after ${lastStage}.`));
    }, 10_000);
    window.addEventListener('message', onMessage);
    document.body.append(iframe);
  });
};

const deleteAuditDatabase = (databaseName: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Audit conformance cleanup failed.'));
    request.onblocked = () =>
      reject(new Error('Audit conformance cleanup was blocked.'));
  });

const runAudit: ConformanceApi['runAudit'] = async () => {
  const databaseName = `prodivix-audit-conformance-${randomNonce()}`;
  const createRecord = (index: number): GatewayAuditRecord => ({
    eventId: `event-${index}`,
    occurredAt: index,
    owner: {
      pluginId: '@prodivix/conformance-runtime',
      installationId: 'conformance-installation',
      generation: 1,
    },
    pluginVersion: '1.0.0',
    operationId: 'conformance-operation',
    method: 'workspace/read-summary',
    contractVersion: '1.0',
    permissionRevision: 1,
    capability: { id: 'workspace.read' },
    phase: index % 2 === 0 ? 'outcome' : 'preflight',
    outcome: index % 2 === 0 ? 'success' : 'attempted',
    requestBytes: 2,
    metadata: {
      authorization: 'Bearer must-not-persist',
      workspaceId: `workspace-${index}`,
    },
  });
  const writer = createIndexedDbGatewayAuditStore({
    databaseName,
    retention: { maxRecords: 2, maxBytes: 64 * 1024 },
  });
  for (const index of [1, 2, 3]) await writer.append(createRecord(index));
  await writer.dispose();

  const reader = createIndexedDbGatewayAuditStore({ databaseName });
  const records = await reader.readRecent(10);
  await reader.dispose();
  await deleteAuditDatabase(databaseName);
  return Object.freeze({
    eventIds: Object.freeze(records.map(({ eventId }) => eventId)),
    authorization:
      typeof records[0]?.metadata.authorization === 'string'
        ? records[0].metadata.authorization
        : undefined,
  });
};

window.prodivixPluginSandboxConformance = Object.freeze({
  runRuntime,
  runUi,
  runAudit,
});
