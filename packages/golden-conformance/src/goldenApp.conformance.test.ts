import { describe, expect, it } from 'vitest';
import {
  GOLDEN_CODEGEN_POLICY,
  GOLDEN_OFFICIAL_PLUGIN_EVIDENCE,
} from './goldenApp.fixture';
import { runGoldenConformance } from './goldenScenario';

describe('Prodivix Golden App conformance', () => {
  it('reproduces create, edit, save, recovery, conflict, export, and build', async () => {
    const report = await runGoldenConformance();

    expect(report.authoring).toMatchObject({
      createdDocumentCount: 6,
      routeCount: 4,
      undoRestoredCreatedState: true,
      redoRestoredEditedState: true,
    });
    expect(report.save.creationOperationId).toBe('golden-create-workspace');
    expect(report.save.editOperationId).toBe('golden-edit-checkout');
    expect(report.save.creationRequest).toMatchObject({
      expected: {
        workspaceRev: 1,
        routeRev: 1,
      },
    });
    expect(report.save.editRequest.expected).toMatchObject({
      documents: [
        { id: 'code-checkout-handler', contentRev: 1 },
        { id: 'page-checkout', contentRev: 1 },
      ],
    });
    expect(report.recovery).toEqual({
      pendingReplayRecovered: true,
      acknowledgedReplaySkipped: true,
      replacementKeptCausalHead: true,
    });
    expect(report.conflict.conflictCount).toBeGreaterThan(0);
    expect(report.conflict).toMatchObject({
      resolutionOperationId: 'zz-golden-conflict-resolution',
      selectedSource: 'local',
    });
    expect(report.program.target).toEqual({
      framework: 'react',
      preset: 'vite',
    });
    expect(report.program.entryModuleId).toBe('workspace-react-entry');
    expect(report.program.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'workspace-react-entry',
        'pir-react:page-home',
        'pir-react:page-checkout',
        'pir-react:component-order-summary',
      ])
    );
    expect(
      report.program.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error'
      )
    ).toEqual([]);

    const blockingDiagnostics = report.bundle.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error'
    );
    expect(blockingDiagnostics).toEqual([]);
    expect(report.bundle.metadata?.exportBlocked).toBe(false);
    expect(
      report.bundle.metadata?.routeTopology?.routes.map((route) => route.path)
    ).toEqual(
      expect.arrayContaining([
        '/',
        '/checkout',
        '/order-summary',
        '/order-summary-preview',
      ])
    );
    const reusedComponentRoutes = report.bundle.metadata?.routeTopology?.routes
      .filter((route) => route.pageDocId === 'component-order-summary')
      .map((route) => route.path)
      .sort();
    expect(reusedComponentRoutes).toEqual([
      '/order-summary',
      '/order-summary-preview',
    ]);
    expect(report.bundle.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'antd',
        version: '5.28.0',
      })
    );
    expect(GOLDEN_OFFICIAL_PLUGIN_EVIDENCE).toMatchObject({
      contributionId: 'antd.react-codegen',
      resourcePath: 'plugin/contributions/codegen-policy.json',
    });
    expect(GOLDEN_OFFICIAL_PLUGIN_EVIDENCE.packageDigest).toMatch(/^sha256-/);
    expect(GOLDEN_CODEGEN_POLICY.libraries[0]?.source).toMatchObject({
      pluginId: '@prodivix/plugin-antd',
      contributionId: 'antd.react-codegen',
    });

    const filePaths = report.bundle.files.map((file) => file.path);
    expect(filePaths).toEqual(
      expect.arrayContaining([
        'src/App.tsx',
        'src/components/page-home/GoldenHome.tsx',
        'src/components/page-checkout/GoldenCheckout.tsx',
        'src/components/component-order-summary/GoldenOrderSummary.tsx',
        'src/actions/checkout.ts',
        'src/styles/checkout.css',
        'public/logo.svg',
        'config/golden.json',
        '.prodivix/routes.json',
        '.prodivix/export-manifest.json',
      ])
    );
    const app = report.bundle.files.find((file) => file.path === 'src/App.tsx');
    const appSource = String(app?.contents);
    expect(appSource).toContain('workspaceDocumentComponents');
    expect(appSource).toContain('submitCheckout');
    expect(appSource).toContain('"/checkout"');
    expect(appSource.match(/import GoldenOrderSummary\b/g)).toHaveLength(1);
    expect(appSource.match(/Component: GoldenOrderSummary\b/g)).toHaveLength(2);
    expect(
      appSource.match(/"component-order-summary": GoldenOrderSummary,/g)
    ).toHaveLength(1);
    const sharedComponentModules = report.bundle.files.filter((file) =>
      file.path.endsWith('/GoldenOrderSummary.tsx')
    );
    expect(sharedComponentModules).toHaveLength(1);
    const checkout = report.bundle.files.find(
      (file) => file.path === 'src/components/page-checkout/GoldenCheckout.tsx'
    );
    expect(String(checkout?.contents)).toContain("from 'antd'");
    expect(String(checkout?.contents)).toContain('<form');
    expect(String(checkout?.contents)).toContain('"type": "email"');
    expect(String(checkout?.contents)).toContain('"type": "primary"');
    expect(String(checkout?.contents)).toContain('__pdxRenderValue("Pay now")');
    const workspaceCss = report.bundle.files.find(
      (file) => file.path === 'src/styles/checkout.css'
    );
    expect(String(workspaceCss?.contents)).toContain(
      '.golden-checkout { display: grid;'
    );
    const logo = report.bundle.files.find(
      (file) => file.path === 'public/logo.svg'
    );
    expect(String(logo?.contents)).toContain('<svg');
    const projectConfig = report.bundle.files.find(
      (file) => file.path === 'config/golden.json'
    );
    expect(JSON.parse(String(projectConfig?.contents))).toMatchObject({
      target: 'react-vite',
      features: ['routes', 'forms', 'plugins', 'resources'],
    });
    expect(report.build.bundleFileCount).toBe(report.bundle.files.length);
    expect(report.build.transformedModuleCount).toBe(
      report.bundle.files.filter(
        (file) =>
          typeof file.contents === 'string' &&
          /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file.path)
      ).length
    );
    expect(report.build.emittedFileCount).toBeGreaterThan(0);
  });
});
