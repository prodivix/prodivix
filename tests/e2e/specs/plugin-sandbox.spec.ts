import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const sandboxOrigin =
  process.env.E2E_SANDBOX_BASE_URL ??
  `http://127.0.0.1:${Number(process.env.E2E_SANDBOX_PORT ?? 4174)}`;

const openHarness = async (page: Page) => {
  await page.goto('/plugin-sandbox-conformance.html');
  await page.waitForFunction(() =>
    Boolean(window.prodivixPluginSandboxConformance)
  );
};

test.describe('plugin sandbox production conformance', () => {
  test('runs verified runtime bytes without exposing Host or browser authority', async ({
    page,
  }) => {
    await openHarness(page);

    const result = await page.evaluate(
      ({ sandboxUrl }) =>
        window.prodivixPluginSandboxConformance.runRuntime({
          sandboxUrl,
          mode: 'probe',
        }),
      { sandboxUrl: `${sandboxOrigin}/runtime-broker.html` }
    );

    expect(result.activated).toBe(true);
    expect(result.diagnosticCodes).toEqual([]);
    expect(result.probe).toEqual({
      parentDomBlocked: 'true',
      networkBlocked: 'true',
      storageBlocked: 'true',
      nestedWorkerBlocked: 'true',
      topNavigationBlocked: 'true',
    });
  });

  test('terminates a hung Worker while the editor main loop remains responsive', async ({
    page,
  }) => {
    await openHarness(page);

    const result = await page.evaluate(
      ({ sandboxUrl }) =>
        window.prodivixPluginSandboxConformance.runRuntime({
          sandboxUrl,
          mode: 'hang',
        }),
      { sandboxUrl: `${sandboxOrigin}/runtime-broker.html` }
    );

    expect(result.activated).toBe(false);
    expect(result.diagnosticCodes).toContain('PLG-4025');
    expect(result.mainLoopTicks).toBeGreaterThan(5);
    expect(result.elapsedMs).toBeLessThan(10_000);
  });

  test('rejects a runtime that throws during activation without destabilizing the editor', async ({
    page,
  }) => {
    await openHarness(page);

    const result = await page.evaluate(
      ({ sandboxUrl }) =>
        window.prodivixPluginSandboxConformance.runRuntime({
          sandboxUrl,
          mode: 'crash',
        }),
      { sandboxUrl: `${sandboxOrigin}/runtime-broker.html` }
    );

    expect(result.activated).toBe(false);
    expect(result.diagnosticCodes).toContain('PLG-4002');
    expect(result.elapsedMs).toBeLessThan(10_000);
  });

  for (const scenario of [
    {
      mode: 'unhandled-rejection' as const,
      expectedReason: 'unhandled-runtime-rejection',
    },
    { mode: 'close' as const, expectedReason: 'heartbeat-timeout' },
  ]) {
    test(`terminates a runtime after ${scenario.mode} while the editor remains responsive`, async ({
      page,
    }) => {
      await openHarness(page);

      const result = await page.evaluate(
        ({ sandboxUrl, mode }) =>
          window.prodivixPluginSandboxConformance.runRuntime({
            sandboxUrl,
            mode,
          }),
        {
          sandboxUrl: `${sandboxOrigin}/runtime-broker.html`,
          mode: scenario.mode,
        }
      );

      expect(result.activated).toBe(true);
      expect(result.terminationReasonCode).toBe(scenario.expectedReason);
      expect(result.mainLoopTicks).toBeGreaterThan(5);
      expect(result.elapsedMs).toBeLessThan(10_000);
    });
  }

  test('isolates UI DOM, navigation, network, storage, popup, download, and permission attempts', async ({
    page,
  }) => {
    await openHarness(page);
    const escapedResponses: string[] = [];
    let popupOpened = false;
    let downloadStarted = false;
    page.on('response', (response) => {
      if (response.url().includes('example.com')) {
        escapedResponses.push(response.url());
      }
    });
    page.on('popup', () => {
      popupOpened = true;
    });
    page.on('download', () => {
      downloadStarted = true;
    });

    const result = await page.evaluate(
      ({ sandboxUrl }) =>
        window.prodivixPluginSandboxConformance.runUi({ sandboxUrl }),
      { sandboxUrl: `${sandboxOrigin}/ui-conformance.html` }
    );

    expect(result).toEqual({
      parentDomBlocked: true,
      topNavigationBlocked: true,
      networkBlocked: true,
      storageBlocked: true,
      nestedWorkerBlocked: true,
      popupBlocked: true,
      permissionBlocked: true,
      formAndDownloadAttempted: true,
      sandboxTokens: ['allow-scripts'],
      hostLocationUnchanged: true,
    });
    expect(escapedResponses).toEqual([]);
    expect(popupOpened).toBe(false);
    expect(downloadStarted).toBe(false);
  });

  test('serves immutable sandbox security headers from the dedicated origin', async ({
    request,
  }) => {
    const runtime = await request.get(`${sandboxOrigin}/runtime-broker.html`);
    const ui = await request.get(`${sandboxOrigin}/ui-conformance.html`);

    expect(runtime.ok()).toBe(true);
    expect(runtime.headers()['set-cookie']).toBeUndefined();
    expect(runtime.headers()['cache-control']).toBe('no-store');
    expect(runtime.headers()['cross-origin-resource-policy']).toBe(
      'cross-origin'
    );
    expect(runtime.headers()['content-security-policy']).toContain(
      "default-src 'none'"
    );
    expect(runtime.headers()['content-security-policy']).toContain(
      'worker-src blob:'
    );
    expect(runtime.headers()['permissions-policy']).toContain('geolocation=()');
    expect(ui.headers()['content-security-policy']).toContain(
      "worker-src 'none'"
    );
    expect(ui.headers()['referrer-policy']).toBe('no-referrer');
    const runtimeScript = await request.get(
      `${sandboxOrigin}/runtime-broker.js`
    );
    expect(runtimeScript.headers()['access-control-allow-origin']).toBe('*');
    expect(runtimeScript.headers()['x-content-type-options']).toBe('nosniff');
    expect(
      (await request.get(`${sandboxOrigin}/not-a-sandbox-resource`)).status()
    ).toBe(404);
  });

  test('persists bounded and redacted Host Gateway audit records', async ({
    page,
  }) => {
    await openHarness(page);

    const result = await page.evaluate(() =>
      window.prodivixPluginSandboxConformance.runAudit()
    );

    expect(result).toEqual({
      eventIds: ['event-3', 'event-2'],
      authorization: '[REDACTED]',
    });
  });
});

declare global {
  interface Window {
    prodivixPluginSandboxConformance: {
      runRuntime(input: {
        sandboxUrl: string;
        mode: 'probe' | 'hang' | 'crash' | 'unhandled-rejection' | 'close';
      }): Promise<{
        activated: boolean;
        diagnosticCodes: string[];
        probe?: Record<string, string>;
        terminationReasonCode?: string;
        mainLoopTicks: number;
        elapsedMs: number;
      }>;
      runUi(input: { sandboxUrl: string }): Promise<{
        parentDomBlocked: boolean;
        topNavigationBlocked: boolean;
        networkBlocked: boolean;
        storageBlocked: boolean;
        nestedWorkerBlocked: boolean;
        popupBlocked: boolean;
        permissionBlocked: boolean;
        formAndDownloadAttempted: boolean;
        sandboxTokens: string[];
        hostLocationUnchanged: boolean;
      }>;
      runAudit(): Promise<{
        eventIds: string[];
        authorization?: string;
      }>;
    };
  }
}
