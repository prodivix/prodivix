import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PLUGIN_DIAGNOSTIC_CODES } from '@prodivix/plugin-contracts';
import { generateReactBundle } from '@prodivix/prodivix-compiler';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import { createPaletteContributionDescriptor } from '@/editor/features/blueprint/palette';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';
import {
  createRendererProjectionRegistry,
  createWebPluginPlatform,
  installNativeCorePlugin,
  type OfficialHostModuleCatalogEntry,
  type WebPluginPlatform,
} from '@/plugins/platform';
import {
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';
import {
  createNeutralOfficialHostCatalog,
  createNeutralOfficialArtifact,
  createNeutralOfficialPlugin,
  NEUTRAL_OFFICIAL_HOST_MODULE,
  NEUTRAL_PACKAGE_DIGEST,
} from '@/plugins/platform/__tests__/neutralOfficialPlugin.fixture';

const platforms = new Set<WebPluginPlatform>();

const createDeferred = () => {
  let resolve!: (value: void | PromiseLike<void>) => void;
  const promise = new Promise<void>((currentResolve) => {
    resolve = currentResolve;
  });
  return Object.freeze({ promise, resolve });
};

const createSurfaceResolverPlugin = (
  point: 'paletteContribution' | 'renderPolicy'
) => {
  const plugin = createNeutralOfficialPlugin();
  if (point === 'renderPolicy') {
    return {
      ...plugin,
      contributions: plugin.contributions.filter(
        (contribution) =>
          contribution.point === 'externalLibrary' ||
          contribution.point === 'renderPolicy'
      ),
    };
  }
  const palette = plugin.contributions.find(
    (contribution) => contribution.point === 'paletteContribution'
  );
  if (!palette || palette.point !== 'paletteContribution') {
    throw new Error('Neutral fixture Palette contribution is missing.');
  }
  return {
    ...plugin,
    contributions: [
      {
        ...palette,
        descriptor: {
          ...palette.descriptor,
          groups: palette.descriptor.groups.map((group) => ({
            ...group,
            items: group.items.map((item) => ({
              ...item,
              runtimeType: 'NeutralButton',
            })),
          })),
        },
      },
    ],
  };
};

const createPlatform = (
  officialHostModules: readonly OfficialHostModuleCatalogEntry[] = createNeutralOfficialHostCatalog()
) => {
  const result = createWebPluginPlatform({
    workspaceId: `web-platform-test-${platforms.size + 1}`,
    officialHostModules,
    integrityService: {
      digestSha256: async () => NEUTRAL_PACKAGE_DIGEST,
    },
  });
  if (result.ok === false) {
    throw new Error('Web Plugin Platform test instance must initialize.');
  }
  platforms.add(result.value);
  return result.value;
};

const createGroup = (
  groupId: string,
  itemId: string,
  label: string
): ComponentGroup => ({
  id: groupId,
  title: `${label} Group`,
  source: 'builtIn',
  items: [
    {
      id: itemId,
      name: label,
      runtimeType: 'TestComponent',
      preview: <span>{label}</span>,
      defaultProps: { label },
    },
  ],
});

const registerGroup = (
  platform: WebPluginPlatform,
  pluginId: string,
  group: ComponentGroup,
  version = '1.0.0'
) =>
  platform.runtime.paletteContributions.install({
    pluginId,
    displayName: `${group.title} Test`,
    version,
    installationId: `test:${pluginId}`,
    contributionId: 'test.palette',
    descriptor: createPaletteContributionDescriptor([group]),
    groups: [group],
    order: 500,
  });

afterEach(async () => {
  await Promise.all([...platforms].map((platform) => platform.shutdown()));
  platforms.clear();
});

describe('workspace Web Plugin Platform', () => {
  it('publishes the native catalog through the workspace Host', async () => {
    const platform = createPlatform();
    const result = await installNativeCorePlugin(
      platform.runtime.paletteContributions
    );

    expect(result.ok).toBe(true);
    expect(platform.queries.palette.getItemById('button')?.name).toBe('Button');
    expect(
      platform.queries.palette.getItemById('radix-dialog')
    ).toBeUndefined();
  });

  it('publishes and removes a trusted resolved contribution', async () => {
    const platform = createPlatform();
    const pluginId = '@prodivix/test.palette.publish';
    const group = createGroup(
      'test-publish-group',
      'test-publish-item',
      'Published'
    );

    const registered = await registerGroup(platform, pluginId, group);

    expect(registered.ok).toBe(true);
    expect(
      platform.queries.palette.getItemById('test-publish-item')?.name
    ).toBe('Published');
    expect(
      platform.queries.palette
        .getSnapshot()
        .groups.some((candidate) => candidate.id === 'test-publish-group')
    ).toBe(true);

    const disabled =
      await platform.runtime.paletteContributions.disable(pluginId);

    expect(disabled.ok).toBe(true);
    expect(
      platform.queries.palette.getItemById('test-publish-item')
    ).toBeUndefined();
  });

  it('atomically replaces a contribution from the same owner identity', async () => {
    const platform = createPlatform();
    const pluginId = '@prodivix/test.palette.replace';
    const first = createGroup(
      'test-replace-group',
      'test-replace-item',
      'First'
    );
    const second = createGroup(
      'test-replace-group',
      'test-replace-item',
      'Second'
    );

    const firstResult = await registerGroup(platform, pluginId, first, '1.0.0');
    const secondResult = await registerGroup(
      platform,
      pluginId,
      second,
      '1.1.0'
    );

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(secondResult.ok && secondResult.value.generation).toBe(2);
    expect(
      platform.queries.palette.getItemById('test-replace-item')?.name
    ).toBe('Second');
    expect(
      platform.queries.palette
        .getSnapshot()
        .groups.filter((candidate) => candidate.id === 'test-replace-group')
    ).toHaveLength(1);
  });

  it('rejects cross-owner palette ids without overwriting the first owner', async () => {
    const platform = createPlatform();
    const first = createGroup(
      'test-conflict-group',
      'test-conflict-item',
      'Owner A'
    );
    const second = createGroup(
      'test-conflict-group',
      'test-conflict-item',
      'Owner B'
    );

    const firstResult = await registerGroup(
      platform,
      '@prodivix/test.palette.owner-a',
      first
    );
    const secondResult = await registerGroup(
      platform,
      '@prodivix/test.palette.owner-b',
      second
    );

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(false);
    expect(secondResult.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT
    );
    expect(
      platform.queries.palette.getItemById('test-conflict-item')?.name
    ).toBe('Owner A');
  });

  it('rejects non-JSON default props before Host discovery', async () => {
    const platform = createPlatform();
    const group = createGroup(
      'test-invalid-group',
      'test-invalid-item',
      'Invalid'
    );
    group.items[0]!.defaultProps = { onClick: () => undefined };

    const result = await registerGroup(
      platform,
      '@prodivix/test.palette.invalid',
      group
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe(
      PLUGIN_DIAGNOSTIC_CODES.NON_JSON_VALUE
    );
    expect(
      platform.queries.palette.getItemById('test-invalid-item')
    ).toBeUndefined();
  });

  it('publishes all contribution points in one registry transaction', async () => {
    const platform = createPlatform();
    const committedBatches: string[][] = [];
    const subscription = platform.runtime.packages.contributions.subscribe(
      (event) => {
        committedBatches.push(event.added.map((record) => record.point));
      }
    );
    const result = await platform.runtime.packages.install(
      createNeutralOfficialPlugin({
        label: 'Multi-point',
        groupId: 'test-multi-point-group',
        itemId: 'test-multi-point-item',
      })
    );

    subscription.dispose();
    expect(result.ok).toBe(true);
    expect(committedBatches).toEqual([
      [
        'externalLibrary',
        'paletteContribution',
        'renderPolicy',
        'blueprintTemplate',
        'codegenPolicy',
        'iconProvider',
      ],
    ]);
    expect(
      platform.runtime.packages.contributions.list('renderPolicy')
    ).toHaveLength(1);
    expect(
      platform.queries.palette.getItemById('test-multi-point-item')?.name
    ).toBe('Multi-point Button');
    const owners = [
      ...platform.runtime.packages.contributions.list('paletteContribution'),
      ...platform.runtime.packages.contributions.list('externalLibrary'),
      ...platform.runtime.packages.contributions.list('renderPolicy'),
      ...platform.runtime.packages.contributions.list('blueprintTemplate'),
      ...platform.runtime.packages.contributions.list('codegenPolicy'),
      ...platform.runtime.packages.contributions.list('iconProvider'),
    ].map((record) => record.owner);
    expect(new Set(owners.map((owner) => owner.generation))).toEqual(
      new Set([1])
    );
    expect(new Set(owners.map((owner) => owner.installationId))).toEqual(
      new Set(['fixture:@prodivix/plugin-neutral-fixture'])
    );
    expect(platform.queries.extensions.getSnapshot().revision).toBe(
      platform.queries.palette.getSnapshot().revision
    );
  });

  it('completes the six-point bundled artifact gate through Canvas and export', async () => {
    const fixture = await createNeutralOfficialArtifact();
    const platform = createPlatform(fixture.hostCatalog);
    const committedBatches: string[][] = [];
    const subscription = platform.runtime.packages.contributions.subscribe(
      (event) =>
        committedBatches.push(event.added.map((record) => record.point))
    );

    const result = await platform.runtime.packages.installBundled(
      fixture.artifact,
      {
        installationId: 'fixture:neutral-resource-package',
        sourceId: 'fixture:neutral-resource-source',
        trustLevel: 'official',
        publisherVerified: true,
      }
    );

    subscription.dispose();
    expect(result.ok).toBe(true);
    expect(fixture.hostCatalog).toHaveLength(1);
    expect(fixture.hostCatalog[0]?.packageDigest).toBe(
      fixture.artifact.packageDigest
    );
    expect(committedBatches).toEqual([
      [
        'externalLibrary',
        'paletteContribution',
        'renderPolicy',
        'blueprintTemplate',
        'codegenPolicy',
        'iconProvider',
      ],
    ]);
    expect(
      platform.queries.palette.getCreationRecipe('neutral-button')?.kind
    ).toBe('template');
    const document: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'Resource Fixture' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: { root: { id: 'root', type: 'PdxDiv' } },
          childIdsById: { root: [] },
        },
      },
    };
    const inserted = applyPaletteItemInsertion(
      document,
      platform.queries.palette,
      {
        workspaceId: 'workspace-resource-fixture',
        documentId: 'document-resource-fixture',
        itemId: 'neutral-button',
        preferredTargetId: 'root',
        commandId: 'command-resource-fixture',
        issuedAt: '2026-07-11T00:00:00.000Z',
      }
    );
    expect(inserted.ok).toBe(true);
    expect(
      inserted.ok && inserted.doc.ui.graph.nodesById[inserted.nextNodeId]
    ).toMatchObject({
      type: 'NeutralButton',
      props: { label: 'Neutral Button', tone: 'default' },
    });
    if (!inserted.ok) return;
    const extensions = platform.queries.extensions.getSnapshot();
    const registry = createRendererProjectionRegistry(extensions);
    render(
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <PIRRenderer pirDoc={inserted.doc} registry={registry} />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Neutral Button' })).toBeTruthy();

    const bundle = generateReactBundle(inserted.doc, {
      codegenPolicySnapshot: extensions.codegenPolicy,
    });
    const app = bundle.files.find((file) => file.path === 'src/App.tsx');
    expect(app?.contents).toContain(
      "import { Button } from '@neutral-ui/components';"
    );
    expect(app?.contents).toContain(
      '<Button label="Neutral Button" tone="default" />'
    );
    expect(bundle.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '@neutral-ui/components',
          version: '1.2.3',
          origin: expect.objectContaining({ license: 'MIT' }),
        }),
      ])
    );
    expect(platform.listOfficialImplementationBindings()).toHaveLength(3);
    expect(platform.getAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageDigest: fixture.artifact.packageDigest,
        }),
      ])
    );

    const disabled = await platform.runtime.packages.disable(
      '@prodivix/plugin-neutral-fixture'
    );
    expect(disabled.ok).toBe(true);
    expect(
      platform.queries.palette.getCreationRecipe('neutral-button')
    ).toBeUndefined();
    const cleaned = platform.queries.extensions.getSnapshot();
    expect(cleaned.externalLibraries).toEqual([]);
    expect(cleaned.rendererComponents).toEqual([]);
    expect(cleaned.iconProviders).toEqual([]);
    expect(cleaned.codegenPolicy.libraries).toEqual([]);
    expect(cleaned.codegenPolicy.iconProviders).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('blueprintTemplate')
    ).toEqual([]);
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
  });

  it('installs metadata and codegen contributions without any React Host module', async () => {
    const platform = createPlatform([]);
    const complete = createNeutralOfficialPlugin();
    const external = complete.contributions.find(
      (contribution) => contribution.point === 'externalLibrary'
    );
    const codegen = complete.contributions.find(
      (contribution) => contribution.point === 'codegenPolicy'
    );
    if (!external || external.point !== 'externalLibrary' || !codegen) {
      throw new Error('Neutral metadata fixture contributions must exist.');
    }
    delete external.descriptor.hostImplementationId;

    const result = await platform.runtime.packages.install({
      ...complete,
      pluginId: '@prodivix/plugin-metadata-fixture',
      displayName: 'Metadata Fixture',
      installationId: 'fixture:metadata-only',
      contributions: [external, codegen],
    });

    expect(result.ok).toBe(true);
    const snapshot = platform.queries.extensions.getSnapshot();
    expect(snapshot.externalLibraries).toHaveLength(1);
    expect(
      snapshot.externalLibraries[0]?.components[0]?.component
    ).toBeUndefined();
    expect(snapshot.rendererComponents).toEqual([]);
    expect(snapshot.codegenPolicy.libraries).toHaveLength(1);
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
  });

  it('replaces a bundled artifact generation without retaining old leases', async () => {
    const first = await createNeutralOfficialArtifact();
    const replacement = await createNeutralOfficialArtifact({
      version: '1.1.0',
    });
    const platform = createPlatform([
      ...first.hostCatalog,
      ...replacement.hostCatalog,
    ]);

    const installed = await platform.runtime.packages.installBundled(
      first.artifact,
      {
        installationId: 'fixture:neutral-replacement',
        sourceId: 'fixture:neutral-source-v1',
        trustLevel: 'official',
        publisherVerified: true,
      }
    );
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    const cleanupStarted = createDeferred();
    const releaseCleanup = createDeferred();
    const oldSurfaceCleanup = vi.fn(async () => {
      cleanupStarted.resolve(undefined);
      await releaseCleanup.promise;
    });
    platform.runtime.surfaceLeases.register(
      {
        pluginId: installed.value.pluginId,
        installationId: installed.value.installationId,
        generation: installed.value.generation,
      },
      oldSurfaceCleanup
    );

    let replacementSettled = false;
    const replacementPromise = platform.runtime.packages
      .installBundled(replacement.artifact, {
        installationId: 'fixture:neutral-replacement',
        sourceId: 'fixture:neutral-source-v2',
        trustLevel: 'official',
        publisherVerified: true,
      })
      .then((result) => {
        replacementSettled = true;
        return result;
      });
    await cleanupStarted.promise;
    try {
      expect(replacementSettled).toBe(false);
    } finally {
      releaseCleanup.resolve(undefined);
    }
    const replaced = await replacementPromise;

    expect(installed.value.generation).toBe(1);
    expect(replaced.ok && replaced.value.generation).toBe(2);
    expect(first.artifact.packageDigest).not.toBe(
      replacement.artifact.packageDigest
    );
    expect(
      platform
        .listOfficialImplementationBindings()
        .every((binding) => binding.owner.generation === 2)
    ).toBe(true);
    expect(
      platform.runtime.packages.contributions
        .list('blueprintTemplate')
        .map((record) => record.owner.generation)
    ).toEqual([2]);
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);
    await vi.waitFor(() => expect(oldSurfaceCleanup).toHaveBeenCalledOnce());
  });

  it('releases owner-scoped surface leases when only that plugin is disabled', async () => {
    const fixture = await createNeutralOfficialArtifact();
    const platform = createPlatform(fixture.hostCatalog);
    const installed = await platform.runtime.packages.installBundled(
      fixture.artifact,
      {
        installationId: 'fixture:surface-disable',
        sourceId: 'fixture:surface-disable-source',
        trustLevel: 'official',
        publisherVerified: true,
      }
    );
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    const cleanupStarted = createDeferred();
    const releaseCleanup = createDeferred();
    const cleanup = vi.fn(async () => {
      cleanupStarted.resolve(undefined);
      await releaseCleanup.promise;
    });
    platform.runtime.surfaceLeases.register(
      {
        pluginId: installed.value.pluginId,
        installationId: installed.value.installationId,
        generation: installed.value.generation,
      },
      cleanup
    );
    expect(platform.runtime.surfaceLeases.listSnapshots()).toHaveLength(1);

    let disableSettled = false;
    const disablePromise = platform.runtime.packages
      .disable(installed.value.pluginId)
      .then((result) => {
        disableSettled = true;
        return result;
      });
    await cleanupStarted.promise;
    try {
      expect(disableSettled).toBe(false);
    } finally {
      releaseCleanup.resolve(undefined);
    }
    const disabled = await disablePromise;
    expect(disabled.ok).toBe(true);
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Palette', 'paletteContribution'],
    ['render policy', 'renderPolicy'],
  ] as const)(
    'awaits async cleanup owned only by the %s resolver',
    async (_label, point) => {
      const platform = createPlatform();
      const installed = await platform.runtime.packages.install(
        createSurfaceResolverPlugin(point)
      );
      expect(installed.ok).toBe(true);
      if (!installed.ok) return;
      const cleanupStarted = createDeferred();
      const releaseCleanup = createDeferred();
      const cleanup = vi.fn(async () => {
        cleanupStarted.resolve(undefined);
        await releaseCleanup.promise;
      });
      platform.runtime.surfaceLeases.register(
        {
          pluginId: installed.value.pluginId,
          installationId: installed.value.installationId,
          generation: installed.value.generation,
        },
        cleanup
      );

      let disableSettled = false;
      const disablePromise = platform.runtime.packages
        .disable(installed.value.pluginId)
        .then((result) => {
          disableSettled = true;
          return result;
        });
      await cleanupStarted.promise;
      try {
        expect(disableSettled).toBe(false);
      } finally {
        releaseCleanup.resolve(undefined);
      }
      const disabled = await disablePromise;

      expect(disabled.ok).toBe(true);
      expect(cleanup).toHaveBeenCalledTimes(1);
    }
  );

  it('awaits rejected surface cleanup during shutdown and reports a stable diagnostic', async () => {
    const fixture = await createNeutralOfficialArtifact();
    const platform = createPlatform(fixture.hostCatalog);
    const installed = await platform.runtime.packages.installBundled(
      fixture.artifact,
      {
        installationId: 'fixture:surface-shutdown',
        sourceId: 'fixture:surface-shutdown-source',
        trustLevel: 'official',
        publisherVerified: true,
      }
    );
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    const cleanupStarted = createDeferred();
    const releaseCleanup = createDeferred();
    const cleanup = vi.fn(async () => {
      cleanupStarted.resolve(undefined);
      await releaseCleanup.promise;
      throw new Error('fixture surface cleanup failed');
    });
    const surfaceLease = platform.runtime.surfaceLeases.register(
      {
        pluginId: installed.value.pluginId,
        installationId: installed.value.installationId,
        generation: installed.value.generation,
      },
      cleanup
    );

    const disposal = surfaceLease.dispose();
    let shutdownSettled = false;
    const shutdownPromise = platform.shutdown().then((result) => {
      shutdownSettled = true;
      return result;
    });
    await cleanupStarted.promise;
    try {
      expect(shutdownSettled).toBe(false);
    } finally {
      releaseCleanup.resolve(undefined);
    }
    const shutdown = await shutdownPromise;
    await expect(disposal).rejects.toThrow('fixture surface cleanup failed');

    expect(shutdown.ok).toBe(false);
    expect(shutdown.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);
  });

  it('retries a build-attested Host Module after a transient load failure', async () => {
    const fixture = await createNeutralOfficialArtifact();
    const catalogEntry = fixture.hostCatalog[0];
    if (!catalogEntry) {
      throw new Error(
        'Neutral official Host Module catalog must not be empty.'
      );
    }
    const load = vi
      .fn<OfficialHostModuleCatalogEntry['load']>()
      .mockRejectedValueOnce(new Error('transient Host Module load failure'))
      .mockImplementation(catalogEntry.load);
    const platform = createPlatform([Object.freeze({ ...catalogEntry, load })]);
    const install = () =>
      platform.runtime.packages.installBundled(fixture.artifact, {
        installationId: 'fixture:neutral-host-module-retry',
        sourceId: 'fixture:neutral-host-module-retry-source',
        trustLevel: 'official',
        publisherVerified: true,
      });

    const failed = await install();
    expect(failed.ok).toBe(false);
    expect(failed.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_IMPLEMENTATION_NOT_FOUND
    );
    expect(platform.listOfficialImplementationBindings()).toEqual([]);

    const retried = await install();
    expect(retried.ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(
      platform
        .listOfficialImplementationBindings()
        .every((binding) => binding.owner.generation === 2)
    ).toBe(true);
  });

  it('rolls back every point and releases Palette claims when one resolver fails', async () => {
    const platform = createPlatform();

    const failed = await platform.runtime.packages.install(
      createNeutralOfficialPlugin({
        label: 'Rollback',
        groupId: 'test-rollback-group',
        itemId: 'test-rollback-item',
        iconImplementationId: 'neutral.missing-icons',
      })
    );

    expect(failed.ok).toBe(false);
    expect(
      platform.runtime.packages.contributions.list('paletteContribution')
    ).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('renderPolicy')
    ).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('blueprintTemplate')
    ).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('externalLibrary')
    ).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('codegenPolicy')
    ).toEqual([]);
    expect(
      platform.runtime.packages.contributions.list('iconProvider')
    ).toEqual([]);
    expect(platform.runtime.packages.contributions.getRevision()).toBe(0);
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
    expect(
      platform.queries.palette.getItemById('test-rollback-item')
    ).toBeUndefined();

    const retry = await platform.runtime.packages.install(
      createNeutralOfficialPlugin({
        label: 'Rollback',
        groupId: 'test-rollback-group',
        itemId: 'test-rollback-item',
      })
    );
    expect(retry.ok).toBe(true);
    expect(
      platform.queries.palette.getItemById('test-rollback-item')?.name
    ).toBe('Rollback Button');
  });

  it('keeps concurrent replacement projections bound to their package attestation', async () => {
    const firstPrepareStarted = createDeferred();
    const releaseFirstPrepare = createDeferred();
    const platform = createPlatform(
      createNeutralOfficialHostCatalog(NEUTRAL_PACKAGE_DIGEST, async () => {
        firstPrepareStarted.resolve(undefined);
        await releaseFirstPrepare.promise;
        return NEUTRAL_OFFICIAL_HOST_MODULE;
      })
    );

    const firstInstall = platform.runtime.packages.install(
      createNeutralOfficialPlugin({
        version: '1.0.0',
        label: 'First projection',
        groupId: 'test-concurrent-first-group',
        itemId: 'test-concurrent-first-item',
      })
    );
    await firstPrepareStarted.promise;

    const secondInstall = platform.runtime.packages.install(
      createNeutralOfficialPlugin({
        version: '1.1.0',
        label: 'Second projection',
        groupId: 'test-concurrent-second-group',
        itemId: 'test-concurrent-second-item',
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirstPrepare.resolve(undefined);

    const [firstResult, secondResult] = await Promise.all([
      firstInstall,
      secondInstall,
    ]);

    expect(firstResult.ok).toBe(false);
    expect(firstResult.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED
    );
    expect(firstResult.diagnostics.map((item) => item.code)).not.toContain(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED
    );
    expect(secondResult.ok).toBe(true);
    expect(
      platform.queries.palette.getItemById('test-concurrent-first-item')
    ).toBeUndefined();
    expect(
      platform.queries.palette.getItemById('test-concurrent-second-item')?.name
    ).toBe('Second projection Button');
    expect(
      platform
        .listOfficialImplementationBindings()
        .every((binding) => binding.owner.generation === 2)
    ).toBe(true);
  });
});
