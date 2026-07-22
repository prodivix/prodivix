import type { LlmProviderRequest } from '@prodivix/shared';
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './openAICompatibleProvider';

const request: LlmProviderRequest = {
  task: {
    id: 'task-1',
    intent: 'Create a plan',
    context: { entries: [] },
    allowedTools: [],
    outputChannels: [],
  },
  tools: [],
};

describe('OpenAICompatibleProvider streaming', () => {
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
