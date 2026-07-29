import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  createBrowserSandboxObservationDigest,
  type BrowserSandboxObservation,
} from '../browserSecurityObservation';
import type { BrowserSecurityPolicyProfile } from '../security';
import { observePlaywrightPreAuthorRuntime } from './playwrightRuntimeObservation';
import {
  observePlaywrightProviderSandbox,
  PlaywrightSecurityTelemetry,
} from './playwrightSecurityTelemetry';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;
const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';

const AUTHOR_FORGERY_HTML = `<!doctype html>
<html>
  <head>
    <script>
      class ForgedIFrame {
        constructor() {
          this.sandbox = ['allow-same-origin', 'allow-scripts'];
        }
      }
      Object.defineProperties(window, {
        innerWidth: { configurable: false, value: 13 },
        innerHeight: { configurable: false, value: 17 },
        devicePixelRatio: { configurable: false, value: 99 },
        matchMedia: {
          configurable: false,
          value: () => ({ matches: false }),
        },
        HTMLIFrameElement: {
          configurable: false,
          value: ForgedIFrame,
        },
        frameElement: {
          configurable: false,
          value: new ForgedIFrame(),
        },
      });
      Object.defineProperty(navigator, 'language', {
        configurable: false,
        value: 'forged',
      });
    </script>
  </head>
  <body></body>
</html>`;

const sandboxPolicy: BrowserSecurityPolicyProfile = Object.freeze({
  allowedOrigins: Object.freeze([]),
  productionProbeMarkers: Object.freeze([]),
  expectedChecks: Object.freeze([
    Object.freeze({
      ruleId: 'security.sandbox-isolation',
      targetId: 'target.security',
      expectedDigest: sha('a'),
      collector: 'browser-sandbox',
    }),
  ]),
});

describe.skipIf(!enabled)('Playwright provider observations', () => {
  it('keeps runtime identity and sandbox facts pre-author under author realm monkeypatches', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 900, height: 700 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        locale: 'en-GB',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const runtime = await observePlaywrightPreAuthorRuntime(page);
      const sandbox = await observePlaywrightProviderSandbox(page);
      const telemetry = new PlaywrightSecurityTelemetry(page, sandbox);

      await page.goto(
        `data:text/html;charset=utf-8,${encodeURIComponent(AUTHOR_FORGERY_HTML)}`,
        { waitUntil: 'load' }
      );

      await expect(
        page.evaluate(() => ({
          widthCssPixels: window.innerWidth,
          heightCssPixels: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          colorScheme: matchMedia('(prefers-color-scheme: dark)').matches,
          locale: navigator.language,
          sandboxTokens: [
            ...(
              window.frameElement as unknown as {
                sandbox: readonly string[];
              }
            ).sandbox,
          ],
        }))
      ).resolves.toEqual({
        widthCssPixels: 13,
        heightCssPixels: 17,
        devicePixelRatio: 99,
        colorScheme: false,
        locale: 'forged',
        sandboxTokens: ['allow-same-origin', 'allow-scripts'],
      });
      expect(runtime).toEqual({
        widthCssPixels: 900,
        heightCssPixels: 700,
        devicePixelRatio: 2,
        colorScheme: 'dark',
        motionPreference: 'reduced',
        locale: 'en-GB',
      });

      const report = (await telemetry.collectSecurity(sandboxPolicy)) as {
        checks: readonly Readonly<{
          ruleId: string;
          observedDigest: string;
        }>[];
      };
      const providerDigest = createBrowserSandboxObservationDigest(sandbox);
      const forgedObservation: BrowserSandboxObservation = {
        ...sandbox,
        sandboxTokens: ['allow-same-origin', 'allow-scripts'],
      };
      expect(report.checks).toEqual([
        expect.objectContaining({
          ruleId: 'security.sandbox-isolation',
          observedDigest: providerDigest,
        }),
      ]);
      expect(providerDigest).not.toBe(
        createBrowserSandboxObservationDigest(forgedObservation)
      );
      await context.close();
    } finally {
      await browser.close();
    }
  }, 30_000);
});
