import { describe, expect, it } from 'vitest';
import { generateWorkspaceReactViteBundle } from '@prodivix/prodivix-compiler';
import {
  GOLDEN_ASSET_MATERIALIZATIONS,
  GOLDEN_CODEGEN_POLICY,
} from './goldenApp.fixture';
import { authorGoldenG1Workspace, GOLDEN_G1_IDS } from './goldenG1Scenario';
import { verifyGoldenStandaloneProject } from './generatedProjectHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G1_STANDALONE === '1')(
  'Prodivix Golden G1 standalone export conformance',
  () => {
    it('installs, typechecks, tests and builds the generated React/Vite package', async () => {
      const authored = authorGoldenG1Workspace();
      const bundle = generateWorkspaceReactViteBundle(authored.workspace, {
        projectName: 'Prodivix Golden G1 App',
        codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
        assetMaterializations: GOLDEN_ASSET_MATERIALIZATIONS,
        packageResolver: { strategy: 'npm' },
      });

      expect(
        bundle.diagnostics.filter(({ severity }) => severity === 'error')
      ).toEqual([]);
      expect(
        bundle.files.some(({ sourceTrace }) =>
          sourceTrace.some(
            ({ sourceRef }) =>
              sourceRef.id === GOLDEN_G1_IDS.controlledJsxDocument
          )
        )
      ).toBe(true);
      expect(
        bundle.files.some(({ sourceTrace }) =>
          sourceTrace.some(
            ({ sourceRef }) =>
              sourceRef.id === GOLDEN_G1_IDS.controlledCssDocument
          )
        )
      ).toBe(true);

      const evidence = await verifyGoldenStandaloneProject(bundle);
      expect(evidence).toMatchObject({
        bundleFileCount: bundle.files.length,
        completedCommands: ['install', 'typecheck', 'test', 'build'],
      });
      const packageFile = bundle.files.find(
        ({ path }) => path === 'package.json'
      );
      const packageManager = JSON.parse(String(packageFile?.contents)) as {
        packageManager: string;
      };
      expect(evidence.packageManager).toBe(packageManager.packageManager);
    }, 600_000);
  }
);
