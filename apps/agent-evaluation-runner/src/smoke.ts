import {
  digestAgentCanonicalValue,
  type AgentNativeProviderTransportRequest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createHash, randomUUID } from 'node:crypto';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  loadAgentEvaluationRunnerConfig,
  requireEnabledAgentEvaluationRunnerConfig,
  type AgentEvaluationEnvironment,
  type AgentEvaluationNativeProtocol,
  type AgentEvaluationRunnerConfig,
} from './config';
import type { AgentEvaluationHostResolver } from './egress';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
  type AgentEvaluationRunnerErrorCode,
} from './errors';
import {
  createAgentEvaluationProviderTransport,
  type AgentEvaluationFetch,
  type AgentEvaluationProviderPayload,
  type AgentEvaluationTransportReceipt,
} from './providerTransport';
import {
  EnvironmentAgentProviderSecretResolver,
  type AgentProviderSecretResolver,
} from './secretResolver';

const smokePrompt = 'Reply with exactly PRODIVIX_G4_SMOKE_OK.';
const smokeProtocols = Object.freeze([
  'openai-responses',
  'anthropic-messages',
  'gemini-interactions',
] as const satisfies readonly AgentEvaluationNativeProtocol[]);

export type AgentEvaluationSmokeProviderResult = Readonly<{
  protocolFamily: AgentEvaluationNativeProtocol;
  providerConfigurationId: string;
  outcome: 'completed' | 'failed';
  receipt?: AgentEvaluationTransportReceipt;
  errorCategory?: AgentEvaluationRunnerErrorCode;
}>;

export type AgentEvaluationSmokeReport = Readonly<{
  format: 'prodivix-g4-provider-smoke';
  version: 1;
  runId: string;
  outcome: 'completed' | 'failed';
  providers: readonly AgentEvaluationSmokeProviderResult[];
  startedAt: string;
  completedAt: string;
  reportDigest: string;
}>;

export type RunAgentEvaluationSmokeInput = Readonly<{
  config?: AgentEvaluationRunnerConfig;
  environment?: AgentEvaluationEnvironment;
  secrets?: AgentProviderSecretResolver;
  fetcher?: AgentEvaluationFetch;
  resolveHost?: AgentEvaluationHostResolver;
  now?: () => Date;
  runId?: string;
  recordReceipt?: (receipt: AgentEvaluationTransportReceipt) => void;
}>;

const digestText = (value: string): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

const canonicalRunId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const smokeCompletion = (
  protocolFamily: AgentEvaluationNativeProtocol,
  events: readonly unknown[]
): boolean => {
  let output = '';
  let completed = false;
  let rejected = false;
  for (const raw of events) {
    const event = record(raw);
    if (!event) return false;
    if (protocolFamily === 'openai-responses') {
      if (
        event.type === 'response.output_text.delta' &&
        typeof event.delta === 'string'
      ) {
        output += event.delta;
      }
      completed ||= event.type === 'response.completed';
      rejected ||=
        event.type === 'response.failed' ||
        event.type === 'response.incomplete' ||
        event.type === 'response.cancelled' ||
        event.type === 'error';
    } else if (protocolFamily === 'anthropic-messages') {
      const delta = record(event.delta);
      if (
        event.type === 'content_block_delta' &&
        delta?.type === 'text_delta' &&
        typeof delta.text === 'string'
      ) {
        output += delta.text;
      }
      completed ||= event.type === 'message_stop';
      rejected ||=
        event.type === 'error' ||
        (event.type === 'message_delta' &&
          ['max_tokens', 'refusal'].includes(String(delta?.stop_reason)));
    } else {
      const delta = record(event.delta);
      const interaction = record(event.interaction);
      const step = record(event.step);
      if (
        event.event_type === 'step.start' &&
        step?.type === 'model_output' &&
        Array.isArray(step.content)
      ) {
        for (const rawBlock of step.content) {
          const block = record(rawBlock);
          if (block?.type === 'text' && typeof block.text === 'string') {
            output += block.text;
          }
        }
      }
      if (
        event.event_type === 'step.delta' &&
        delta?.type === 'text' &&
        typeof delta.text === 'string'
      ) {
        output += delta.text;
      }
      completed ||=
        event.event_type === 'interaction.completed' &&
        interaction?.status === 'completed';
      rejected ||=
        event.event_type === 'interaction.failed' ||
        event.event_type === 'interaction.cancelled' ||
        event.event_type === 'error';
    }
  }
  return completed && !rejected && output === 'PRODIVIX_G4_SMOKE_OK';
};

const payloadFor = (
  protocolFamily: AgentEvaluationNativeProtocol
): AgentEvaluationProviderPayload => {
  switch (protocolFamily) {
    case 'openai-responses':
      return Object.freeze({
        body: Object.freeze({
          input: smokePrompt,
          max_output_tokens: 16,
        }),
      });
    case 'anthropic-messages':
      return Object.freeze({
        body: Object.freeze({
          max_tokens: 16,
          messages: Object.freeze([
            Object.freeze({ role: 'user', content: smokePrompt }),
          ]),
        }),
      });
    case 'gemini-interactions':
      return Object.freeze({
        body: Object.freeze({
          input: smokePrompt,
          generation_config: Object.freeze({ max_output_tokens: 16 }),
        }),
      });
  }
};

const smokeRequest = (
  protocolFamily: AgentEvaluationNativeProtocol,
  providerConfigurationId: string,
  modelId: string,
  runId: string
): AgentNativeProviderTransportRequest => {
  const scope = Object.freeze({
    kind: 'g4-provider-smoke',
    protocolFamily,
    providerConfigurationId,
    modelId,
    runId,
  });
  return Object.freeze({
    protocolFamily,
    invocation: Object.freeze({
      invocationId: `g4-smoke:${protocolFamily}:${runId}`,
      requestDigest: digestAgentCanonicalValue({
        ...scope,
        artifact: 'request',
      }),
      providerConfigurationId,
      modelLineageDigest: digestAgentCanonicalValue({
        providerConfigurationId,
        modelId,
      }),
      capabilityProfileDigest: digestAgentCanonicalValue({
        kind: 'g4-provider-smoke-capability',
        version: 1,
      }),
      inferenceConfigurationDigest: digestAgentCanonicalValue({
        kind: 'g4-provider-smoke-inference',
        maximumOutputTokens: 16,
        version: 1,
      }),
      contextPackDigest: digestAgentCanonicalValue({
        kind: 'g4-provider-smoke-context',
        prompt: smokePrompt,
        version: 1,
      }),
    }),
  });
};

/** Ephemeral authority for the diagnostic smoke report; release admission uses the durable five-target qualifier. */
const smokeDispatchAuthority = (
  request: AgentNativeProviderTransportRequest,
  runId: string
) => {
  const protocolFamily =
    request.protocolFamily as AgentEvaluationNativeProtocol;
  const planDigest = digestAgentCanonicalValue({
    kind: 'g4-provider-diagnostic-smoke-plan',
    runId,
    version: 1,
  });
  const caseId = 'case.g4-provider-diagnostic-smoke';
  const targetId = `target.g4-provider-diagnostic-smoke.${protocolFamily}`;
  const capabilityDescriptorDigest = digestAgentCanonicalValue({
    kind: 'g4-provider-diagnostic-smoke-capability',
    version: 1,
  });
  const targetDigest = digestAgentCanonicalValue({
    protocolFamily,
    providerConfigurationId: request.invocation.providerConfigurationId,
    modelLineageDigest: request.invocation.modelLineageDigest,
  });
  const samplingIdentityDigest = digestAgentCanonicalValue({
    planDigest,
    caseId,
    capabilityDescriptorDigest,
    targetId,
    targetDigest,
    riskClass: 'ordinary',
    repetitionIndex: 0,
  });
  const descriptorBase = Object.freeze({
    attemptId: `evaluation-attempt:${samplingIdentityDigest.slice('sha256-'.length)}`,
    planDigest,
    shardId: `evaluation-shard:diagnostic-smoke-${protocolFamily}`,
    caseId,
    capabilityDescriptorDigest,
    targetId,
    targetDigest,
    riskClass: 'ordinary' as const,
    repetitionIndex: 0,
    samplingIdentityDigest,
  });
  const descriptor = Object.freeze({
    ...descriptorBase,
    descriptorDigest: digestAgentCanonicalValue(descriptorBase),
  });
  return Object.freeze({
    descriptor,
    repositoryCommit: '0'.repeat(40),
    turnIndex: 0,
    budgetReservationId: `evaluation-smoke-reservation:${protocolFamily}:${runId}`,
    demandDigest: digestAgentCanonicalValue({
      kind: 'g4-provider-diagnostic-smoke-demand',
      protocolFamily,
      maximumOutputTokens: 16,
    }),
  });
};

const createReport = (
  input: Omit<AgentEvaluationSmokeReport, 'reportDigest'>
): AgentEvaluationSmokeReport => {
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    reportDigest: digestText(canonicalJsonText(base)),
  });
};

/** Executes exactly one bounded first-party request for every frozen native provider. */
export const runAgentEvaluationSmoke = async (
  input: RunAgentEvaluationSmokeInput = {}
): Promise<AgentEvaluationSmokeReport> => {
  const environment = input.environment ?? process.env;
  const config = requireEnabledAgentEvaluationRunnerConfig(
    input.config ?? loadAgentEvaluationRunnerConfig(environment)
  );
  const now = input.now ?? (() => new Date());
  const runId = input.runId ?? randomUUID();
  if (!canonicalRunId(runId)) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  const startedAt = now().toISOString();
  const receipts = new Map<
    AgentEvaluationNativeProtocol,
    AgentEvaluationTransportReceipt
  >();
  const transport = createAgentEvaluationProviderTransport({
    config,
    secrets:
      input.secrets ?? new EnvironmentAgentProviderSecretResolver(environment),
    resolvePayload: ({ protocolFamily }) => {
      if (!(protocolFamily in AGENT_EVALUATION_PROVIDER_DEFINITIONS)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
      return payloadFor(protocolFamily as AgentEvaluationNativeProtocol);
    },
    resolveDispatchIntentAuthority: (request) =>
      smokeDispatchAuthority(request, runId),
    ...(input.fetcher ? { fetcher: input.fetcher } : {}),
    ...(input.resolveHost ? { resolveHost: input.resolveHost } : {}),
    now,
    recordReceipt: (receipt) => {
      if (
        receipt.protocolFamily !== 'openai-responses' &&
        receipt.protocolFamily !== 'anthropic-messages' &&
        receipt.protocolFamily !== 'gemini-interactions'
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
      receipts.set(receipt.protocolFamily, receipt);
      input.recordReceipt?.(receipt);
    },
  });

  const providers: AgentEvaluationSmokeProviderResult[] = [];
  for (const protocolFamily of smokeProtocols) {
    const provider = config.providers[protocolFamily];
    try {
      const execution = await transport.execute(
        smokeRequest(
          protocolFamily,
          provider.providerConfigurationId,
          provider.modelId,
          runId
        )
      );
      if (
        execution.receipt.httpStatus === undefined ||
        execution.receipt.httpStatus < 200 ||
        execution.receipt.httpStatus >= 300 ||
        execution.receipt.providerResponseId === undefined ||
        execution.receipt.sseEventCount < 1 ||
        !smokeCompletion(protocolFamily, execution.events)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
        );
      }
      providers.push(
        Object.freeze({
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          outcome: 'completed',
          receipt: execution.receipt,
        })
      );
    } catch (caught) {
      const error = safeRunnerError(caught);
      providers.push(
        Object.freeze({
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          outcome: 'failed',
          ...(receipts.get(protocolFamily)
            ? { receipt: receipts.get(protocolFamily) }
            : {}),
          errorCategory: error.code,
        })
      );
    }
  }

  return createReport({
    format: 'prodivix-g4-provider-smoke',
    version: 1,
    runId,
    outcome: providers.every(({ outcome }) => outcome === 'completed')
      ? 'completed'
      : 'failed',
    providers: Object.freeze(providers),
    startedAt,
    completedAt: now().toISOString(),
  });
};
