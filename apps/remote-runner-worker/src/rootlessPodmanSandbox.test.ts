import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  createExecutableProjectSnapshot,
  createExecutionRequest,
  createExecutionFilesystemDiff,
  decodeExecutionFilesystemDiff,
  encodeExecutionFilesystemDiff,
  readExecutionTestReportValue,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
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
  createInstallProxyLogArguments,
  createRootlessPodmanRunArguments,
  createRootlessPodmanSandbox,
  createRootlessPodmanSandboxWirePayload,
  createRootlessInstallProxyUrl,
  decodeRootlessInstallProxyTraces,
  decodeRootlessPodmanSandboxResult,
  verifyRootlessPodmanEngine,
} from './rootlessPodmanSandbox';
import {
  assertControlledStaticRootlessAggregateAuthority,
  assertControlledStaticRootlessStageAuthoritySequence,
  CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER,
  createControlledStaticRootlessAggregateAuthority,
  createControlledStaticRootlessStageAuthority,
  createControlledStaticRootlessStageCleanupAuthority,
  type ControlledStaticRootlessControllerProcessReceipt,
  type ControlledStaticRootlessStage,
  type ControlledStaticRootlessStageAuthority,
} from '../scripts/controlledStaticRootlessStageAuthority';
import { decodeControlledStaticRootlessCanonicalBase64 } from '../scripts/controlledStaticRootlessRequestProtocol';

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

  it('decodes large canonical stage artifacts without regexp stack growth', () => {
    const source = 'A'.repeat(8 * 1024 * 1024);

    const decoded = decodeControlledStaticRootlessCanonicalBase64(
      source,
      'Stage artifact'
    );

    expect(decoded.byteLength).toBe(6 * 1024 * 1024);
    expect(decoded.at(-1)).toBe(0);
  });

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

  it('reads install proxy traces through a bounded per-execution log window', () => {
    const startedAt = 1_700_000_000_000;

    expect(
      createInstallProxyLogArguments(
        'prodivix-install-proxy',
        startedAt,
        startedAt + 12_400
      )
    ).toEqual(['logs', '--since', '14s', 'prodivix-install-proxy']);
    expect(
      createInstallProxyLogArguments(
        'prodivix-install-proxy',
        startedAt,
        startedAt
      )
    ).toEqual(['logs', '--since', '1s', 'prodivix-install-proxy']);
    // A skewed or paused clock must never widen the window to the whole history.
    expect(
      createInstallProxyLogArguments(
        'prodivix-install-proxy',
        startedAt,
        startedAt + 30 * 24 * 60 * 60 * 1_000
      )
    ).toEqual(['logs', '--since', '86400s', 'prodivix-install-proxy']);
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
        {
          path: 'package.json',
          contents: '{"private":true,"devDependencies":{"vitest":"^4.1.9"}}',
        },
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
        {
          path: 'src/auth.generated.ts',
          contents: 'export { loadPrincipal } from "./auth.server";',
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
            metadata: { adapter: 'vitest', toolVersion: '4.1.9' },
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

describe('controlled static rootless stage isolation authority', () => {
  const digest = (value: string | Uint8Array): string =>
    `sha256-${createHash('sha256').update(value).digest('hex')}`;
  const emptyDigest = digest('');
  const environmentDigest = digest('controller-environment');
  const imageDigest = `sha256:${'a'.repeat(64)}`;

  const processReceipt = (
    args: readonly string[],
    exitCode: number,
    startedAtEpochMs: number,
    stdout = ''
  ): ControlledStaticRootlessControllerProcessReceipt =>
    Object.freeze({
      application: 'podman',
      args: Object.freeze([...args]),
      cwd: 'repository:/',
      environmentDigest,
      startedAtEpochMs,
      completedAtEpochMs: startedAtEpochMs + 1,
      exitCode,
      signal: null,
      timedOut: false,
      stdout: Object.freeze({
        digest: stdout ? digest(stdout) : emptyDigest,
        byteLength: Buffer.byteLength(stdout),
        capturedByteLength: Buffer.byteLength(stdout),
        truncated: false,
      }),
      stderr: Object.freeze({
        digest: emptyDigest,
        byteLength: 0,
        capturedByteLength: 0,
        truncated: false,
      }),
    });

  const cleanupAuthority = (
    stage: ControlledStaticRootlessStage,
    ordinal: number,
    overrides: Readonly<{
      removeExitCode?: number;
      residualStdout?: string;
    }> = {}
  ) => {
    const name = `prodivix-g3-v6-static-${stage}-${String(ordinal).repeat(8)}`;
    const executionId = `g3-v6-${'b'.repeat(16)}-${stage}-${ordinal}`;
    const base = ordinal * 100 + 20;
    return createControlledStaticRootlessStageCleanupAuthority({
      stage,
      ordinal,
      containerName: name,
      executionId,
      imageDigest,
      remove: processReceipt(
        ['rm', '--force', '--ignore', name],
        overrides.removeExitCode ?? 0,
        base
      ),
      absence: processReceipt(['container', 'exists', name], 1, base + 2),
      residualQuery: processReceipt(
        [
          'ps',
          '--all',
          '--filter',
          `label=prodivix.remote-execution=${executionId}`,
          '--format',
          '{{.ID}}',
        ],
        0,
        base + 4,
        overrides.residualStdout ?? ''
      ),
    });
  };

  const stageAuthority = (
    stage: ControlledStaticRootlessStage,
    ordinal: number
  ): ControlledStaticRootlessStageAuthority => {
    const cleanup = cleanupAuthority(stage, ordinal);
    const providerStartedAt = ordinal * 100 + 10;
    const output = Object.freeze({
      digest: emptyDigest,
      byteLength: 0,
      capturedByteLength: 0,
      truncated: false as const,
    });
    return createControlledStaticRootlessStageAuthority({
      stage,
      ordinal,
      requestDigest: digest('request'),
      snapshotDigest: digest('snapshot'),
      projectManifestDigest: digest('manifest'),
      lockDigest: digest('lock'),
      toolchainFileSetDigest: digest('toolchain-files'),
      rollupVersion: '4.62.3',
      rollupImplementation: '@rollup/wasm-node',
      rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3',
      esbuildVersion: '0.27.7',
      esbuildImplementation: 'esbuild-wasm',
      esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7',
      sourceBaselineDigest: digest('source-baseline'),
      providerFileSetDigest: digest(`provider-files:${ordinal}`),
      observedInputFileSetDigest: digest(`provider-files:${ordinal}`),
      observedInputFileCount: 10 + ordinal,
      packageImportDigest: ordinal < 2 ? null : digest('package-import'),
      resultSetDigest: digest(`results:${stage}`),
      innerAuthorityDigest: digest(`inner:${stage}`),
      innerCleanupClaim: Object.freeze({
        source: 'sandbox-self-report',
        directCommandCount: 1,
        residualProcessCount: 0,
        cleanupVerified: true,
      }),
      command: Object.freeze({
        stage,
        application: stage === 'version' ? 'pnpm' : 'node',
        args: Object.freeze([]),
        cwd: 'workspace:/',
        executionBoundary: 'sandbox',
        environmentDigest,
        tool: Object.freeze({
          binary: stage === 'version' ? 'pnpm' : 'node',
          version: '1.0.0',
        }),
        startedAtEpochMs: providerStartedAt + 1,
        completedAtEpochMs: providerStartedAt + 8,
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: output,
        stderr: output,
      }),
      providerProcess: processReceipt(
        [
          'run',
          `--name=${cleanup.container.name}`,
          `--label=prodivix.remote-execution=${cleanup.container.executionId}`,
          '--network=none',
          '--read-only',
          imageDigest,
        ],
        0,
        providerStartedAt
      ),
      cleanup,
    });
  };

  const validStages = (): ControlledStaticRootlessStageAuthority[] =>
    CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER.map((stage, ordinal) =>
      stageAuthority(stage, ordinal)
    );
  const rehashAuthority = <T extends { authorityDigest: string }>(
    value: T
  ): T => {
    const { authorityDigest: _authorityDigest, ...base } = value;
    return {
      ...base,
      authorityDigest: digest(canonicalJsonText(base)),
    } as unknown as T;
  };

  it('accepts six fresh sequential stages with build before test', () => {
    const stages = validStages();

    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stages)
    ).not.toThrow();
    expect(stages.map(({ stage }) => stage)).toEqual([
      'version',
      'install',
      'isolation',
      'typecheck',
      'build',
      'test',
    ]);
    expect(
      stages.every(({ command }) => command.executionBoundary === 'sandbox')
    ).toBe(true);
  });

  it('rejects cross-stage baseline and carried-result tampering', () => {
    expect(() =>
      createControlledStaticRootlessStageAuthority({
        ...stageAuthority('isolation', 2),
        observedInputFileSetDigest: digest('foreign-stage-files'),
      })
    ).toThrow(/fresh baseline/u);

    const stages = validStages();
    stages[3] = {
      ...stages[3]!,
      freshBaseline: {
        ...stages[3]!.freshBaseline,
        priorStageResultCount: 1,
      },
    } as unknown as ControlledStaticRootlessStageAuthority;
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stages)
    ).toThrow(/cleanup authority|stage authority/u);
  });

  it('rejects a misordered build/test result sequence', () => {
    const stages = validStages();
    [stages[4], stages[5]] = [stages[5]!, stages[4]!];

    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stages)
    ).toThrow(/cleanup authority|stage authority/u);
  });

  it('does not accept a forged inner cleanup claim without outer cleanup', () => {
    const stages = validStages();
    stages[2] = {
      ...stages[2]!,
      cleanup: {
        ...stages[2]!.cleanup,
        cleanupVerified: false,
        residualProcessCount: 1,
      },
    } as unknown as ControlledStaticRootlessStageAuthority;

    expect(stages[2]!.innerCleanupClaim).toMatchObject({
      cleanupVerified: true,
      directCommandCount: 1,
      residualProcessCount: 0,
    });
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stages)
    ).toThrow(/cleanup authority|stage authority/u);
  });

  it('rejects outer remove failure and label residual containers', () => {
    expect(() => cleanupAuthority('build', 4, { removeExitCode: 1 })).toThrow(
      /zero residual/u
    );
    expect(() =>
      cleanupAuthority('build', 4, { residualStdout: 'container-id\n' })
    ).toThrow(/zero residual/u);
  });

  it('rejects reused container identity, overlapping stages, and provider file-set drift', () => {
    const reused = validStages();
    const forgedCleanup = rehashAuthority({
      ...reused[1]!.cleanup,
      container: reused[0]!.cleanup.container,
      remove: reused[0]!.cleanup.remove,
      absence: reused[0]!.cleanup.absence,
      residualQuery: reused[0]!.cleanup.residualQuery,
    });
    reused[1] = rehashAuthority({
      ...reused[1]!,
      cleanup: forgedCleanup,
    });
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(reused)
    ).toThrow(/provider boundary|cleanup identity|cleanup authority/u);

    const overlapping = validStages();
    const providerProcess = {
      ...overlapping[1]!.providerProcess,
      startedAtEpochMs: 10,
      completedAtEpochMs: 11,
    };
    overlapping[1] = rehashAuthority({
      ...overlapping[1]!,
      providerProcess,
    });
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(overlapping)
    ).toThrow(/overlapped|prior cleanup/u);

    expect(() =>
      createControlledStaticRootlessStageAuthority({
        ...stageAuthority('test', 5),
        observedInputFileSetDigest: digest(
          'test-mutated-source-or-vite-node-modules'
        ),
      })
    ).toThrow(/fresh baseline/u);
  });

  it('rejects package imports before install and result allowlist escape after full rehash', () => {
    expect(() =>
      createControlledStaticRootlessStageAuthority({
        ...stageAuthority('install', 1),
        packageImportDigest: digest('premature-package-import'),
      })
    ).toThrow(/fresh baseline/u);

    const stages = validStages();
    stages[4] = rehashAuthority({
      ...stages[4]!,
      resultAllowlist: Object.freeze([
        ...stages[4]!.resultAllowlist,
        'test-report',
      ]),
    });
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stages)
    ).toThrow(/stage authority drifted/u);
  });

  it('rejects full-rehash cleanup, stage, and aggregate authority forgeries', () => {
    const cleanupStages = validStages();
    const cleanup = rehashAuthority({
      ...cleanupStages[3]!.cleanup,
      residualWorkspaceCount: 1,
    });
    cleanupStages[3] = rehashAuthority({
      ...cleanupStages[3]!,
      cleanup,
    } as unknown as ControlledStaticRootlessStageAuthority);
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(cleanupStages)
    ).toThrow(/cleanup authority|stage authority/u);

    const stageStages = validStages();
    stageStages[5] = rehashAuthority({
      ...stageStages[5]!,
      sourceBaselineDigest: digest('test-mutated-source'),
    });
    expect(() =>
      assertControlledStaticRootlessStageAuthoritySequence(stageStages)
    ).toThrow(/source baseline/u);

    const valid = validStages();
    const aggregate = createControlledStaticRootlessAggregateAuthority(valid);
    const forgedAggregate = rehashAuthority({
      ...aggregate,
      activeContainerCount: 1,
    });
    expect(() =>
      assertControlledStaticRootlessAggregateAuthority(
        forgedAggregate as never,
        valid
      )
    ).toThrow(/aggregate stage authority drifted/u);
  });

  it('binds cleanup queries to the exact execution label and container only', () => {
    const own = cleanupAuthority('test', 5);
    expect(() =>
      createControlledStaticRootlessStageCleanupAuthority({
        stage: own.stage,
        ordinal: own.ordinal,
        containerName: own.container.name,
        executionId: own.container.executionId,
        imageDigest: own.container.imageDigest,
        remove: {
          ...own.remove,
          args: [
            'rm',
            '--force',
            '--ignore',
            'prodivix-g3-v6-static-test-deadbeef',
          ],
        },
        absence: own.absence,
        residualQuery: {
          ...own.residualQuery,
          args: [
            'ps',
            '--all',
            '--filter',
            'label=prodivix.remote-execution=another-container',
            '--format',
            '{{.ID}}',
          ],
        },
      })
    ).toThrow(/zero residual/u);
  });

  it('keeps rootless toolchain validation bounded and package-manager independent', async () => {
    const worker = await import(
      // @ts-expect-error -- the executable MJS intentionally has no TS facade
      '../scripts/controlledStaticRootlessStageWorker.mjs'
    );
    const sources = {
      'control.json': 'control-authority',
      'package.json': 'project-manifest',
      'pnpm-lock.yaml': 'dependency-lock',
      'pnpm-workspace.yaml': 'workspace-authority',
      'controlled-vite.config.mjs': 'vite-authority',
      'isolation-probe.mjs': 'isolation-authority',
    };
    const authority =
      worker.createControlledStaticRootlessToolchainFileAuthority(sources);
    expect(authority).toEqual({
      manifestDigest: digest(sources['package.json']),
      lockDigest: digest(sources['pnpm-lock.yaml']),
      isolationProbeDigest: digest(sources['isolation-probe.mjs']),
      toolchainFileSetDigest: digest(
        canonicalJsonText(
          Object.entries(sources).map(([path, contents]) => ({
            path,
            digest: digest(contents),
          }))
        )
      ),
    });
    expect(() =>
      worker.createControlledStaticRootlessToolchainFileAuthority({
        ...sources,
        'unexpected-cache': 'host-state',
      })
    ).toThrow(/toolchain files/u);

    const environmentDigest = digest('toolchain-validation-environment');
    const command = worker.createControlledStaticRootlessCommandPlan(
      {
        stage: 'install',
        nodeVersion: '22.23.1',
        pnpmVersion: '11.9.0',
        ...authority,
      },
      environmentDigest
    );

    expect(command).toEqual({
      stage: 'install',
      application: 'node',
      args: [
        '.prodivix/controlled-static-rootless-stage-worker.mjs',
        '--verify-toolchain-authority',
        authority.manifestDigest,
        authority.lockDigest,
        authority.toolchainFileSetDigest,
      ],
      environmentDigest,
      tool: {
        binary: 'node',
        version: '22.23.1',
        subjectBinary: '.prodivix/controlled-static-rootless-stage-worker.mjs',
        subjectVersion: authority.toolchainFileSetDigest,
      },
      timeoutMs: 30_000,
    });
    expect(command.args).not.toContain('install');
    expect(command.args).not.toContain('--offline');
    expect(command.args).not.toContain('--store-dir=/opt/prodivix/pnpm-store');
  });

  it('rejects hostile package-import paths, links, kinds, bounds, and full-rehash manifest drift', async () => {
    // The executable worker keeps its archive validator dependency-free so the
    // exact code injected into Podman can be exercised without a container.
    const worker = await import(
      // @ts-expect-error -- the executable MJS intentionally has no TS facade
      '../scripts/controlledStaticRootlessStageWorker.mjs'
    );
    type PackageEntry = Readonly<Record<string, unknown>>;
    const fileEntry = (
      path: string,
      overrides: Readonly<Record<string, unknown>> = {}
    ): PackageEntry => {
      const contents = Buffer.from('package-file', 'utf8');
      return {
        contents: contents.toString('base64'),
        digest: digest(contents),
        kind: 'file',
        mode: 0o644,
        path,
        size: contents.byteLength,
        ...overrides,
      };
    };
    const archive = (
      entries: readonly PackageEntry[],
      mutateManifest?: (
        manifest: Readonly<Record<string, unknown>>
      ) => Readonly<Record<string, unknown>>
    ) => {
      const created =
        worker.createControlledStaticRootlessPackageManifest(entries);
      const manifest = mutateManifest
        ? mutateManifest(created.manifest)
        : created.manifest;
      const manifestDigest = digest(canonicalJsonText(manifest));
      const contents = Buffer.from(
        JSON.stringify({
          format: 'prodivix.controlled-static-rootless-package-import.v1',
          manifest,
          entries,
        }),
        'utf8'
      );
      const compressed = gzipSync(contents, { level: 9 });
      return {
        compressed,
        authority: {
          path: '.prodivix/package-import.json.gz',
          digest: digest(compressed),
          byteLength: compressed.byteLength,
          contentDigest: digest(contents),
          manifestDigest,
          fileSetDigest: manifest.fileSetDigest,
          entryCount: manifest.entryCount,
          totalFileBytes: manifest.totalFileBytes,
          maximumDepth: manifest.maximumDepth,
        },
      };
    };
    const decode = (entries: readonly PackageEntry[]) => {
      const value = archive(entries);
      return worker.decodeControlledStaticRootlessPackageImportBytes(
        value.compressed,
        value.authority
      );
    };
    const valid = fileEntry('.pnpm/package/index.js');

    expect(() => decode([valid])).not.toThrow();
    for (const entries of [
      [fileEntry('/absolute')],
      [fileEntry('../escape')],
      [fileEntry('duplicate'), fileEntry('duplicate')],
      [fileEntry('Case'), fileEntry('case')],
      [
        valid,
        {
          kind: 'symlink',
          path: 'escape-link',
          target: '../../outside-node-modules',
        },
      ],
      [
        valid,
        {
          digest: digest('device'),
          kind: 'device',
          mode: 0o600,
          path: 'special-device',
          size: 1,
        },
      ],
      [
        valid,
        {
          digest: digest('hardlink'),
          kind: 'hardlink',
          mode: 0o644,
          path: 'hardlink',
          size: 1,
          target: 'other',
        },
      ],
    ] as const) {
      expect(() => decode(entries)).toThrow();
    }
    expect(() =>
      decode([
        fileEntry(
          Array.from({ length: 65 }, (_, index) => `d${index}`).join('/')
        ),
      ])
    ).toThrow(/depth|bounds/u);
    expect(() =>
      decode([
        fileEntry('oversized', {
          size: 256 * 1024 * 1024 + 1,
        }),
      ])
    ).toThrow(/bounds|budget/u);

    const largeContents = Buffer.alloc(2 * 1024 * 1024, 0xa5);
    expect(() =>
      decode([
        fileEntry('large-package-file', {
          contents: largeContents.toString('base64'),
          digest: digest(largeContents),
          size: largeContents.byteLength,
        }),
      ])
    ).not.toThrow();

    const forged = archive([valid], (manifest) => ({
      ...manifest,
      fileSetDigest: digest('fully-rehashed-but-wrong-file-set'),
    }));
    expect(() =>
      worker.decodeControlledStaticRootlessPackageImportBytes(
        forged.compressed,
        forged.authority
      )
    ).toThrow(/manifest|file set/u);
  });

  it('binds immutable image package seeds to the exact preset, lock, and archive bounds', async () => {
    const worker = await import(
      // @ts-expect-error -- the executable MJS intentionally has no TS facade
      '../scripts/controlledStaticRootlessStageWorker.mjs'
    );
    const lockDigest = digest('package-seed-lock');
    const packageImport = {
      byteLength: 1,
      contentDigest: digest('package-seed-content'),
      digest: digest('package-seed-archive'),
      entryCount: 1,
      fileSetDigest: digest('package-seed-files'),
      manifestDigest: digest('package-seed-manifest'),
      maximumDepth: 1,
      totalFileBytes: 1,
    };
    const seed = {
      format: 'prodivix.controlled-static-rootless-package-seed.v1',
      lockDigest,
      packageImport,
      presetId: 'react-vite',
    };
    const decode = (
      value: Readonly<Record<string, unknown>>,
      expectedLockDigest = lockDigest
    ) =>
      worker.decodeControlledStaticRootlessPackageSeedAuthorityBytes(
        Buffer.from(JSON.stringify(value), 'utf8'),
        {
          presetId: 'react-vite',
          lockDigest: expectedLockDigest,
        }
      );

    expect(decode(seed)).toEqual({
      ...packageImport,
      path: '.prodivix/package-seed.json.gz',
    });
    expect(() => decode({ ...seed, presetId: 'vue-vite' })).toThrow(/drift/u);
    expect(() => decode(seed, digest('other-lock'))).toThrow(/drift/u);
    expect(() =>
      decode({
        ...seed,
        packageImport: { ...packageImport, byteLength: 0 },
      })
    ).toThrow(/drift/u);
    expect(() =>
      worker.decodeControlledStaticRootlessPackageSeedAuthorityBytes(
        Buffer.from(`${JSON.stringify(seed)}\n`, 'utf8'),
        {
          presetId: 'react-vite',
          lockDigest,
        }
      )
    ).toThrow(/canonical/u);
  });
});
