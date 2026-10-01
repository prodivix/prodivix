import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiDraftRequest } from '@prodivix/ai';
import {
  createServerDraftPayload,
  listDraftProviders,
  streamServerDraft,
} from '@/ai/aiDraftClient';

const preferences = {
  provider: 'server' as const,
  providerId: 'configured',
  modelId: 'model',
};
const draft = createAiDraftRequest({
  id: 'draft-1',
  intent: 'Plan a hero',
  context: { entries: [] },
  providerMetadata: {
    apiKey: 'secret-canary',
    baseURL: 'https://untrusted.test',
    abortSignal: new AbortController().signal,
  },
});
const plan = {
  goal: 'Plan a hero',
  assumptions: ['Plan only'],
  milestones: [{ id: 'inspect', title: 'Inspect layout' }],
};
const completed = {
  type: 'completed',
  result: {
    requestId: 'draft-1',
    status: 'planned',
    output: plan,
    diagnostics: [],
  },
};
const collect = async () => {
  const events = [];
  for await (const event of streamServerDraft({
    token: 'session-token',
    draft,
    preferences,
  }))
    events.push(event);
  return events;
};
const respond = (value: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
      })
    )
  );

describe('server plan-only draft boundary', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends public model references and data-only context without credential or transport metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [completed] }), {
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(collect()).resolves.toEqual([completed]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toMatch(/\/api\/agent\/drafts$/);
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer session-token'
    );
    const payload = JSON.parse(init.body);
    expect(payload).toEqual(createServerDraftPayload(draft, preferences));
    expect(payload.draft).toMatchObject({
      allowedTools: [],
      responseMode: 'json',
      streaming: false,
    });
    expect(init.body).not.toContain('secret-canary');
    expect(init.body).not.toContain('baseURL');
    expect(init.body).not.toContain('providerMetadata');
    expect(init.body).not.toContain('abortSignal');
  });
  it.each([
    { events: [] },
    {
      events: [
        { ...completed, result: { ...completed.result, requestId: 'other' } },
      ],
    },
    {
      events: [
        {
          ...completed,
          result: {
            ...completed.result,
            output: { ...plan, commands: [{ kind: 'write' }] },
          },
        },
      ],
    },
    { events: [{ type: 'validated-output', output: plan, rawResponse: '' }] },
    { events: [{ type: 'raw-delta', delta: 'x'.repeat(262145) }, completed] },
    { events: [completed, { type: 'raw-delta', delta: 'late' }] },
  ])(
    'rejects malformed or authority-bearing draft output %#',
    async (response) => {
      respond(response);
      await expect(collect()).rejects.toThrow('invalid plan-only');
    }
  );
  it('accepts an unconfigured catalog but rejects secret-bearing or duplicate catalog identities', async () => {
    respond({ providers: [] });
    await expect(listDraftProviders('session')).resolves.toEqual([]);
    respond({
      providers: [
        {
          id: 'provider',
          displayName: 'Provider',
          models: [],
          capabilities: { plan: true },
          apiKey: 'secret-canary',
        },
      ],
    });
    await expect(listDraftProviders('session')).rejects.toThrow(
      'invalid plan-only'
    );
    const provider = {
      id: 'provider',
      displayName: 'Provider',
      models: [{ id: 'model' }],
      capabilities: { plan: true },
    };
    respond({ providers: [provider, provider] });
    await expect(listDraftProviders('session')).rejects.toThrow(
      'invalid plan-only'
    );
  });
  it('aborts the authenticated server request on caller cancellation', async () => {
    const controller = new AbortController();
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init) => {
        signal = init.signal;
        return new Promise(() => undefined);
      })
    );
    const run = (async () => {
      for await (const _event of streamServerDraft({
        token: 'session',
        draft,
        preferences,
        signal: controller.signal,
      })) {
        /* transport remains pending */
      }
    })().catch((error: unknown) => error);
    controller.abort();
    expect(await run).toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(true);
  });
  it('rejects an excessive transport body before decoding JSON and cancels its reader', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1048577));
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      )
    );
    await expect(collect()).rejects.toThrow('byte budget');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([
    { timeoutMs: 300001 },
    { maxOutputTokens: Number.NaN },
    { temperature: -1 },
  ])(
    'rejects invalid caller budgets before invoking transport %#',
    (budget) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      expect(() =>
        createServerDraftPayload(draft, { ...preferences, budget })
      ).toThrow('budget');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
