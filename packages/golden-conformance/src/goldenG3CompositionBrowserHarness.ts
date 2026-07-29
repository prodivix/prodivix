import { createHash } from 'node:crypto';
import { expect as expectPage, type Page } from '@playwright/test';
import { expect } from 'vitest';
import {
  GOLDEN_G3_COMPOSITION_IDS,
  runGoldenG3BehaviorCompositionSurface,
  type GoldenG3BehaviorCompositionMotionMode,
} from './goldenG3BehaviorCompositionFixture';
import { GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE } from './goldenG2VueCatalogFixture';
import {
  verifyGoldenBrowserProject,
  type GoldenGeneratedProjectBundle,
} from './generatedProjectHarness';

const hash = (contents: Buffer): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const captureVisualSignature = (page: Page) =>
  page.evaluate(() => {
    const requiredElement = (selector: string): Element => {
      const element = document.querySelector(selector);
      if (!element)
        throw new Error(`Missing Golden visual target: ${selector}`);
      return element;
    };
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      const stable = (value: number) => Math.round(value * 1_000) / 1_000;
      return {
        x: stable(bounds.x),
        y: stable(bounds.y),
        width: stable(bounds.width),
        height: stable(bounds.height),
      };
    };
    const style = (element: Element) => {
      const computed = getComputedStyle(element);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
      };
    };
    const heading = requiredElement('h1');
    const createButton = requiredElement('[data-testid="create-product"]');
    const productCards = Array.from(
      document.querySelectorAll('[data-testid="product-card"]')
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      text: document.body.innerText.replace(/\s+/gu, ' ').trim(),
      heading: { rect: rect(heading), style: style(heading) },
      createButton: { rect: rect(createButton), style: style(createButton) },
      productCards: productCards.map((element) => ({
        text: element.textContent?.trim() ?? '',
        rect: rect(element),
        style: style(element),
      })),
    };
  });

export const verifyGoldenG3CompositionBrowserTarget = async (
  framework: 'react' | 'vue',
  bundle: GoldenGeneratedProjectBundle,
  repeatCount = 1
) => {
  const screenshots = new Map<GoldenG3BehaviorCompositionMotionMode, Buffer>();
  const accessibilitySnapshots = new Map<
    GoldenG3BehaviorCompositionMotionMode,
    string
  >();
  const visualSignatures = new Map<
    GoldenG3BehaviorCompositionMotionMode,
    Awaited<ReturnType<typeof captureVisualSignature>>
  >();
  const semanticDigests = new Map<
    GoldenG3BehaviorCompositionMotionMode,
    string
  >();
  const repeatDigests = new Map<
    GoldenG3BehaviorCompositionMotionMode,
    string[]
  >();
  const evidence = await verifyGoldenBrowserProject(bundle, {
    routePath: '/',
    browserChannel: process.env.E2E_BROWSER_CHANNEL,
    authSessionFixtureResponse: GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE,
    preparePage: async (page, projectUrl) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(projectUrl, { waitUntil: 'networkidle' });
    },
    verifyPage: async (page) => {
      for (const motionMode of ['full', 'reduced'] as const) {
        const motionRepeatDigests: string[] = [];
        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
          await page.emulateMedia({
            reducedMotion:
              motionMode === 'reduced' ? 'reduce' : 'no-preference',
            colorScheme: 'light',
          });
          await page.reload({ waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          await expectPage(
            page.getByRole('heading', { name: 'Authenticated Catalog' })
          ).toBeVisible();
          const createProduct = page.getByTestId('create-product');
          await createProduct.focus();
          await expectPage(createProduct).toBeFocused();
          await createProduct.click();
          await expectPage(page.getByTestId('product-card')).toHaveCount(2);
          await expectPage(page.getByText('Beta')).toBeVisible();
          expect(
            await page.locator('[aria-hidden="true"] :focus').count()
          ).toBe(0);
          expect(
            await page.locator('button:visible:not(:disabled)').count()
          ).toBeGreaterThan(0);
          const accessibility = await page.locator('body').ariaSnapshot();
          const visual = await captureVisualSignature(page);
          const semantic = await runGoldenG3BehaviorCompositionSurface(
            'preview',
            motionMode
          );
          expect(semantic.result.status).toBe('completed');
          expect(
            semantic.evidence.animation.result.observations
              .filter(({ kind }) => kind === 'marker-reached')
              .map(({ markerId }) => markerId)
          ).toEqual([GOLDEN_G3_COMPOSITION_IDS.marker]);
          const semanticDigest = semantic.evidence.animation.programDigest;
          const screenshot = await page.screenshot({
            animations: 'disabled',
            fullPage: true,
          });
          motionRepeatDigests.push(
            hash(
              Buffer.from(
                JSON.stringify({
                  accessibility,
                  visual,
                  semanticDigest,
                  screenshotDigest: hash(screenshot),
                })
              )
            )
          );
          accessibilitySnapshots.set(motionMode, accessibility);
          visualSignatures.set(motionMode, visual);
          semanticDigests.set(motionMode, semanticDigest);
          screenshots.set(motionMode, screenshot);
        }
        repeatDigests.set(motionMode, motionRepeatDigests);
      }
    },
  });
  const full = screenshots.get('full');
  const reduced = screenshots.get('reduced');
  if (!full || !reduced) {
    throw new Error(`${framework} did not produce both motion screenshots.`);
  }
  return Object.freeze({
    evidence,
    framework,
    screenshotHashes: Object.freeze({
      full: hash(full),
      reduced: hash(reduced),
    }),
    screenshots: Object.freeze({ full, reduced }),
    accessibilitySnapshots: Object.freeze({
      full: accessibilitySnapshots.get('full'),
      reduced: accessibilitySnapshots.get('reduced'),
    }),
    visualSignatures: Object.freeze({
      full: visualSignatures.get('full'),
      reduced: visualSignatures.get('reduced'),
    }),
    semanticDigests: Object.freeze({
      full: semanticDigests.get('full'),
      reduced: semanticDigests.get('reduced'),
    }),
    repeatDigests: Object.freeze({
      full: Object.freeze(repeatDigests.get('full') ?? []),
      reduced: Object.freeze(repeatDigests.get('reduced') ?? []),
    }),
  });
};
