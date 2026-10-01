export const abortableRuntimeTransport = <T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> =>
  new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Agent runtime transport aborted.'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => {});
  });

export const readBoundedRuntimeJSON = async (
  response: Response,
  signal: AbortSignal,
  maximumBytes = 16_777_216
): Promise<unknown> => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error('Agent runtime response limit is invalid.');
  const contentLength = response.headers.get('Content-Length');
  if (
    contentLength !== null &&
    (!/^[0-9]+$/u.test(contentLength) || Number(contentLength) > maximumBytes)
  ) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Agent runtime response exceeds its byte limit.');
  }
  if (!response.body)
    throw new Error('Agent runtime response has no JSON body.');
  const reader = response.body.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let chunkCount = 0;
    for (;;) {
      const result = await abortableRuntimeTransport(reader.read(), signal);
      if (result.done) break;
      if (++chunkCount > 16_384)
        throw new Error('Agent runtime response exceeds its chunk limit.');
      bytes += result.value.byteLength;
      if (bytes > maximumBytes)
        throw new Error('Agent runtime response exceeds its byte limit.');
      chunks.push(result.value);
    }
    return JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))
    );
  } finally {
    await closeAgentRuntimeReader(reader);
  }
};

export class AgentRuntimeServiceError extends Error {
  constructor(readonly status: number) {
    super(`Agent runtime service rejected the request (${status}).`);
  }
}

/** Await bounded transport cleanup independently of the cancelled caller signal. */
export const closeAgentRuntimeReader = async (
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = await Promise.race([
      reader.cancel().then(
        () => true,
        () => true
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 1_000);
      }),
    ]);
    if (settled) reader.releaseLock();
  } finally {
    if (timer) clearTimeout(timer);
  }
};
