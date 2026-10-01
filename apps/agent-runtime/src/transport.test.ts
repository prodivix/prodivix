import { describe, expect, it } from 'vitest';
import { readBoundedRuntimeJSON } from '#src/transport.js';

describe('bounded ordinary worker JSON transport', () => {
  it('decodes exact JSON and rejects byte limits declared or observed', async () => {
    const signal = new AbortController().signal;
    expect(
      await readBoundedRuntimeJSON(new Response('{"ok":true}'), signal, 32)
    ).toEqual({ ok: true });
    await expect(
      readBoundedRuntimeJSON(
        new Response('{}', { headers: { 'Content-Length': '100' } }),
        signal,
        32
      )
    ).rejects.toThrow('byte limit');
    await expect(
      readBoundedRuntimeJSON(
        new Response('{"value":"' + 'a'.repeat(64) + '"}'),
        signal,
        32
      )
    ).rejects.toThrow('byte limit');
  });
  it('caps zero-length chunks and aborts non-cooperative stalled reads', async () => {
    const zeroChunks = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array());
        },
      })
    );
    await expect(
      readBoundedRuntimeJSON(zeroChunks, new AbortController().signal)
    ).rejects.toThrow('chunk limit');
    const stalled = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          return new Promise(() => {});
        },
      })
    );
    const controller = new AbortController();
    const result = readBoundedRuntimeJSON(stalled, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow('aborted');
  });
});
