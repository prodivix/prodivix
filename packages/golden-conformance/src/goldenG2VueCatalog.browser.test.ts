import { expect as expectPage } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  createGoldenG2VueCatalogProjectedBundle,
  GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE,
} from './goldenG2VueCatalogFixture';
import { verifyGoldenBrowserProject } from './generatedProjectHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_PRODUCT === '1')(
  'Golden G2 authenticated Vue Catalog independent product Gate',
  () => {
    it('installs, typechecks, tests, builds and runs authenticated PIR/Route/Server/CRUD/Asset surfaces', async () => {
      const bundle = createGoldenG2VueCatalogProjectedBundle();
      const evidence = await verifyGoldenBrowserProject(bundle, {
        routePath: '/',
        browserChannel: process.env.E2E_BROWSER_CHANNEL,
        authSessionFixtureResponse: GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE,
        verifyPage: async (page) => {
          await expectPage(page.getByTestId('catalog-shell')).toBeVisible();
          const mountBox = await page.locator('#app').boundingBox();
          const shellBox = await page
            .getByTestId('catalog-shell')
            .boundingBox();
          expect(mountBox).not.toBeNull();
          expect(shellBox).not.toBeNull();
          if (!mountBox || !shellBox) {
            throw new Error('Generated Vue entry surface is not measurable.');
          }
          expect(shellBox.height).toBeGreaterThanOrEqual(mountBox.height - 1);
          await expectPage(page.getByTestId('catalog-main')).toBeVisible();
          await expectPage(page.getByTestId('catalog-sidebar-page')).toHaveText(
            'Featured products'
          );
          await expectPage(page.getByText('Catalog Shell')).toBeVisible();
          await expectPage(page.getByText('Catalog fallback')).toHaveCount(0);
          await expectPage(page.getByText('Sidebar fallback')).toHaveCount(0);
          await expectPage(
            page.getByRole('heading', { name: 'Authenticated Catalog' })
          ).toBeVisible();
          await expectPage(page.getByTestId('product-card')).toContainText(
            'Alpha'
          );
          await expectPage(
            page.locator('[data-prodivix-route-loader]')
          ).toHaveText(/prodivix-product-session/);
          await expectPage(
            page.locator('[data-prodivix-route-loader]')
          ).toHaveText(/golden-catalog-owner/);
          await expectPage(page.getByTestId('catalog-image')).toHaveJSProperty(
            'naturalWidth',
            1
          );

          await page.getByTestId('create-product').click();
          await expectPage(page.getByTestId('product-card')).toHaveCount(2);
          await expectPage(page.getByTestId('catalog')).toContainText('Beta');

          await page.getByTestId('update-product').click();
          await expectPage(page.getByTestId('catalog')).toContainText(
            'Beta Updated'
          );

          await page.getByTestId('delete-product').click();
          await expectPage(page.getByTestId('product-card')).toHaveCount(1);
          await expectPage(page.getByTestId('catalog')).toContainText('Alpha');
          await expectPage(page.getByTestId('catalog')).not.toContainText(
            'Beta Updated'
          );
        },
      });
      expect(evidence.completedCommands).toEqual([
        'install',
        'typecheck',
        'test',
        'build',
        'browser-smoke',
      ]);
      expect(evidence.bundleFileCount).toBe(bundle.files.length);
    }, 600_000);
  }
);
