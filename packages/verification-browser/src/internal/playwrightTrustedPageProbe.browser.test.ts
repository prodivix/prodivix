import { chromium, firefox, webkit } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { createAccessibilityAnnouncementTextDigest } from '../accessibility';
import {
  armTrustedDynamicAnnouncement,
  armTrustedKeyboardActivation,
  cleanupTrustedDynamicAnnouncement,
  installPlaywrightTrustedPageProbe,
  observeTrustedDynamicAnnouncement,
  observeTrustedKeyboard,
  resetTrustedKeyboardFocus,
  resolveTrustedSemanticTargetIndex,
  scanTrustedAxe,
  type TrustedSemanticTargetIdentity,
} from './playwrightTrustedPageProbe';

const TARGET = Object.freeze({
  targetId: 'target-catalog',
  documentId: 'page-catalog',
  nodeId: 'catalog-root',
}) satisfies TrustedSemanticTargetIdentity;
const TRIGGER_TARGET = Object.freeze({
  targetId: 'target-create-product',
  documentId: 'page-catalog',
  nodeId: 'create-product',
}) satisfies TrustedSemanticTargetIdentity;
const ANNOUNCEMENT_TARGET = Object.freeze({
  targetId: 'target-catalog-status',
  documentId: 'page-catalog',
  nodeId: 'catalog-status',
}) satisfies TrustedSemanticTargetIdentity;

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';

const AUTHOR_TAMPER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Trusted probe tamper fixture</title>
    <script>
      Object.defineProperty(window, 'axe', {
        configurable: false,
        enumerable: true,
        get() {
          return Object.freeze({
            run() {
              return Promise.resolve({
                violations: [],
                incomplete: [],
              });
            },
          });
        },
      });
      Document.prototype.querySelectorAll = () => [];
      Object.defineProperty(Document.prototype, 'activeElement', {
        configurable: true,
        get() {
          return null;
        },
      });
      Element.prototype.getAttribute = () => null;
      Element.prototype.matches = () => false;
      Node.prototype.contains = () => false;
      Object.defineProperty(Node.prototype, 'parentElement', {
        configurable: true,
        get() {
          return null;
        },
      });
      globalThis.MutationObserver = class {
        observe() {}
        disconnect() {}
      };
      TextEncoder.prototype.encode = () => new Uint8Array();
      SubtleCrypto.prototype.digest = () =>
        Promise.resolve(new ArrayBuffer(32));
      Object.defineProperty(Node.prototype, 'textContent', {
        configurable: true,
        get() {
          return 'forged author text';
        },
      });
    </script>
  </head>
  <body>
    <main
      data-pir-document-id="page-catalog"
      data-pir-node-id="catalog-root"
    >
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <button
        type="button"
        data-pir-document-id="page-catalog"
        data-pir-node-id="create-product"
        id="create-product"
      >Create product</button>
      <div
        data-pir-document-id="page-catalog"
        data-pir-node-id="catalog-status"
        id="catalog-status"
        role="status"
        aria-live="polite"
      ></div>
    </main>
    <script>
      const createProduct = document.getElementById('create-product');
      const catalogStatus = document.getElementById('catalog-status');
      createProduct.addEventListener('click', () => {
        catalogStatus.replaceChildren('Product created');
      });
    </script>
  </body>
</html>`;

describe.skipIf(!enabled)('Playwright trusted page probe', () => {
  for (const { name, browserType } of [
    { name: 'chromium', browserType: chromium },
    { name: 'firefox', browserType: firefox },
    { name: 'webkit', browserType: webkit },
  ] as const) {
    it(`${name} keeps axe and keyboard evidence outside a non-configurable author axe and monkeypatched DOM APIs`, async () => {
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const fixedTime = Date.parse('2025-01-01T00:00:00.000Z');
        await page.clock.install({ time: fixedTime - 60_000 });
        await page.clock.pauseAt(fixedTime);
        const binding = await installPlaywrightTrustedPageProbe(page);
        await page.route('http://localhost/**', (route) =>
          route.fulfill({
            body: AUTHOR_TAMPER_HTML,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          })
        );
        await page.goto('http://localhost/', { waitUntil: 'load' });

        await expect(
          page.evaluate(() => ({
            axeConfigurable: Object.getOwnPropertyDescriptor(window, 'axe')
              ?.configurable,
            visibleSemanticNodes: document.querySelectorAll(
              '[data-pir-document-id][data-pir-node-id]'
            ).length,
          }))
        ).resolves.toEqual({
          axeConfigurable: false,
          visibleSemanticNodes: 0,
        });

        await expect(
          resolveTrustedSemanticTargetIndex(page, binding, TARGET)
        ).resolves.toBe(0);
        const axeResult = await scanTrustedAxe(page, binding, TARGET);
        expect(axeResult.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'image-alt',
              nodeCount: 1,
            }),
          ])
        );

        await page.getByRole('button', { name: 'Create product' }).focus();
        await resetTrustedKeyboardFocus(page, binding);
        await page.keyboard.press('Tab');
        const focus = await observeTrustedKeyboard(page, binding, TARGET, [
          TARGET,
        ]);
        expect(focus).toMatchObject({
          observedTargetId: TARGET.targetId,
          focusVisible: true,
          focusContained: true,
          activated: false,
        });

        await armTrustedDynamicAnnouncement(page, binding, {
          trigger: TRIGGER_TARGET,
          announcement: ANNOUNCEMENT_TARGET,
          key: 'Enter',
          expectedTextDigest:
            createAccessibilityAnnouncementTextDigest('Product created'),
          settleMs: 1_000,
        });
        await page.keyboard.press('Enter');
        await expect(
          observeTrustedDynamicAnnouncement(page, binding)
        ).resolves.toMatchObject({
          triggerTargetId: TRIGGER_TARGET.targetId,
          announcementTargetId: ANNOUNCEMENT_TARGET.targetId,
          role: 'status',
          live: 'polite',
          beforeTextDigest: createAccessibilityAnnouncementTextDigest(''),
          afterTextDigest:
            createAccessibilityAnnouncementTextDigest('Product created'),
          outcome: 'matched',
        });

        await armTrustedKeyboardActivation(page, binding, TARGET);
        await page.keyboard.press('Enter');
        const activation = await observeTrustedKeyboard(page, binding, TARGET, [
          TARGET,
        ]);
        expect(activation).toMatchObject({
          observedTargetId: TARGET.targetId,
          focusContained: true,
          activated: true,
        });

        await armTrustedDynamicAnnouncement(page, binding, {
          trigger: TRIGGER_TARGET,
          announcement: ANNOUNCEMENT_TARGET,
          key: 'Enter',
          expectedTextDigest: createAccessibilityAnnouncementTextDigest(
            'Forged announcement'
          ),
          settleMs: 50,
        });
        await page.evaluate(() => {
          const trigger = document.getElementById('create-product')!;
          const status = document.getElementById('catalog-status')!;
          trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
          );
          status.replaceChildren('Forged announcement');
        });
        await expect(
          observeTrustedDynamicAnnouncement(page, binding)
        ).resolves.toMatchObject({
          outcome: 'untrusted-key',
          afterTextDigest: createAccessibilityAnnouncementTextDigest(
            'Forged announcement'
          ),
        });

        await armTrustedDynamicAnnouncement(page, binding, {
          trigger: TRIGGER_TARGET,
          announcement: ANNOUNCEMENT_TARGET,
          key: 'Enter',
          expectedTextDigest:
            createAccessibilityAnnouncementTextDigest('Never observed'),
          settleMs: 1_000,
        });
        await cleanupTrustedDynamicAnnouncement(page, binding);
        await expect(
          observeTrustedDynamicAnnouncement(page, binding)
        ).rejects.toThrow();
      } finally {
        await browser.close();
      }
    }, 30_000);
  }
});
