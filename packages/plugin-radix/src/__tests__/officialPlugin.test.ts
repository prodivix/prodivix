import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PLUGIN_ARTIFACT,
  GENERATED_OFFICIAL_PLUGIN_CATALOG,
  RADIX_OFFICIAL_PLUGIN,
} from '#radix/index';
import { RADIX_OFFICIAL_HOST_MODULE } from '#radix/hostModule';

const readArtifactJson = (path: string): Record<string, unknown> => {
  const resource = BUNDLED_PLUGIN_ARTIFACT.resources.find(
    (candidate) => candidate.path === path
  );
  if (!resource) throw new Error(`Missing artifact resource ${path}.`);
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(resource.bytes))
  ) as Record<string, unknown>;
};

describe('Radix UI official plugin definition', () => {
  it('binds one deterministic artifact, generated catalog, and Host loader', async () => {
    expect(GENERATED_OFFICIAL_PLUGIN_CATALOG.support).toEqual({
      total: 37,
      supported: 3,
      template: 34,
      degraded: 0,
    });
    expect(BUNDLED_PLUGIN_ARTIFACT.resources).toHaveLength(7);
    expect(BUNDLED_PLUGIN_ARTIFACT.packageDigest).toMatch(/^sha256-/);
    expect(RADIX_OFFICIAL_PLUGIN.artifact).toBe(BUNDLED_PLUGIN_ARTIFACT);
    expect(RADIX_OFFICIAL_PLUGIN.catalog).toBe(
      GENERATED_OFFICIAL_PLUGIN_CATALOG
    );
    expect(await RADIX_OFFICIAL_PLUGIN.loadHostModule()).toBe(
      RADIX_OFFICIAL_HOST_MODULE
    );
  });

  it('publishes exactly five static contribution points without an icon provider', () => {
    const manifest = readArtifactJson('plugin/manifest.json') as {
      contributes: Array<{ point: string }>;
    };
    expect(manifest.contributes.map((item) => item.point).sort()).toEqual([
      'blueprintTemplate',
      'codegenPolicy',
      'externalLibrary',
      'paletteContribution',
      'renderPolicy',
    ]);
    expect(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.hostImplementations.map(
        (implementation) => implementation.kind
      )
    ).not.toContain('icon-provider');
  });
});
