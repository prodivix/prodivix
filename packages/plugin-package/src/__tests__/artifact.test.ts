import { describe, expect, it } from 'vitest';
import {
  canonicalJsonBytes,
  createBundledPluginArtifact,
  createBundledPluginPackageSource,
  normalizeBundledPluginResourcePath,
  verifyBundledPluginArtifact,
} from '#package/index';

const decoder = new TextDecoder();
const manifest = {
  schemaVersion: '1.0',
  id: '@prodivix/plugin-package-fixture',
};

const createArtifact = (signal?: AbortSignal) =>
  createBundledPluginArtifact({
    manifestPath: 'plugin/manifest.json',
    resources: [
      { path: 'plugin/manifest.json', bytes: canonicalJsonBytes(manifest) },
      {
        path: 'plugin/contributions/palette.json',
        bytes: canonicalJsonBytes({ schemaVersion: '1.0', groups: [] }),
      },
    ],
    signal,
  });

describe('bundled plugin artifacts', () => {
  it('normalizes portable package-relative paths and rejects traversal', () => {
    expect(normalizeBundledPluginResourcePath('.\\plugin//manifest.json')).toBe(
      'plugin/manifest.json'
    );
    expect(() =>
      normalizeBundledPluginResourcePath('../manifest.json')
    ).toThrow();
    expect(() =>
      normalizeBundledPluginResourcePath('C:\\plugin\\manifest.json')
    ).toThrow();
  });

  it('canonicalizes object keys without changing array order', () => {
    expect(
      decoder.decode(
        canonicalJsonBytes({ z: 1, nested: { b: 2, a: [3, 1] }, a: 0 })
      )
    ).toBe('{"a":0,"nested":{"a":[3,1],"b":2},"z":1}');
  });

  it('produces the same digest regardless of resource input order', async () => {
    const first = await createArtifact();
    const second = await createBundledPluginArtifact({
      manifestPath: 'plugin/manifest.json',
      resources: [...first.resources].reverse(),
    });

    expect(second.packageDigest).toBe(first.packageDigest);
  });

  it('rejects byte mutation and configured resource limits', async () => {
    const artifact = await createArtifact();
    const mutated = {
      ...artifact,
      resources: artifact.resources.map((resource, index) =>
        index === 0
          ? { ...resource, bytes: [...resource.bytes.slice(0, -1), 0] }
          : resource
      ),
    };

    expect((await verifyBundledPluginArtifact(mutated)).issues[0]?.code).toBe(
      'digest-mismatch'
    );
    expect(
      (
        await verifyBundledPluginArtifact(artifact, {
          limits: { maxResourceBytes: 8 },
        })
      ).issues[0]?.code
    ).toBe('resource-limit-exceeded');
  });

  it('creates an abort-aware source with defensive resource copies', async () => {
    const artifact = await createArtifact();
    const sourceResult = await createBundledPluginPackageSource(artifact, {
      installationId: 'fixture-installation',
      sourceId: 'fixture-source',
      trustLevel: 'official',
      publisherVerified: true,
    });
    expect(sourceResult.ok).toBe(true);
    if (!sourceResult.ok) return;

    const first = await sourceResult.value.reader.readManifest(
      new AbortController().signal
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    first.value[0] = 0;
    const second = await sourceResult.value.reader.readManifest(
      new AbortController().signal
    );
    expect(second.ok && second.value[0]).not.toBe(0);

    const controller = new AbortController();
    controller.abort();
    const aborted = await sourceResult.value.reader.readResource(
      './contributions/palette.json',
      { maxBytes: 1024, signal: controller.signal }
    );
    expect(aborted.ok).toBe(false);
    expect(aborted.diagnostics[0]?.code).toBe('PLG-4006');
  });

  it('fails source construction when verification is already aborted', async () => {
    const artifact = await createArtifact();
    const controller = new AbortController();
    controller.abort();
    const result = await createBundledPluginPackageSource(artifact, {
      installationId: 'fixture-installation',
      sourceId: 'fixture-source',
      trustLevel: 'official',
      publisherVerified: true,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLG-4006');
  });
});
