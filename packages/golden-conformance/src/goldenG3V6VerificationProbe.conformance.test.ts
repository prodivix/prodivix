import { scanProductionBundleForVerificationProbe } from '@prodivix/prodivix-compiler';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID,
  GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID,
  GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID,
  GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID,
  createGoldenG3CatalogProgram,
  createGoldenG3ReactCatalogBundle,
  createGoldenG3V6ReactCatalogBundle,
  createGoldenG3V6VueCatalogBundle,
  createGoldenG3VerificationCompileProfile,
  createGoldenG3VueCatalogBundle,
} from './goldenG3ScenarioFixture';

const productionProbeScanInput = (
  bundle: ReturnType<typeof createGoldenG3ReactCatalogBundle>
) =>
  bundle.files.map(({ path, contents }) => Object.freeze({ path, contents }));

describe('Golden G3 V6 verification-only compiler probe', () => {
  it('binds the same deterministic Program and semantic targets into both targets', () => {
    const program = createGoldenG3CatalogProgram();
    const first = createGoldenG3VerificationCompileProfile(program);
    const second = createGoldenG3VerificationCompileProfile(program);

    expect(first).toEqual(second);
    expect(first.kind).toBe('verification');
    if (first.kind !== 'verification') return;
    expect(first.scenarioProgramDigest).toBe(program.programDigest);
    expect(first.semanticSnapshotDigest).toBe(program.semanticSnapshotDigest);
    expect(first.targets).toHaveLength(6);
    expect(first.targets.map(({ targetId }) => targetId)).toEqual(
      expect.arrayContaining([
        GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID,
        GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID,
        GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID,
        GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID,
      ])
    );
    expect(
      first.targets.every(({ targetId }) =>
        program.targetManifest.some((target) => target.targetId === targetId)
      )
    ).toBe(true);

    for (const bundle of [
      createGoldenG3V6ReactCatalogBundle(),
      createGoldenG3V6VueCatalogBundle(),
    ]) {
      const result = scanProductionBundleForVerificationProbe(
        productionProbeScanInput(bundle)
      );
      expect(result.status).toBe('blocked');
      expect(result.findings.map(({ marker }) => marker)).toContain(
        'probe-canary'
      );
      expect(result.findings.map(({ marker }) => marker)).toContain(
        'probe-endpoint'
      );
    }
  });

  it('keeps both non-verification source projections probe-free', () => {
    for (const bundle of [
      createGoldenG3ReactCatalogBundle(),
      createGoldenG3VueCatalogBundle(),
    ]) {
      expect(
        scanProductionBundleForVerificationProbe(
          productionProbeScanInput(bundle)
        )
      ).toEqual({ status: 'clean', findings: [] });
    }
  });
});
