import { createHash } from 'node:crypto';
import { expect as expectPage, type Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  createGoldenG3CompositionReactBundle,
  createGoldenG3CompositionVueBundle,
  GOLDEN_G3_COMPOSITION_IDS,
  runGoldenG3BehaviorCompositionSurface,
  runGoldenG3OptimisticConflictJourney,
  type GoldenG3BehaviorCompositionMotionMode,
} from './goldenG3BehaviorCompositionFixture';
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

const verifyTarget = async (
  framework: 'react' | 'vue',
  bundle: GoldenGeneratedProjectBundle
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
  const evidence = await verifyGoldenBrowserProject(bundle, {
    routePath: '/',
    browserChannel: process.env.E2E_BROWSER_CHANNEL,
    preparePage: async (page, projectUrl) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(projectUrl, { waitUntil: 'networkidle' });
    },
    verifyPage: async (page) => {
      for (const motionMode of ['full', 'reduced'] as const) {
        await page.emulateMedia({
          reducedMotion: motionMode === 'reduced' ? 'reduce' : 'no-preference',
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
        expect(await page.locator('[aria-hidden="true"] :focus').count()).toBe(
          0
        );
        expect(
          await page.locator('button:visible:not(:disabled)').count()
        ).toBeGreaterThan(0);
        accessibilitySnapshots.set(
          motionMode,
          await page.locator('body').ariaSnapshot()
        );
        visualSignatures.set(motionMode, await captureVisualSignature(page));

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
        semanticDigests.set(
          motionMode,
          semantic.evidence.animation.programDigest
        );
        screenshots.set(
          motionMode,
          await page.screenshot({
            animations: 'disabled',
            fullPage: true,
          })
        );
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
  });
};

describe.runIf(process.env.PRODIVIX_VERIFY_G3_V2_GOLDEN === '1')(
  'Golden G3 V2 React/Vue full/reduced browser closure',
  () => {
    it('keeps behavior, visual output, focus, and operability compatible across targets', async () => {
      const [react, vue, optimistic] = await Promise.all([
        verifyTarget('react', createGoldenG3CompositionReactBundle()),
        verifyTarget('vue', createGoldenG3CompositionVueBundle()),
        runGoldenG3OptimisticConflictJourney(),
      ]);
      expect(react.evidence.completedCommands).toContain('browser-smoke');
      expect(vue.evidence.completedCommands).toContain('browser-smoke');
      expect(react.visualSignatures).toEqual(vue.visualSignatures);
      expect(react.accessibilitySnapshots).toEqual(vue.accessibilitySnapshots);
      expect(react.screenshotHashes.full).toBe(react.screenshotHashes.reduced);
      expect(vue.screenshotHashes.full).toBe(vue.screenshotHashes.reduced);
      expect(react.screenshotHashes.full).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(vue.screenshotHashes.full).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(react.semanticDigests.full).not.toBe(
        react.semanticDigests.reduced
      );
      expect(vue.semanticDigests).toEqual(react.semanticDigests);
      expect(optimistic).toMatchObject({
        staleRollback: 'rollback-skipped',
        rollback: 'rolled-back',
        retry: 'committed',
        conflictCode: 'DATA_OPTIMISTIC_CONFLICT',
      });
    }, 900_000);
  }
);
