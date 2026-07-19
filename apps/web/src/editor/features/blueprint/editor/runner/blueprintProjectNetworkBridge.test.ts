import {
  createExecutionNetworkTrace,
  toExecutionNetworkBridgeMessage,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  isBlueprintProjectFrameMessageSource,
  readBlueprintProjectConsoleBridgeMessage,
  readBlueprintProjectNetworkBridgeMessage,
  readBlueprintRemoteDataBridgeMessage,
  readBlueprintRemoteDataStreamCancellation,
  readBlueprintRemoteDataStreamOpen,
  readBlueprintRemoteDataStreamPull,
  readBlueprintRemoteServerFunctionBridgeCancellation,
  readBlueprintRemoteServerFunctionBridgeMessage,
} from '@/editor/features/blueprint/editor/runner/blueprintProjectNetworkBridge';

const trace = createExecutionNetworkTrace({
  requestId: 'query-1:1',
  phase: 'runtime',
  runtimeZone: 'client',
  mode: 'live',
  adapter: 'core.http',
  method: 'GET',
  sanitizedUrl: 'https://api.example.test/',
  protocol: 'https',
  startedAt: 10,
  completedAt: 20,
  outcome: 'allowed',
  status: 200,
});

describe('Blueprint project Network bridge', () => {
  it('identity-fences every decoder to the exact active iframe Window', () => {
    const activeFrame = Object.freeze({ frame: 'active' });
    expect(isBlueprintProjectFrameMessageSource(activeFrame, activeFrame)).toBe(
      true
    );
    expect(isBlueprintProjectFrameMessageSource(undefined, undefined)).toBe(
      false
    );
    expect(
      isBlueprintProjectFrameMessageSource(activeFrame, { frame: 'foreign' })
    ).toBe(false);
  });

  it('accepts only strict messages from the active local preview origin', () => {
    const value = toExecutionNetworkBridgeMessage(trace);
    expect(
      readBlueprintProjectNetworkBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/catalog',
        messageOrigin: 'https://preview.localhost',
        value,
      })
    ).toEqual(trace);
    expect(
      readBlueprintProjectNetworkBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/catalog',
        messageOrigin: 'https://attacker.example',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintProjectNetworkBridgeMessage({
        provider: 'remote',
        previewUrl: 'https://preview.localhost/catalog',
        messageOrigin: 'https://preview.localhost',
        value,
      })
    ).toBeUndefined();
  });

  it('accepts Data invocation only from the opaque active Remote frame contract', () => {
    const value = {
      type: 'prodivix.execution-data-gateway-request.v1',
      requestId: 'invocation-1:1',
      documentId: 'data-1',
      operationId: 'list',
      adapterId: 'core.http',
      invocationId: 'invocation-1',
      sequence: 2,
      attempt: 1,
      input: { page: 1 },
    };
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl:
          'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/',
        messageOrigin: 'null',
        value,
      })
    ).toEqual(value);
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/',
        messageOrigin: 'null',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl: 'https://preview.example.test/',
        messageOrigin: 'https://preview.example.test',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl: 'https://preview.example.test/',
        messageOrigin: 'null',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl:
          'http://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/',
        messageOrigin: 'null',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl:
          'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/',
        messageOrigin: 'null',
        value: { ...value, authorization: 'secret-canary' },
      })
    ).toBeUndefined();
  });

  it('accepts subscription open/cancel only from the same opaque Remote frame', () => {
    const previewUrl =
      'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/';
    const value = {
      type: 'prodivix.execution-data-stream-open.v1',
      requestId: 'stream-1:stream',
      documentId: 'data-events',
      operationId: 'watch',
      adapterId: 'core.graphql',
      invocationId: 'stream-1',
      sequence: 1,
      attempt: 1,
      input: {},
    };
    expect(
      readBlueprintRemoteDataStreamOpen({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value,
      })
    ).toEqual(value);
    expect(
      readBlueprintRemoteDataStreamOpen({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'https://attacker.example',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataStreamCancellation({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value: {
          type: 'prodivix.execution-data-stream-cancel.v1',
          requestId: value.requestId,
        },
      })
    ).toEqual({
      type: 'prodivix.execution-data-stream-cancel.v1',
      requestId: value.requestId,
    });
    expect(
      readBlueprintRemoteDataStreamPull({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value: {
          type: 'prodivix.execution-data-stream-pull.v1',
          requestId: value.requestId,
          cursor: 0,
        },
      })
    ).toEqual({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: value.requestId,
      cursor: 0,
    });
  });

  it('accepts Server Function input but rejects session material at the Remote frame boundary', () => {
    const value = {
      type: 'prodivix.execution-server-function-gateway-request.v1',
      requestId: 'server-invocation-1:1',
      invocationId: 'server-invocation-1',
      attempt: 1,
      functionRef: {
        artifactId: 'code-auth',
        exportName: 'loadPrincipal',
      },
      input: { routeId: 'route-home' },
    };
    const previewUrl =
      'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/';
    expect(
      readBlueprintRemoteServerFunctionBridgeMessage({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value,
      })
    ).toEqual(value);
    expect(
      readBlueprintRemoteServerFunctionBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/',
        messageOrigin: 'https://preview.localhost',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteServerFunctionBridgeMessage({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value: { ...value, sessionId: 'server-only' },
      })
    ).toBeUndefined();
    const cancellation = {
      type: 'prodivix.execution-server-function-gateway-cancel.v1',
      requestId: 'server-invocation-1:1',
      invocationId: 'server-invocation-1',
    };
    expect(
      readBlueprintRemoteServerFunctionBridgeCancellation({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'null',
        value: cancellation,
      })
    ).toEqual(cancellation);
    expect(
      readBlueprintRemoteServerFunctionBridgeCancellation({
        provider: 'remote',
        previewUrl,
        messageOrigin: 'https://attacker.example',
        value: cancellation,
      })
    ).toBeUndefined();
  });

  it('accepts structured Console messages from exact Browser and opaque Remote origins', () => {
    const value = {
      type: 'prodivix.execution-console-bridge.v1',
      messageId: 'frame-1:1',
      log: {
        level: 'info',
        category: 'application',
        message: 'created item',
        arguments: [{ id: 'item-1' }],
        redacted: false,
        truncated: false,
      },
    };
    expect(
      readBlueprintProjectConsoleBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/catalog',
        messageOrigin: 'https://preview.localhost',
        value,
      })
    ).toMatchObject({
      messageId: 'frame-1:1',
      log: { category: 'application', message: 'created item' },
    });
    expect(
      readBlueprintProjectConsoleBridgeMessage({
        provider: 'remote',
        previewUrl:
          'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/',
        messageOrigin: 'null',
        value,
      })
    ).toMatchObject({ messageId: 'frame-1:1' });
    expect(
      readBlueprintProjectConsoleBridgeMessage({
        provider: 'browser',
        previewUrl: 'https://preview.localhost/catalog',
        messageOrigin: 'https://attacker.example',
        value,
      })
    ).toBeUndefined();
    expect(
      readBlueprintProjectConsoleBridgeMessage({
        provider: 'remote',
        previewUrl: 'https://preview.example.test/',
        messageOrigin: 'null',
        value,
      })
    ).toBeUndefined();
  });
});
