import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type Page,
} from '@playwright/test';

export type GoldenBrowserGpuEvidence = Readonly<{
  secureContext: boolean;
  webgl2: Readonly<{
    available: boolean;
    shaderCompiled: boolean;
    version?: string;
  }>;
  webgpu: Readonly<{
    apiAvailable: boolean;
    adapterAvailable: boolean;
    deviceAvailable: boolean;
    shaderCompiled: boolean;
  }>;
}>;

export type GoldenBrowserEngine = 'chromium' | 'firefox' | 'webkit';

export type GoldenBrowserEngineVersions = Readonly<
  Record<GoldenBrowserEngine, string>
>;

export type GoldenBrowserProjectEvidence = Readonly<{
  bundleFileCount: number;
  packageManager: string;
  completedCommands: readonly [
    'install',
    'typecheck',
    'test',
    'build',
    'browser-smoke',
  ];
  browserEngine: GoldenBrowserEngine;
  browserChannel: string;
  browserVersion: string;
  routePath: string;
  gpu: GoldenBrowserGpuEvidence;
}>;

export type VerifyGoldenBrowserProjectOptions = Readonly<{
  routePath: string;
  browserEngine?: GoldenBrowserEngine;
  browserChannel?: string;
  preparePage?: (page: Page, projectUrl: string) => Promise<void>;
  verifyPage?: (page: Page) => Promise<void>;
}>;

export type GoldenBrowserLaunchConfiguration =
  | Readonly<{
      browserEngine: 'chromium';
      browserChannel: string;
      chromiumArgs: readonly string[];
    }>
  | Readonly<{
      browserEngine: 'firefox' | 'webkit';
      browserChannel: string;
    }>;

export const resolveGoldenBrowserLaunchConfiguration = (
  options: Pick<
    VerifyGoldenBrowserProjectOptions,
    'browserEngine' | 'browserChannel'
  >
): GoldenBrowserLaunchConfiguration => {
  const browserEngine = options.browserEngine ?? 'chromium';
  const requestedBrowserChannel = options.browserChannel?.trim();
  if (browserEngine !== 'chromium' && requestedBrowserChannel) {
    throw new Error(
      'Golden browserChannel is only supported by the Chromium engine.'
    );
  }
  if (browserEngine === 'chromium') {
    return Object.freeze({
      browserEngine,
      browserChannel: requestedBrowserChannel || 'chrome',
      chromiumArgs: Object.freeze([
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=swiftshader',
        '--use-gpu-in-tests',
      ]),
    });
  }
  return Object.freeze({
    browserEngine,
    browserChannel: browserEngine,
  });
};

/**
 * Observes the bundled engines that the first-party Playwright pool will use.
 * Runtime leases bind these exact versions before any matrix attempt starts.
 */
export const observeGoldenBrowserEngineVersions =
  async (): Promise<GoldenBrowserEngineVersions> => {
    const entries = await Promise.all(
      (
        [
          ['chromium', chromium],
          ['firefox', firefox],
          ['webkit', webkit],
        ] as const
      ).map(async ([engine, browserType]) => {
        const browser = await browserType.launch({ headless: true });
        try {
          return [engine, browser.version()] as const;
        } finally {
          await browser.close();
        }
      })
    );
    return Object.freeze(
      Object.fromEntries(entries)
    ) as GoldenBrowserEngineVersions;
  };

export const launchGoldenBrowser = async (
  launch: GoldenBrowserLaunchConfiguration
): Promise<Browser> => {
  if (launch.browserEngine === 'chromium') {
    return chromium.launch({
      channel:
        launch.browserChannel === 'chromium'
          ? undefined
          : launch.browserChannel,
      headless: true,
      args: [...launch.chromiumArgs],
    });
  }
  if (launch.browserEngine === 'firefox') {
    return firefox.launch({ headless: true });
  }
  return webkit.launch({ headless: true });
};

export const collectGoldenBrowserGpuEvidence = async (
  page: Page
): Promise<GoldenBrowserGpuEvidence> =>
  page.evaluate(async (): Promise<GoldenBrowserGpuEvidence> => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    let webglShaderCompiled = false;
    let webglVersion: string | undefined;
    if (gl) {
      webglVersion = String(gl.getParameter(gl.VERSION));
      const compileShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return undefined;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
        gl.deleteShader(shader);
        return undefined;
      };
      const vertex = compileShader(
        gl.VERTEX_SHADER,
        '#version 300 es\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }'
      );
      const fragment = compileShader(
        gl.FRAGMENT_SHADER,
        '#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { color = vec4(1.0); }'
      );
      if (vertex && fragment) {
        const program = gl.createProgram();
        if (program) {
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          webglShaderCompiled = Boolean(
            gl.getProgramParameter(program, gl.LINK_STATUS)
          );
          gl.deleteProgram(program);
        }
      }
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }

    type MinimalGpuDevice = Readonly<{
      createShaderModule: (input: Readonly<{ code: string }>) => Readonly<{
        getCompilationInfo: () => Promise<
          Readonly<{
            messages: readonly Readonly<{ type: string }>[];
          }>
        >;
      }>;
      destroy: () => void;
    }>;
    type MinimalGpuAdapter = Readonly<{
      requestDevice: () => Promise<MinimalGpuDevice>;
    }>;
    type MinimalGpu = Readonly<{
      requestAdapter: (
        options?: Readonly<{ powerPreference?: string }>
      ) => Promise<MinimalGpuAdapter | null>;
    }>;
    const gpu = (navigator as Navigator & { gpu?: MinimalGpu }).gpu;
    let adapter: MinimalGpuAdapter | null = null;
    let device: MinimalGpuDevice | undefined;
    let webgpuShaderCompiled = false;
    if (gpu) {
      adapter = await gpu.requestAdapter();
      if (adapter) {
        device = await adapter.requestDevice();
        const shader = device.createShaderModule({
          code: '@compute @workgroup_size(1) fn main() {}',
        });
        const compilation = await shader.getCompilationInfo();
        webgpuShaderCompiled = !compilation.messages.some(
          ({ type }) => type === 'error'
        );
      }
    }
    const evidence: GoldenBrowserGpuEvidence = {
      secureContext: window.isSecureContext,
      webgl2: {
        available: Boolean(gl),
        shaderCompiled: webglShaderCompiled,
        ...(webglVersion ? { version: webglVersion } : {}),
      },
      webgpu: {
        apiAvailable: Boolean(gpu),
        adapterAvailable: Boolean(adapter),
        deviceAvailable: Boolean(device),
        shaderCompiled: webgpuShaderCompiled,
      },
    };
    device?.destroy();
    return evidence;
  });
