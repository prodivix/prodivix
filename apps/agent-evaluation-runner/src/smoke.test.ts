import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import type { AgentEvaluationFetch } from './providerTransport';
import { runAgentEvaluationSmoke } from './smoke';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_ENABLED: '1',
  PRODIVIX_G4_MODEL_EVAL_OPENAI_MODEL_ID: 'openai-smoke-model',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_MODEL_ID: 'anthropic-smoke-model',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_MODEL_ID: 'gemini-smoke-model',
  PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY: 'openai-smoke-secret-123',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY: 'anthropic-smoke-secret-123',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY: 'gemini-smoke-secret-123',
});

const successfulSse = (url: string): string => {
  if (
    url === AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses'].endpoint
  ) {
    return 'data: {"type":"response.created","response":{"id":"resp_smoke","model":"openai-smoke-model"}}\n\ndata: {"type":"response.output_text.delta","item_id":"msg_smoke","delta":"PRODIVIX_G4_SMOKE_OK"}\n\ndata: {"type":"response.completed","response":{"id":"resp_smoke","model":"openai-smoke-model","status":"completed","usage":{"input_tokens":8,"output_tokens":4}}}\n\ndata: [DONE]\n\n';
  }
  if (
    url === AGENT_EVALUATION_PROVIDER_DEFINITIONS['anthropic-messages'].endpoint
  ) {
    return 'data: {"type":"message_start","message":{"id":"msg_smoke","model":"anthropic-smoke-model","usage":{"input_tokens":8}}}\n\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"PRODIVIX_G4_SMOKE_OK"}}\n\ndata: {"type":"content_block_stop","index":0}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\ndata: {"type":"message_stop"}\n\n';
  }
  return 'data: {"event_type":"interaction.created","interaction":{"id":"interaction_smoke","model":"gemini-smoke-model","model_version":"gemini-smoke-model","status":"in_progress"}}\n\ndata: {"event_type":"step.start","index":0,"step":{"type":"model_output"}}\n\ndata: {"event_type":"step.delta","index":0,"delta":{"type":"text","text":"PRODIVIX_G4_SMOKE_OK"}}\n\ndata: {"event_type":"step.stop","index":0}\n\ndata: {"event_type":"interaction.completed","interaction":{"id":"interaction_smoke","model":"gemini-smoke-model","model_version":"gemini-smoke-model","status":"completed","usage":{"total_input_tokens":8,"total_output_tokens":4}}}\n\ndata: [DONE]\n\n';
};

describe('agent evaluation provider smoke', () => {
  it('is disabled by default before any fetch can occur', async () => {
    const fetcher = vi.fn();
    await expect(
      runAgentEvaluationSmoke({
        environment: {},
        fetcher: fetcher as AgentEvaluationFetch,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.disabled,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('makes exactly one minimal request per frozen provider', async () => {
    const urls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return new Response(successfulSse(url), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'provider-smoke-request',
        },
      });
    }) as AgentEvaluationFetch;
    const report = await runAgentEvaluationSmoke({
      environment,
      fetcher,
      resolveHost: async () => ['8.8.8.8'],
      now: () => new Date('2026-08-08T00:00:00.000Z'),
      runId: 'test-run-1',
    });

    expect(urls).toEqual([
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses'].endpoint,
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['anthropic-messages'].endpoint,
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions'].endpoint,
    ]);
    expect(report.outcome, JSON.stringify(report)).toBe('completed');
    expect(report.providers).toHaveLength(3);
    expect(
      report.providers.every(({ outcome }) => outcome === 'completed')
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain('smoke-secret');
  });

  it('continues the bounded matrix and reports safe categories after one failure', async () => {
    const urls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (
        url ===
        AGENT_EVALUATION_PROVIDER_DEFINITIONS['anthropic-messages'].endpoint
      ) {
        return new Response(
          'credential rejected with private provider detail',
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
      return new Response(successfulSse(url), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'provider-smoke-request',
        },
      });
    }) as AgentEvaluationFetch;
    const report = await runAgentEvaluationSmoke({
      environment,
      fetcher,
      resolveHost: async () => ['8.8.8.8'],
      runId: 'test-run-failure',
    });

    expect(urls).toHaveLength(3);
    expect(report.outcome).toBe('failed');
    expect(report.providers[1]).toMatchObject({
      protocolFamily: 'anthropic-messages',
      outcome: 'failed',
      errorCategory:
        AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
    });
    expect(JSON.stringify(report)).not.toContain('private provider detail');
    expect(JSON.stringify(report)).not.toContain('smoke-secret');
  });

  it('does not pass a stream that has an ID and marker without terminal completion', async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('api.openai.com')
        ? 'data: {"type":"response.created","response":{"id":"resp_truncated","model":"openai-smoke-model"}}\n\ndata: {"type":"response.output_text.delta","item_id":"msg_truncated","delta":"PRODIVIX_G4_SMOKE_OK"}\n\n'
        : successfulSse(url);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'provider-smoke-request',
        },
      });
    }) as AgentEvaluationFetch;
    const report = await runAgentEvaluationSmoke({
      environment,
      fetcher,
      resolveHost: async () => ['8.8.8.8'],
      runId: 'test-run-truncated',
    });
    expect(report).toMatchObject({
      outcome: 'failed',
      providers: [
        {
          protocolFamily: 'openai-responses',
          outcome: 'failed',
          errorCategory: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
        },
        { protocolFamily: 'anthropic-messages', outcome: 'completed' },
        { protocolFamily: 'gemini-interactions', outcome: 'completed' },
      ],
    });
  });
});
