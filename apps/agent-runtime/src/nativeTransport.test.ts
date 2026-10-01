import { describe, expect, it, vi } from 'vitest';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { createAgentRuntimeNativeAdapter } from '#src/nativeTransport.js';
import { prepareAgentRuntimeContext } from '#src/composition.js';
import { runtimeFixture, time } from '#src/runtime.fixture.js';

const credential = 'fixture-private-material';
const harness = async (fetch: typeof globalThis.fetch, timeoutMs = 1_000) => {
  const fixture = runtimeFixture();
  const context = await prepareAgentRuntimeContext({
    ...fixture,
    runId: 'run.fixture',
    at: time,
  });
  const request = {
    invocationId: 'invocation.fixture',
    requestDigest: digestAgentCanonicalValue('request'),
    providerConfigurationId:
      fixture.binding.catalog.provider.providerConfigurationId,
    modelLineageDigest: fixture.binding.catalog.model.lineageDigest,
    capabilityProfileDigest:
      fixture.binding.catalog.capabilityProfile.profileDigest,
    inferenceConfigurationDigest: fixture.binding.inference.configurationDigest,
    contextPackDigest: context.pack.manifestDigest,
  };
  const adapter = createAgentRuntimeNativeAdapter({
    ...fixture,
    context,
    request,
    now: () => time,
    timeoutMs,
    environment: { MODEL_FIXTURE_KEY: credential },
    fetch,
  });
  return { adapter, request };
};
const response = (deltas: readonly string[]) =>
  new Response(
    [
      ...deltas.map(
        (delta) =>
          `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\n`
      ),
      `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'response.fixture', status: 'completed', usage: { input_tokens: 40, output_tokens: 12 } } })}\n\n`,
    ].join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
const collect = async (
  h: Awaited<ReturnType<typeof harness>>,
  signal?: AbortSignal
) => {
  const facts = [];
  for await (const fact of h.adapter.invokeRuntime(h.request, signal))
    facts.push(fact);
  return facts;
};

describe('ordinary callback-bound native transport', () => {
  it('normalizes a real bounded SSE response while keeping the credential solely in callback headers', async () => {
    let headerValue = '';
    let body = '';
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      headerValue = new Headers(init?.headers).get('Authorization') ?? '';
      body = String(init?.body);
      return response(['{"answer":"The count ', 'is 1."}']);
    });
    const facts = await collect(await harness(fetch));
    expect(headerValue).toBe(`Bearer ${credential}`);
    expect(body).not.toContain(credential);
    expect(JSON.stringify(facts)).not.toContain(credential);
    expect(facts.some((fact) => fact.factType === 'usage-vector')).toBe(true);
    expect(
      facts.filter((fact) => fact.factType === 'provider-event').at(-1)?.value
        .durableEvent.type
    ).toBe('completed');
  });
  it.each(['split', 'escaped'] as const)(
    'rejects a %s credential canary before any result leaves its callback',
    async (kind) => {
      const deltas =
        kind === 'split'
          ? ['{"answer":"fixture-private-', 'material"}']
          : [JSON.stringify({ answer: credential }).replaceAll('f', '\\u0066')];
      const facts = await collect(
        await harness(vi.fn(async () => response(deltas)))
      );
      expect(
        facts.some(
          (fact) =>
            fact.factType === 'provider-event' &&
            fact.value.durableEvent.type === 'output-delta'
        )
      ).toBe(false);
      expect(JSON.stringify(facts)).not.toContain(credential);
      expect(
        facts.find((fact) => fact.factType === 'provider-event')?.value
          .durableEvent.type
      ).toBe('failed');
    }
  );
  it('bounds an uncooperative fetch and aborts a stalled response body', async () => {
    const start = performance.now();
    const never = await harness(
      vi.fn(() => new Promise<Response>(() => {})),
      30
    );
    const first = await collect(never);
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(
      first.find((fact) => fact.factType === 'provider-event')?.value
        .durableEvent.type
    ).toBe('failed');
    let cancelled = false;
    const stalled = await harness(
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          )
      ),
      30
    );
    const second = await collect(stalled);
    expect(cancelled).toBe(true);
    expect(
      second.find((fact) => fact.factType === 'provider-event')?.value
        .durableEvent.type
    ).toBe('failed');
  });
});
