import { release } from 'node:os';
import {
  digestVerificationValue,
  type VerificationBrowserEngine,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  assertPlaywrightBrowserImageAuthorityReceipt,
  createPlaywrightBrowserImageAuthorityReceipt,
  type BrowserVerificationRuntimeIdentity,
  type PlaywrightBrowserImageAuthorityReceipt,
  type VisualBaselineCompatibilityProfile,
} from '@prodivix/verification-browser';

export type GoldenG3V6ControlledPlatform =
  'linux-20260720' | 'linux-20260726' | 'windows';

export const GOLDEN_G3_V6_VISUAL_NORMALIZER = Object.freeze({
  id: 'pdx-rgba',
  version: '1',
});

const CONTROLLED_OS_IMAGES = Object.freeze({
  windows: Object.freeze({
    platform: 'win32',
    architecture: 'x64',
    image: 'windows-11-10.0.26200',
    imageVersion: '10.0.26200',
    kernelRelease: '10.0.26200',
    digest:
      'sha256-09a21856d04a4703ff7b6518fd5530c9ce35eb0d142e278dda0573acff97ce13',
    machineClass: 'golden-windows-x64',
  }),
  'linux-20260720': Object.freeze({
    platform: 'linux',
    architecture: 'x64',
    image: 'github-actions-ubuntu-24.04',
    imageVersion: '20260720.247.2',
    kernelRelease: '6.17.0-1020-azure',
    digest:
      'sha256-f1a69f4e794715c63c0cb7518710529914b536d0b431a586c169223ec1a08d98',
    machineClass: 'github-actions-ubuntu-24-04-x64-20260720',
  }),
  'linux-20260726': Object.freeze({
    platform: 'linux',
    architecture: 'x64',
    image: 'github-actions-ubuntu-24.04',
    imageVersion: '20260726.254.1',
    kernelRelease: '6.17.0-1020-azure',
    digest:
      'sha256-fe4a98154a770868440b08e10fb44e3740b2cffd7666382890c572d6e25a04e2',
    machineClass: 'github-actions-ubuntu-24-04-x64-20260726',
  }),
});

export const GOLDEN_G3_V6_CONTROLLED_PLATFORMS = Object.freeze(
  Object.keys(CONTROLLED_OS_IMAGES) as GoldenG3V6ControlledPlatform[]
);

export type GoldenG3V6ObservedPlatformIdentity = Readonly<{
  platform: string;
  architecture: string;
  kernelRelease: string;
  githubActions?: string;
  imageOS?: string;
  imageVersion?: string;
}>;

export type GoldenG3V6SelectedPlatformIdentity = Readonly<{
  platformId: GoldenG3V6ControlledPlatform;
  platform: string;
  architecture: string;
  image: string;
  imageVersion: string;
  kernelRelease: string;
  imageDigest: string;
  machineClass: string;
  githubActions: boolean;
}>;

export type GoldenG3V6ControlledBrowserImageIdentity = Readonly<{
  platformId: GoldenG3V6ControlledPlatform;
  engine: VerificationBrowserEngine;
  version: string;
  imageDigest: string;
  authorityReceipt: PlaywrightBrowserImageAuthorityReceipt;
}>;

const CONTROLLED_BROWSER_VERSIONS = Object.freeze({
  chromium: '149.0.7827.55',
  firefox: '151.0',
  webkit: '26.5',
} satisfies Readonly<Record<VerificationBrowserEngine, string>>);

const adoptBrowserImageAuthorityReceipt = (
  input: Parameters<typeof createPlaywrightBrowserImageAuthorityReceipt>[0],
  expectedImageDigest: string
): PlaywrightBrowserImageAuthorityReceipt =>
  assertPlaywrightBrowserImageAuthorityReceipt(
    createPlaywrightBrowserImageAuthorityReceipt(input),
    expectedImageDigest
  );

const WINDOWS_BROWSER_IMAGES = Object.freeze({
  chromium: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.chromium,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'chromium',
        executableRelativePath: 'chrome-win64/chrome.exe',
        executableContentDigest:
          'sha256-b798f9e53a98d29eb7f36f8c409f905d3184780a04d2bcb56989067194784bd1',
        fileSetDigest:
          'sha256-16fdd697a8f02763c5b09b0cee6dacc4078bea4db87ef7c231117ba2051ab8ab',
        fileCount: 308,
        totalByteLength: 435_574_347,
      },
      'sha256-872e2c01c088badb3d70e2fedfd688f20d3dade1a7c165d3851c3e8479bc5ce3'
    ),
  }),
  firefox: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.firefox,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'firefox',
        executableRelativePath: 'firefox/firefox.exe',
        executableContentDigest:
          'sha256-85475a46874a3ffe5b996e85d7f9d8282b48b5ad296284a983c21026de5999cf',
        fileSetDigest:
          'sha256-fe55d7f5dc5fd3ce57b91a1f951119ffbf969ccacb38df41dd5ac66618fa2226',
        fileCount: 59,
        totalByteLength: 343_210_892,
      },
      'sha256-7b1171752f70c66d825bc2801c972e28802f4203175098af4f1ff916f9406c90'
    ),
  }),
  webkit: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.webkit,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'webkit',
        executableRelativePath: 'Playwright.exe',
        executableContentDigest:
          'sha256-5e77e4327329cc988dbf1039a19e62a23e29b9c4eb58f3d473cf2172adde38f2',
        fileSetDigest:
          'sha256-575b3eeac1711aca98df94f07e289d967162747a358a9019ec4b020b892994b0',
        fileCount: 342,
        totalByteLength: 174_539_580,
      },
      'sha256-14e24213f3ce2d7b8d8c97b39858d7fb6246d6f835a874709d85ab73ff0e0983'
    ),
  }),
} satisfies Readonly<
  Record<
    VerificationBrowserEngine,
    Readonly<{
      version: string;
      authorityReceipt: PlaywrightBrowserImageAuthorityReceipt;
    }>
  >
>);

const LINUX_BROWSER_IMAGES = Object.freeze({
  chromium: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.chromium,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'chromium',
        executableRelativePath: 'chrome-linux64/chrome',
        executableContentDigest:
          'sha256-2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801',
        fileSetDigest:
          'sha256-66352a58874b10309f73c57d1bbf7c5e4bcf0418a73d5c482aad21fc9b44575f',
        fileCount: 303,
        totalByteLength: 396_335_288,
      },
      'sha256-ef25a309e7789edc344ced422fdf8a06827f5917c35743b414d5c269579cae2d'
    ),
  }),
  firefox: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.firefox,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'firefox',
        executableRelativePath: 'firefox/firefox',
        executableContentDigest:
          'sha256-934ffa962b3f73809e910303568df1c435b86a6c1abdbd54a70730242ea24868',
        fileSetDigest:
          'sha256-0a0578eae64d2b9b0eabdb3eed05fbf89c4f6a3348b487a824ab28dd7f4c2b85',
        fileCount: 47,
        totalByteLength: 306_369_223,
      },
      'sha256-9fd0b52c767e011485c9b7efb93c6e815bf8924aeaf7ad1c2cfe88a1cdbc309e'
    ),
  }),
  webkit: Object.freeze({
    version: CONTROLLED_BROWSER_VERSIONS.webkit,
    authorityReceipt: adoptBrowserImageAuthorityReceipt(
      {
        engine: 'webkit',
        executableRelativePath: 'pw_run.sh',
        executableContentDigest:
          'sha256-a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b',
        fileSetDigest:
          'sha256-58d9ba47d8dc45683207cde3b3c321cc84936e5171bf5eafc1e9c82d84faead7',
        fileCount: 54,
        totalByteLength: 303_750_926,
      },
      'sha256-9fc0ef65c910a9fc6626faaa5bc27b93182334ecb68be0f09d83fec936eb6d4e'
    ),
  }),
} satisfies Readonly<
  Record<
    VerificationBrowserEngine,
    Readonly<{
      version: string;
      authorityReceipt: PlaywrightBrowserImageAuthorityReceipt;
    }>
  >
>);

const CONTROLLED_BROWSER_IMAGES_BY_PLATFORM = Object.freeze({
  windows: WINDOWS_BROWSER_IMAGES,
  'linux-20260720': LINUX_BROWSER_IMAGES,
  'linux-20260726': LINUX_BROWSER_IMAGES,
} satisfies Readonly<
  Record<
    GoldenG3V6ControlledPlatform,
    typeof WINDOWS_BROWSER_IMAGES | typeof LINUX_BROWSER_IMAGES
  >
>);

const GOLDEN_G3_V6_PLAYWRIGHT_VERSION = '1.61.1';
const GOLDEN_G3_V6_RENDERER_GENERATION = 'playwright-1-61-1-rgba-v1';

export const GOLDEN_G3_V6_FONT_FREE_SET_DIGEST =
  'sha256-cdc0cdb0eee82b4b1039323c9f4dde0b85c19aa3a207ef7426a61531764edb89';

export const GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST =
  'sha256-4f02035b5bd907b871099bab946f5468114d7b40b6e9407de284bec37314d6f5';

export const GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY = Object.freeze({
  format: 'prodivix.golden-g3-v6-browser-identity-registry',
  version: 1,
  playwrightVersion: GOLDEN_G3_V6_PLAYWRIGHT_VERSION,
  rendererGeneration: GOLDEN_G3_V6_RENDERER_GENERATION,
  operatingSystemImages: CONTROLLED_OS_IMAGES,
  browserImagesByPlatform: CONTROLLED_BROWSER_IMAGES_BY_PLATFORM,
  fontSet: Object.freeze({
    kind: 'font-free-capture-font-set',
    fonts: Object.freeze([]),
    digest: GOLDEN_G3_V6_FONT_FREE_SET_DIGEST,
  }),
});

export const selectGoldenG3V6ControlledPlatform = (
  observed: GoldenG3V6ObservedPlatformIdentity
): GoldenG3V6ControlledPlatform => {
  if (
    observed.platform === 'win32' &&
    observed.architecture === 'x64' &&
    observed.kernelRelease === '10.0.26200'
  ) {
    return 'windows';
  }
  if (
    observed.platform === 'linux' &&
    observed.architecture === 'x64' &&
    observed.githubActions === 'true' &&
    observed.imageOS === 'ubuntu24' &&
    observed.kernelRelease === '6.17.0-1020-azure'
  ) {
    if (observed.imageVersion === '20260720.247.2') {
      return 'linux-20260720';
    }
    if (observed.imageVersion === '20260726.254.1') {
      return 'linux-20260726';
    }
  }
  throw new Error(
    `Golden V6 has no pre-adopted or workflow-attested browser identity for ${observed.platform}/${observed.architecture}/${observed.kernelRelease}.`
  );
};

export const currentGoldenG3V6ControlledPlatform =
  (): GoldenG3V6ControlledPlatform =>
    selectGoldenG3V6ControlledPlatform({
      platform: process.platform,
      architecture: process.arch,
      kernelRelease: release(),
      githubActions: process.env.GITHUB_ACTIONS,
      imageOS: process.env.PRODIVIX_G3_V6_RUNNER_IMAGE_OS,
      imageVersion: process.env.PRODIVIX_G3_V6_RUNNER_IMAGE_VERSION,
    });

export const createGoldenG3V6SelectedPlatformIdentity =
  (): GoldenG3V6SelectedPlatformIdentity => {
    const platformId = currentGoldenG3V6ControlledPlatform();
    const selected = CONTROLLED_OS_IMAGES[platformId];
    return Object.freeze({
      platformId,
      platform: selected.platform,
      architecture: selected.architecture,
      image: selected.image,
      imageVersion: selected.imageVersion,
      kernelRelease: selected.kernelRelease,
      imageDigest: selected.digest,
      machineClass: selected.machineClass,
      githubActions: platformId !== 'windows',
    });
  };

export const createGoldenG3V6ControlledBrowserImageIdentities =
  (): readonly GoldenG3V6ControlledBrowserImageIdentity[] =>
    createGoldenG3V6ControlledBrowserImageIdentitiesForPlatform(
      currentGoldenG3V6ControlledPlatform()
    );

export const createGoldenG3V6ControlledBrowserImageIdentitiesForPlatform = (
  platformId: GoldenG3V6ControlledPlatform
): readonly GoldenG3V6ControlledBrowserImageIdentity[] =>
  Object.freeze(
    (
      Object.entries(
        CONTROLLED_BROWSER_IMAGES_BY_PLATFORM[platformId]
      ) as readonly Readonly<
        [
          VerificationBrowserEngine,
          (typeof WINDOWS_BROWSER_IMAGES)[VerificationBrowserEngine],
        ]
      >[]
    )
      .map(([engine, identity]) =>
        Object.freeze({
          platformId,
          engine,
          version: identity.version,
          imageDigest: identity.authorityReceipt.imageDigest,
          authorityReceipt: identity.authorityReceipt,
        })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(left.engine, right.engine)
      )
  );

export const goldenG3V6ExpectedBrowserVersion = (
  engine: VerificationBrowserEngine
): string => CONTROLLED_BROWSER_VERSIONS[engine];

export const createGoldenG3V6BrowserRuntimeIdentity = (
  cell: VerificationPlanCell
): BrowserVerificationRuntimeIdentity => {
  const engine = cell.browserEngine;
  if (!engine) {
    throw new Error(
      `Golden V6 browser identity requires an engine for "${cell.id}".`
    );
  }
  const platformId = currentGoldenG3V6ControlledPlatform();
  const platform = CONTROLLED_OS_IMAGES[platformId];
  const browser = CONTROLLED_BROWSER_IMAGES_BY_PLATFORM[platformId][engine];
  return Object.freeze({
    machineClass: platform.machineClass,
    operatingSystemImageDigest: platform.digest,
    browserImageDigest: browser.authorityReceipt.imageDigest,
    browserEngine: engine,
    browserVersion: browser.version,
    fontSetDigest: GOLDEN_G3_V6_FONT_FREE_SET_DIGEST,
    viewport: Object.freeze({
      widthCssPixels: cell.viewport.width,
      heightCssPixels: cell.viewport.height,
      devicePixelRatio: 1,
    }),
    colorScheme: cell.colorScheme,
    motionPreference: cell.motion,
    locale: cell.locale,
    cacheClass: 'cold',
    rendererGeneration: GOLDEN_G3_V6_RENDERER_GENERATION,
    normalizer: GOLDEN_G3_V6_VISUAL_NORMALIZER,
  });
};

export const createGoldenG3V6VisualCompatibilityProfile = (
  cell: Pick<
    VerificationPlanCell,
    | 'scenarioId'
    | 'targetId'
    | 'frameworkTarget'
    | 'surface'
    | 'browserEngine'
    | 'viewport'
    | 'colorScheme'
    | 'motion'
    | 'locale'
  >,
  platform: GoldenG3V6ControlledPlatform
): VisualBaselineCompatibilityProfile => {
  const engine = cell.browserEngine;
  if (!engine) {
    throw new Error(
      `Golden V6 visual compatibility requires an engine for target "${cell.targetId}".`
    );
  }
  if (!cell.scenarioId) {
    throw new Error(
      `Golden V6 visual compatibility requires a scenario for target "${cell.targetId}".`
    );
  }
  const operatingSystem = CONTROLLED_OS_IMAGES[platform];
  const browser = CONTROLLED_BROWSER_IMAGES_BY_PLATFORM[platform][engine];
  return Object.freeze({
    scenarioId: cell.scenarioId,
    stepId: 'catalog-image-visible',
    targetId: cell.targetId,
    frameworkTarget: cell.frameworkTarget,
    surface: cell.surface,
    browserEngine: engine,
    browserImageDigest: browser.authorityReceipt.imageDigest,
    operatingSystemImageDigest: operatingSystem.digest,
    fontSetDigest: GOLDEN_G3_V6_FONT_FREE_SET_DIGEST,
    viewport: Object.freeze({
      widthCssPixels: cell.viewport.width,
      heightCssPixels: cell.viewport.height,
      devicePixelRatio: 1,
    }),
    captureRegion: Object.freeze({
      widthCssPixels: 64,
      heightCssPixels: 64,
    }),
    colorScheme: cell.colorScheme,
    motionPreference: cell.motion,
    locale: cell.locale,
    rendererGeneration: GOLDEN_G3_V6_RENDERER_GENERATION,
    normalizer: GOLDEN_G3_V6_VISUAL_NORMALIZER,
    diffAlgorithm: Object.freeze({
      id: 'prodivix-rgba-absolute',
      version: 1,
    }),
  });
};

export const assertGoldenG3V6BrowserIdentityRegistry = (): void => {
  const osImages = Object.freeze({
    windows: Object.freeze({
      kind: 'controlled-os-image',
      platform: 'win32',
      image: 'windows-11-10.0.26200',
      arch: 'x64',
      imageVersion: '10.0.26200',
      kernelRelease: '10.0.26200',
    }),
    'linux-20260720': Object.freeze({
      kind: 'controlled-os-image',
      platform: 'linux',
      image: 'github-actions-ubuntu-24.04',
      arch: 'x64',
      imageVersion: '20260720.247.2',
      kernelRelease: '6.17.0-1020-azure',
    }),
    'linux-20260726': Object.freeze({
      kind: 'controlled-os-image',
      platform: 'linux',
      image: 'github-actions-ubuntu-24.04',
      arch: 'x64',
      imageVersion: '20260726.254.1',
      kernelRelease: '6.17.0-1020-azure',
    }),
  });
  for (const [platform, value] of Object.entries(osImages)) {
    const actualDigest = digestVerificationValue(value);
    if (
      actualDigest !==
      CONTROLLED_OS_IMAGES[platform as GoldenG3V6ControlledPlatform].digest
    ) {
      throw new Error(
        `Golden V6 pre-adopted ${platform} OS image digest drifted: ${actualDigest}.`
      );
    }
  }
  for (const platform of GOLDEN_G3_V6_CONTROLLED_PLATFORMS) {
    for (const [engine, browser] of Object.entries(
      CONTROLLED_BROWSER_IMAGES_BY_PLATFORM[platform]
    )) {
      const authorityReceipt = assertPlaywrightBrowserImageAuthorityReceipt(
        browser.authorityReceipt,
        browser.authorityReceipt.imageDigest
      );
      if (
        authorityReceipt.engine !== engine ||
        browser.version !==
          CONTROLLED_BROWSER_VERSIONS[engine as VerificationBrowserEngine]
      ) {
        throw new Error(
          `Golden V6 pre-adopted ${platform}/${engine} browser image authority drifted.`
        );
      }
    }
  }
  if (
    digestVerificationValue({
      kind: 'font-free-capture-font-set',
      fonts: [],
    }) !== GOLDEN_G3_V6_FONT_FREE_SET_DIGEST
  ) {
    throw new Error('Golden V6 pre-adopted font-free set digest drifted.');
  }
  const registryDigest = digestVerificationValue(
    GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY
  );
  if (registryDigest !== GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST) {
    throw new Error(
      `Golden V6 browser identity registry digest drifted: ${registryDigest}.`
    );
  }
};
