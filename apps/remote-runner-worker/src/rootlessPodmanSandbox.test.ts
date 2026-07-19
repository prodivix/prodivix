import { createHash } from 'node:crypto';
import {
  createExecutableProjectSnapshot,
  createExecutionRequest,
  createExecutionFilesystemDiff,
  decodeExecutionFilesystemDiff,
  encodeExecutionFilesystemDiff,
  readExecutionTestReportValue,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
} from '@prodivix/runtime-core';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
  createServerFunctionInvocationTrace,
  encodeServerRuntimeTestInvocationTraces,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  SERVER_RUNTIME_TEST_INVOCATION_TRACE_MEDIA_TYPE,
  toExecutionServerFunctionBridgeSuccess,
} from '@prodivix/server-runtime';
import { describe, expect, it } from 'vitest';
import {
  createRootlessPodmanRunArguments,
  createRootlessPodmanSandbox,
  createRootlessPodmanSandboxWirePayload,
  createRootlessInstallProxyUrl,
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
        '--tmpfs=/workspace:rw,nosuid,nodev,size=64m,mode=0777',
        '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777',
      ])
    );
    expect(args.some((arg) => /(?:^|,)uid=|(?:^|,)gid=/u.test(arg))).toBe(
      false
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
    expect(
      createRootlessInstallProxyUrl(
        'http://prodivix-install-proxy:8080/',
        'install-trace-1234'
      )
    ).toBe(
      'http://install-trace-1234:prodivix-sandbox@prodivix-install-proxy:8080/'
    );
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

  it('keeps invocation and Secret material out of the install-phase payload', () => {
    const secretCanary = 'post-install-secret-material-canary';
    const functionRef = {
      artifactId: 'code-secret',
      exportName: 'useSecret',
    } as const;
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: {
        presetId: 'isolated-server-function',
        framework: 'typescript',
        runtime: 'node',
      },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'src/.prodivix/server-runtime/invoke.mjs',
          contents: 'export {};',
        },
        {
          path: 'src/.prodivix/server-runtime/function.mjs',
          contents: 'export const useSecret = () => undefined;',
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [
        {
          kind: 'production',
          path: 'src/.prodivix/server-runtime/invoke.mjs',
        },
      ],
      capabilityRequirements: {
        preview: [],
        build: [],
        test: [],
        production: [
          'artifacts',
          'cancellation',
          'dependency-install',
          'environment-binding',
          'filesystem',
          'server-function',
          'source-trace',
          'streaming-logs',
          'timeout',
        ],
      },
      serverFunctionPlan: {
        format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
        command: {
          command: 'node',
          args: ['src/.prodivix/server-runtime/invoke.mjs'],
        },
        entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
        sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
        functionRef,
        runtimeManifest: {
          schemaVersion: '1.0',
          functionsByExport: {
            useSecret: {
              kind: 'function',
              runtimeZone: 'server',
              adapterId: 'prodivix.code-export',
              effect: 'read',
              auth: { kind: 'public' },
              inputSchema: true,
              outputSchema: true,
              environment: {
                secretsByField: {
                  signingKey: { bindingId: 'signing-key' },
                },
              },
            },
          },
        },
      },
    });
    const request = createExecutionRequest({
      requestId: 'request-secret',
      profile: 'production',
      runtimeZone: 'server',
      workspace: snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: functionRef.artifactId,
        },
        entrypoint: functionRef.exportName,
        input: {
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
          requestId: 'invocation-secret:1',
          invocationId: 'invocation-secret',
          attempt: 1,
          functionRef,
          input: { value: 'invocation-input-canary' },
        },
      },
      requiredCapabilities: ['environment-binding', 'server-function'],
    });
    const wire = createRootlessPodmanSandboxWirePayload(
      snapshot,
      'production',
      64 * 1024,
      4 * 1024 * 1024,
      request,
      undefined,
      {
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: { signingKey: secretCanary },
      }
    );
    const install = JSON.parse(wire.installPayload) as Record<string, unknown>;
    const execution = JSON.parse(wire.executionPermission) as Record<
      string,
      unknown
    >;
    const controlNonce = String(install.controlNonce);

    expect(wire.installPayload).not.toContain(secretCanary);
    expect(wire.installPayload).not.toContain('invocation-input-canary');
    expect(install).not.toHaveProperty('serverFunctionRequest');
    expect(install).not.toHaveProperty('serverFunctionSecrets');
    expect(install.serverFunctionRuntime).toEqual({
      hasAuthority: false,
      secretFields: ['signingKey'],
    });
    expect(execution).toMatchObject({
      format: 'prodivix.sandbox-execution-permission.v1',
      token: 'PRODIVIX_SANDBOX_CONTINUE_V1',
      controlNonce,
      serverFunctionSecrets: {
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: { signingKey: secretCanary },
      },
    });
    expect(JSON.stringify(execution)).toContain('invocation-input-canary');
    expect(wire.installCompleteMarker).toBe(
      `PRODIVIX_SANDBOX_INSTALL_COMPLETE_V1:${controlNonce}`
    );
    expect(wire.captureReadyMarker).toBe(
      `PRODIVIX_SANDBOX_CAPTURE_READY_V1:${controlNonce}`
    );
    expect(wire.captureExecutionPermission).toBe(
      `PRODIVIX_SANDBOX_CAPTURE_V1:${controlNonce}`
    );
    expect(wire.installCompleteMarker).not.toBe(
      'PRODIVIX_SANDBOX_INSTALL_COMPLETE_V1'
    );
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

  it('canonicalizes one production Server Function result against its snapshot', () => {
    const functionRef = {
      artifactId: 'code-server-greeting',
      exportName: 'getGreeting',
    } as const;
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: {
        presetId: 'isolated-server-function',
        framework: 'typescript',
        runtime: 'node',
      },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'src/.prodivix/server-runtime/invoke.mjs',
          contents: 'export {};',
        },
        {
          path: 'src/.prodivix/server-runtime/function.mjs',
          contents: 'export const getGreeting = () => undefined;',
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: functionRef.artifactId,
              },
            },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [
        {
          kind: 'production',
          path: 'src/.prodivix/server-runtime/invoke.mjs',
        },
      ],
      capabilityRequirements: {
        preview: [],
        build: [],
        test: [],
        production: [
          'artifacts',
          'cancellation',
          'dependency-install',
          'filesystem',
          'server-function',
          'source-trace',
          'streaming-logs',
          'timeout',
        ],
      },
      serverFunctionPlan: {
        format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
        command: {
          command: 'node',
          args: ['src/.prodivix/server-runtime/invoke.mjs'],
        },
        entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
        sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
        functionRef,
        runtimeManifest: {
          schemaVersion: '1.0',
          functionsByExport: {
            getGreeting: {
              kind: 'function',
              runtimeZone: 'server',
              adapterId: 'prodivix.code-export',
              effect: 'read',
              auth: { kind: 'public' },
              inputSchema: true,
              outputSchema: {
                type: 'object',
                required: ['greeting'],
                properties: { greeting: { type: 'string' } },
                additionalProperties: false,
              },
            },
          },
        },
      },
    });
    const request = createExecutionRequest({
      requestId: 'remote-server-function-1',
      profile: 'production',
      runtimeZone: 'server',
      workspace: snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: functionRef.artifactId,
        },
        entrypoint: functionRef.exportName,
        input: {
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
          requestId: 'invocation-1:1',
          invocationId: 'invocation-1',
          attempt: 1,
          functionRef,
          input: { name: 'Ada' },
        },
      },
      requiredCapabilities: ['server-function'],
    });
    const response = Buffer.from(
      JSON.stringify({
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
        requestId: 'invocation-1:1',
        ok: true,
        result: { kind: 'value', value: { greeting: 'Hello Ada' } },
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
            artifactId: `server-function-result:${snapshot.contentDigest}:invocation-1:1`,
            kind: 'report',
            mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
            contents: response.toString('base64'),
          },
        ],
      }),
      snapshot,
      'production',
      'execution-production-1',
      request,
      2_000,
      1_000,
      128 * 1024
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      artifacts: [
        {
          kind: 'report',
          mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
          metadata: {
            requestId: 'invocation-1:1',
            status: 'succeeded',
          },
        },
      ],
    });
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
      'execution-build-1',
      undefined,
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
        'execution-build-1',
        undefined,
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
      'execution-preview-1',
      undefined,
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

  it('canonicalizes a runtime filesystem diff against exact snapshot bytes', () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-1',
        partitionRevisions: {
          'document:code-1:content': 'content-1',
          'document:code-1:meta': 'meta-1',
        },
      },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [
        { path: 'package.json', contents: '{"private":true}' },
        {
          path: 'src/main.ts',
          contents: 'export const value = 1;',
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'build', path: 'src/main.ts' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'test'],
      },
    });
    const buildFile = Buffer.from('<main>ready</main>');
    const buildContents = Buffer.from(
      JSON.stringify({
        format: 'prodivix.execution-build-bundle.v1',
        snapshotDigest: snapshot.contentDigest,
        target: snapshot.target,
        files: [
          {
            path: 'index.html',
            size: buildFile.byteLength,
            digest: `sha256-${createHash('sha256').update(buildFile).digest('hex')}`,
            encoding: 'base64',
            contents: buildFile.toString('base64'),
          },
        ],
      })
    );
    const untrustedDiff = encodeExecutionFilesystemDiff(
      createExecutionFilesystemDiff({
        snapshotDigest: snapshot.contentDigest,
        workspace: snapshot.workspace,
        capturedAt: 2_000,
        complete: true,
        changes: [
          {
            kind: 'modified',
            path: 'src/main.ts',
            baseline: { contents: Buffer.from('export const value = 1;') },
            runtime: { contents: Buffer.from('export const value = 2;') },
          },
          {
            kind: 'added',
            path: 'terminal-runtime-probe.txt',
            runtime: { contents: Buffer.from('created in terminal') },
          },
        ],
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
            artifactId: `build-bundle:${snapshot.contentDigest}`,
            kind: 'bundle',
            mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
            contents: buildContents.toString('base64'),
          },
          {
            artifactId: `filesystem-diff:${snapshot.contentDigest}`,
            kind: 'report',
            mediaType:
              'application/vnd.prodivix.execution-filesystem-diff+json',
            contents: Buffer.from(untrustedDiff).toString('base64'),
          },
        ],
      }),
      snapshot,
      'build',
      'execution-build-fs-1',
      undefined,
      2_000,
      1_000,
      buildContents.byteLength + untrustedDiff.byteLength + 4_096
    );
    const artifact = result.artifacts?.find((candidate) =>
      candidate.artifactId.startsWith('filesystem-diff:')
    );
    const diff = decodeExecutionFilesystemDiff(artifact!.contents);

    expect(artifact).toMatchObject({
      kind: 'report',
      metadata: { changeCount: '2', complete: 'true' },
      sourceTrace: [
        { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
      ],
    });
    expect(diff.changes[0]).toMatchObject({
      path: 'src/main.ts',
      sourceTrace: [
        { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
      ],
    });
    expect(diff.changes[1]).toMatchObject({
      kind: 'added',
      path: 'terminal-runtime-probe.txt',
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
        {
          path: 'src/auth.server.ts',
          contents: 'export const loadPrincipal = () => undefined;',
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: 'code-auth',
              },
            },
          ],
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'src/App.test.tsx' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'server-function', 'test'],
      },
      serverRuntimeMockProvision: {
        format: 'prodivix.server-runtime-test-provision.v1',
        fixtureSetId: 'rootless-auth-test',
        principal: {
          providerId: 'prodivix-test-fixture',
          principalId: 'test-user',
        },
        permissions: [],
        fixtures: [],
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
    const invocationRequest = {
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'test-load-principal:1',
      invocationId: 'test-load-principal',
      attempt: 1,
      functionRef: {
        artifactId: 'code-auth',
        exportName: 'loadPrincipal',
      },
      input: null,
    } as const;
    const invocationTraces = encodeServerRuntimeTestInvocationTraces([
      createServerFunctionInvocationTrace({
        request: invocationRequest,
        response: toExecutionServerFunctionBridgeSuccess(
          invocationRequest.requestId,
          { kind: 'value', value: { credential: 'not-projected' } }
        ),
        startedAt: 1_900,
        completedAt: 1_910,
      }),
    ]);
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
          {
            artifactId: `server-function-invocation-traces:${snapshot.contentDigest}`,
            kind: 'report',
            label: 'Server Function Test invocation traces',
            mediaType: SERVER_RUNTIME_TEST_INVOCATION_TRACE_MEDIA_TYPE,
            metadata: { adapter: 'prodivix.server-runtime-test' },
            contents: Buffer.from(invocationTraces).toString('base64'),
          },
        ],
      }),
      snapshot,
      'test',
      'execution-test-1',
      createExecutionRequest({
        requestId: 'execution-test-request-1',
        profile: 'test',
        runtimeZone: 'test',
        workspace: snapshot.workspace,
        invocation: {
          kind: 'test',
          targetRef: {
            kind: 'workspace',
            workspaceId: snapshot.workspace.workspaceId,
          },
        },
        requiredCapabilities: ['filesystem', 'server-function', 'test'],
      }),
      2_000,
      1_000,
      128 * 1024
    );
    const artifact = result.artifacts?.[0];
    const report = readExecutionTestReportValue(
      JSON.parse(Buffer.from(artifact!.contents).toString('utf8')) as unknown
    );

    expect(artifact).toMatchObject({
      artifactId: 'test-report:execution-test-1',
      kind: 'report',
      mediaType: 'application/vnd.prodivix.test-report+json',
      metadata: { status: 'passed', totalCases: '1' },
      sourceTrace: [{ sourceRef: { kind: 'document', documentId: 'page-1' } }],
    });
    expect(report).toMatchObject({
      kind: 'test-report',
      reportId: 'test-report:execution-test-1',
      status: 'passed',
      completedAt: 2_000,
      summary: { totalFiles: 1, totalCases: 1 },
    });
    expect(result.serverFunctionTraces).toEqual([
      {
        trace: expect.objectContaining({
          requestId: 'test-load-principal:1',
          functionRef: invocationRequest.functionRef,
          outcome: 'succeeded',
          resultKind: 'value',
          redacted: true,
        }),
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'code-auth',
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(result.serverFunctionTraces)).not.toContain(
      'not-projected'
    );

    expect(
      decodeRootlessPodmanSandboxResult(
        JSON.stringify({
          protocol: 'prodivix.sandbox-result.v1',
          exitCode: 2,
          stdout: Buffer.from('vitest configuration failed').toString('base64'),
          stderr: '',
          outputTruncated: false,
          artifacts: [],
        }),
        snapshot,
        'test',
        'execution-test-host-failure',
        undefined,
        2_000,
        1_000,
        128 * 1024
      )
    ).toMatchObject({
      status: 'failed',
      exitCode: 2,
      stdout: 'vitest configuration failed',
      artifacts: [],
    });
  });
});
