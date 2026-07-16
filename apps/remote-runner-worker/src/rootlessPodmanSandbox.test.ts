import { createHash } from 'node:crypto';
import {
  createExecutableProjectSnapshot,
  readExecutionTestReportValue,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  createRootlessPodmanRunArguments,
  createRootlessPodmanSandbox,
  decodeRootlessInstallProxyTraces,
  decodeRootlessPodmanSandboxResult,
  verifyRootlessPodmanEngine,
} from './rootlessPodmanSandbox';

describe('rootless Podman sandbox contract', () => {
  const limits = {
    maximumCpuCores: 1,
    maximumMemoryMb: 256,
    maximumDiskMb: 64,
    maximumPids: 32,
    maximumOpenFiles: 128,
    temporaryDirectoryMb: 32,
    maximumArtifactBytes: 4 * 1024 * 1024,
  } as const;

  it('requires an immutable production image', () => {
    for (const imageReference of [
      'localhost/prodivix-sandbox:latest',
      'sha256:abc',
    ]) {
      expect(() =>
        createRootlessPodmanSandbox({
          imageReference,
          limits,
        })
      ).toThrow(/immutable digest/u);
    }
  });

  it('rejects missing production resource ceilings', () => {
    for (const property of Object.keys(limits) as (keyof typeof limits)[]) {
      expect(() =>
        createRootlessPodmanSandbox({
          imageReference: `sha256:${'a'.repeat(64)}`,
          limits: { ...limits, [property]: 0 },
        })
      ).toThrow(/must be positive/u);
    }
  });

  it('fails closed when the rootless engine is unavailable', async () => {
    await expect(
      verifyRootlessPodmanEngine('prodivix-missing-podman-command')
    ).rejects.toThrow('Rootless Podman is required');
  });

  it('constructs a no-mount, no-network, least-privilege OCI invocation', () => {
    const args = createRootlessPodmanRunArguments({
      name: 'prodivix-gate',
      executionId: 'gate-security',
      imageReference: `sha256:${'a'.repeat(64)}`,
      uid: 1001,
      gid: 1001,
      cpuCores: 1,
      memoryMb: 256,
      diskMb: 64,
      pids: 32,
      openFiles: 128,
      temporaryDirectoryMb: 32,
    });
    expect(args).toEqual(
      expect.arrayContaining([
        '--interactive',
        '--network=none',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--userns=keep-id',
        '--user=1001:1001',
        '--pid=private',
        '--ipc=private',
        '--uts=private',
        '--cgroupns=private',
        '--memory=256m',
        '--memory-swap=256m',
        '--pids-limit=32',
        '--ulimit=nofile=128:128',
        '--ulimit=core=0:0',
        '--log-driver=none',
      ])
    );
    expect(args.some((arg) => arg === '-v' || arg.startsWith('--volume'))).toBe(
      false
    );
    expect(args.some((arg) => arg.startsWith('--privileged'))).toBe(false);
    expect(
      args.some(
        (arg) =>
          arg === '-e' || arg === '--env-host' || arg.startsWith('--env=')
      )
    ).toBe(false);
  });

  it('connects install only to an internal allowlist proxy without inheriting host environment', () => {
    const args = createRootlessPodmanRunArguments({
      name: 'prodivix-gate',
      imageReference: `sha256:${'a'.repeat(64)}`,
      uid: 1001,
      gid: 1001,
      cpuCores: 1,
      memoryMb: 256,
      diskMb: 64,
      pids: 32,
      openFiles: 128,
      temporaryDirectoryMb: 32,
      installNetworkName: 'prodivix-install-egress',
      installProxyUrl: 'http://install-trace-1234@prodivix-install-proxy:8080/',
    });
    expect(args).toContain('--network=prodivix-install-egress');
    expect(args).toEqual(
      expect.arrayContaining([
        '--env=HTTP_PROXY=http://install-trace-1234@prodivix-install-proxy:8080/',
        '--env=HTTPS_PROXY=http://install-trace-1234@prodivix-install-proxy:8080/',
        '--env=NO_PROXY=localhost,127.0.0.1,::1',
      ])
    );
    expect(args).not.toContain('--env-host');
    expect(() =>
      createRootlessPodmanSandbox({
        imageReference: `sha256:${'a'.repeat(64)}`,
        installNetworkPolicy: {
          mode: 'proxy-allowlist',
          networkName: '../host',
          proxyUrl: 'http://prodivix-install-proxy:8080/',
          proxyContainerName: 'prodivix-install-proxy',
          allowedHosts: ['registry.npmjs.org'],
        },
        limits,
      })
    ).toThrow(/install network policy/u);
  });

  it('strictly sanitizes proxy traces to origin-only metadata', () => {
    const traces = decodeRootlessInstallProxyTraces(
      JSON.stringify({
        protocol: 'prodivix.install-egress-trace.v1',
        requestId: 'install-trace-1234',
        method: 'CONNECT',
        host: 'registry.npmjs.org',
        port: 443,
        startedAt: 100,
        completedAt: 125,
        outcome: 'allowed',
        status: 200,
        requestBytes: 12,
        responseBytes: 24,
      }),
      'install-trace-1234'
    );
    expect(traces).toEqual([
      {
        requestId: 'install-trace-1234:1',
        method: 'CONNECT',
        sanitizedUrl: 'https://registry.npmjs.org/',
        protocol: 'https',
        startedAt: 100,
        completedAt: 125,
        outcome: 'allowed',
        status: 200,
        requestBytes: 12,
        responseBytes: 24,
      },
    ]);
    expect(JSON.stringify(traces)).not.toContain('token');
    expect(() =>
      decodeRootlessInstallProxyTraces(
        JSON.stringify({
          protocol: 'prodivix.install-egress-trace.v1',
          requestId: 'install-trace-1234',
          method: 'CONNECT',
          host: 'registry.npmjs.org',
          port: 443,
          startedAt: 100,
          completedAt: 125,
          outcome: 'allowed',
          status: 200,
          requestBytes: 12,
          responseBytes: 24,
          query: 'token=secret',
        }),
        'install-trace-1234'
      )
    ).toThrow(/unknown fields/u);
  });

  it('strictly decodes bounded Build artifacts and restores source trace', () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'index.html',
          contents: '<div id="root"></div>',
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'build', path: 'index.html' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'test'],
      },
    });
    const buildFile = Buffer.from('<main/>', 'utf8');
    const contents = Buffer.from(
      JSON.stringify({
        format: 'prodivix.execution-build-bundle.v1',
        snapshotDigest: snapshot.contentDigest,
        target: snapshot.target,
        files: [
          {
            path: 'index.html',
            size: buildFile.byteLength,
            digest: `sha256-${createHash('sha256')
              .update(buildFile)
              .digest('hex')}`,
            encoding: 'base64',
            contents: buildFile.toString('base64'),
          },
        ],
      }),
      'utf8'
    );
    const result = decodeRootlessPodmanSandboxResult(
      JSON.stringify({
        protocol: 'prodivix.sandbox-result.v1',
        exitCode: 0,
        stdout: Buffer.from('built').toString('base64'),
        stderr: '',
        outputTruncated: false,
        artifacts: [
          {
            artifactId: `build-bundle:${snapshot.contentDigest}`,
            kind: 'bundle',
            label: 'Remote build bundle',
            mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
            metadata: { fileCount: '1' },
            contents: contents.toString('base64'),
          },
        ],
      }),
      snapshot,
      'build',
      2_000,
      1_000,
      contents.byteLength
    );

    expect(result).toMatchObject({ status: 'succeeded', stdout: 'built' });
    expect(result.artifacts?.[0]).toMatchObject({
      sourceTrace: [
        {
          sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
        },
      ],
    });
    expect(result.artifacts?.[0]?.contents).toEqual(new Uint8Array(contents));
    expect(() =>
      decodeRootlessPodmanSandboxResult(
        JSON.stringify({
          protocol: 'prodivix.sandbox-result.v1',
          exitCode: 0,
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [
            {
              artifactId: 'bundle',
              kind: 'bundle',
              mediaType: 'application/json',
              contents: contents.toString('base64'),
              unexpected: true,
            },
          ],
        }),
        snapshot,
        'build',
        2_000,
        1_000,
        contents.byteLength
      )
    ).toThrow(/unknown fields/u);
  });

  it('publishes a healthy static Preview only after validating its entrypoint', () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'src/main.tsx',
          contents: 'export {}',
          sourceTrace: [
            { sourceRef: { kind: 'document', documentId: 'page-1' } },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'preview', path: 'src/main.tsx' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'test'],
      },
    });
    const entry = Buffer.from('<main>ready</main>');
    const buildBundle = {
      format: 'prodivix.execution-build-bundle.v1',
      snapshotDigest: snapshot.contentDigest,
      target: snapshot.target,
      files: [
        {
          path: 'index.html',
          size: entry.byteLength,
          digest: `sha256-${createHash('sha256').update(entry).digest('hex')}`,
          encoding: 'base64',
          contents: entry.toString('base64'),
        },
      ],
    };
    const contents = Buffer.from(
      JSON.stringify({
        format: 'prodivix.execution-preview-bundle.v1',
        entryFilePath: 'index.html',
        bundle: buildBundle,
      })
    );
    const result = decodeRootlessPodmanSandboxResult(
      JSON.stringify({
        protocol: 'prodivix.sandbox-result.v1',
        exitCode: 0,
        stdout: '',
        stderr: '',
        outputTruncated: false,
        artifacts: [
          {
            artifactId: `preview-bundle:${snapshot.contentDigest}`,
            kind: 'bundle',
            label: 'Remote static preview bundle',
            mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
            metadata: {
              snapshotDigest: snapshot.contentDigest,
              readiness: 'ready',
              health: 'healthy',
              entryFilePath: 'index.html',
            },
            contents: contents.toString('base64'),
          },
        ],
      }),
      snapshot,
      'preview',
      2_000,
      1_000,
      contents.byteLength
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      artifacts: [
        {
          kind: 'bundle',
          metadata: { readiness: 'ready', health: 'healthy' },
          sourceTrace: [
            { sourceRef: { kind: 'document', documentId: 'page-1' } },
          ],
        },
      ],
    });
  });

  it('converts a private Vitest result into the canonical Test report', () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'src/App.test.tsx',
          contents: 'export {}',
          sourceTrace: [
            {
              sourceRef: { kind: 'document', documentId: 'page-1' },
            },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'src/App.test.tsx' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'test'],
      },
    });
    const privateReport = Buffer.from(
      JSON.stringify({
        success: true,
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'passed',
            assertionResults: [
              {
                title: 'renders',
                fullName: 'App renders',
                status: 'passed',
                failureMessages: [],
              },
            ],
          },
        ],
      }),
      'utf8'
    );
    const result = decodeRootlessPodmanSandboxResult(
      JSON.stringify({
        protocol: 'prodivix.sandbox-result.v1',
        exitCode: 0,
        stdout: '',
        stderr: '',
        outputTruncated: false,
        artifacts: [
          {
            artifactId: `vitest-report:${snapshot.contentDigest}`,
            kind: 'report',
            label: 'Vitest private report',
            mediaType: 'application/vnd.vitest.report+json',
            metadata: { adapter: 'vitest' },
            contents: privateReport.toString('base64'),
          },
        ],
      }),
      snapshot,
      'test',
      2_000,
      1_000,
      128 * 1024
    );
    const artifact = result.artifacts?.[0];
    const report = readExecutionTestReportValue(
      JSON.parse(Buffer.from(artifact!.contents).toString('utf8')) as unknown
    );

    expect(artifact).toMatchObject({
      artifactId: `test-report:${snapshot.contentDigest}`,
      kind: 'report',
      mediaType: 'application/vnd.prodivix.test-report+json',
      metadata: { status: 'passed', totalCases: '1' },
      sourceTrace: [{ sourceRef: { kind: 'document', documentId: 'page-1' } }],
    });
    expect(report).toMatchObject({
      kind: 'test-report',
      status: 'passed',
      completedAt: 2_000,
      summary: { totalFiles: 1, totalCases: 1 },
    });
  });
});
