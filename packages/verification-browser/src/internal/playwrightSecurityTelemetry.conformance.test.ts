import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import type { BrowserSandboxObservation } from '../browserSecurityObservation';
import type { BrowserSecurityPolicyProfile } from '../security';
import { PlaywrightSecurityTelemetry } from './playwrightSecurityTelemetry';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;
const providerSandbox: BrowserSandboxObservation = Object.freeze({
  contextIsolation: 'fresh-nonpersistent',
  serviceWorkerPolicy: 'blocked',
  topLevel: true,
  canReachParent: true,
  sandboxTokens: Object.freeze([]),
});

class FakePage {
  readonly #listeners = new Map<
    string,
    Array<(...values: unknown[]) => void>
  >();
  readonly frame = Object.freeze({});

  on(name: string, listener: (...values: unknown[]) => void): void {
    const listeners = this.#listeners.get(name) ?? [];
    listeners.push(listener);
    this.#listeners.set(name, listeners);
  }

  emit(name: string, ...values: unknown[]): void {
    for (const listener of this.#listeners.get(name) ?? []) {
      listener(...values);
    }
  }

  mainFrame(): object {
    return this.frame;
  }

  async waitForLoadState(): Promise<void> {}

  async content(): Promise<string> {
    throw new Error(
      'Security telemetry must not treat rendered DOM as a bundle scan.'
    );
  }

  async evaluate(): Promise<never> {
    throw new Error(
      'Security telemetry must not evaluate mutable author realm state.'
    );
  }
}

describe('Playwright security telemetry', () => {
  it('keeps network and console evidence bounded while digesting actual observations', async () => {
    const fake = new FakePage();
    const telemetry = new PlaywrightSecurityTelemetry(
      fake as unknown as Page,
      providerSandbox
    );
    const request = {
      url: () =>
        'https://example.test/private/customer-secret?access_token=secret',
      method: () => 'GET',
      resourceType: () => 'document',
    };
    fake.emit('request', request);
    fake.emit('response', {
      request: () => request,
      status: () => 200,
      frame: () => fake.frame,
      headers: () => ({
        'content-security-policy': "default-src 'self'",
        'permissions-policy': 'camera=()',
      }),
    });
    fake.emit('console', {
      type: () => 'error',
      text: () => {
        throw new Error('collector must not read console text');
      },
    });

    const operations = await telemetry.collectNetworkSummary();
    expect(operations).toEqual([
      expect.objectContaining({
        host: 'example.test',
        pathTemplate: '/{segment-1}/{segment-2}',
        status: 200,
      }),
    ]);
    expect(JSON.stringify(operations)).not.toMatch(
      /customer-secret|access_token|secret/u
    );

    const consoleEvents = telemetry.collectConsoleSummary();
    expect(consoleEvents).toEqual([
      expect.objectContaining({
        sequence: 0,
        level: 'error',
        diagnosticCodes: ['VER-BROWSER-CONSOLE-ERROR'],
      }),
    ]);
    expect(JSON.stringify(consoleEvents)).not.toContain('console text');

    const policy: BrowserSecurityPolicyProfile = {
      allowedOrigins: ['https://example.test'],
      productionProbeMarkers: ['__PRODIVIX_VERIFY_ONLY_CANARY_V1__'],
      expectedChecks: [
        {
          ruleId: 'security.unexpected-network',
          targetId: 'target.security',
          expectedDigest: sha('a'),
          collector: 'browser-network',
        },
        {
          ruleId: 'security.csp-policy',
          targetId: 'target.security',
          expectedDigest: sha('b'),
          collector: 'response-csp',
        },
        {
          ruleId: 'security.permissions-policy',
          targetId: 'target.security',
          expectedDigest: sha('c'),
          collector: 'response-permissions-policy',
        },
        {
          ruleId: 'security.sandbox-isolation',
          targetId: 'target.security',
          expectedDigest: sha('d'),
          collector: 'browser-sandbox',
        },
      ],
    };
    const report = (await telemetry.collectSecurity(policy)) as {
      checks: readonly Readonly<{
        ruleId: string;
        observedDigest: string;
        violationCount: number;
      }>[];
    };
    expect(
      report.checks.find(
        ({ ruleId }) => ruleId === 'security.unexpected-network'
      )?.observedDigest
    ).not.toBe(sha('a'));
    expect(report.checks).toHaveLength(4);
    expect(
      report.checks.some(
        ({ ruleId }) => ruleId === 'security.production-probe-leak'
      )
    ).toBe(false);
  });
});
