import fc from 'fast-check';
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

const remoteInput = {
  provider: 'remote' as const,
  previewUrl:
    'https://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.preview.example.test/',
  messageOrigin: 'null',
};

const browserInput = {
  provider: 'browser' as const,
  previewUrl: 'https://preview.localhost/catalog',
  messageOrigin: 'https://preview.localhost',
};

describe('Blueprint project Network bridge properties', () => {
  it('identity-fences every foreign source from the exact active iframe Window', () => {
    const activeFrame = Object.freeze({ frame: 'active' });
    fc.assert(
      fc.property(fc.jsonValue(), (foreignSource) => {
        expect(
          isBlueprintProjectFrameMessageSource(activeFrame, foreignSource)
        ).toBe(false);
      })
    );
  });

  it('never throws while rejecting arbitrary cross-page payloads at all strict bridge decoders', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(() =>
          readBlueprintProjectNetworkBridgeMessage({
            ...browserInput,
            value,
          })
        ).not.toThrow();
        expect(() =>
          readBlueprintProjectConsoleBridgeMessage({
            ...remoteInput,
            value,
          })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteDataBridgeMessage({ ...remoteInput, value })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteDataStreamOpen({ ...remoteInput, value })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteDataStreamPull({ ...remoteInput, value })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteDataStreamCancellation({
            ...remoteInput,
            value,
          })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteServerFunctionBridgeMessage({
            ...remoteInput,
            value,
          })
        ).not.toThrow();
        expect(() =>
          readBlueprintRemoteServerFunctionBridgeCancellation({
            ...remoteInput,
            value,
          })
        ).not.toThrow();
      })
    );
  });

  it('rejects credential-shaped unknown fields from otherwise valid Remote messages', () => {
    const value = {
      type: 'prodivix.execution-data-gateway-request.v1',
      requestId: 'invocation-1:1',
      documentId: 'data-1',
      operationId: 'list',
      adapterId: 'core.http',
      invocationId: 'invocation-1',
      sequence: 1,
      attempt: 1,
      input: {},
    };
    fc.assert(
      fc.property(
        fc.constantFrom(
          'authorization',
          'cookie',
          'credential',
          'secret',
          'sessionId',
          'token'
        ),
        fc.jsonValue(),
        (field, fieldValue) => {
          expect(
            readBlueprintRemoteDataBridgeMessage({
              ...remoteInput,
              value: { ...value, [field]: fieldValue },
            })
          ).toBeUndefined();
        }
      )
    );
  });
});
