import type { RemoteExecutionHttpPort } from '@prodivix/runtime-remote';

export type WebRemoteExecutionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Browser HTTP adapter with bounded streaming reads and no implicit credential forwarding. */
export const createWebRemoteExecutionHttpPort = (
  fetcher: WebRemoteExecutionFetch = globalThis.fetch
): RemoteExecutionHttpPort =>
  Object.freeze({
    async request(input) {
      const response = await fetcher(input.url, {
        method: input.method,
        headers: input.headers,
        ...(input.body
          ? { body: new Uint8Array(input.body).buffer as ArrayBuffer }
          : {}),
        ...(input.signal ? { signal: input.signal as AbortSignal } : {}),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      const declaredLength = response.headers.get('content-length');
      if (
        declaredLength !== null &&
        (!/^\d+$/u.test(declaredLength) ||
          Number(declaredLength) > input.maximumResponseBytes)
      ) {
        await response.body?.cancel();
        throw new Error(
          'Remote HTTP response exceeds its declared byte limit.'
        );
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const current = await reader.read();
            if (current.done) break;
            total += current.value.byteLength;
            if (total > input.maximumResponseBytes) {
              await reader.cancel();
              throw new Error('Remote HTTP response exceeds its byte limit.');
            }
            chunks.push(current.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      const body = new Uint8Array(total);
      let offset = 0;
      chunks.forEach((chunk) => {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      });
      return Object.freeze({
        status: response.status,
        headers: Object.freeze({
          'content-type': response.headers.get('content-type') ?? undefined,
          'content-length': declaredLength ?? undefined,
          etag: response.headers.get('etag') ?? undefined,
        }),
        body,
      });
    },
  });
