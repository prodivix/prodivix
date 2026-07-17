import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { ReactExportBundle } from '@prodivix/prodivix-compiler';
import { build, transformWithOxc } from 'vite';

export type GoldenBuildEvidence = Readonly<{
  bundleFileCount: number;
  emittedFileCount: number;
  transformedModuleCount: number;
}>;

export type GoldenStandaloneProjectEvidence = Readonly<{
  bundleFileCount: number;
  packageManager: string;
  completedCommands: readonly ['install', 'typecheck', 'test', 'build'];
}>;

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
  browserChannel: string;
  browserVersion: string;
  routePath: string;
  gpu: GoldenBrowserGpuEvidence;
}>;

export type VerifyGoldenBrowserProjectOptions = Readonly<{
  routePath: string;
  browserChannel?: string;
  verifyPage?: (page: Page) => Promise<void>;
}>;

const resolveSafeOutputPath = (root: string, filePath: string): string => {
  const target = resolve(root, filePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Generated file escaped the Golden build root: ${filePath}`
    );
  }
  return target;
};

const writeBundle = async (
  root: string,
  bundle: ReactExportBundle
): Promise<void> => {
  for (const file of bundle.files) {
    const target = resolveSafeOutputPath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
};

const isBareImport = (id: string): boolean =>
  !id.startsWith('.') &&
  !id.startsWith('/') &&
  !id.startsWith('\0') &&
  !/^[a-zA-Z]:[\\/]/.test(id);

type GoldenRollupOutput = Readonly<{ output: readonly unknown[] }>;

const countRollupOutputs = (
  output: GoldenRollupOutput | GoldenRollupOutput[]
): number =>
  (Array.isArray(output) ? output : [output]).reduce(
    (count, item) => count + item.output.length,
    0
  );

const transformGeneratedModules = async (
  bundle: ReactExportBundle
): Promise<number> => {
  const extensions = [
    '.cjs',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.mts',
    '.ts',
    '.tsx',
  ];
  let transformed = 0;
  for (const file of bundle.files) {
    if (typeof file.contents !== 'string') continue;
    const extension = extensions.find((candidate) =>
      file.path.endsWith(candidate)
    );
    if (!extension) continue;
    await transformWithOxc(file.contents, file.path);
    transformed += 1;
  }
  return transformed;
};

const runPnpm = async (
  root: string,
  packageManager: string,
  args: readonly string[],
  timeoutMs = 300_000
): Promise<void> => {
  const command = `corepack ${packageManager} ${args.join(' ')}`;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: root,
      env: {
        ...process.env,
        CI: '1',
        COREPACK_ENABLE_PROJECT_SPEC: '0',
      },
      shell: true,
      windowsHide: true,
    });
    let output = '';
    const collect = (chunk: Buffer | string): void => {
      output = `${output}${String(chunk)}`.slice(-32_000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(
        new Error(`${command} exceeded ${timeoutMs}ms.\n${output}`)
      );
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(`${command} exited with code ${code}.\n${output}`)
        );
    });
  });
};

const readBundlePackageManager = (bundle: ReactExportBundle): string => {
  const packageFile = bundle.files.find(({ path }) => path === 'package.json');
  if (!packageFile || typeof packageFile.contents !== 'string') {
    throw new Error('Golden standalone export has no package.json.');
  }
  const packageManager = (
    JSON.parse(packageFile.contents) as Readonly<{ packageManager?: unknown }>
  ).packageManager;
  if (
    typeof packageManager !== 'string' ||
    !/^pnpm@[0-9A-Za-z._+-]+$/.test(packageManager)
  ) {
    throw new Error(
      'Golden standalone export must declare one executable pnpm version.'
    );
  }
  return packageManager;
};

const runStandaloneProjectCommands = async (
  root: string,
  packageManager: string
): Promise<void> => {
  await runPnpm(root, packageManager, [
    'install',
    '--frozen-lockfile=false',
    '--prefer-offline',
  ]);
  await runPnpm(root, packageManager, ['typecheck']);
  await runPnpm(root, packageManager, ['test']);
  await runPnpm(root, packageManager, ['build']);
};

const goldenStaticContentTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
} as const);

type GoldenStaticServer = Readonly<{
  origin: string;
  close: () => Promise<void>;
}>;

const readGoldenStaticResponse = async (
  distRoot: string,
  requestPath: string
): Promise<Readonly<{ contents: Buffer; filePath: string }>> => {
  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    // An invalid URI is intentionally served by the SPA fallback.
  }
  const relativePath = decodedPath.replace(/^\/+/, '');
  const candidate = resolve(distRoot, relativePath || 'index.html');
  const safeCandidate =
    candidate !== distRoot && candidate.startsWith(`${distRoot}${sep}`)
      ? candidate
      : resolve(distRoot, 'index.html');
  try {
    return { contents: await readFile(safeCandidate), filePath: safeCandidate };
  } catch {
    const fallback = resolve(distRoot, 'index.html');
    return { contents: await readFile(fallback), filePath: fallback };
  }
};

const startGoldenStaticServer = async (
  distRoot: string
): Promise<GoldenStaticServer> => {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const payload = await readGoldenStaticResponse(
        distRoot,
        requestUrl.pathname
      );
      const contentType =
        goldenStaticContentTypes[
          extname(
            payload.filePath
          ).toLowerCase() as keyof typeof goldenStaticContentTypes
        ] ?? 'application/octet-stream';
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': contentType,
      });
      response.end(request.method === 'HEAD' ? undefined : payload.contents);
    } catch (error) {
      response.writeHead(500, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Golden browser server has no TCP address.');
  }
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.closeAllConnections();
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise()
        );
      }),
  });
};

const collectGoldenBrowserGpuEvidence = async (
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

/** Syntax-checks every generated module and builds the reachable graph without a server. */
export const buildGoldenExportBundle = async (
  bundle: ReactExportBundle
): Promise<GoldenBuildEvidence> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-'));
  try {
    const transformedModuleCount = await transformGeneratedModules(bundle);
    await writeBundle(root, bundle);
    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        rollupOptions: {
          external: isBareImport,
        },
      },
    });
    return {
      bundleFileCount: bundle.files.length,
      emittedFileCount: countRollupOutputs(
        output as GoldenRollupOutput | GoldenRollupOutput[]
      ),
      transformedModuleCount,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

/** Verifies the generated bundle as an independent package without a server. */
export const verifyGoldenStandaloneProject = async (
  bundle: ReactExportBundle
): Promise<GoldenStandaloneProjectEvidence> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-standalone-'));
  try {
    const packageManager = readBundlePackageManager(bundle);
    await writeBundle(root, bundle);
    await runStandaloneProjectCommands(root, packageManager);
    return {
      bundleFileCount: bundle.files.length,
      packageManager,
      completedCommands: ['install', 'typecheck', 'test', 'build'],
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

/**
 * Runs the independent package Gate, serves its production output, and uses a
 * real browser origin for runtime and GPU capability evidence.
 */
export const verifyGoldenBrowserProject = async (
  bundle: ReactExportBundle,
  options: VerifyGoldenBrowserProjectOptions
): Promise<GoldenBrowserProjectEvidence> => {
  if (
    !options.routePath.startsWith('/') ||
    options.routePath.startsWith('//')
  ) {
    throw new Error(
      'Golden browser routePath must be an origin-relative path.'
    );
  }
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-browser-'));
  let staticServer: GoldenStaticServer | undefined;
  let browser: Browser | undefined;
  try {
    const packageManager = readBundlePackageManager(bundle);
    await writeBundle(root, bundle);
    await runStandaloneProjectCommands(root, packageManager);
    staticServer = await startGoldenStaticServer(resolve(root, 'dist'));
    const browserChannel = options.browserChannel?.trim() || 'chrome';
    browser = await chromium.launch({
      channel: browserChannel === 'chromium' ? undefined : browserChannel,
      headless: true,
      args: [
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=swiftshader',
        '--use-gpu-in-tests',
      ],
    });
    const page = await browser.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.goto(new URL(options.routePath, staticServer.origin).href, {
      waitUntil: 'networkidle',
    });
    await options.verifyPage?.(page);
    const gpu = await collectGoldenBrowserGpuEvidence(page);
    if (runtimeErrors.length > 0) {
      throw new Error(
        `Golden browser runtime reported errors:\n${runtimeErrors.join('\n')}`
      );
    }
    const evidence: GoldenBrowserProjectEvidence = {
      bundleFileCount: bundle.files.length,
      packageManager,
      completedCommands: [
        'install',
        'typecheck',
        'test',
        'build',
        'browser-smoke',
      ],
      browserChannel,
      browserVersion: browser.version(),
      routePath: options.routePath,
      gpu,
    };
    return Object.freeze(evidence);
  } finally {
    await browser?.close();
    await staticServer?.close();
    await rm(root, { recursive: true, force: true });
  }
};
