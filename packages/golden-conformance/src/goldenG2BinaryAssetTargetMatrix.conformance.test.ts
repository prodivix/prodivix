import { describe, expect, it } from 'vitest';
import {
  createBinaryAssetPublicDeliveryRequest,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from '@prodivix/runtime-remote';
import {
  GOLDEN_ASSET_MATERIALIZATIONS,
  GOLDEN_LOGO_ASSET_REFERENCE,
} from './goldenApp.fixture';
import { createGoldenG2AuthServerWorkspace } from './goldenG2AuthServerFixture';
import { createGoldenG2ExecutableSnapshot } from './goldenG2ExecutionFixture';
import {
  createGoldenG2VueCatalogRemoteSnapshot,
  createGoldenG2VueCatalogTestSnapshot,
  GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
  GOLDEN_G2_VUE_CATALOG_WORKSPACE,
} from './goldenG2VueCatalogFixture';

type TargetCase = Readonly<{
  target: 'react-vite' | 'vue-vite';
  assetPath: string;
  materialization: BinaryAssetMaterialization;
  deterministic: ExecutableProjectSnapshot;
  remote: ExecutableProjectSnapshot;
}>;

const assetBytes = (
  snapshot: ExecutableProjectSnapshot,
  path: string
): Uint8Array => {
  const contents = snapshot.files.find((file) => file.path === path)?.contents;
  if (!(contents instanceof Uint8Array)) {
    throw new Error(`Expected exact binary Asset at ${path}.`);
  }
  return contents;
};

const profileAssetBytes = (
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build',
  path: string
): Uint8Array => {
  const contents = projectExecutableProjectRuntimeFiles(snapshot, profile).find(
    (file) => file.path === path
  )?.contents;
  if (!(contents instanceof Uint8Array)) {
    throw new Error(`Expected ${profile} Asset at ${path}.`);
  }
  return contents;
};

const targetCases = (): readonly TargetCase[] => {
  const react = createGoldenG2ExecutableSnapshot();
  const vueTest = createGoldenG2VueCatalogTestSnapshot();
  const vueRemote = createGoldenG2VueCatalogRemoteSnapshot();
  const reactMaterialization = GOLDEN_ASSET_MATERIALIZATIONS[0];
  const vueMaterialization = GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS[0];
  if (!reactMaterialization || !vueMaterialization) {
    throw new Error('Golden Binary Asset materialization is missing.');
  }
  return Object.freeze([
    Object.freeze({
      target: 'react-vite' as const,
      assetPath: 'public/logo.png',
      materialization: reactMaterialization,
      deterministic: react,
      remote: react,
    }),
    Object.freeze({
      target: 'vue-vite' as const,
      assetPath: 'public/catalog/product.png',
      materialization: vueMaterialization,
      deterministic: vueTest,
      remote: vueRemote,
    }),
  ]);
};

describe('G2 Binary Asset cross-target product closure matrix', () => {
  it.each(targetCases())(
    'keeps exact bytes through $target Browser/Test and Remote Preview/Test/Build',
    ({ assetPath, deterministic, materialization, remote }) => {
      expect(assetBytes(deterministic, assetPath)).toEqual(
        materialization.contents
      );
      expect(profileAssetBytes(deterministic, 'preview', assetPath)).toEqual(
        materialization.contents
      );
      expect(profileAssetBytes(deterministic, 'test', assetPath)).toEqual(
        materialization.contents
      );

      const decoded = decodeRemoteExecutableProjectSnapshot(
        encodeRemoteExecutableProjectSnapshot(remote)
      );
      expect(assetBytes(decoded, assetPath)).toEqual(materialization.contents);
      for (const profile of ['preview', 'test', 'build'] as const) {
        expect(profileAssetBytes(decoded, profile, assetPath)).toEqual(
          materialization.contents
        );
      }
      const wire = JSON.stringify(
        encodeRemoteExecutableProjectSnapshot(remote)
      );
      expect(wire).not.toContain('workspace-blob');
      expect(wire).not.toContain(materialization.reference.digest);
    }
  );

  it('uses the same full-raster isolated delivery request for both framework targets', () => {
    for (const target of ['react-vite', 'vue-vite'] as const) {
      expect({
        target,
        request: createBinaryAssetPublicDeliveryRequest('image/png'),
      }).toEqual({
        target,
        request: {
          transform: 'png-raster-reencode',
          disposition: 'inline',
        },
      });
      expect(createBinaryAssetPublicDeliveryRequest('image/jpeg')).toEqual({
        transform: 'jpeg-raster-reencode',
        disposition: 'inline',
      });
    }
  });

  it('exports unprotected static bytes but fails closed for protected React and Vue targets', () => {
    const reactStatic = createGoldenG2ExecutableSnapshot();
    expect(assetBytes(reactStatic, 'public/logo.png')).toEqual(
      GOLDEN_ASSET_MATERIALIZATIONS[0]?.contents
    );
    expect(GOLDEN_LOGO_ASSET_REFERENCE.digest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );

    const protectedReact = generateWorkspaceReactViteExecutableProject(
      createGoldenG2AuthServerWorkspace('remote-live')
    );
    const protectedVue = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G2_VUE_CATALOG_WORKSPACE
    );
    expect(protectedReact.status).toBe('blocked');
    expect(protectedVue.status).toBe('blocked');
    if (protectedReact.status === 'blocked') {
      expect(protectedReact.diagnostics.map(({ code }) => code)).toContain(
        'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
      );
    }
    if (protectedVue.status === 'blocked') {
      expect(protectedVue.diagnostics.map(({ code }) => code)).toContain(
        'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
      );
    }
  });
});
