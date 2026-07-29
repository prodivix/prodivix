import {
  compareVerificationText,
  VERIFICATION_STRUCTURED_ARTIFACT_LIMITS,
  type VerificationArtifactConsoleEvent,
  type VerificationArtifactNetworkMethod,
  type VerificationArtifactNetworkOperation,
} from '@prodivix/verification';
import type { Page, Request } from 'playwright-core';
import {
  createBrowserCspObservationDigest,
  createBrowserNetworkObservationDigest,
  createBrowserPermissionsPolicyObservationDigest,
  createBrowserSandboxObservationDigest,
  type BrowserSandboxObservation,
} from '../browserSecurityObservation';
import type {
  BrowserSecurityPolicyProfile,
  SecurityCheckObservation,
} from '../security';
import {
  roundMilliseconds,
  SECURITY_SCHEMA_DIGEST,
  toolIdentity,
} from './playwrightBrowserShared';

type NetworkRequestStart = Readonly<{
  sequence: number;
  startOffsetMs: number;
}>;

const networkMethod = (
  value: string
): VerificationArtifactNetworkMethod | undefined => {
  const normalized = value.toUpperCase();
  return (
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
  ).find((candidate) => candidate === normalized);
};

const anonymousPathTemplate = (pathname: string): string => {
  const segmentCount = pathname.split('/').filter(Boolean).length;
  if (segmentCount === 0) return '/';
  const retained = Math.min(segmentCount, 32);
  const segments = Array.from(
    { length: retained },
    (_, index) => `{segment-${index + 1}}`
  );
  if (segmentCount > retained) segments.push('{remaining}');
  return `/${segments.join('/')}`;
};

const safeNetworkHost = (url: URL): string => {
  const hostname = url.hostname
    .replace(/^\[/u, '')
    .replace(/\]$/u, '')
    .toLowerCase();
  return hostname.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u.test(
      hostname
    )
    ? hostname
    : 'opaque.invalid';
};

const consoleLevel = (
  value: string
): VerificationArtifactConsoleEvent['level'] =>
  value === 'debug'
    ? 'debug'
    : value === 'warning' || value === 'warn'
      ? 'warning'
      : value === 'error' || value === 'assert'
        ? 'error'
        : 'info';

/**
 * Captures only bounded metadata. Console text/args/stacks, URL queries,
 * headers, bodies, and concrete path segments never enter this object.
 */
export class PlaywrightSecurityTelemetry {
  readonly #page: Page;
  readonly #sandboxObservation: BrowserSandboxObservation;
  readonly #networkOrigins = new Set<string>();
  readonly #networkRequestStart = new WeakMap<Request, NetworkRequestStart>();
  readonly #openNetworkRequests = new Set<Request>();
  readonly #networkOperations: VerificationArtifactNetworkOperation[] = [];
  readonly #consoleEvents: VerificationArtifactConsoleEvent[] = [];
  readonly #startedAt = performance.now();
  #documentHeaders: Readonly<Record<string, string>> = Object.freeze({});
  #networkSequence = 0;
  #consoleSequence = 0;
  #unsupportedNetworkRequestCount = 0;
  #networkOverflow = false;
  #consoleOverflow = false;

  constructor(page: Page, sandboxObservation: BrowserSandboxObservation) {
    this.#page = page;
    this.#sandboxObservation = Object.freeze({
      ...sandboxObservation,
      sandboxTokens: Object.freeze([...sandboxObservation.sandboxTokens]),
    });
    this.#attach();
  }

  #attach(): void {
    this.#page.on('request', (request) => {
      const sequence = this.#networkSequence;
      this.#networkSequence += 1;
      this.#networkRequestStart.set(
        request,
        Object.freeze({
          sequence,
          startOffsetMs: roundMilliseconds(performance.now() - this.#startedAt),
        })
      );
      this.#openNetworkRequests.add(request);
      try {
        const url = new URL(request.url());
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          this.#networkOrigins.add(url.origin);
        } else {
          this.#unsupportedNetworkRequestCount += 1;
        }
      } catch {
        this.#unsupportedNetworkRequestCount += 1;
      }
    });
    this.#page.on('response', (response) => {
      const request = response.request();
      this.#openNetworkRequests.delete(request);
      this.#recordNetworkOperation(request, response.status());
      if (
        request.resourceType() === 'document' &&
        response.frame() === this.#page.mainFrame()
      ) {
        this.#documentHeaders = Object.freeze(response.headers());
      }
    });
    this.#page.on('requestfailed', (request) => {
      this.#openNetworkRequests.delete(request);
      this.#recordNetworkOperation(request, 0);
    });
    this.#page.on('console', (message) => {
      this.#recordConsoleEvent(
        consoleLevel(message.type()),
        `VER-BROWSER-CONSOLE-${message
          .type()
          .replaceAll(/[^A-Za-z0-9]+/gu, '-')
          .toUpperCase()}`
      );
    });
    this.#page.on('pageerror', () => {
      this.#recordConsoleEvent('error', 'VER-BROWSER-PAGE-ERROR');
    });
  }

  #recordNetworkOperation(request: Request, status: number): void {
    const started = this.#networkRequestStart.get(request);
    if (started === undefined) return;
    this.#networkRequestStart.delete(request);
    if (
      this.#networkOperations.length >=
      VERIFICATION_STRUCTURED_ARTIFACT_LIMITS.maximumNetworkOperations
    ) {
      this.#networkOverflow = true;
      return;
    }
    const method = networkMethod(request.method());
    if (method === undefined) return;
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    this.#networkOperations.push(
      Object.freeze({
        method,
        host: safeNetworkHost(url),
        pathTemplate: anonymousPathTemplate(url.pathname),
        status:
          Number.isSafeInteger(status) &&
          (status === 0 || (status >= 100 && status <= 599))
            ? status
            : 0,
        timing: Object.freeze({
          startOffsetMs: started.startOffsetMs,
          durationMs: roundMilliseconds(
            performance.now() - this.#startedAt - started.startOffsetMs
          ),
        }),
        operationId: `network.${String(started.sequence).padStart(6, '0')}`,
      })
    );
  }

  #recordConsoleEvent(
    level: VerificationArtifactConsoleEvent['level'],
    diagnosticCode: string
  ): void {
    if (
      this.#consoleEvents.length >=
      VERIFICATION_STRUCTURED_ARTIFACT_LIMITS.maximumConsoleEvents
    ) {
      this.#consoleOverflow = true;
      return;
    }
    const sequence = this.#consoleSequence;
    this.#consoleSequence += 1;
    this.#consoleEvents.push(
      Object.freeze({
        sequence,
        eventId: `console.${String(sequence).padStart(6, '0')}`,
        level,
        timestampOffsetMs: roundMilliseconds(
          performance.now() - this.#startedAt
        ),
        diagnosticCodes: Object.freeze([diagnosticCode]),
      })
    );
  }

  async collectNetworkSummary(): Promise<
    readonly VerificationArtifactNetworkOperation[]
  > {
    await this.#page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => undefined);
    if (this.#networkOverflow || this.#openNetworkRequests.size > 0) {
      throw new Error(
        'Browser network summary is partial or exceeds its operation bound.'
      );
    }
    return Object.freeze(
      [...this.#networkOperations].sort((left, right) =>
        compareVerificationText(left.operationId, right.operationId)
      )
    );
  }

  collectConsoleSummary(): readonly VerificationArtifactConsoleEvent[] {
    if (this.#consoleOverflow) {
      throw new Error('Browser console summary exceeds its event bound.');
    }
    return Object.freeze([...this.#consoleEvents]);
  }

  async collectSecurity(
    profile: BrowserSecurityPolicyProfile
  ): Promise<unknown> {
    const allowedOrigins = new Set(profile.allowedOrigins);
    const observedOrigins = [...this.#networkOrigins].sort(
      compareVerificationText
    );
    const unexpectedNetworkCount =
      observedOrigins.filter((origin) => !allowedOrigins.has(origin)).length +
      this.#unsupportedNetworkRequestCount;
    const csp = this.#documentHeaders['content-security-policy'] ?? '';
    const permissions = this.#documentHeaders['permissions-policy'] ?? '';
    const networkDigest =
      createBrowserNetworkObservationDigest(observedOrigins);
    const cspDigest = createBrowserCspObservationDigest(csp);
    const permissionsDigest =
      createBrowserPermissionsPolicyObservationDigest(permissions);
    const sandboxDigest = createBrowserSandboxObservationDigest(
      this.#sandboxObservation
    );
    const checks: SecurityCheckObservation[] = [];
    for (const expected of profile.expectedChecks) {
      if (
        expected.collector === 'core-resolved-observation' ||
        expected.collector === 'core-finalization'
      ) {
        continue;
      }
      const observed =
        expected.collector === 'browser-network'
          ? {
              observedDigest: networkDigest,
              violationCount: unexpectedNetworkCount,
            }
          : expected.collector === 'response-csp'
            ? {
                observedDigest: cspDigest,
                violationCount: csp.length === 0 ? 1 : 0,
              }
            : expected.collector === 'response-permissions-policy'
              ? {
                  observedDigest: permissionsDigest,
                  violationCount: permissions.length === 0 ? 1 : 0,
                }
              : {
                  observedDigest: sandboxDigest,
                  violationCount: 0,
                };
      checks.push(
        Object.freeze({
          ruleId: expected.ruleId,
          state: 'complete' as const,
          targetId: expected.targetId,
          expectedDigest: expected.expectedDigest,
          observedDigest: observed.observedDigest,
          violationCount: observed.violationCount,
          diagnosticCodes: Object.freeze([]),
        })
      );
    }
    return {
      format: 'prodivix.browser-owned-security-report',
      version: 1,
      tool: toolIdentity(SECURITY_SCHEMA_DIGEST),
      complete: true,
      checks,
    };
  }
}

/**
 * Observes the provider-created about:blank Page before any author navigation.
 * The remaining fields are construction facts owned by `browser.newContext`.
 */
export const observePlaywrightProviderSandbox = async (
  page: Page
): Promise<BrowserSandboxObservation> => {
  const relation = await page.evaluate(() => ({
    topLevel: window.top === window,
    canReachParent: window.parent === window,
  }));
  if (!relation.topLevel || !relation.canReachParent) {
    throw new TypeError(
      'A browser verification Page must start as a provider-owned top-level document.'
    );
  }
  return Object.freeze({
    contextIsolation: 'fresh-nonpersistent',
    serviceWorkerPolicy: 'blocked',
    topLevel: true,
    canReachParent: true,
    sandboxTokens: Object.freeze([]),
  });
};
