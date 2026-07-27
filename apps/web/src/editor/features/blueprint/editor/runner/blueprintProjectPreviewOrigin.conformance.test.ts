import { describe, expect, it, vi } from 'vitest';
import { resolveProjectPreviewSandbox } from '@/editor/features/blueprint/editor/runner/BlueprintProjectRunnerSurface';
import {
  readBlueprintProjectConsoleBridgeMessage,
  readBlueprintRemoteDataBridgeMessage,
  readBlueprintRemoteDataStreamCancellation,
  readBlueprintRemoteDataStreamOpen,
  readBlueprintRemoteDataStreamPull,
  readBlueprintRemoteServerFunctionBridgeCancellation,
  readBlueprintRemoteServerFunctionBridgeMessage,
} from '@/editor/features/blueprint/editor/runner/blueprintProjectNetworkBridge';

type PreviewSecurityHeaderFactory = (
  editorOrigins: readonly string[],
  capabilityOrigin?: string
) => Readonly<Record<string, string>>;

/**
 * `apps/web` and `apps/remote-preview-host` are separate TypeScript projects, so the
 * Preview Host header factory is resolved by the bundler at test time rather than by a
 * static cross-project import. Loading the real factory is the point of this file: the
 * editor bridge gate must agree with the headers the Host actually serves, not with a
 * copy of them.
 */
const { createPreviewSecurityHeaders } = await vi.importActual<{
  createPreviewSecurityHeaders: PreviewSecurityHeaderFactory;
}>('../../../../../../../remote-preview-host/src/previewSecurityPolicy.ts');

const capability =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const previewUrl = `https://${capability}.preview.example.test/`;
const previewOrigin = new URL(previewUrl).origin;
const editorOrigin = 'https://editor.example.test';

/**
 * Models the HTML sandboxing rule that couples the two components: a document's
 * active sandboxing flag set is the union of the embedder's iframe `sandbox` flags
 * and the flags a CSP `sandbox` directive forces, so CSP can only narrow what the
 * iframe attribute allows. The origin flag is cleared only when both inputs allow
 * same-origin; otherwise the document is opaque and every `postMessage` reaches the
 * editor as `origin: 'null'` while targeted replies are dropped.
 */
const resolvePreviewDocumentOrigin = (input: {
  previewUrl: string;
  contentSecurityPolicy: string;
  iframeSandbox: string;
}): string => {
  const allowsSameOrigin = (tokens: string): boolean =>
    tokens.split(/\s+/u).includes('allow-same-origin');
  const sandboxDirective = input.contentSecurityPolicy
    .split(';')
    .map((directive) => directive.trim())
    .find(
      (directive) => directive === 'sandbox' || directive.startsWith('sandbox ')
    );
  const forcedOpaque =
    sandboxDirective !== undefined && !allowsSameOrigin(sandboxDirective);
  return forcedOpaque || !allowsSameOrigin(input.iframeSandbox)
    ? 'null'
    : new URL(input.previewUrl).origin;
};

const remotePreviewMessageOrigin = (contentSecurityPolicy: string): string =>
  resolvePreviewDocumentOrigin({
    previewUrl,
    contentSecurityPolicy,
    iframeSandbox: resolveProjectPreviewSandbox('remote'),
  });

const dataRequest = {
  type: 'prodivix.execution-data-gateway-request.v1',
  requestId: 'invocation-1:1',
  documentId: 'data-1',
  operationId: 'list',
  adapterId: 'core.http',
  invocationId: 'invocation-1',
  sequence: 1,
  attempt: 1,
  input: { page: 1 },
};

const streamOpen = {
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

const serverFunctionRequest = {
  type: 'prodivix.execution-server-function-gateway-request.v1',
  requestId: 'server-invocation-1:1',
  invocationId: 'server-invocation-1',
  attempt: 1,
  functionRef: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
  input: { routeId: 'route-home' },
};

const consoleMessage = {
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

describe('Remote preview origin model conformance', () => {
  const headers = createPreviewSecurityHeaders([editorOrigin], previewOrigin);
  const contentSecurityPolicy = headers['content-security-policy'];

  it('serves preview documents on the capability tuple origin the editor gate expects', () => {
    expect(remotePreviewMessageOrigin(contentSecurityPolicy)).toBe(
      previewOrigin
    );
  });

  it('accepts every Remote bridge message carried by the served origin', () => {
    const messageOrigin = remotePreviewMessageOrigin(contentSecurityPolicy);
    const input = { provider: 'remote' as const, previewUrl, messageOrigin };
    expect(
      readBlueprintRemoteDataBridgeMessage({ ...input, value: dataRequest })
    ).toEqual(dataRequest);
    expect(
      readBlueprintRemoteDataStreamOpen({ ...input, value: streamOpen })
    ).toEqual(streamOpen);
    expect(
      readBlueprintRemoteDataStreamPull({
        ...input,
        value: {
          type: 'prodivix.execution-data-stream-pull.v1',
          requestId: streamOpen.requestId,
          cursor: 0,
        },
      })
    ).toBeDefined();
    expect(
      readBlueprintRemoteDataStreamCancellation({
        ...input,
        value: {
          type: 'prodivix.execution-data-stream-cancel.v1',
          requestId: streamOpen.requestId,
        },
      })
    ).toBeDefined();
    expect(
      readBlueprintRemoteServerFunctionBridgeMessage({
        ...input,
        value: serverFunctionRequest,
      })
    ).toEqual(serverFunctionRequest);
    expect(
      readBlueprintRemoteServerFunctionBridgeCancellation({
        ...input,
        value: {
          type: 'prodivix.execution-server-function-gateway-cancel.v1',
          requestId: serverFunctionRequest.requestId,
          invocationId: serverFunctionRequest.invocationId,
        },
      })
    ).toBeDefined();
    expect(
      readBlueprintProjectConsoleBridgeMessage({
        ...input,
        value: consoleMessage,
      })
    ).toMatchObject({ messageId: 'frame-1:1' });
  });

  it('keeps the isolation the dropped CSP sandbox directive used to add', () => {
    expect(contentSecurityPolicy).toContain(`frame-ancestors ${editorOrigin}`);
    expect(contentSecurityPolicy).toContain(`connect-src ${previewOrigin}`);
    expect(contentSecurityPolicy).toContain("default-src 'none'");
    expect(contentSecurityPolicy).toContain("script-src 'self'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("frame-src 'none'");
    expect(contentSecurityPolicy).toContain("base-uri 'none'");
    expect(contentSecurityPolicy).toContain("form-action 'none'");
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('credentialless');
  });

  it('stays fail-closed for an opaque preview document and for foreign origins', () => {
    const opaquePolicy = `${contentSecurityPolicy}; sandbox allow-scripts`;
    const opaqueOrigin = remotePreviewMessageOrigin(opaquePolicy);
    expect(opaqueOrigin).toBe('null');
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl,
        messageOrigin: opaqueOrigin,
        value: dataRequest,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteServerFunctionBridgeMessage({
        provider: 'remote',
        previewUrl,
        messageOrigin: editorOrigin,
        value: serverFunctionRequest,
      })
    ).toBeUndefined();
    expect(
      readBlueprintRemoteDataBridgeMessage({
        provider: 'remote',
        previewUrl,
        messageOrigin: `https://${'f'.repeat(64)}.preview.example.test`,
        value: dataRequest,
      })
    ).toBeUndefined();
  });
});
