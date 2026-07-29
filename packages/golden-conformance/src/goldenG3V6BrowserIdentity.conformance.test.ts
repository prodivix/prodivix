import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY,
  GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
  GOLDEN_G3_V6_CONTROLLED_PLATFORMS,
  assertGoldenG3V6BrowserIdentityRegistry,
  createGoldenG3V6BrowserRuntimeIdentity,
  createGoldenG3V6ControlledBrowserImageIdentitiesForPlatform,
  currentGoldenG3V6ControlledPlatform,
  selectGoldenG3V6ControlledPlatform,
} from './goldenG3V6BrowserIdentityFixture';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import { GOLDEN_G3_V6_VISUAL_BASELINE_SET } from './goldenG3V6VisualBaseline';
import { digestVerificationValue } from '@prodivix/verification';
import { assertPlaywrightBrowserImageAuthorityReceipt } from '@prodivix/verification-browser';

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 pre-adopted browser identities', () => {
  it('pins one canonical registry and an attested current platform', () => {
    expect(() => assertGoldenG3V6BrowserIdentityRegistry()).not.toThrow();
    expect(
      digestVerificationValue(GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY)
    ).toBe(GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST);
    expect(GOLDEN_G3_V6_CONTROLLED_PLATFORMS).toContain(
      currentGoldenG3V6ControlledPlatform()
    );
  });

  it('pre-adopts every visual cell for Windows and the active Linux rollout', () => {
    expect(GOLDEN_G3_V6_VISUAL_BASELINE_SET.entries).toHaveLength(36);
    expect(
      new Set(
        GOLDEN_G3_V6_VISUAL_BASELINE_SET.entries.map(
          ({ compatibilityProfileDigest }) => compatibilityProfileDigest
        )
      ).size
    ).toBe(36);
  });

  it('binds each platform and engine to an independently recomputable Playwright image receipt', () => {
    const expectedImageDigests = Object.freeze({
      windows: Object.freeze({
        chromium:
          'sha256-872e2c01c088badb3d70e2fedfd688f20d3dade1a7c165d3851c3e8479bc5ce3',
        firefox:
          'sha256-7b1171752f70c66d825bc2801c972e28802f4203175098af4f1ff916f9406c90',
        webkit:
          'sha256-14e24213f3ce2d7b8d8c97b39858d7fb6246d6f835a874709d85ab73ff0e0983',
      }),
      'linux-20260720': Object.freeze({
        chromium:
          'sha256-b068eacdcf55000c263f4f1bac19fc91eee30ea5280b32ac2711c918c95cb58e',
        firefox:
          'sha256-9fd0b52c767e011485c9b7efb93c6e815bf8924aeaf7ad1c2cfe88a1cdbc309e',
        webkit:
          'sha256-9fc0ef65c910a9fc6626faaa5bc27b93182334ecb68be0f09d83fec936eb6d4e',
      }),
      'linux-20260726': Object.freeze({
        chromium:
          'sha256-b068eacdcf55000c263f4f1bac19fc91eee30ea5280b32ac2711c918c95cb58e',
        firefox:
          'sha256-9fd0b52c767e011485c9b7efb93c6e815bf8924aeaf7ad1c2cfe88a1cdbc309e',
        webkit:
          'sha256-9fc0ef65c910a9fc6626faaa5bc27b93182334ecb68be0f09d83fec936eb6d4e',
      }),
    });
    for (const platformId of GOLDEN_G3_V6_CONTROLLED_PLATFORMS) {
      const identities =
        createGoldenG3V6ControlledBrowserImageIdentitiesForPlatform(platformId);
      expect(identities).toHaveLength(3);
      for (const identity of identities) {
        expect(identity.platformId).toBe(platformId);
        expect(identity.imageDigest).toBe(
          expectedImageDigests[platformId][identity.engine]
        );
        expect(
          assertPlaywrightBrowserImageAuthorityReceipt(
            identity.authorityReceipt,
            identity.imageDigest
          )
        ).toEqual(identity.authorityReceipt);
      }
    }
  });

  it('selects the current platform receipt for every Browser runtime identity', () => {
    const platformId = currentGoldenG3V6ControlledPlatform();
    const receiptByEngine = new Map(
      createGoldenG3V6ControlledBrowserImageIdentitiesForPlatform(
        platformId
      ).map((identity) => [identity.engine, identity.authorityReceipt])
    );
    const browserCells = createGoldenG3V6Plan().plan.cells.filter(
      (cell) => cell.browserEngine !== undefined
    );
    expect(
      new Set(browserCells.map(({ browserEngine }) => browserEngine))
    ).toEqual(new Set(['chromium', 'firefox', 'webkit']));
    for (const cell of browserCells) {
      expect(
        createGoldenG3V6BrowserRuntimeIdentity(cell).browserImageDigest
      ).toBe(receiptByEngine.get(cell.browserEngine!)?.imageDigest);
    }
  });

  it('rejects a fully shaped browser image receipt whose materialized image facts were changed', () => {
    const receipt =
      GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY.browserImagesByPlatform.windows
        .chromium.authorityReceipt;
    const tamperedReceipts = [
      Object.freeze({
        ...receipt,
        executableContentDigest:
          'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      Object.freeze({
        ...receipt,
        fileSetDigest:
          'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
      Object.freeze({ ...receipt, fileCount: receipt.fileCount + 1 }),
      Object.freeze({
        ...receipt,
        totalByteLength: receipt.totalByteLength + 1,
      }),
    ];
    for (const tampered of tamperedReceipts) {
      expect(() =>
        assertPlaywrightBrowserImageAuthorityReceipt(
          tampered,
          receipt.imageDigest
        )
      ).toThrow(/mismatch/u);
    }
  });

  it('fails closed for missing, unknown, or drifted GitHub runner ImageVersion', () => {
    const observed = {
      platform: 'linux',
      architecture: 'x64',
      kernelRelease: '6.17.0-1020-azure',
      githubActions: 'true',
      imageOS: 'ubuntu24',
    };
    expect(() => selectGoldenG3V6ControlledPlatform(observed)).toThrow(
      /no pre-adopted/u
    );
    expect(() =>
      selectGoldenG3V6ControlledPlatform({
        ...observed,
        imageVersion: 'unknown',
      })
    ).toThrow(/no pre-adopted/u);
    expect(() =>
      selectGoldenG3V6ControlledPlatform({
        ...observed,
        imageVersion: '20260726.254.2',
      })
    ).toThrow(/no pre-adopted/u);
    expect(
      selectGoldenG3V6ControlledPlatform({
        ...observed,
        imageVersion: '20260726.254.1',
      })
    ).toBe('linux-20260726');
  });
});
