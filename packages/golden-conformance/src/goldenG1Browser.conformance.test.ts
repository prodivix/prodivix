import { expect as expectPage } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { generateWorkspaceReactViteBundle } from '@prodivix/prodivix-compiler';
import { GOLDEN_CODEGEN_POLICY } from './goldenApp.fixture';
import {
  authorGoldenG1Workspace,
  GOLDEN_G1_DEFAULT_DEFINITION_TEXT,
  GOLDEN_G1_INSTANCE_LABELS,
} from './goldenG1Scenario';
import { verifyGoldenBrowserProject } from './generatedProjectHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G1_BROWSER === '1')(
  'Prodivix Golden G1 browser conformance',
  () => {
    it('runs the standalone export and proves WebGL2 and WebGPU availability', async () => {
      const authored = authorGoldenG1Workspace();
      const bundle = generateWorkspaceReactViteBundle(authored.workspace, {
        projectName: 'Prodivix Golden G1 App',
        codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
        packageResolver: { strategy: 'npm' },
      });

      expect(
        bundle.diagnostics.filter(({ severity }) => severity === 'error')
      ).toEqual([]);

      const evidence = await verifyGoldenBrowserProject(bundle, {
        routePath: '/checkout',
        browserChannel: process.env.E2E_BROWSER_CHANNEL,
        verifyPage: async (page) => {
          await expectPage(page.locator('#root')).not.toBeEmpty();
          await expectPage(
            page.locator('[data-prodivix-route-not-found="true"]')
          ).toHaveCount(0);
          await expectPage(
            page.getByRole('heading', { name: 'Checkout' })
          ).toBeVisible();
          for (const label of Object.values(GOLDEN_G1_INSTANCE_LABELS)) {
            await expectPage(
              page.getByText(label, { exact: true }).first()
            ).toBeVisible();
          }
          await expectPage(
            page
              .getByText(GOLDEN_G1_DEFAULT_DEFINITION_TEXT, {
                exact: true,
              })
              .first()
          ).toBeVisible();

          const email = page.locator('input[type="email"]').first();
          await expectPage(email).toBeVisible();
          await email.fill('browser-gate@prodivix.dev');
          await expectPage(email).toHaveValue('browser-gate@prodivix.dev');

          await page.evaluate(() => {
            window.history.pushState({}, '', '/missing-golden-route');
            window.dispatchEvent(new PopStateEvent('popstate'));
          });
          await expectPage(
            page.locator('[data-prodivix-route-not-found="true"]')
          ).toContainText('Route not found.');
          await page.evaluate(() => {
            window.history.pushState({}, '', '/checkout');
            window.dispatchEvent(new PopStateEvent('popstate'));
          });
          await expectPage(
            page.getByRole('heading', { name: 'Checkout' })
          ).toBeVisible();
        },
      });

      expect(evidence).toMatchObject({
        bundleFileCount: bundle.files.length,
        completedCommands: [
          'install',
          'typecheck',
          'test',
          'build',
          'browser-smoke',
        ],
        browserChannel: process.env.E2E_BROWSER_CHANNEL?.trim() || 'chrome',
        routePath: '/checkout',
        gpu: {
          secureContext: true,
          webgl2: { available: true, shaderCompiled: true },
          webgpu: {
            apiAvailable: true,
            adapterAvailable: true,
            deviceAvailable: true,
            shaderCompiled: true,
          },
        },
      });
      expect(evidence.browserVersion).toMatch(/^\d+\./);
    }, 600_000);
  }
);
