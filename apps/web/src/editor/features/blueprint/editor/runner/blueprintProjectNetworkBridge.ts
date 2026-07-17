import {
  readExecutionDataGatewayBridgeRequest,
  readExecutionConsoleBridgeMessage,
  readExecutionNetworkBridgeMessage,
  type ExecutionConsoleBridgeMessage,
  type ExecutionDataGatewayBridgeRequest,
  type ExecutionNetworkTrace,
} from '@prodivix/runtime-core';
import type { BlueprintProjectRunProvider } from '@/editor/features/blueprint/editor/runner/blueprintProjectRunnerClient';

const readPreviewOrigin = (previewUrl: string): URL | undefined => {
  try {
    return new URL(previewUrl);
  } catch {
    return undefined;
  }
};

const isRemoteCapabilityPreview = (preview: URL): boolean => {
  const loopback =
    ['localhost', '127.0.0.1', '::1'].includes(preview.hostname) ||
    preview.hostname.endsWith('.localhost');
  const capabilityLabel = preview.hostname.split('.', 1)[0];
  return Boolean(
    (preview.protocol === 'https:' ||
      (preview.protocol === 'http:' && loopback)) &&
    !preview.username &&
    !preview.password &&
    capabilityLabel &&
    /^[a-f0-9]{64}$/u.test(capabilityLabel)
  );
};

const acceptsPreviewMessageOrigin = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
}): boolean => {
  const preview = readPreviewOrigin(input.previewUrl);
  if (!preview) return false;
  return input.provider === 'browser'
    ? input.messageOrigin === preview.origin
    : input.messageOrigin === 'null' && isRemoteCapabilityPreview(preview);
};

/** Accepts Network messages only from the exact active local preview origin. */
export const readBlueprintProjectNetworkBridgeMessage = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionNetworkTrace | undefined => {
  if (input.provider !== 'browser') return undefined;
  if (!acceptsPreviewMessageOrigin(input)) return undefined;
  return readExecutionNetworkBridgeMessage(input.value);
};

/** Accepts bounded application Console records only from the exact active preview frame origin. */
export const readBlueprintProjectConsoleBridgeMessage = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionConsoleBridgeMessage | undefined => {
  if (!acceptsPreviewMessageOrigin(input)) return undefined;
  return readExecutionConsoleBridgeMessage(input.value);
};

/** Accepts value-only Data requests only from the sandboxed active Remote preview frame. */
export const readBlueprintRemoteDataBridgeMessage = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionDataGatewayBridgeRequest | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input))
    return undefined;
  return readExecutionDataGatewayBridgeRequest(input.value);
};
