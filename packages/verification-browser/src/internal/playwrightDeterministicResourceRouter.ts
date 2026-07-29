import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  normalizeExecutionAuthSessionFixtureResponse,
  type DeterministicFixtureNetworkEvent,
  type DeterministicRuntimeSession,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import type { Route } from 'playwright-core';
import { digestBrowserVerificationBytes } from '../browserVerificationCellInput';
import {
  createBrowserRuntimeControlUuid,
  type BrowserRuntimeControlFixtureRequest,
  type BrowserRuntimeControlLease,
} from '../browserRuntimeControlPort';

const sandboxResponseHeaders = Object.freeze({
  'content-security-policy':
    "default-src 'none'; base-uri 'none'; child-src 'none'; connect-src 'self'; font-src 'self' data:; form-action 'none'; frame-src 'none'; img-src 'self' data:; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'none'",
  'permissions-policy':
    'camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), publickey-credentials-get=(), usb=()',
  'x-dns-prefetch-control': 'off',
});

const parserEgressPattern =
  /<\s*(?:iframe|frame|object|embed)\b|<\s*meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\b|<\s*script\b[^>]*\btype\s*=\s*["']application\/speculationrules["']|<\s*link\b[^>]*\brel\s*=\s*(?:["'][^"']*\b(?:dns-prefetch|preconnect|prefetch|prerender)\b[^"']*["']|[^\s>]*(?:dns-prefetch|preconnect|prefetch|prerender)[^\s>]*)/iu;

export type RuntimeFixtureResolutionLedgerEntry = Readonly<{
  request: BrowserRuntimeControlFixtureRequest;
  dispatchEvent: DeterministicFixtureNetworkEvent;
  response: ReturnType<typeof normalizeExecutionAuthSessionFixtureResponse>;
  responseDigest: string;
  resolutionDigest: string;
}>;

export type PlaywrightDeterministicResourceRouterSnapshot = Readonly<{
  deniedRouteRequests: number;
  manifestViolations: number;
  activeRouteRequests: number;
  responseCount: number;
  fixtureRequestCount: number;
  fixtureResponseCount: number;
  fixtureResolutionLedger: readonly RuntimeFixtureResolutionLedgerEntry[];
  requestLedger: readonly Readonly<{
    url: string;
    method: string;
    resourceType: string;
    status: number;
    contentDigest: string;
  }>[];
}>;

/**
 * Owns exact loopback resource routing and the single causal auth-fixture
 * dispatch. It never forwards undeclared requests.
 */
export class PlaywrightDeterministicResourceRouter {
  readonly #origin: string;
  readonly #lease: BrowserRuntimeControlLease;
  readonly #allowedResources: ReadonlyMap<
    string,
    BrowserRuntimeControlLease['resourceManifest']['resources'][number]
  >;
  readonly #routeOperations = new Set<Promise<void>>();
  #runtimeSession: DeterministicRuntimeSession | undefined;
  #deniedRouteRequests = 0;
  #manifestViolations = 0;
  #activeRouteRequests = 0;
  #responseCount = 0;
  #fixtureRequestCount = 0;
  #fixtureResponseCount = 0;
  #fixtureResolutionLedger: RuntimeFixtureResolutionLedgerEntry[] = [];
  #requestLedger: Array<{
    url: string;
    method: string;
    resourceType: string;
    status: number;
    contentDigest: string;
  }> = [];

  constructor(
    origin: string,
    lease: BrowserRuntimeControlLease,
    allowedResources: ReadonlyMap<
      string,
      BrowserRuntimeControlLease['resourceManifest']['resources'][number]
    >
  ) {
    this.#origin = origin;
    this.#lease = lease;
    this.#allowedResources = allowedResources;
  }

  bindRuntimeSession(session: DeterministicRuntimeSession): void {
    if (this.#runtimeSession !== undefined) {
      throw new Error(
        'Deterministic browser resource router session was rebound.'
      );
    }
    this.#runtimeSession = session;
  }

  unbindRuntimeSession(): void {
    this.#runtimeSession = undefined;
  }

  async route(route: Route): Promise<void> {
    const operation = this.#routeExactResource(route);
    this.#routeOperations.add(operation);
    try {
      await operation;
    } finally {
      this.#routeOperations.delete(operation);
    }
  }

  async drain(): Promise<void> {
    let turn = 0;
    while (this.#routeOperations.size > 0) {
      if (turn >= 64) {
        throw new Error(
          'Deterministic browser resource routing did not reach idle.'
        );
      }
      await Promise.all([...this.#routeOperations]);
      turn += 1;
    }
  }

  snapshot(): PlaywrightDeterministicResourceRouterSnapshot {
    return Object.freeze({
      deniedRouteRequests: this.#deniedRouteRequests,
      manifestViolations: this.#manifestViolations,
      activeRouteRequests: this.#activeRouteRequests,
      responseCount: this.#responseCount,
      fixtureRequestCount: this.#fixtureRequestCount,
      fixtureResponseCount: this.#fixtureResponseCount,
      fixtureResolutionLedger: Object.freeze([
        ...this.#fixtureResolutionLedger,
      ]),
      requestLedger: Object.freeze(
        this.#requestLedger.map((entry) => Object.freeze({ ...entry }))
      ),
    });
  }

  async #routeExactResource(route: Route): Promise<void> {
    const request = route.request();
    const runtimeFixtureUrl = new URL(
      EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
      this.#origin
    ).href;
    if (request.url() === runtimeFixtureUrl) {
      await this.#routeRuntimeFixture(route, runtimeFixtureUrl);
      return;
    }
    const resource = this.#allowedResources.get(request.url());
    if (request.method() !== 'GET' || !resource) {
      this.#deniedRouteRequests += 1;
      await route.abort('blockedbyclient');
      return;
    }
    this.#activeRouteRequests += 1;
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      const body = await response.body();
      const contentDigest = digestBrowserVerificationBytes(
        new Uint8Array(body)
      );
      const contentType = response.headers()['content-type'] ?? '';
      const parserEgressDetected =
        (resource.kind === 'entry' ||
          resource.kind === 'control-host' ||
          contentType.toLowerCase().includes('text/html')) &&
        parserEgressPattern.test(new TextDecoder().decode(body));
      if (
        response.status() < 200 ||
        response.status() >= 300 ||
        response.url() !== request.url() ||
        contentDigest !== resource.contentDigest ||
        parserEgressDetected
      ) {
        this.#manifestViolations += 1;
        await route.abort('blockedbyclient');
        return;
      }
      this.#responseCount += 1;
      this.#requestLedger.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        status: response.status(),
        contentDigest,
      });
      await route.fulfill({
        response,
        body,
        headers: {
          ...response.headers(),
          ...sandboxResponseHeaders,
        },
      });
    } catch {
      this.#manifestViolations += 1;
      try {
        await route.abort('failed');
      } catch {
        // The manifest violation remains authoritative if the route closed.
      }
    } finally {
      this.#activeRouteRequests -= 1;
    }
  }

  async #routeRuntimeFixture(
    route: Route,
    runtimeFixtureUrl: string
  ): Promise<void> {
    const playwrightRequest = route.request();
    this.#fixtureRequestCount += 1;
    this.#activeRouteRequests += 1;
    try {
      const session = this.#runtimeSession;
      const fixture = this.#lease.plan.network.fixtures.find(
        ({ target }) => target.kind === 'auth-session'
      );
      if (
        this.#lease.fixtureBinding.expectedRuntimeDispatchCount !== 1 ||
        this.#fixtureRequestCount !== 1 ||
        typeof this.#lease.resolveRuntimeFixture !== 'function' ||
        !session ||
        this.#lease.plan.network.fixtures.length !== 1 ||
        !fixture ||
        fixture.outcome.kind !== 'result' ||
        playwrightRequest.method() !== 'GET' ||
        playwrightRequest.resourceType() !== 'fetch' ||
        playwrightRequest.url() !== runtimeFixtureUrl ||
        playwrightRequest.postData() !== null ||
        session.network.events().length !== 0
      ) {
        throw new Error(
          'Browser runtime fixture request drifted from its exact causal contract.'
        );
      }
      const invocationId = createBrowserRuntimeControlUuid(
        session.identifiers.next('operation')
      );
      const request = Object.freeze({
        method: 'GET' as const,
        url: runtimeFixtureUrl,
        invocationId,
        attempt: fixture.attempt ?? 1,
      });
      const response = normalizeExecutionAuthSessionFixtureResponse(
        await this.#lease.resolveRuntimeFixture(request)
      );
      const events = session.network.events();
      const dispatchEvent = events[0];
      const expectedOutcome = fixture.outcome.value;
      if (
        events.length !== 1 ||
        !dispatchEvent ||
        dispatchEvent.sequence !== 1 ||
        dispatchEvent.requestKind !== 'auth-session' ||
        dispatchEvent.resourceId !== fixture.target.resourceId ||
        dispatchEvent.inputDigest !== fixture.inputDigest ||
        dispatchEvent.outcome !== 'matched' ||
        dispatchEvent.fixtureId !== fixture.id ||
        dispatchEvent.reason !== undefined ||
        response.fixtureId !== fixture.id ||
        response.resourceId !== fixture.target.resourceId ||
        response.inputDigest !== fixture.inputDigest ||
        response.fixtureSetDigest !== this.#lease.plan.fixtureSetDigests[0] ||
        response.outcomeDigest !== digestVerificationValue(fixture.outcome) ||
        response.providerId !== fixture.target.resourceId ||
        response.invocationId !== invocationId ||
        response.attempt !== request.attempt ||
        !sameCanonicalJson(
          {
            principalId: response.principalId,
            permissionIds: response.permissionIds,
          },
          expectedOutcome
        )
      ) {
        throw new Error(
          'Browser runtime fixture response drifted from the live Core dispatch.'
        );
      }
      const bodyText = canonicalJsonText(response);
      const body = new TextEncoder().encode(bodyText);
      const responseDigest = digestBrowserVerificationBytes(body);
      const resolutionIdentity = Object.freeze({
        request,
        dispatchEvent,
        response,
        responseDigest,
      });
      const resolutionDigest = digestVerificationValue(resolutionIdentity);
      this.#fixtureResolutionLedger.push(
        Object.freeze({
          ...resolutionIdentity,
          resolutionDigest,
        })
      );
      this.#fixtureResponseCount += 1;
      this.#responseCount += 1;
      this.#requestLedger.push({
        url: playwrightRequest.url(),
        method: playwrightRequest.method(),
        resourceType: playwrightRequest.resourceType(),
        status: 200,
        contentDigest: responseDigest,
      });
      await route.fulfill({
        status: 200,
        body: bodyText,
        headers: {
          'cache-control': 'no-store',
          'content-type': EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
          'x-content-type-options': 'nosniff',
          'x-dns-prefetch-control': 'off',
        },
      });
    } catch {
      this.#manifestViolations += 1;
      try {
        await route.abort('blockedbyclient');
      } catch {
        // The causal fixture violation remains authoritative.
      }
    } finally {
      this.#activeRouteRequests -= 1;
    }
  }
}
