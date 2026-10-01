const MAXIMUM_BYTES = 8_388_608;
const MAXIMUM_CHUNKS = 100_000;

const withCancellation = <T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> =>
  new Promise((resolve, reject) => {
    const cancelled = () => {
      signal.removeEventListener('abort', cancelled);
      reject(
        new BackendTransportFailure(
          'Backend request was cancelled or timed out.',
          'infrastructure'
        )
      );
    };
    if (signal.aborted) {
      void operation.catch(() => undefined);
      cancelled();
      return;
    }
    signal.addEventListener('abort', cancelled, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', cancelled);
        if (signal.aborted) cancelled();
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancelled);
        if (signal.aborted) cancelled();
        else reject(error);
      }
    );
  });

export class BackendTransportFailure extends Error {
  readonly kind: 'invalid-contract' | 'infrastructure';
  constructor(message: string, kind: 'invalid-contract' | 'infrastructure') {
    super(message);
    this.name = 'BackendTransportFailure';
    this.kind = kind;
  }
}

export const validateBackendUrl = (value: string | URL): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BackendTransportFailure(
      'Backend endpoint is invalid.',
      'invalid-contract'
    );
  }
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BackendTransportFailure(
      'Backend endpoint must be HTTPS or loopback HTTP without credentials, query or fragment.',
      'invalid-contract'
    );
  }
  return url;
};

/** One bounded authenticated transport for every CLI backend command. */
export const requestBackend = async (
  endpoint: string | URL,
  init: RequestInit,
  tokenEnvironmentKey: string
): Promise<Response> => {
  const url = validateBackendUrl(endpoint);
  const token = process.env[tokenEnvironmentKey]?.trim();
  if (
    !token ||
    token.length > 16_384 ||
    [...token].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  ) {
    throw new BackendTransportFailure(
      `${tokenEnvironmentKey} must contain one short-lived access token.`,
      'invalid-contract'
    );
  }
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  const deadline = AbortSignal.timeout(30_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  try {
    signal.throwIfAborted();
    const pendingResponse = fetch(url, {
      ...init,
      headers,
      redirect: 'error',
      signal,
    });
    void pendingResponse.then(
      (response) => {
        if (signal.aborted) void response.body?.cancel().catch(() => undefined);
      },
      () => undefined
    );
    const response = await withCancellation(pendingResponse, signal);
    const declaredLength = response.headers.get('content-length');
    if (
      declaredLength !== null &&
      (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) ||
        !Number.isSafeInteger(Number(declaredLength)) ||
        Number(declaredLength) > MAXIMUM_BYTES)
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new BackendTransportFailure(
        'Backend response exceeds its contract budget.',
        'infrastructure'
      );
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        for (let index = 0; ; index += 1) {
          signal.throwIfAborted();
          if (index >= MAXIMUM_CHUNKS)
            throw new BackendTransportFailure(
              'Backend response exceeds its contract budget.',
              'infrastructure'
            );
          const next = await withCancellation(reader.read(), signal);
          if (next.done) break;
          length += next.value.byteLength;
          if (length > MAXIMUM_BYTES)
            throw new BackendTransportFailure(
              'Backend response exceeds its contract budget.',
              'infrastructure'
            );
          chunks.push(next.value);
        }
    } catch (error) {
      void reader?.cancel().catch(() => undefined);
      throw error;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(length === 0 ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (error instanceof BackendTransportFailure) throw error;
    if (signal.aborted)
      throw new BackendTransportFailure(
        'Backend request was cancelled or timed out.',
        'infrastructure'
      );
    throw new BackendTransportFailure(
      'Backend is unavailable.',
      'infrastructure'
    );
  }
};
