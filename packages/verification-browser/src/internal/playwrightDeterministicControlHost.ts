import { randomBytes } from 'node:crypto';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeSession,
} from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type {
  BrowserRuntimeControlApplication,
  BrowserRuntimeControlAttestationPhase,
  BrowserRuntimeControlHost,
  BrowserRuntimeControlLease,
} from '../browserRuntimeControlPort';
import { createBrowserRuntimeControlUuid } from '../browserRuntimeControlPort';
import type { BrowserToolPoolAcquireInput } from '../browserVerificationPort';
import {
  assertPlaywrightLoopbackOrigin,
  clearPlaywrightBrowserStorage,
  emptyPlaywrightDeterministicResidual,
  freezePlaywrightIdentifierValues,
  playwrightResidualFrom,
  readPlaywrightPageResidual,
  samePlaywrightControlRequestCoordinates,
} from './playwrightDeterministicControlContext';
import { installPlaywrightDeterministicControlInit } from './playwrightDeterministicControlInit';
import {
  settlePlaywrightDeterministicRuntime,
  synchronizePlaywrightVirtualClock,
  type PlaywrightDeterministicSettleResult,
} from './playwrightDeterministicControlOperation';
import {
  projectPlaywrightRuntimeControlApplication,
  type PlaywrightDeterministicAttemptActivity,
} from './playwrightDeterministicControlObservation';
import {
  acceptRuntimeCursorTransition,
  createEmptyRuntimeCursorProjection,
  createRuntimeCursorSealManifest,
  type RuntimeCursorProjection,
  type RuntimeReportEvent,
} from './playwrightDeterministicControlProtocol';
import {
  createPlaywrightDenyProxyAuthority,
  type PlaywrightDenyProxyAuthority,
} from './playwrightDenyProxyAuthority';
import { PlaywrightDeterministicResourceRouter } from './playwrightDeterministicResourceRouter';

/**
 * Owns one real Playwright context for one deterministic attempt. Core
 * provider hooks, terminal observation, and the browser adapter all operate
 * on this same context.
 */
export class PlaywrightDeterministicControlHost implements BrowserRuntimeControlHost {
  readonly #browser: Browser;
  readonly #input: BrowserToolPoolAcquireInput;
  readonly #lease: BrowserRuntimeControlLease;
  readonly #allowedResources: ReadonlyMap<
    string,
    BrowserRuntimeControlLease['resourceManifest']['resources'][number]
  >;
  #context: BrowserContext | undefined;
  #page: Page | undefined;
  #denyProxyAuthority: PlaywrightDenyProxyAuthority | undefined;
  #namespace: string | undefined;
  #probeKey: string | undefined;
  #reportBindingKey: string | undefined;
  #attemptActivity: PlaywrightDeterministicAttemptActivity = {
    documentInitializationCount: 0,
    authoredAnimationCreationCount: 0,
    authorAnimationFrameCreationCount: 0,
    cryptoRandomCreationCount: 0,
    nativeTimerCreationCount: 0,
    streamCreationCount: 0,
    workerCreationCount: 0,
    deniedWorkerCreations: 0,
    deniedRequests: 0,
    authorRequestCreationCount: 0,
  };
  #manifestViolations = 0;
  #runtimeSession: DeterministicRuntimeSession | undefined;
  readonly #resourceRouter: PlaywrightDeterministicResourceRouter;
  #cleanAtReset = false;
  #cleanupResidual: DeterministicIsolationResidual | undefined;
  #operationActive = false;
  #animationClockSyncCount = 0;
  #virtualAnimationTimeMs = 0;
  #cursorLedger: RuntimeCursorProjection = createEmptyRuntimeCursorProjection();
  #cursorViolationCount = 0;
  #createdPageCount = 0;
  #childFrameAttachmentCount = 0;
  #pageErrorMessages: string[] = [];
  #policyViolationDirectives = new Set<string>();
  #probeCapability: string | undefined;
  #closed = false;

  constructor(browser: Browser, input: BrowserToolPoolAcquireInput) {
    this.#browser = browser;
    this.#input = input;
    this.#lease = input.runtimeControlLease;
    this.#allowedResources = new Map(
      this.#lease.resourceManifest.resources.map((resource) => [
        resource.url,
        resource,
      ])
    );
    this.#resourceRouter = new PlaywrightDeterministicResourceRouter(
      input.origin,
      this.#lease,
      this.#allowedResources
    );
  }

  get context(): BrowserContext {
    if (!this.#context) {
      throw new Error('Deterministic browser context is not ready.');
    }
    return this.#context;
  }

  get page(): Page {
    if (!this.#page) {
      throw new Error('Deterministic browser page is not ready.');
    }
    return this.#page;
  }

  #handleRuntimeReport(event: unknown): void {
    if (typeof event !== 'object' || event === null || Array.isArray(event)) {
      this.#manifestViolations += 1;
      return;
    }
    const report = event as Partial<RuntimeReportEvent>;
    if (report.kind === 'cursor-transition') {
      const next = acceptRuntimeCursorTransition(this.#cursorLedger, event);
      if (!next) {
        this.#cursorViolationCount += 1;
        return;
      }
      this.#cursorLedger = next;
      this.#attemptActivity.documentInitializationCount =
        next.documentInitializationCount;
      return;
    }
    if (report.kind !== 'activity') {
      this.#manifestViolations += 1;
      return;
    }
    if (report.activity === 'animation-created') {
      this.#attemptActivity.authoredAnimationCreationCount += 1;
    } else if (report.activity === 'animation-frame-created') {
      this.#attemptActivity.authorAnimationFrameCreationCount += 1;
    } else if (report.activity === 'crypto-random-created') {
      this.#attemptActivity.cryptoRandomCreationCount += 1;
    } else if (report.activity === 'timer-created') {
      this.#attemptActivity.nativeTimerCreationCount += 1;
    } else if (report.activity === 'stream-created') {
      this.#attemptActivity.streamCreationCount += 1;
    } else if (report.activity === 'worker-created') {
      this.#attemptActivity.workerCreationCount += 1;
    } else if (report.activity === 'worker-denied') {
      this.#attemptActivity.deniedWorkerCreations += 1;
    } else if (report.activity === 'request-denied') {
      this.#attemptActivity.deniedRequests += 1;
      if (report.policyDirective !== undefined) {
        if (
          /^[a-z][a-z0-9-]{0,63}(?::[a-z][a-z0-9-]{0,31})?$/u.test(
            report.policyDirective
          ) &&
          this.#policyViolationDirectives.size < 16
        ) {
          this.#policyViolationDirectives.add(report.policyDirective);
        } else {
          this.#manifestViolations += 1;
        }
      }
    } else if (report.activity === 'author-request-created') {
      this.#attemptActivity.authorRequestCreationCount += 1;
    } else if (report.activity === 'clock-control-attempted') {
      this.#manifestViolations += 1;
    } else {
      this.#manifestViolations += 1;
    }
  }

  async reset(
    request: Parameters<BrowserRuntimeControlHost['reset']>[0]
  ): Promise<void> {
    if (
      this.#context ||
      !samePlaywrightControlRequestCoordinates(request, this.#lease) ||
      request.plan.cell.browserEngine !== this.#input.engine ||
      request.plan.cell.viewport.width !== this.#input.cell.viewport.width ||
      request.plan.cell.viewport.height !== this.#input.cell.viewport.height ||
      request.plan.cell.colorScheme !== this.#input.cell.colorScheme ||
      request.plan.cell.motion !== this.#input.cell.motion ||
      request.plan.cell.locale !== this.#input.cell.locale ||
      request.plan.rendering.devicePixelRatio !==
        this.#input.runtimeIdentity.viewport.devicePixelRatio ||
      request.plan.scheduler.maximumConcurrency !== 1
    ) {
      throw new Error(
        'Deterministic browser reset coordinates drifted from the target lease.'
      );
    }
    const targetOrigin = assertPlaywrightLoopbackOrigin(this.#input.origin);
    const controlUrl = new URL(this.#lease.controlHostUrl);
    if (
      controlUrl.origin !== targetOrigin ||
      controlUrl.username ||
      controlUrl.password ||
      controlUrl.search ||
      controlUrl.hash ||
      this.#allowedResources.get(controlUrl.href)?.kind !== 'control-host' ||
      this.#lease.resourceManifest.executableSnapshotDigest !==
        this.#lease.executableSnapshotDigest ||
      [...this.#allowedResources.keys()].some(
        (url) => new URL(url).origin !== targetOrigin
      ) ||
      (this.#lease.fixtureBinding.expectedRuntimeDispatchCount === 1
        ? this.#lease.plan.network.fixtures.length !== 1 ||
          this.#lease.plan.network.fixtures[0]?.target.kind !==
            'auth-session' ||
          this.#lease.plan.network.fixtures[0]?.outcome.kind !== 'result' ||
          typeof this.#lease.resolveRuntimeFixture !== 'function'
        : this.#lease.plan.network.fixtures.some(
            ({ target }) => target.kind === 'auth-session'
          ) || this.#lease.resolveRuntimeFixture !== undefined)
    ) {
      throw new Error(
        'Deterministic browser resource manifest is not bound to the target origin.'
      );
    }
    const denyProxyAuthority = await createPlaywrightDenyProxyAuthority();
    this.#denyProxyAuthority = denyProxyAuthority;
    let context: BrowserContext;
    try {
      context = await this.#browser.newContext({
        baseURL: targetOrigin,
        viewport: {
          width: request.plan.cell.viewport.width,
          height: request.plan.cell.viewport.height,
        },
        deviceScaleFactor: request.plan.rendering.devicePixelRatio,
        colorScheme: request.plan.cell.colorScheme,
        reducedMotion:
          request.plan.cell.motion === 'reduced' ? 'reduce' : 'no-preference',
        locale: request.plan.cell.locale,
        timezoneId: request.plan.timezone,
        serviceWorkers:
          request.plan.serviceWorker.mode === 'disabled' ? 'block' : 'allow',
        proxy: {
          server: denyProxyAuthority.endpoint,
          bypass: 'localhost,127.0.0.1,::1',
        },
      });
    } catch (error) {
      await denyProxyAuthority.close().catch(() => undefined);
      this.#denyProxyAuthority = undefined;
      throw error;
    }
    this.#context = context;
    this.#namespace = request.namespace;
    const reportBindingKey = `__prodivix_report_${this.#lease.expectedControlDigest.slice('sha256-'.length, 23)}`;
    this.#reportBindingKey = reportBindingKey;
    await context.exposeBinding(
      reportBindingKey,
      (_source, event: unknown): void => this.#handleRuntimeReport(event)
    );
    await context.route('**/*', (route) => this.#resourceRouter.route(route));
    context.on('page', (createdPage) => {
      this.#createdPageCount += 1;
      createdPage.on('frameattached', (frame) => {
        if (frame.parentFrame() !== null) {
          this.#childFrameAttachmentCount += 1;
        }
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      this.#pageErrorMessages.push(error.message);
    });
    this.#page = page;
    await page.goto(controlUrl.href, { waitUntil: 'domcontentloaded' });
    await this.#resourceRouter.drain();
    await context.clearCookies();
    await clearPlaywrightBrowserStorage(page);
    const measured = await readPlaywrightPageResidual(page, undefined);
    const cookies = await context.cookies();
    const proxy = denyProxyAuthority.snapshot();
    const routes = this.#resourceRouter.snapshot();
    this.#cleanAtReset =
      measured.localStorage === 0 &&
      measured.sessionStorage === 0 &&
      measured.indexedDb === 0 &&
      measured.cacheStorage === 0 &&
      measured.serviceWorkers === 0 &&
      measured.activeAnimations === 0 &&
      measured.pendingTimers === 0 &&
      measured.pendingStreams === 0 &&
      measured.activeWorkers === 0 &&
      cookies.length === 0 &&
      this.#manifestViolations === 0 &&
      routes.manifestViolations === 0 &&
      routes.deniedRouteRequests === 0 &&
      routes.activeRouteRequests === 0 &&
      proxy.connectionAttemptCount === 0 &&
      proxy.activeConnectionCount === 0 &&
      proxy.connectAttemptCount === 0 &&
      proxy.httpRequestAttemptCount === 0 &&
      proxy.unknownAttemptCount === 0 &&
      proxy.faultCount === 0;
  }

  async apply(
    request: Parameters<BrowserRuntimeControlHost['apply']>[0]
  ): Promise<Readonly<{ appliedControlDigest: string; fontReady: boolean }>> {
    if (
      !samePlaywrightControlRequestCoordinates(request, this.#lease) ||
      request.expectedControlDigest !== this.#lease.expectedControlDigest ||
      !this.#cleanAtReset ||
      !this.#context ||
      !this.#page
    ) {
      throw new Error(
        'Deterministic browser controls cannot apply to a dirty or drifted context.'
      );
    }
    const render = await this.#page.evaluate(async () => {
      await document.fonts.ready;
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        colorScheme: matchMedia('(prefers-color-scheme: dark)').matches
          ? ('dark' as const)
          : ('light' as const),
        motion: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? ('reduced' as const)
          : ('full' as const),
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        fontReady: document.fonts.status === 'loaded',
      };
    });
    if (
      render.width !== request.plan.cell.viewport.width ||
      render.height !== request.plan.cell.viewport.height ||
      render.devicePixelRatio !== request.plan.rendering.devicePixelRatio ||
      render.colorScheme !== request.plan.cell.colorScheme ||
      render.motion !== request.plan.cell.motion ||
      render.locale !== request.plan.cell.locale ||
      render.timezone !== request.plan.timezone ||
      !render.fontReady
    ) {
      throw new Error(
        'Playwright context did not apply the exact deterministic rendering controls.'
      );
    }
    return Object.freeze({
      appliedControlDigest: request.expectedControlDigest,
      fontReady: render.fontReady,
    });
  }

  async probe(
    request: Parameters<BrowserRuntimeControlHost['probe']>[0]
  ): Promise<DeterministicIsolationResidual> {
    if (
      request.namespace !== this.#namespace ||
      (request.phase === 'after-reset' && (!this.#context || !this.#page))
    ) {
      return Object.freeze({
        ...emptyPlaywrightDeterministicResidual(),
        effects: 1,
      });
    }
    if (request.phase === 'after-cleanup') {
      return (
        this.#cleanupResidual ??
        Object.freeze({
          ...emptyPlaywrightDeterministicResidual(),
          effects: 1,
        })
      );
    }
    const measured = await readPlaywrightPageResidual(
      this.page,
      this.#probeKey
    );
    const cookies = await this.context.cookies();
    const proxy = this.#denyProxyAuthority?.snapshot();
    const routes = this.#resourceRouter.snapshot();
    return playwrightResidualFrom(
      measured,
      cookies.length,
      this.#cleanAtReset &&
        this.#manifestViolations === 0 &&
        routes.manifestViolations === 0 &&
        routes.deniedRouteRequests === 0 &&
        routes.activeRouteRequests === 0 &&
        proxy?.connectionAttemptCount === 0 &&
        proxy.activeConnectionCount === 0 &&
        proxy.faultCount === 0
        ? 0
        : 1
    );
  }

  async installRuntimeControls(
    session: DeterministicRuntimeSession,
    probes: Readonly<{
      performanceProbe: Readonly<{
        propertyKey: string;
        capability: string;
      }>;
      trustedPageProbe: Readonly<{
        propertyKey: string;
        capability: string;
      }>;
    }>
  ): Promise<void> {
    if (
      session.applied.namespace !== this.#namespace ||
      session.applied.controlDigest !== this.#lease.expectedControlDigest ||
      !this.#reportBindingKey
    ) {
      throw new Error(
        'Deterministic runtime session drifted from its Playwright host.'
      );
    }
    const witness = this.#lease.expectedWitness();
    const random = session.random.stream('browser-page');
    const randomValues = Object.freeze([
      witness.randomSample,
      ...Array.from({ length: 4_095 }, () => random.nextFloat()),
    ]);
    const identifierValues = freezePlaywrightIdentifierValues({
      attempt: [
        witness.identifierSamples.attempt,
        ...Array.from({ length: 255 }, () =>
          session.identifiers.next('attempt')
        ),
      ],
      step: [
        witness.identifierSamples.step,
        ...Array.from({ length: 255 }, () => session.identifiers.next('step')),
      ],
      action: [
        witness.identifierSamples.action,
        ...Array.from({ length: 255 }, () =>
          session.identifiers.next('action')
        ),
      ],
      operation: [
        witness.identifierSamples.operation,
        ...Array.from({ length: 255 }, () =>
          session.identifiers.next('operation')
        ),
      ],
    });
    const operationUuids = Object.freeze(
      identifierValues.operation.map(createBrowserRuntimeControlUuid)
    );
    const entropy = randomBytes(32).toString('hex');
    const probeKey = '__prodivix_control_probe_' + entropy.slice(0, 24);
    const probeCapability = entropy.slice(24);
    this.#probeKey = probeKey;
    this.#probeCapability = probeCapability;
    this.#runtimeSession = session;
    this.#resourceRouter.bindRuntimeSession(session);
    const epochMs = Date.parse(this.#lease.plan.clock.epoch);
    await this.page.clock.install({ time: epochMs - 60_000 });
    await this.page.clock.pauseAt(epochMs);
    await installPlaywrightDeterministicControlInit(
      this.context,
      {
        randomValues,
        identifierValues,
        operationUuids,
        expectedWitness: witness,
        namespace: session.applied.namespace,
        fixtureBindingDigest: this.#lease.fixtureBinding.bindingDigest,
        executableSnapshotDigest: this.#lease.executableSnapshotDigest,
        allowedUrls: Object.freeze([
          ...this.#allowedResources.keys(),
          ...(this.#lease.fixtureBinding.expectedRuntimeDispatchCount === 1
            ? [
                new URL(
                  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
                  this.#input.origin
                ).href,
              ]
            : []),
        ]),
        reportBindingKey: this.#reportBindingKey,
        probeKey,
        probeCapability,
        performanceProbeKey: probes.performanceProbe.propertyKey,
        trustedPageProbeKey: probes.trustedPageProbe.propertyKey,
        cursorSeals: createRuntimeCursorSealManifest(witness),
      },
      {
        performance: probes.performanceProbe,
        trustedPage: probes.trustedPageProbe,
      }
    );
  }

  async navigateToTarget(): Promise<void> {
    const entry = this.#lease.resourceManifest.resources.find(
      ({ kind }) => kind === 'entry'
    );
    if (
      !entry ||
      new URL(entry.url).origin !==
        assertPlaywrightLoopbackOrigin(this.#input.origin)
    ) {
      throw new Error(
        'Deterministic browser target entry is missing or origin-drifted.'
      );
    }
    await this.page.goto(entry.url, {
      waitUntil: 'networkidle',
      timeout: 10_000,
    });
    await this.#resourceRouter.drain();
  }

  async #syncVirtualClock(session: DeterministicRuntimeSession): Promise<void> {
    this.#virtualAnimationTimeMs = await synchronizePlaywrightVirtualClock({
      page: this.page,
      session,
      currentVirtualAnimationTimeMs: this.#virtualAnimationTimeMs,
      probeKey: this.#probeKey,
      probeCapability: this.#probeCapability,
      pageErrorMessages: this.#pageErrorMessages,
    });
    this.#animationClockSyncCount += 1;
  }

  async #settle(): Promise<PlaywrightDeterministicSettleResult> {
    return settlePlaywrightDeterministicRuntime({
      page: this.page,
      lease: this.#lease,
      probeKey: this.#probeKey,
      probeCapability: this.#probeCapability,
      pageErrorMessages: this.#pageErrorMessages,
    });
  }

  async runControlledOperation<Value>(
    session: DeterministicRuntimeSession,
    label: string,
    operation: () => Value | Promise<Value>
  ): Promise<Value> {
    if (
      this.#operationActive ||
      session.applied.namespace !== this.#namespace
    ) {
      throw new Error(
        'Deterministic browser operation is concurrent or namespace-drifted.'
      );
    }
    this.#operationActive = true;
    const operationId = session.identifiers.next('operation');
    let value: Value | undefined;
    let failure: unknown;
    try {
      session.scheduler.enqueue({
        id: `${operationId}:${label}`,
        lane: 'browser-operation',
        readyAt: session.clock.now(),
        run: async () => {
          try {
            value = await operation();
            const routes = this.#resourceRouter.snapshot();
            if (
              this.#manifestViolations !== 0 ||
              routes.manifestViolations !== 0 ||
              routes.deniedRouteRequests !== 0
            ) {
              throw new Error(
                'Deterministic browser operation observed a denied or drifted resource.'
              );
            }
            await this.#syncVirtualClock(session);
            await this.#settle();
          } catch (error) {
            failure = error;
          }
        },
      });
      const snapshot = await session.scheduler.runUntilIdle();
      if (
        snapshot.status !== 'idle' ||
        snapshot.pendingTaskIds.length !== 0 ||
        snapshot.pendingBarrierIds.length !== 0 ||
        snapshot.droppedEventCount !== 0
      ) {
        throw new Error(
          'Deterministic browser scheduler did not return to exact idle state.'
        );
      }
      if (failure !== undefined) throw failure;
      return value as Value;
    } finally {
      this.#operationActive = false;
    }
  }

  async observe(
    session: DeterministicRuntimeSession,
    phase: BrowserRuntimeControlAttestationPhase
  ): Promise<BrowserRuntimeControlApplication> {
    await this.runControlledOperation(
      session,
      `attest-${phase}`,
      async () => undefined
    );
    const settle = await this.#settle();
    const application = projectPlaywrightRuntimeControlApplication({
      lease: this.#lease,
      phase,
      origin: this.#input.origin,
      session,
      runtimeSession: this.#runtimeSession,
      settle,
      activity: this.#attemptActivity,
      manifestViolations: this.#manifestViolations,
      routes: this.#resourceRouter.snapshot(),
      proxy: this.#denyProxyAuthority?.snapshot(),
      cursorLedger: this.#cursorLedger,
      cursorViolationCount: this.#cursorViolationCount,
      createdPageCount: this.#createdPageCount,
      childFrameAttachmentCount: this.#childFrameAttachmentCount,
      contextPageCount: this.context.pages().length,
      pageFrameCount: this.page.frames().length,
      pageErrorMessages: this.#pageErrorMessages,
      policyViolationDirectives: Object.freeze([
        ...this.#policyViolationDirectives,
      ]),
      cleanAtReset: this.#cleanAtReset,
      virtualAnimationTimeMs: this.#virtualAnimationTimeMs,
      animationClockSyncCount: this.#animationClockSyncCount,
    });
    if (phase === 'terminal') {
      await this.#denyProxyAuthority!.close();
    }
    return application;
  }

  async cleanup(
    request: Parameters<BrowserRuntimeControlHost['cleanup']>[0]
  ): Promise<void> {
    if (
      this.#closed ||
      request.namespace !== this.#namespace ||
      !sameCanonicalJson(request.plan, this.#lease.plan)
    ) {
      throw new Error(
        'Deterministic browser cleanup coordinates are stale or drifted.'
      );
    }
    this.#closed = true;
    let residual: DeterministicIsolationResidual = Object.freeze({
      ...emptyPlaywrightDeterministicResidual(),
      effects: 1,
    });
    try {
      if (this.#page && !this.#page.isClosed()) {
        const controlUrl = new URL(this.#lease.controlHostUrl);
        await this.#page.goto(controlUrl.href, {
          waitUntil: 'domcontentloaded',
          timeout: 5_000,
        });
        await this.#resourceRouter.drain();
        await clearPlaywrightBrowserStorage(this.#page);
        await this.#context?.clearCookies();
        const measured = await readPlaywrightPageResidual(
          this.#page,
          undefined
        );
        const cookies = (await this.#context?.cookies()) ?? [];
        residual = playwrightResidualFrom(measured, cookies.length);
      }
      await this.#context?.close();
      const proxy = this.#denyProxyAuthority?.snapshot();
      if (
        proxy &&
        (proxy.connectionAttemptCount !== 0 ||
          proxy.activeConnectionCount !== 0 ||
          proxy.connectAttemptCount !== 0 ||
          proxy.httpRequestAttemptCount !== 0 ||
          proxy.unknownAttemptCount !== 0 ||
          proxy.faultCount !== 0)
      ) {
        residual = Object.freeze({
          ...residual,
          effects: residual.effects + 1,
        });
      }
      await this.#denyProxyAuthority?.close();
    } catch {
      residual = Object.freeze({ ...residual, effects: residual.effects + 1 });
      try {
        await this.#context?.close();
      } catch {
        residual = Object.freeze({
          ...residual,
          effects: residual.effects + 1,
        });
      }
      try {
        await this.#denyProxyAuthority?.close();
      } catch {
        residual = Object.freeze({
          ...residual,
          effects: residual.effects + 1,
        });
      }
    } finally {
      this.#cleanupResidual = residual;
      this.#runtimeSession = undefined;
      this.#resourceRouter.unbindRuntimeSession();
      this.#denyProxyAuthority = undefined;
      this.#page = undefined;
      this.#context = undefined;
    }
  }
}
