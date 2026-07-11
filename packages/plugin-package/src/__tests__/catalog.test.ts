import { describe, expect, it } from 'vitest';
import {
  createBundledPluginCatalog,
  planBundledPluginReconciliation,
  type BundledPluginArtifactV1,
} from '#package/index';

const artifact = (packageDigest: string): BundledPluginArtifactV1 => ({
  schemaVersion: '1.0',
  manifestPath: 'plugin/manifest.json',
  packageDigest,
  resources: [],
});

describe('bundled plugin catalog', () => {
  it('plans stable retain, replacement, installation, disable, and unknown sets', () => {
    const result = createBundledPluginCatalog([
      {
        catalogId: 'alpha',
        pluginId: '@prodivix/plugin-alpha',
        artifact: artifact('sha256-alpha-next'),
        metadata: { label: 'Alpha' },
      },
      {
        catalogId: 'beta',
        pluginId: '@prodivix/plugin-beta',
        artifact: artifact('sha256-beta'),
        metadata: { label: 'Beta' },
      },
      {
        catalogId: 'gamma',
        pluginId: '@prodivix/plugin-gamma',
        artifact: artifact('sha256-gamma'),
        metadata: { label: 'Gamma' },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = planBundledPluginReconciliation(
      ['gamma', 'missing', 'alpha', 'beta', 'beta'],
      [
        {
          pluginId: '@prodivix/plugin-alpha',
          packageDigest: 'sha256-alpha-old',
        },
        { pluginId: '@prodivix/plugin-beta', packageDigest: 'sha256-beta' },
        {
          pluginId: '@prodivix/plugin-disabled',
          packageDigest: 'sha256-disabled',
        },
      ],
      result.catalog
    );

    expect(plan.install.map((entry) => entry.catalogId)).toEqual(['gamma']);
    expect(plan.replace.map((entry) => entry.catalogId)).toEqual(['alpha']);
    expect(plan.retain.map((entry) => entry.catalogId)).toEqual(['beta']);
    expect(plan.disable.map((entry) => entry.pluginId)).toEqual([
      '@prodivix/plugin-disabled',
    ]);
    expect(plan.unknown).toEqual(['missing']);
  });

  it('rejects duplicate catalog and plugin identities', () => {
    const result = createBundledPluginCatalog([
      {
        catalogId: 'alpha',
        pluginId: '@prodivix/plugin-shared',
        artifact: artifact('sha256-alpha'),
        metadata: null,
      },
      {
        catalogId: 'beta',
        pluginId: '@prodivix/plugin-shared',
        artifact: artifact('sha256-beta'),
        metadata: null,
      },
    ]);

    expect(result).toEqual({
      ok: false,
      message: 'Bundled plugin id is duplicated.',
      catalogId: 'beta',
    });
  });
});
