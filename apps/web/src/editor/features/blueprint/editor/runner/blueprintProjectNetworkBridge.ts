import {
  readExecutionDataGatewayBridgeRequest,
  readExecutionDataStreamCancellation,
  readExecutionDataStreamOpenRequest,
  readExecutionDataStreamPull,
  readExecutionConsoleBridgeMessage,
  readExecutionNetworkBridgeMessage,
  type ExecutionConsoleBridgeMessage,
  type ExecutionDataGatewayBridgeRequest,
  type ExecutionDataStreamCancellation,
  type ExecutionDataStreamOpenRequest,
  type ExecutionDataStreamPull,
  type ExecutionNetworkTrace,
} from '@prodivix/runtime-core';
import type { BlueprintProjectRunProvider } from '@/editor/features/blueprint/editor/runner/blueprintProjectRunnerClient';
import {
  readExecutionServerFunctionBridgeCancellation,
  readExecutionServerFunctionBridgeRequest,
  type ExecutionServerFunctionBridgeCancellation,
  type ExecutionServerFunctionBridgeRequest,
} from '@prodivix/server-runtime';

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

/** Identity-fences every bridge decoder to the currently mounted iframe Window. */
export const isBlueprintProjectFrameMessageSource = (
  activeFrameWindow: unknown,
  messageSource: unknown
): boolean =>
  activeFrameWindow !== null &&
  activeFrameWindow !== undefined &&
  messageSource === activeFrameWindow;

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

/** Accepts subscription open only from the sandboxed active Remote preview frame. */
export const readBlueprintRemoteDataStreamOpen = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionDataStreamOpenRequest | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input))
    return undefined;
  return readExecutionDataStreamOpenRequest(input.value);
};

export const readBlueprintRemoteDataStreamCancellation = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionDataStreamCancellation | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input))
    return undefined;
  return readExecutionDataStreamCancellation(input.value);
};

export const readBlueprintRemoteDataStreamPull = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionDataStreamPull | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input))
    return undefined;
  return readExecutionDataStreamPull(input.value);
};

/** Accepts value-only Server Function requests only from the active Remote capability frame. */
export const readBlueprintRemoteServerFunctionBridgeMessage = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionServerFunctionBridgeRequest | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input)) {
    return undefined;
  }
  return readExecutionServerFunctionBridgeRequest(input.value);
};

/** Accepts cancellation only from the exact frame that may issue the corresponding Server Function request. */
export const readBlueprintRemoteServerFunctionBridgeCancellation = (input: {
  provider: BlueprintProjectRunProvider;
  previewUrl: string;
  messageOrigin: string;
  value: unknown;
}): ExecutionServerFunctionBridgeCancellation | undefined => {
  if (input.provider !== 'remote' || !acceptsPreviewMessageOrigin(input)) {
    return undefined;
  }
  return readExecutionServerFunctionBridgeCancellation(input.value);
};
