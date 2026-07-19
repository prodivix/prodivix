import { expect as expectPage } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { createGoldenG2VueCatalogProjectedBundle } from './goldenG2VueCatalogFixture';
import { verifyGoldenBrowserProject } from './generatedProjectHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_PRODUCT === '1')(
  'Golden G2 authenticated Vue Catalog independent product Gate',
  () => {
    it('installs, typechecks, tests, builds and runs authenticated PIR/Route/Server/CRUD/Asset surfaces', async () => {
      const bundle = createGoldenG2VueCatalogProjectedBundle();
      const evidence = await verifyGoldenBrowserProject(bundle, {
        routePath: '/',
        browserChannel: process.env.E2E_BROWSER_CHANNEL,
        verifyPage: async (page) => {
          await expectPage(page.getByTestId('catalog-shell')).toBeVisible();
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
          ).toHaveText(/Golden Owner/);
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
