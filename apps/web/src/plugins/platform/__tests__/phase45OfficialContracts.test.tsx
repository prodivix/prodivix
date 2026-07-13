import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  type CodegenPolicyContributionV1,
  PLUGIN_DIAGNOSTIC_CODES,
  type RenderPolicyContributionV1,
} from '@prodivix/plugin-contracts';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import {
  generateReactBundle,
  generateReactCode,
} from '@prodivix/prodivix-compiler';
import { PIRRenderer, resolveIconRef } from '@prodivix/pir-react-renderer';
import {
  createRendererProjectionRegistry,
  createWebPluginPlatform,
  type WebPluginPlatform,
} from '@/plugins/platform';
import {
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';
import {
  createNeutralOfficialHostCatalog,
  createNeutralOfficialPlugin,
  NEUTRAL_PACKAGE_DIGEST,
} from '@/plugins/platform/__tests__/neutralOfficialPlugin.fixture';

const platforms = new Set<WebPluginPlatform>();

const createPlatform = () => {
  const result = createWebPluginPlatform({
    workspaceId: `phase45-gate-${platforms.size + 1}`,
    officialHostModules: createNeutralOfficialHostCatalog(),
    integrityService: {
      digestSha256: async () => NEUTRAL_PACKAGE_DIGEST,
    },
  });
  if (result.ok === false) {
    throw new Error('Phase 4.5 fixture platform must initialize.');
  }
  platforms.add(result.value);
  return result.value;
};

const createButtonDocument = (): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name: 'NeutralFixture' },
  ui: {
    graph: {
      version: 1,
      rootId: 'neutral-button',
      nodesById: {
        'neutral-button': {
          id: 'neutral-button',
          type: 'NeutralButton',
          text: 'Launch',
        },
      },
      childIdsById: { 'neutral-button': [] },
    },
  },
});

const createIconDocument = (): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name: 'NeutralIconFixture' },
  ui: {
    graph: {
      version: 1,
      rootId: 'neutral-icon',
      nodesById: {
        'neutral-icon': {
          id: 'neutral-icon',
          type: 'PdxIcon',
          props: {
            iconRef: { provider: 'neutral-icons', name: 'Spark' },
            size: 24,
            color: '#123456',
          },
        },
      },
      childIdsById: { 'neutral-icon': [] },
    },
  },
});

afterEach(async () => {
  await Promise.all([...platforms].map((platform) => platform.shutdown()));
  platforms.clear();
});

describe('Phase 4.5 library-neutral gate', () => {
  it('rejects codegen imports without an exact external-library dependency', async () => {
    const platform = createPlatform();
    const plugin = createNeutralOfficialPlugin();
    const codegenContribution = plugin.contributions.find(
      (contribution) => contribution.point === 'codegenPolicy'
    );
    const descriptor = codegenContribution?.descriptor as unknown as
      CodegenPolicyContributionV1 | undefined;
    if (!descriptor) throw new Error('Fixture Codegen Policy must exist.');
    descriptor.rules[0]!.import.packageName = '@neutral-ui/missing';
    descriptor.dependencies.push({
      name: '@neutral-ui/missing',
      version: '1.0.0',
      kind: 'dependency',
      license: 'MIT',
    });

    const installed = await platform.runtime.packages.install(plugin);

    expect(installed.ok).toBe(false);
    expect(installed.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE
    );
    expect(platform.runtime.packages.contributions.getRevision()).toBe(0);
  });

  it('rejects cross-point runtime references before any resolver publishes', async () => {
    const platform = createPlatform();
    const plugin = createNeutralOfficialPlugin();
    const renderContribution = plugin.contributions.find(
      (contribution) => contribution.point === 'renderPolicy'
    );
    const descriptor = renderContribution?.descriptor as unknown as
      RenderPolicyContributionV1 | undefined;
    if (!descriptor) throw new Error('Fixture Render Policy must exist.');
    descriptor.rules[0]!.runtimeType = 'UnknownNeutralButton';

    const installed = await platform.runtime.packages.install(plugin);

    expect(installed.ok).toBe(false);
    expect(installed.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE
    );
    expect(platform.runtime.packages.contributions.getRevision()).toBe(0);
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
  });

  it('completes Palette -> Canvas -> React export without a library-specific Host branch', async () => {
    const platform = createPlatform();
    const installed = await platform.runtime.packages.install(
      createNeutralOfficialPlugin()
    );

    expect(installed.ok).toBe(true);
    expect(platform.queries.palette.getItemById('neutral-button')?.name).toBe(
      'Neutral Button'
    );

    const extensions = platform.queries.extensions.getSnapshot();
    const registry = createRendererProjectionRegistry(extensions);
    render(
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <PIRRenderer pirDoc={createButtonDocument()} registry={registry} />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Launch' })).toBeTruthy();

    const bundle = generateReactBundle(createButtonDocument(), {
      codegenPolicySnapshot: extensions.codegenPolicy,
    });
    const app = bundle.files.find((file) => file.path === 'src/App.tsx');
    expect(app?.contents).toContain(
      "import { Button } from '@neutral-ui/components';"
    );
    expect(app?.contents).toContain('<Button label="Launch" />');
    expect(bundle.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '@neutral-ui/components',
          version: '1.2.3',
          origin: expect.objectContaining({ license: 'MIT' }),
        }),
      ])
    );

    const ResolvedIcon = resolveIconRef({
      provider: 'neutral-icons',
      name: 'Spark',
    });
    expect(ResolvedIcon).not.toBeNull();
    if (!ResolvedIcon) throw new Error('Fixture icon must resolve.');
    const SolidIcon = resolveIconRef({
      provider: 'neutral-icons',
      name: 'Spark',
      variant: 'solid',
    });
    if (!SolidIcon) throw new Error('Fixture solid icon must resolve.');
    render(
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <ResolvedIcon size={24} color="#123456" />
            <SolidIcon size={20} color="#654321" />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );
    expect(screen.getByLabelText('outline spark 24 #123456')).toBeTruthy();
    expect(screen.getByLabelText('solid spark 20 #654321')).toBeTruthy();
    const iconCode = generateReactCode(createIconDocument(), {
      resourceType: 'component',
      codegenPolicySnapshot: extensions.codegenPolicy,
    });
    expect(iconCode).toContain(
      "import { SparkIcon } from '@neutral-ui/icons/outline';"
    );
    expect(iconCode).toContain('<SparkIcon dimension={24} tone="#123456" />');
    expect(iconCode).not.toContain('iconRef');
  });

  it('removes every resolved projection and lease on disable', async () => {
    const platform = createPlatform();
    const installed = await platform.runtime.packages.install(
      createNeutralOfficialPlugin()
    );
    expect(installed.ok).toBe(true);
    expect(platform.listOfficialImplementationBindings()).toHaveLength(2);

    const disabled = await platform.runtime.packages.disable(
      '@prodivix/plugin-neutral-fixture'
    );

    expect(disabled.ok).toBe(true);
    expect(
      platform.queries.palette.getItemById('neutral-button')
    ).toBeUndefined();
    const snapshot = platform.queries.extensions.getSnapshot();
    expect(snapshot.externalLibraries).toEqual([]);
    expect(snapshot.rendererComponents).toEqual([]);
    expect(snapshot.iconProviders).toEqual([]);
    expect(snapshot.codegenPolicy.libraries).toEqual([]);
    expect(snapshot.codegenPolicy.iconProviders).toEqual([]);
    expect(
      resolveIconRef({ provider: 'neutral-icons', name: 'Spark' })
    ).toBeNull();
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
  });

  it('rejects host-overlay policies without an attested wrapper', async () => {
    const platform = createPlatform();
    const plugin = createNeutralOfficialPlugin();
    const renderContribution = plugin.contributions.find(
      (contribution) => contribution.point === 'renderPolicy'
    );
    const descriptor = renderContribution?.descriptor as unknown as
      RenderPolicyContributionV1 | undefined;
    if (!descriptor) throw new Error('Fixture Render Policy must exist.');
    descriptor.rules[0]!.portal = { mode: 'host-overlay' };
    descriptor.rules[0]!.hostImplementationId = 'neutral.render';

    const installed = await platform.runtime.packages.install(plugin);

    expect(installed.ok).toBe(false);
    expect(installed.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED
    );
    expect(platform.runtime.packages.contributions.getRevision()).toBe(0);
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
  });
});
