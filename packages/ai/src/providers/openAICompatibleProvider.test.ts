import { describe, expect, it, vi } from 'vitest';
import type {
  AiDraftProviderRequest,
  AiDraftStreamEvent,
} from '../draft/draft.types';
import { OpenAICompatibleProvider } from './openAICompatibleProvider';

const request: AiDraftProviderRequest = {
  draft: {
    id: 'task-1',
    intent: 'Create a plan',
    context: { entries: [] },
    allowedTools: [],
  },
  tools: [],
};

describe('OpenAICompatibleProvider streaming', () => {
  it('applies the deadline even when the fetch port ignores abort', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const provider = new OpenAICompatibleProvider({
        baseURL: 'https://api.example.com/v1',
        model: 'test',
        fetcher: async (_url, init) => {
          signal = init?.signal;
          return await new Promise(() => undefined);
        },
      });
      const pending = expect(
        provider.generate({
          ...request,
          draft: { ...request.draft, budget: { timeoutMs: 10 } },
        })
      ).rejects.toThrow('aborted or timed out');
      await vi.advanceTimersByTimeAsync(10);
      await pending;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a stalled stream at the deadline', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const provider = new OpenAICompatibleProvider({
        baseURL: 'https://api.example.com/v1',
        model: 'test',
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: new ReadableStream({ cancel }),
          json: async () => ({}),
        }),
      });
      const consume = async () => {
        for await (const _event of provider.stream({
          ...request,
          draft: { ...request.draft, budget: { timeoutMs: 10 } },
        })) {
          /* Consume the bounded draft stream. */
        }
      };
      const pending = expect(consume()).rejects.toThrow('aborted or timed out');
      await vi.advanceTimersByTimeAsync(10);
      await pending;
      expect(cancel).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects oversized streamed output before emitting the overflowing delta', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 3; index++)
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(100_000) } }] })}\n\n`
            )
          );
      },
      cancel,
    });
    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      model: 'test',
      fetcher: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        body,
        json: async () => ({}),
      }),
    });
    const events: AiDraftStreamEvent[] = [];
    await expect(
      (async () => {
        for await (const event of provider.stream(request)) events.push(event);
      })()
    ).rejects.toMatchObject({ rawResponse: 'x'.repeat(200_000) });
    expect(events).toHaveLength(2);
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects an oversized unfinished SSE event and JSON body without retaining it', async () => {
    for (const stream of [true, false]) {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1_048_577).fill(120));
        },
        cancel,
      });
      const provider = new OpenAICompatibleProvider({
        baseURL: 'https://api.example.com/v1',
        model: 'test',
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          body,
          json: async () => ({}),
        }),
      });
      const consume = stream
        ? async () => {
            for await (const _event of provider.stream(request)) {
              /* Consume until rejection. */
            }
          }
        : () => provider.generate(request);
      await expect(consume()).rejects.toMatchObject({
        rawResponse: stream ? '' : undefined,
      });
      expect(cancel).toHaveBeenCalled();
    }
  });
  it('ignores empty SSE data events and cancels after DONE', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data:\n\n'));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    content: JSON.stringify({
                      goal: 'Ship safely',
                      assumptions: [],
                      milestones: [],
                    }),
                  },
                },
              ],
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      },
      cancel,
    });
    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
      fetcher: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        body,
        json: async () => ({}),
      }),
    });

    const events = [];
    for await (const event of provider.stream(request)) events.push(event);

    expect(events.at(-1)).toMatchObject({
      type: 'validated-output',
      output: { goal: 'Ship safely' },
    });
    expect(cancel).toHaveBeenCalledWith('sse-consumer-closed');
  });
});
