import {
  createExecutableProjectSnapshot,
  createExecutionRequest,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
} from '@prodivix/runtime-core';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
} from '@prodivix/server-runtime';
import { describe, expect, it } from 'vitest';
import { createRemoteWorkerServerFunctionArtifact } from './serverFunctionArtifact';

const functionRef = Object.freeze({
  artifactId: 'code-server-greeting',
  exportName: 'getGreeting',
});

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
      sourceTrace: [
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: functionRef.artifactId,
          },
        },
      ],
    },
    {
      path: 'src/.prodivix/server-runtime/function.mjs',
      contents:
        "import { greeting } from './modules/module-001.mjs'; export const getGreeting = () => greeting;",
      sourceTrace: [
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: functionRef.artifactId,
          },
        },
      ],
    },
    {
      path: 'src/.prodivix/server-runtime/modules/module-001.mjs',
      contents: `export const greeting = 'hello';`,
      sourceTrace: [
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: 'code-server-greeting-helper',
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

const contents = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

describe('remote worker Server Function artifact', () => {
  it('canonicalizes a correlated schema-valid sandbox response', () => {
    const artifact = createRemoteWorkerServerFunctionArtifact({
      snapshot,
      request,
      contents: contents({
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
        requestId: 'invocation-1:1',
        ok: true,
        result: { kind: 'value', value: { greeting: 'Hello Ada' } },
      }),
    });

    expect(artifact).toMatchObject({
      artifactId: `server-function-result:${snapshot.contentDigest}:invocation-1:1`,
      kind: 'report',
      mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
      metadata: {
        snapshotDigest: snapshot.contentDigest,
        requestId: 'invocation-1:1',
        artifactId: functionRef.artifactId,
        exportName: functionRef.exportName,
        status: 'succeeded',
      },
      sourceTrace: [
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: functionRef.artifactId,
          },
        },
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: 'code-server-greeting-helper',
          },
        },
      ],
    });
    expect(new TextDecoder().decode(artifact.contents)).toBe(
      `${JSON.stringify({
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
        requestId: 'invocation-1:1',
        ok: true,
        result: { kind: 'value', value: { greeting: 'Hello Ada' } },
      })}\n`
    );
  });

  it('rejects forged output or correlation before durable publication', () => {
    expect(() =>
      createRemoteWorkerServerFunctionArtifact({
        snapshot,
        request,
        contents: contents({
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
          requestId: 'invocation-1:1',
          ok: true,
          result: { kind: 'value', value: { greeting: 42 } },
        }),
      })
    ).toThrow(/canonical contract/u);
    expect(() =>
      createRemoteWorkerServerFunctionArtifact({
        snapshot,
        request,
        contents: contents({
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
          requestId: 'another-invocation:1',
          ok: false,
          error: { code: 'SVR_ISOLATED_EXECUTION_FAILED', retryable: false },
        }),
      })
    ).toThrow(/canonical contract/u);
  });
});
