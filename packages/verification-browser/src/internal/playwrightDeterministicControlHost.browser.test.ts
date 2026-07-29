import { createServer, type Server } from 'node:http';
import {
  createCiDeterministicRuntimeProvider,
  createDeterministicRuntimeControlPlan,
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
  normalizeExecutionAuthSessionFixtureResponse,
  type DeterministicRuntimeProviderHooks,
  type DeterministicRuntimeSession,
} from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { decodeAxeAccessibilityPayload } from '../accessibility';
import type { BrowserVerificationRuntimeIdentity } from '../browserAdapter.types';
import {
  assertBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlFixtureBinding,
  createBrowserRuntimeControlResourceManifest,
  createBrowserRuntimeControlUuid,
  type BrowserRuntimeControlAttestation,
  type BrowserRuntimeControlExpectedWitness,
  type BrowserRuntimeControlFixtureRequest,
  type BrowserRuntimeControlHost,
  type BrowserRuntimeControlLease,
} from '../browserRuntimeControlPort';
import { digestBrowserVerificationBytes } from '../browserVerificationCellInput';
import { createBrowserVerificationOriginDigest } from '../browserRuntimeIdentity';
import type { BrowserToolPoolAcquireInput } from '../browserVerificationPort';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from '../playwrightPrivatePayload';
import type { PerformancePolicyProfile } from '../performance';
import { PlaywrightBrowserTool } from './playwrightBrowserSession';
import { launchNetworkIsolatedBrowser } from './playwrightBrowserPool';
import { createPlaywrightDenyProxyAuthority } from './playwrightDenyProxyAuthority';

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';
const textEncoder = new TextEncoder();
const digestText = (value: string): string =>
  digestBrowserVerificationBytes(textEncoder.encode(value));
const sha = (value: unknown): string => digestVerificationValue(value);
const PHASE_TIMEOUT_MS = 20_000;
const CLEANUP_TIMEOUT_MS = 20_000;

const errorChainMessages = (error: unknown): readonly string[] => {
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
};

const runBoundedPhase = async <T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs = PHASE_TIMEOUT_MS
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Playwright browser matrix phase "${label}" exceeded ${timeoutMs}ms.`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    throw new Error(`Playwright browser matrix phase "${label}" failed.`, {
      cause: error,
    });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const CONTROL_DOCUMENT =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Control</title></head><body></body></html>';
const ENTRY_DOCUMENT =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runtime control</title><script type="module" src="/app.js"></script></head><body><main hidden data-pir-document-id="page-catalog" data-pir-node-id="catalog" id="catalog">Catalog owner</main></body></html>';

type FixtureServer = Readonly<{
  origin: string;
  close(): Promise<void>;
}>;

const listen = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(
      { host: '127.0.0.1', port: 0, exclusive: true },
      resolvePromise
    );
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });

const startFixtureServer = async (
  applicationSource: string
): Promise<FixtureServer> => {
  const server = createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (request.url === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(ENTRY_DOCUMENT);
      return;
    }
    if (request.url === '/__control.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(CONTROL_DOCUMENT);
      return;
    }
    if (request.url === '/app.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
      });
      response.end(applicationSource);
      return;
    }
    response.writeHead(404).end();
  });
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Fixture server did not bind a loopback port.');
  }
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await closeServer(server);
    },
  });
};

const authFixture = Object.freeze({
  id: 'fixture.auth-owner',
  target: Object.freeze({
    kind: 'auth-session' as const,
    resourceId: 'provider.auth-owner',
  }),
  inputDigest: sha('fixture-input'),
  attempt: 1,
  outcome: Object.freeze({
    kind: 'result' as const,
    value: Object.freeze({
      principalId: 'principal.catalog-owner',
      permissionIds: Object.freeze(['workspace.owner']),
    }),
  }),
});
const fixtureSetId = 'fixture-set.auth-owner';
const fixtureSetDigest = sha('fixture-set');
const projectionDigest = sha('fixture-projection');

const applicationSource = (
  violation:
    | 'none'
    | 'clock'
    | 'crypto'
    | 'cursor'
    | 'duplicate-fixture'
    | 'missing-fixture'
    | 'parser'
    | 'popup'
    | 'storage'
    | 'transport',
  fixtureEnabled = true
): string => `
const startupRandom = Math.random();
if (!Number.isFinite(startupRandom)) throw new Error('startup random drift');
const startupOperationId = crypto.randomUUID();
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/.test(startupOperationId)) {
  throw new Error('startup operation identity drift');
}
const catalog = document.getElementById('catalog');
const consumeFixture = async () => {
  const response = await fetch(${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH)}, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error'
  });
  const session = await response.json();
  if (
    session.principalId !== 'principal.catalog-owner' ||
    !session.permissionIds.includes('workspace.owner')
  ) throw new Error('fixture permission drift');
  catalog.hidden = false;
};
${fixtureEnabled && violation !== 'missing-fixture' ? 'await consumeFixture();' : 'catalog.hidden = false;'}
if (${JSON.stringify(violation)} === 'duplicate-fixture') {
  try { await consumeFixture(); } catch {}
}
if (${JSON.stringify(violation)} === 'clock') {
  await globalThis.__pwClock.controller.fastForward(1);
}
if (${JSON.stringify(violation)} === 'crypto') {
  try { crypto.getRandomValues(new Uint8Array(4)); } catch {}
}
if (${JSON.stringify(violation)} === 'cursor') {
  const key = '__prodivix_runtime_cursor_seal__';
  const sealed = JSON.parse(sessionStorage.getItem(key));
  sealed.cursor.randomSampleCount += 1;
  sessionStorage.setItem(key, JSON.stringify(sealed));
  location.reload();
}
if (${JSON.stringify(violation)} === 'parser') {
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://example.com';
    document.head.appendChild(link);
  } catch {}
  try {
    const speculation = document.createElement('script');
    speculation.type = 'speculationrules';
    speculation.textContent = '{"prefetch":[{"source":"list","urls":["https://example.com"]}]}';
    document.head.appendChild(speculation);
  } catch {}
  try {
    const frame = document.createElement('iframe');
    frame.src = '/';
    document.body.appendChild(frame);
  } catch {}
  const image = new Image();
  image.src = 'https://example.com/pixel.png';
  document.body.appendChild(image);
}
if (${JSON.stringify(violation)} === 'popup') {
  const popup = window.open('/');
  popup?.close();
}
if (${JSON.stringify(violation)} === 'storage') {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('author-db', 1);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const cache = await caches.open('author-cache');
  await cache.put('/cached', new Response('cached'));
  try { indexedDB.databases = async () => []; } catch {}
  try { caches.keys = async () => []; } catch {}
}
if (${JSON.stringify(violation)} === 'transport') {
  try { await fetch('https://example.com/escape'); } catch {}
  try { new WebSocket('wss://example.com/escape'); } catch {}
  try { new RTCPeerConnection(); } catch {}
  try { new WebTransport('https://example.com/escape'); } catch {}
  try { await navigator.serviceWorker.register('/app.js'); } catch {}
}
`;

const scenarioProgram = Object.freeze({
  scenarioId: 'scenario.auth-owner-visible',
  targetManifest: Object.freeze([
    Object.freeze({
      targetId: 'target.catalog',
      semanticSymbolId: 'symbol.catalog',
      capability: 'visibility',
      source: Object.freeze({
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/catalog',
      }),
    }),
  ]),
  instructions: Object.freeze([
    Object.freeze({
      id: 'instruction.observe',
      stepId: 'step.observe',
      dependencyInstructionIds: Object.freeze([]),
      operation: 'observe:pir.visible',
      targetId: 'target.catalog',
    }),
  ]),
  observations: Object.freeze([
    Object.freeze({
      stepId: 'step.observe',
      kind: 'visible',
      targetId: 'target.catalog',
      assertionIds: Object.freeze(['assert.visible']),
      assertions: Object.freeze([
        Object.freeze({
          id: 'assert.visible',
          operator: 'equals',
          expected: true,
        }),
      ]),
      automatonDigest: sha('automaton'),
    }),
  ]),
  sourceTrace: Object.freeze([]),
  budgets: Object.freeze({
    totalMs: 2_000,
    stepMs: 1_000,
    settleMs: 500,
  }),
});

const runtimeIdentity = (
  engine: 'chromium' | 'firefox' | 'webkit',
  browserVersion: string
): BrowserVerificationRuntimeIdentity =>
  Object.freeze({
    machineClass: 'browser-control-test',
    operatingSystemImageDigest: sha('operating-system'),
    browserImageDigest: sha({ engine, browserVersion }),
    browserEngine: engine,
    browserVersion,
    fontSetDigest: sha('font-set'),
    viewport: Object.freeze({
      widthCssPixels: 800,
      heightCssPixels: 600,
      devicePixelRatio: 1,
    }),
    colorScheme: 'light',
    motionPreference: 'reduced',
    locale: 'en-US',
    cacheClass: 'cold',
    rendererGeneration: 'renderer.test',
    normalizer: Object.freeze({ id: 'rgba', version: '1' }),
  });

const verificationCell = (
  engine: 'chromium' | 'firefox' | 'webkit',
  fixtureEnabled: boolean
): VerificationPlanCell =>
  ({
    id: `cell.browser-control.${engine}`,
    checkId: `check.browser-control.${engine}`,
    checkKind: fixtureEnabled ? 'e2e' : 'performance',
    scenarioId: scenarioProgram.scenarioId,
    targetId: 'target.catalog',
    frameworkTarget: 'react-vite',
    surface: 'ci',
    browserEngine: engine,
    viewport: Object.freeze({ id: 'desktop', width: 800, height: 600 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
  }) as VerificationPlanCell;

const createLease = (input: {
  origin: string;
  engine: 'chromium' | 'firefox' | 'webkit';
  fixtureEnabled: boolean;
  applicationSource: string;
  emptyPermissions?: boolean;
  wrongResponse?: boolean;
}): BrowserRuntimeControlLease => {
  const executableSnapshotDigest = sha({
    origin: input.origin,
    engine: input.engine,
    fixtureEnabled: input.fixtureEnabled,
  });
  const plan = createDeterministicRuntimeControlPlan({
    profileId: 'profile.browser-control',
    profileDigest: sha('control-profile'),
    fixtureSetDigests: input.fixtureEnabled
      ? Object.freeze([fixtureSetDigest])
      : Object.freeze([]),
    clock: Object.freeze({
      epoch: '2025-01-01T00:00:00.000Z',
      tickMs: 1,
      maximumVirtualDurationMs: 30_000,
    }),
    timezone: 'UTC',
    random: Object.freeze({
      algorithm: 'xoshiro256ss',
      seed: 'browser-control-random',
    }),
    identifiers: Object.freeze({
      seed: 'browser-control-identifiers',
      namespaces: Object.freeze([
        'attempt',
        'step',
        'action',
        'operation',
      ] as const),
    }),
    scheduler: Object.freeze({
      seed: 'browser-control-scheduler',
      maximumTurns: 128,
      maximumConcurrency: 1,
    }),
    network: Object.freeze({
      mode: 'fixture-only',
      undeclaredRequest: 'reject',
      fixtures: input.fixtureEnabled
        ? Object.freeze([authFixture])
        : Object.freeze([]),
    }),
    storage: Object.freeze({
      bootstrapFixtureIds: Object.freeze([]),
      cleanup: 'required',
    }),
    rendering: Object.freeze({
      devicePixelRatio: 1,
      animationClock: 'virtual',
      fontReadiness: 'required',
    }),
    serviceWorker: Object.freeze({
      mode: 'disabled',
      cache: 'empty',
    }),
    settle: Object.freeze({
      conditions: Object.freeze([
        'declared-effects-complete',
        'font-ready',
        'render-stable',
      ] as const),
      maximumFrames: 8,
    }),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 2_000,
      networkMs: 2_000,
      animationMs: 2_000,
    }),
    cell: Object.freeze({
      id: `runtime-cell.${input.engine}`,
      frameworkTarget: 'react-vite',
      surface: 'ci',
      browserEngine: input.engine,
      viewport: Object.freeze({ width: 800, height: 600 }),
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
    }),
  });
  const resources = createBrowserRuntimeControlResourceManifest({
    executableSnapshotDigest,
    resources: Object.freeze([
      Object.freeze({
        url: `${input.origin}/`,
        kind: 'entry',
        contentDigest: digestText(ENTRY_DOCUMENT),
      }),
      Object.freeze({
        url: `${input.origin}/__control.html`,
        kind: 'control-host',
        contentDigest: digestText(CONTROL_DOCUMENT),
      }),
      Object.freeze({
        url: `${input.origin}/app.js`,
        kind: 'bundle',
        contentDigest: digestText(input.applicationSource),
      }),
    ]),
  });
  const fixtureBinding = createBrowserRuntimeControlFixtureBinding({
    plan,
    executableSnapshotDigest,
    projectionAuthorityDigest: sha('projection-authority'),
    expectedRuntimeDispatchCount: input.fixtureEnabled ? 1 : 0,
  });
  let boundHost: BrowserRuntimeControlHost | undefined;
  let hookFailure: unknown;
  const deferredHooks: DeterministicRuntimeProviderHooks = Object.freeze({
    async reset(request) {
      try {
        await boundHost!.reset(request);
      } catch (error) {
        hookFailure ??= error;
        throw error;
      }
    },
    async apply(request) {
      try {
        return await boundHost!.apply(request);
      } catch (error) {
        hookFailure ??= error;
        throw error;
      }
    },
    async probe(request) {
      try {
        return await boundHost!.probe(request);
      } catch (error) {
        hookFailure ??= error;
        throw error;
      }
    },
    async cleanup(request) {
      try {
        await boundHost!.cleanup(request);
      } catch (error) {
        hookFailure ??= error;
        throw error;
      }
    },
  });
  const provider = createCiDeterministicRuntimeProvider({
    id: `provider.browser-control.${input.engine}`,
    version: '1',
    implementationDigest: sha('provider-implementation'),
    hooks: deferredHooks,
  });
  const capabilitySnapshot = provider.inspect(plan);
  let session: DeterministicRuntimeSession | undefined;
  let witness: BrowserRuntimeControlExpectedWitness | undefined;
  const issued = new Map<string, BrowserRuntimeControlAttestation>();
  let terminal: BrowserRuntimeControlAttestation | undefined;
  let resolverCalled = false;
  const lease: BrowserRuntimeControlLease = Object.freeze({
    leaseId: `lease.browser-control.${input.engine}`,
    attemptId: `attempt.browser-control.${input.engine}`,
    generation: 1,
    providerKind: 'ci',
    targetLeaseBindingDigest: sha('target-lease-binding'),
    originDigest: createBrowserVerificationOriginDigest(input.origin),
    controlHostUrl: `${input.origin}/__control.html`,
    executableSnapshotDigest,
    resourceManifest: resources,
    fixtureBinding,
    plan,
    expectedControlDigest: plan.controlDigest,
    expectedCapabilitySnapshot: capabilitySnapshot,
    controlCapabilityIds: DETERMINISTIC_RUNTIME_CONTROL_IDS,
    async start(host) {
      boundHost = host;
      const started = await provider.startAttempt({
        attemptId: lease.attemptId,
        plan,
      });
      if (started.status !== 'ready' && hookFailure !== undefined) {
        throw hookFailure;
      }
      if (started.status === 'ready') {
        session = started.session;
        const randomSample = session.random.stream('browser-page').nextFloat();
        const identifierSamples = Object.freeze({
          attempt: session.identifiers.next('attempt'),
          step: session.identifiers.next('step'),
          action: session.identifiers.next('action'),
          operation: session.identifiers.next('operation'),
        });
        witness = Object.freeze({
          randomSample,
          identifierSamples,
          operationUuid: createBrowserRuntimeControlUuid(
            identifierSamples.operation
          ),
        });
      }
      return started;
    },
    expectedWitness() {
      if (!witness) throw new Error('Runtime witness is not ready.');
      return witness;
    },
    liveWitness() {
      if (!session) throw new Error('Runtime session is not ready.');
      const scheduler = session.scheduler.snapshot();
      return Object.freeze({
        schedulerStatus: scheduler.status,
        schedulerTurns: scheduler.turns,
        schedulerLogicalTime: scheduler.logicalTime,
        schedulerPendingTaskCount: scheduler.pendingTaskIds.length,
        schedulerPendingBarrierCount: scheduler.pendingBarrierIds.length,
        schedulerDroppedEventCount: scheduler.droppedEventCount,
        schedulerCompletedOperationCount: scheduler.events.filter(
          ({ kind, lane }) =>
            kind === 'task-completed' && lane === 'browser-operation'
        ).length,
        schedulerSnapshotDigest: sha(scheduler),
        fixtureDispatchCount: session.network.events().length,
      });
    },
    ...(input.fixtureEnabled
      ? {
          async resolveRuntimeFixture(
            request: BrowserRuntimeControlFixtureRequest
          ) {
            if (!session || resolverCalled) {
              throw new Error('Runtime fixture resolver is not fresh.');
            }
            resolverCalled = true;
            const result = await session.network.dispatch({
              kind: 'auth-session',
              resourceId: authFixture.target.resourceId,
              inputDigest: authFixture.inputDigest,
              attempt: authFixture.attempt,
            });
            if (result.status !== 'matched') {
              throw new Error('Core auth fixture did not match.');
            }
            return normalizeExecutionAuthSessionFixtureResponse({
              format: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
              version: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
              fixtureSetId,
              fixtureSetDigest,
              fixtureId: authFixture.id,
              resourceId: authFixture.target.resourceId,
              inputDigest: authFixture.inputDigest,
              outcomeDigest: sha(authFixture.outcome),
              projectionDigest,
              providerId: authFixture.target.resourceId,
              principalId: input.wrongResponse
                ? 'principal.wrong'
                : authFixture.outcome.value.principalId,
              permissionIds: input.emptyPermissions
                ? []
                : authFixture.outcome.value.permissionIds,
              invocationId: request.invocationId,
              attempt: request.attempt,
            });
          },
        }
      : {}),
    async attest(phase) {
      if (!boundHost || !session) {
        throw new Error('Runtime attestation owner is not ready.');
      }
      const attestation = createBrowserRuntimeControlAttestation({
        lease,
        phase,
        providerId: provider.descriptor.id,
        namespace: session.applied.namespace,
        capabilitySnapshotDigest: session.applied.capabilitySnapshotDigest,
        application: await boundHost.observe(session, phase),
      });
      issued.set(attestation.attestationDigest, attestation);
      return attestation;
    },
    assertIssued(attestation) {
      const asserted = assertBrowserRuntimeControlAttestation(
        attestation,
        lease
      );
      if (
        !sameCanonicalJson(issued.get(asserted.attestationDigest), asserted)
      ) {
        throw new Error('Runtime attestation was not issued.');
      }
      return asserted;
    },
    sealTerminal(attestation) {
      const asserted = lease.assertIssued(attestation);
      if (asserted.phase !== 'terminal' || terminal) {
        throw new Error('Runtime terminal attestation is invalid.');
      }
      terminal = asserted;
    },
    terminalSealed: () => terminal !== undefined,
  });
  return lease;
};

const browserInput = (
  browser: Browser,
  engine: 'chromium' | 'firefox' | 'webkit',
  server: FixtureServer,
  lease: BrowserRuntimeControlLease,
  fixtureEnabled: boolean
): BrowserToolPoolAcquireInput => ({
  engine,
  origin: server.origin,
  cell: verificationCell(engine, fixtureEnabled),
  runtimeIdentity: runtimeIdentity(engine, browser.version()),
  providerKind: 'ci',
  runtimeControlLease: lease,
  launch: Object.freeze({ headless: true }),
});

const runPositiveAttempt = async (
  browser: Browser,
  engine: 'chromium' | 'firefox' | 'webkit'
): Promise<void> => {
  const source = applicationSource('none');
  const server = await startFixtureServer(source);
  try {
    const lease = createLease({
      origin: server.origin,
      engine,
      fixtureEnabled: true,
      applicationSource: source,
    });
    const tool = await runBoundedPhase(`${engine}:positive:create`, () =>
      PlaywrightBrowserTool.create(
        browser,
        browserInput(browser, engine, server, lease, true)
      )
    );
    try {
      const report = evaluatePlaywrightBehavior(
        decodePlaywrightBehaviorPayload(
          await runBoundedPhase(`${engine}:positive:behavior`, () =>
            tool.executeBehavior(scenarioProgram as never)
          )
        )
      );
      expect(report.exitCode).toBe(0);
      const accessibility = decodeAxeAccessibilityPayload(
        await runBoundedPhase(`${engine}:positive:accessibility`, () =>
          tool.scanAccessibility(
            'target.catalog',
            scenarioProgram.targetManifest
          )
        )
      );
      expect(accessibility).toMatchObject({
        targetId: 'target.catalog',
        violations: [],
      });
      const terminal = await runBoundedPhase(
        `${engine}:positive:terminal`,
        () => tool.finalizeRuntimeControls()
      );
      expect(terminal.application.network).toMatchObject({
        fixtureRequestCount: 1,
        fixtureDispatchCount: 1,
        fixtureResponseCount: 1,
        proxyConnectionAttemptCount: 0,
      });
      lease.sealTerminal(terminal);
    } finally {
      const firstClose = tool.close();
      const secondClose = tool.close();
      expect(secondClose).toBe(firstClose);
      await runBoundedPhase(
        `${engine}:positive:tool-close`,
        () => firstClose,
        CLEANUP_TIMEOUT_MS
      );
    }
    expect(lease.terminalSealed()).toBe(true);
  } finally {
    await server.close();
  }
};

const expectRejectedAttempt = async (
  browser: Browser,
  engine: 'chromium' | 'firefox' | 'webkit',
  violation: Parameters<typeof applicationSource>[0],
  options: Readonly<{
    caseLabel?: string;
    emptyPermissions?: boolean;
    wrongResponse?: boolean;
  }> = {}
): Promise<void> => {
  const source = applicationSource(violation);
  const server = await startFixtureServer(source);
  try {
    const lease = createLease({
      origin: server.origin,
      engine,
      fixtureEnabled: true,
      applicationSource: source,
      ...options,
    });
    let rejection: unknown;
    let tool: PlaywrightBrowserTool | undefined;
    try {
      tool = await runBoundedPhase(
        `${engine}:${options.caseLabel ?? `violation:${violation}`}:create`,
        () =>
          PlaywrightBrowserTool.create(
            browser,
            browserInput(browser, engine, server, lease, true)
          )
      );
      await runBoundedPhase(
        `${engine}:${options.caseLabel ?? `violation:${violation}`}:terminal`,
        () => tool!.finalizeRuntimeControls()
      );
    } catch (error) {
      rejection = error;
    } finally {
      if (tool) {
        await runBoundedPhase(
          `${engine}:${options.caseLabel ?? `violation:${violation}`}:tool-close`,
          () => tool!.close(),
          CLEANUP_TIMEOUT_MS
        );
      }
    }
    expect(rejection).toBeInstanceOf(Error);
    expect(errorChainMessages(rejection).join(' | ')).not.toContain('exceeded');
    expect(lease.terminalSealed()).toBe(false);
  } finally {
    await server.close();
  }
};

const performancePolicy = (
  identity: BrowserVerificationRuntimeIdentity
): PerformancePolicyProfile =>
  Object.freeze({
    expectedEnvironment: Object.freeze({
      machineClass: identity.machineClass,
      operatingSystemImageDigest: identity.operatingSystemImageDigest,
      browserImageDigest: identity.browserImageDigest,
      browserEngine: identity.browserEngine,
      browserVersion: identity.browserVersion,
      fontSetDigest: identity.fontSetDigest,
      viewport: identity.viewport,
      colorScheme: identity.colorScheme,
      motionPreference: identity.motionPreference,
      locale: identity.locale,
      cacheClass: identity.cacheClass,
    }),
    sampling: Object.freeze({
      warmupRuns: 1,
      sampleCount: 3,
      statistic: 'p75',
    }),
    thresholds: Object.freeze([
      Object.freeze({
        metricId: 'scenario-duration',
        unit: 'ms',
        operator: 'less-than-or-equal',
        threshold: 5_000,
      }),
    ]),
  });

const runReloadAttempt = async (
  browser: Browser,
  engine: 'chromium' | 'firefox' | 'webkit'
): Promise<void> => {
  const source = applicationSource('none', false);
  const server = await startFixtureServer(source);
  try {
    const lease = createLease({
      origin: server.origin,
      engine,
      fixtureEnabled: false,
      applicationSource: source,
    });
    const identity = runtimeIdentity(engine, browser.version());
    const tool = await runBoundedPhase(`${engine}:reload:create`, () =>
      PlaywrightBrowserTool.create(browser, {
        ...browserInput(browser, engine, server, lease, false),
        runtimeIdentity: identity,
      })
    );
    try {
      await runBoundedPhase(`${engine}:reload:collect-performance`, () =>
        tool.collectPerformance(
          performancePolicy(identity),
          sha('performance-profile'),
          scenarioProgram as never
        )
      );
      const terminal = await runBoundedPhase(`${engine}:reload:terminal`, () =>
        tool.finalizeRuntimeControls()
      );
      expect(terminal.application.consumption.documentInitializationCount).toBe(
        1
      );
      expect(terminal.application.network).toMatchObject({
        fixtureRequestCount: 0,
        fixtureDispatchCount: 0,
        fixtureResponseCount: 0,
      });
      lease.sealTerminal(terminal);
    } finally {
      await runBoundedPhase(
        `${engine}:reload:tool-close`,
        () => tool.close(),
        CLEANUP_TIMEOUT_MS
      );
    }
  } finally {
    await server.close();
  }
};

const exerciseDenyProxyAuthority = async (browser: Browser): Promise<void> => {
  let targetHitCount = 0;
  const target = createServer((_request, response) => {
    targetHitCount += 1;
    response.writeHead(200).end('unexpected target hit');
  });
  await listen(target);
  const targetAddress = target.address();
  if (targetAddress === null || typeof targetAddress === 'string') {
    await closeServer(target);
    throw new Error('Deny-proxy target did not bind a port.');
  }
  const authority = await createPlaywrightDenyProxyAuthority();
  const context = await browser.newContext({
    proxy: {
      server: authority.endpoint,
      bypass: '<-loopback>',
    },
  });
  try {
    const page = await context.newPage();
    await page
      .goto(`http://127.0.0.1:${targetAddress.port}/`, {
        timeout: 3_000,
        waitUntil: 'commit',
      })
      .catch(() => undefined);
    await page
      .goto('https://proxy-target.invalid/', {
        timeout: 3_000,
        waitUntil: 'commit',
      })
      .catch(() => undefined);
    const snapshot = authority.snapshot();
    expect(snapshot.connectionAttemptCount).toBeGreaterThan(1);
    expect(snapshot.httpRequestAttemptCount).toBeGreaterThan(0);
    expect(snapshot.connectAttemptCount).toBeGreaterThan(0);
    expect(targetHitCount).toBe(0);
  } finally {
    await context.close();
    await authority.close();
    target.closeAllConnections();
    await closeServer(target);
  }
};

describe.skipIf(!enabled)(
  'Playwright deterministic BrowserTool to Host to Core controls',
  () => {
    const engines = [
      { engine: 'chromium', browserType: chromium },
      { engine: 'firefox', browserType: firefox },
      { engine: 'webkit', browserType: webkit },
    ] as const satisfies readonly Readonly<{
      engine: 'chromium' | 'firefox' | 'webkit';
      browserType: BrowserType;
    }>[];
    const withBrowser = async (
      engine: 'chromium' | 'firefox' | 'webkit',
      browserType: BrowserType,
      caseLabel: string,
      exercise: (browser: Browser) => Promise<void>
    ): Promise<void> => {
      const browserServer = await runBoundedPhase(
        `${engine}:${caseLabel}:launch-server`,
        () => browserType.launchServer({ headless: true })
      );
      try {
        const browser = await runBoundedPhase(
          `${engine}:${caseLabel}:connect`,
          () => browserType.connect(browserServer.wsEndpoint())
        );
        await runBoundedPhase(
          `${engine}:${caseLabel}`,
          () => exercise(browser),
          50_000
        );
      } finally {
        await runBoundedPhase(
          `${engine}:${caseLabel}:kill`,
          () => browserServer.kill(),
          CLEANUP_TIMEOUT_MS
        );
        if (
          browserServer.process().exitCode === null &&
          browserServer.process().signalCode === null
        ) {
          throw new Error(
            `Playwright browser matrix phase "${engine}:${caseLabel}:kill" left a live browser process.`
          );
        }
      }
    };
    for (const { engine, browserType } of engines) {
      it(`${engine} production pool launch preserves a clean pre-author control host`, async () => {
        const browser = await runBoundedPhase(
          `${engine}:production-pool:launch`,
          () =>
            launchNetworkIsolatedBrowser(
              {
                engine,
                launch: Object.freeze({ headless: true }),
              } as BrowserToolPoolAcquireInput,
              browserType.executablePath()
            )
        );
        try {
          await runBoundedPhase(
            `${engine}:production-pool:positive`,
            () => runPositiveAttempt(browser, engine),
            50_000
          );
        } finally {
          await runBoundedPhase(
            `${engine}:production-pool:close`,
            () => browser.close(),
            CLEANUP_TIMEOUT_MS
          );
        }
      }, 70_000);
    }
    for (const { engine, browserType } of engines) {
      it(
        `${engine} deny proxy never reaches the requested target`,
        () =>
          withBrowser(engine, browserType, 'deny-proxy', (browser) =>
            exerciseDenyProxyAuthority(browser)
          ),
        70_000
      );
      it(
        `${engine} binds one live auth consumption to the Core dispatch`,
        () =>
          withBrowser(engine, browserType, 'positive', (browser) =>
            runPositiveAttempt(browser, engine)
          ),
        70_000
      );
      it(
        `${engine} samples performance without reloading the controlled document`,
        () =>
          withBrowser(engine, browserType, 'performance', (browser) =>
            runReloadAttempt(browser, engine)
          ),
        70_000
      );
      for (const violation of [
        'clock',
        'crypto',
        'cursor',
        'duplicate-fixture',
        'missing-fixture',
        'parser',
        'popup',
        'storage',
        'transport',
      ] as const) {
        it(
          `${engine} rejects ${violation}`,
          () =>
            withBrowser(
              engine,
              browserType,
              `violation:${violation}`,
              (browser) => expectRejectedAttempt(browser, engine, violation)
            ),
          70_000
        );
      }
      it(
        `${engine} rejects a wrong auth principal response`,
        () =>
          withBrowser(
            engine,
            browserType,
            'violation:wrong-response',
            (browser) =>
              expectRejectedAttempt(browser, engine, 'none', {
                caseLabel: 'violation:wrong-response',
                wrongResponse: true,
              })
          ),
        70_000
      );
      it(
        `${engine} rejects an empty auth permission response`,
        () =>
          withBrowser(
            engine,
            browserType,
            'violation:empty-permissions',
            (browser) =>
              expectRejectedAttempt(browser, engine, 'none', {
                caseLabel: 'violation:empty-permissions',
                emptyPermissions: true,
              })
          ),
        70_000
      );
    }
  }
);
