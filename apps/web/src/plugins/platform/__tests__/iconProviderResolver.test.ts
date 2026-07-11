import { describe, expect, it, vi } from 'vitest';
import type {
  IconProviderContributionV1,
  InlineContributionSource,
} from '@prodivix/plugin-contracts';
import {
  createPluginOwnerRef,
  pluginHostSuccess,
  type PluginHostResult,
} from '@prodivix/plugin-host';
import { createIconProviderContributionResolver } from '@/plugins/platform/contributions/iconProviderResolver';
import { createOfficialSurfaceLeaseRegistry } from '@/plugins/platform/officialSurfaceHost';
import type {
  LibraryArtifactResolver,
  OfficialHostImplementationBinding,
} from '@/plugins/platform/officialHostImplementations';

const descriptor: IconProviderContributionV1 = {
  schemaVersion: '1.0',
  providerId: 'shared-icons',
  libraryId: 'neutral-ui',
  displayName: 'Shared Icons',
  package: { name: '@neutral/icons', version: '1.0.0', license: 'MIT' },
  hostImplementationId: 'neutral.icons',
  exports: { strategy: 'named-exports' },
  normalization: { inputCase: 'preserve', exportCase: 'pascal' },
  render: { size: { mode: 'prop', prop: 'size' } },
  codegen: { importKind: 'named', sourceMode: 'package' },
  limits: {
    maxIcons: 100,
    maxNameLength: 120,
    maxResponseBytes: 4096,
    maxCacheEntries: 32,
  },
};
const jsonDescriptor =
  descriptor as unknown as InlineContributionSource['descriptor'];

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const createBinding = () => {
  const dispose = vi.fn();
  return {
    result: pluginHostSuccess(
      Object.freeze({
        value: Object.freeze({
          kind: 'icon-provider' as const,
          package: Object.freeze({
            name: descriptor.package.name,
            version: descriptor.package.version,
          }),
          resolveExport: () => null,
          listExports: () => [],
        }),
        dispose,
      }) satisfies OfficialHostImplementationBinding<'icon-provider'>
    ),
    dispose,
  };
};

describe('Icon Provider resolver ownership', () => {
  it('rejects a concurrent provider-id claim after artifact resolution', async () => {
    const pending: ReturnType<
      typeof createDeferred<
        PluginHostResult<OfficialHostImplementationBinding<'icon-provider'>>
      >
    >[] = [];
    const artifacts: LibraryArtifactResolver = {
      resolveComponentLibrary: async () => {
        throw new Error('Component resolution is not used by this test.');
      },
      resolveIconProvider: () => {
        const deferred =
          createDeferred<
            PluginHostResult<OfficialHostImplementationBinding<'icon-provider'>>
          >();
        pending.push(deferred);
        return deferred.promise;
      },
    };
    const contract = createIconProviderContributionResolver(
      artifacts,
      createOfficialSurfaceLeaseRegistry()
    );
    const prepare = (pluginId: string) =>
      contract.prepare({
        owner: createPluginOwnerRef(pluginId, `installation:${pluginId}`, 1),
        attestation: {
          sourceId: `source:${pluginId}`,
          packageDigest: `digest:${pluginId}`,
          trustLevel: 'official',
          publisherVerified: true,
        },
        declaration: {
          id: 'icons',
          point: 'iconProvider',
          contractVersion: '1.0',
          source: { kind: 'inline', descriptor: jsonDescriptor },
        },
        descriptor: jsonDescriptor,
        permission: {
          permissionRevision: 1,
          getDecision: () => undefined,
          isGranted: () => true,
        },
        operationId: `operation:${pluginId}`,
        signal: new AbortController().signal,
      });

    const firstPending = prepare('@prodivix/plugin-first');
    const secondPending = prepare('@prodivix/plugin-second');
    expect(pending).toHaveLength(2);
    const firstBinding = createBinding();
    pending[0]!.resolve(firstBinding.result);
    const first = await firstPending;
    const secondBinding = createBinding();
    pending[1]!.resolve(secondBinding.result);
    const second = await secondPending;

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.diagnostics[0]?.code).toBe('PLG-3010');
    expect(secondBinding.dispose).toHaveBeenCalledOnce();
    if (first.ok) await first.value.dispose?.();
    expect(firstBinding.dispose).toHaveBeenCalledOnce();
  });
});
