import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  armPlaywrightTrustedPerformanceObservation,
  finishPlaywrightTrustedPerformanceObservation,
  installPlaywrightPerformanceProbe,
  readPlaywrightTrustedMonotonicTimestamp,
} from './playwrightPerformanceProbe';

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';

const TAMPER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Trusted performance probe</title>
    <script>
      Performance.prototype.now = () => 0;
      globalThis.PerformanceObserver = class {
        observe() {}
        takeRecords() { return []; }
      };
      globalThis.requestAnimationFrame = (callback) => {
        callback(0);
        return 1;
      };
    </script>
  </head>
  <body>
    <button id="interaction" type="button">Interact</button>
    <script>
      document.getElementById('interaction').addEventListener('click', () => {
        const deadline = Date.now() + 80;
        while (Date.now() < deadline) {}
      });
    </script>
  </body>
</html>`;

const VIRTUAL_CLOCK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Trusted performance under virtual author time</title>
    <style>
      body { margin: 0; font: 16px sans-serif; }
      h1 { display: block; width: 640px; height: 180px; margin: 24px; }
      button { margin: 24px; width: 240px; height: 64px; }
    </style>
  </head>
  <body>
    <h1>Largest content remains observable</h1>
    <button id="interaction" type="button">Interact under virtual time</button>
    <script>
      const nativeDateNow = Date.now.bind(Date);
      document.getElementById('interaction').addEventListener('click', () => {
        const deadline = nativeDateNow() + 80;
        let iterations = 0;
        while (nativeDateNow() < deadline && iterations < 100_000_000) {
          iterations += 1;
        }
      });
    </script>
  </body>
</html>`;

describe.skipIf(!enabled)(
  'Playwright trusted performance probe browsers',
  () => {
    it('chromium keeps monotonic timing and trusted interactions outside author monkeypatches', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const binding = await installPlaywrightPerformanceProbe(page);
        await page.route('http://localhost/**', (route) =>
          route.fulfill({
            body: TAMPER_HTML,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          })
        );
        await page.goto('http://localhost/', { waitUntil: 'load' });

        const startedAt = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        await armPlaywrightTrustedPerformanceObservation(page, binding);
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Interact' }).click();
        const finishedAt = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        const observation = await finishPlaywrightTrustedPerformanceObservation(
          page,
          binding
        );

        expect(startedAt).toBeGreaterThan(0);
        expect(finishedAt).toBeGreaterThan(startedAt);
        expect(observation.trustedInteractionCount).toBeGreaterThanOrEqual(1);
        expect(observation.frameCount).toBeGreaterThan(0);
        expect(observation.missedFrames).toBeGreaterThanOrEqual(1);

        await page.evaluate(() => {
          const deadline = Date.now() + 80;
          while (Date.now() < deadline) {
            // Deliberately occupy the author main thread after sampling ends.
          }
        });
        const afterScenario =
          await finishPlaywrightTrustedPerformanceObservation(page, binding);
        expect(afterScenario.missedFrames).toBe(observation.missedFrames);
      } finally {
        await browser.close();
      }
    }, 30_000);

    it('chromium keeps native monotonic time and animation frames outside a paused Playwright Clock', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const binding = await installPlaywrightPerformanceProbe(page);
        await page.route('http://localhost/**', (route) =>
          route.fulfill({
            body: VIRTUAL_CLOCK_HTML,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          })
        );
        await page.goto('http://localhost/', { waitUntil: 'load' });

        const trustedBefore = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        const fixedTime = Date.UTC(2032, 3, 5, 6, 7, 8);
        await page.clock.install({ time: fixedTime });
        await page.clock.pauseAt(fixedTime + 1_000);
        const authorBefore = await page.evaluate(() => ({
          dateNow: Date.now(),
          performanceNow: performance.now(),
        }));

        await armPlaywrightTrustedPerformanceObservation(page, binding);
        await page.waitForTimeout(120);
        const trustedAfter = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        const authorAfter = await page.evaluate(() => ({
          dateNow: Date.now(),
          performanceNow: performance.now(),
        }));
        const observation = await finishPlaywrightTrustedPerformanceObservation(
          page,
          binding
        );

        expect(authorBefore.dateNow).toBe(fixedTime + 1_000);
        expect(authorAfter).toEqual(authorBefore);
        expect(trustedAfter).toBeGreaterThan(trustedBefore + 50);
        expect(observation.frameCount).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 30_000);

    it('chromium keeps native navigation LCP INP and frame observations outside a paused Playwright Clock', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const binding = await installPlaywrightPerformanceProbe(page);
        await page.route('http://localhost/**', (route) =>
          route.fulfill({
            body: VIRTUAL_CLOCK_HTML,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          })
        );
        await page.goto('http://localhost/', { waitUntil: 'load' });
        const interaction = page.getByRole('button', {
          name: 'Interact under virtual time',
        });
        const box = await interaction.boundingBox();
        expect(box).not.toBeNull();

        const fixedTime = Date.UTC(2032, 3, 5, 6, 7, 8);
        await page.clock.install({ time: fixedTime });
        await page.clock.pauseAt(fixedTime + 1_000);
        await armPlaywrightTrustedPerformanceObservation(page, binding);
        await page.waitForTimeout(120);
        await page.mouse.click(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2
        );
        await page.waitForTimeout(120);
        const observation = await finishPlaywrightTrustedPerformanceObservation(
          page,
          binding
        );

        expect(observation.supportedEntryTypes).toContain('navigation');
        expect(observation.navigationEntryCount).toBe(1);
        expect(observation.navigationDuration).toBeGreaterThan(0);
        expect(observation.supportedEntryTypes).toContain(
          'largest-contentful-paint'
        );
        expect(observation.lcpEntryCount).toBeGreaterThanOrEqual(1);
        expect(observation.lcp).toBeGreaterThan(0);
        expect(observation.supportedEntryTypes).toContain('event');
        expect(observation.trustedInteractionCount).toBeGreaterThanOrEqual(1);
        expect(observation.inp).toBeGreaterThan(0);
        expect(observation.frameCount).toBeGreaterThan(0);
        expect(observation.missedFrames).toBeGreaterThanOrEqual(1);
      } finally {
        await browser.close();
      }
    }, 30_000);

    it('chromium keeps pre-author native timing after a paused Playwright Clock document reload', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const binding = await installPlaywrightPerformanceProbe(page);
        await page.route('http://localhost/**', (route) =>
          route.fulfill({
            body: VIRTUAL_CLOCK_HTML,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          })
        );
        await page.goto('http://localhost/', { waitUntil: 'load' });
        const fixedTime = Date.UTC(2032, 3, 5, 6, 7, 8);
        await page.clock.install({ time: fixedTime });
        await page.clock.pauseAt(fixedTime + 1_000);
        await page.reload({ waitUntil: 'load' });
        const interaction = page.getByRole('button', {
          name: 'Interact under virtual time',
        });
        const box = await interaction.boundingBox();
        expect(box).not.toBeNull();

        const trustedBefore = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        const authorBefore = await page.evaluate(() => ({
          dateNow: Date.now(),
          performanceNow: performance.now(),
        }));
        await armPlaywrightTrustedPerformanceObservation(page, binding);
        await page.waitForTimeout(120);
        await page.mouse.click(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2
        );
        await page.waitForTimeout(120);
        const trustedAfter = await readPlaywrightTrustedMonotonicTimestamp(
          page,
          binding
        );
        const authorAfter = await page.evaluate(() => ({
          dateNow: Date.now(),
          performanceNow: performance.now(),
        }));
        const observation = await finishPlaywrightTrustedPerformanceObservation(
          page,
          binding
        );

        expect(authorAfter).toEqual(authorBefore);
        expect(trustedAfter).toBeGreaterThan(trustedBefore + 50);
        expect(observation.navigationEntryCount).toBe(1);
        expect(observation.navigationDuration).toBeGreaterThan(0);
        expect(observation.lcpEntryCount).toBeGreaterThanOrEqual(1);
        expect(observation.lcp).toBeGreaterThan(0);
        expect(observation.trustedInteractionCount).toBeGreaterThanOrEqual(1);
        expect(observation.inp).toBeGreaterThan(0);
        expect(observation.frameCount).toBeGreaterThan(0);
        expect(observation.missedFrames).toBeGreaterThanOrEqual(1);
      } finally {
        await browser.close();
      }
    }, 30_000);
  }
);
