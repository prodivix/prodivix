import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  type ExecutableProjectSnapshot,
  type ExecutionAuthSessionFixtureResponse,
} from '@prodivix/runtime-core';
import { build, transformWithOxc } from 'vite';
import {
  collectGoldenBrowserGpuEvidence,
  launchGoldenBrowser,
  resolveGoldenBrowserLaunchConfiguration,
  type GoldenBrowserProjectEvidence,
  type VerifyGoldenBrowserProjectOptions as GoldenBrowserInteractionOptions,
} from './generatedProjectBrowserEngine';
import {
  readGoldenGeneratedProjectPackageManager,
  runGoldenPreparedToolchainEvidence,
  runGoldenStandaloneProjectCommands,
  writeGoldenGeneratedProjectBundle,
  type GoldenGeneratedProjectBundle,
  type GoldenPreparedProjectToolchainEvidence,
} from './generatedProjectToolchain';
import { GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT } from './goldenG3V6RuntimeControlBindings';

export {
  observeGoldenBrowserEngineVersions,
  resolveGoldenBrowserLaunchConfiguration,
  type GoldenBrowserEngine,
  type GoldenBrowserEngineVersions,
  type GoldenBrowserGpuEvidence,
  type GoldenBrowserLaunchConfiguration,
  type GoldenBrowserProjectEvidence,
} from './generatedProjectBrowserEngine';
export type {
  GoldenGeneratedProjectBundle,
  GoldenPreparedProjectToolchainEvidence,
} from './generatedProjectToolchain';

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

export type GoldenPreparedBrowserProject = Readonly<{
  bundleFileCount: number;
  packageManager: string;
  origin: string;
  toolchain?: GoldenPreparedProjectToolchainEvidence;
  dispose(): Promise<void>;
}>;

export type PrepareGoldenBrowserProjectOptions = Readonly<{
  executableSnapshot?: ExecutableProjectSnapshot;
  authSessionFixtureResponse?: ExecutionAuthSessionFixtureResponse;
}>;

export type VerifyGoldenBrowserProjectOptions =
  GoldenBrowserInteractionOptions &
    Readonly<{
      authSessionFixtureResponse?: ExecutionAuthSessionFixtureResponse;
    }>;

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
  bundle: GoldenGeneratedProjectBundle
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

export const GOLDEN_BROWSER_RESPONSE_POLICIES = Object.freeze({
  contentSecurityPolicy:
    "default-src 'none'; base-uri 'none'; child-src 'none'; connect-src 'self'; font-src 'self' data:; form-action 'none'; frame-src 'none'; img-src 'self' data:; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'none'",
  permissionsPolicy:
    'camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), publickey-credentials-get=(), usb=()',
});

const GOLDEN_BROWSER_HOST_CONTENT_SECURITY_POLICY =
  GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy.replace(
    "frame-src 'none'",
    "frame-src 'self'"
  );

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
  distRoot: string,
  authSessionFixtureResponse?: ExecutionAuthSessionFixtureResponse
): Promise<GoldenStaticServer> => {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (
        requestUrl.pathname === EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH
      ) {
        if (
          !authSessionFixtureResponse ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          response.writeHead(authSessionFixtureResponse ? 405 : 404, {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
          });
          response.end();
          return;
        }
        const payload = Buffer.from(
          JSON.stringify(authSessionFixtureResponse),
          'utf8'
        );
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': payload.byteLength,
          'content-type': EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        });
        response.end(request.method === 'HEAD' ? undefined : payload);
        return;
      }
      if (requestUrl.pathname === '/__prodivix-golden-host.html') {
        const payload = Buffer.from(
          GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT,
          'utf8'
        );
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': payload.byteLength,
          'content-security-policy':
            GOLDEN_BROWSER_HOST_CONTENT_SECURITY_POLICY,
          'content-type': 'text/html; charset=utf-8',
          'permissions-policy':
            GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy,
        });
        response.end(request.method === 'HEAD' ? undefined : payload);
        return;
      }
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
        'content-length': payload.contents.byteLength,
        'content-security-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy,
        'content-type': contentType,
        'permissions-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy,
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

/**
 * Builds and serves a generated target once so a matrix can reuse the target
 * while keeping every browser attempt in a fresh context.
 */
export const prepareGoldenBrowserProject = async (
  bundle: GoldenGeneratedProjectBundle,
  options: PrepareGoldenBrowserProjectOptions = {}
): Promise<GoldenPreparedBrowserProject> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-browser-'));
  let staticServer: GoldenStaticServer | undefined;
  try {
    const packageManager = readGoldenGeneratedProjectPackageManager(bundle);
    const toolchain = options.executableSnapshot
      ? await runGoldenPreparedToolchainEvidence(options.executableSnapshot)
      : undefined;
    if (toolchain && options.executableSnapshot) {
      await writeGoldenGeneratedProjectBundle(root, {
        files: toolchain.buildBundle.files.map((file) => ({
          path: `${options.executableSnapshot!.buildPlan.outputDirectoryPath}/${file.path}`,
          contents: file.contents,
        })),
      });
    } else {
      await writeGoldenGeneratedProjectBundle(root, bundle);
      await runGoldenStandaloneProjectCommands(root, packageManager);
    }
    staticServer = await startGoldenStaticServer(
      resolve(
        root,
        options.executableSnapshot?.buildPlan.outputDirectoryPath ?? 'dist'
      ),
      options.authSessionFixtureResponse
    );
    let disposed = false;
    return Object.freeze({
      bundleFileCount: bundle.files.length,
      packageManager,
      origin: staticServer.origin,
      ...(toolchain ? { toolchain } : {}),
      dispose: async (): Promise<void> => {
        if (disposed) return;
        disposed = true;
        try {
          await staticServer?.close();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    });
  } catch (error) {
    try {
      await staticServer?.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    throw error;
  }
};

/** Syntax-checks every generated module and builds the reachable graph without a server. */
export const buildGoldenExportBundle = async (
  bundle: GoldenGeneratedProjectBundle
): Promise<GoldenBuildEvidence> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-'));
  try {
    const transformedModuleCount = await transformGeneratedModules(bundle);
    await writeGoldenGeneratedProjectBundle(root, bundle);
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
  bundle: GoldenGeneratedProjectBundle
): Promise<GoldenStandaloneProjectEvidence> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-standalone-'));
  try {
    const packageManager = readGoldenGeneratedProjectPackageManager(bundle);
    await writeGoldenGeneratedProjectBundle(root, bundle);
    await runGoldenStandaloneProjectCommands(root, packageManager);
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
  bundle: GoldenGeneratedProjectBundle,
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
  const launch = resolveGoldenBrowserLaunchConfiguration(options);
  let project: GoldenPreparedBrowserProject | undefined;
  let browser: Awaited<ReturnType<typeof launchGoldenBrowser>> | undefined;
  try {
    project = await prepareGoldenBrowserProject(bundle, {
      authSessionFixtureResponse: options.authSessionFixtureResponse,
    });
    browser = await launchGoldenBrowser(launch);
    const page = await browser.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    const projectUrl = new URL(options.routePath, project.origin).href;
    if (options.preparePage) await options.preparePage(page, projectUrl);
    else await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
    await options.verifyPage?.(page);
    const gpu = await collectGoldenBrowserGpuEvidence(page);
    if (runtimeErrors.length > 0) {
      throw new Error(
        `Golden browser runtime reported errors:\n${runtimeErrors.join('\n')}`
      );
    }
    const evidence: GoldenBrowserProjectEvidence = {
      bundleFileCount: bundle.files.length,
      packageManager: project.packageManager,
      completedCommands: [
        'install',
        'typecheck',
        'test',
        'build',
        'browser-smoke',
      ],
      browserEngine: launch.browserEngine,
      browserChannel: launch.browserChannel,
      browserVersion: browser.version(),
      routePath: options.routePath,
      gpu,
    };
    return Object.freeze(evidence);
  } finally {
    try {
      await browser?.close();
    } finally {
      await project?.dispose();
    }
  }
};
