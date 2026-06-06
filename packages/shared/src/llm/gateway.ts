import type {
  LlmDiagnostic,
  LlmOutputChannel,
  LlmProvider,
  LlmProviderGenerateResult,
  LlmStreamEvent,
  LlmStructuredOutput,
  LlmToolDefinition,
  LlmTaskRequest,
  LlmTaskResult,
} from './types';
import { LlmProviderError } from './types';
import type { LlmTraceStore } from './traceStore';
import { LlmToolRegistry } from './toolRegistry';

export interface LlmGatewayOptions {
  provider: LlmProvider;
  tools: LlmToolRegistry;
  traceStore?: LlmTraceStore;
  createId?: () => string;
  now?: () => string;
}

const defaultCreateId = () =>
  `llm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

const defaultNow = () => new Date().toISOString();

const getOutputChannel = (
  output: LlmStructuredOutput
): LlmOutputChannel | 'plan' => {
  if ('channel' in output) {
    return output.channel;
  }

  return 'plan';
};

const unwrapProviderResult = (
  result: LlmProviderGenerateResult
): { output: LlmStructuredOutput; rawResponse?: string } => {
  if (isProviderResultEnvelope(result)) {
    return result;
  }

  return { output: result };
};

const isProviderResultEnvelope = (
  result: LlmProviderGenerateResult
): result is { output: LlmStructuredOutput; rawResponse?: string } =>
  typeof result === 'object' &&
  result !== null &&
  'output' in result &&
  isStructuredOutput((result as { output?: unknown }).output);

const isStructuredOutput = (value: unknown): value is LlmStructuredOutput => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<LlmStructuredOutput>;
  return (
    ('goal' in candidate && typeof candidate.goal === 'string') ||
    ('channel' in candidate &&
      (candidate.channel === 'pir-command' ||
        candidate.channel === 'node-graph-operation' ||
        candidate.channel === 'code-artifact'))
  );
};

type UnwrappedProviderResult = {
  output: LlmStructuredOutput;
  rawResponse?: string;
};

interface GatewayRunContext {
  task: LlmTaskRequest;
  traceId: string;
  startedAt: string;
  allowedTools: readonly LlmToolDefinition[];
}

/**
 * LLM Gateway 是 MFE 内部 AI 调用链路的统一入口：先按任务挑选允许的工具，
 * 再调用 provider，随后校验输出通道并写入 trace，最后返回可 dry-run 或可计划化的结果。
 *
 * LlmGateway is the unified MFE AI execution entrypoint: it picks task-allowed
 * tools, calls the provider, validates the output channel, records trace data,
 * and returns a result ready for planning or dry-run handling.
 */
export class LlmGateway {
  private readonly provider: LlmProvider;
  private readonly tools: LlmToolRegistry;
  private readonly traceStore?: LlmTraceStore;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options: LlmGatewayOptions) {
    this.provider = options.provider;
    this.tools = options.tools;
    this.traceStore = options.traceStore;
    this.createId = options.createId ?? defaultCreateId;
    this.now = options.now ?? defaultNow;
  }

  async run(task: LlmTaskRequest): Promise<LlmTaskResult> {
    const startedAt = this.now();
    const traceId = this.createId();
    const allowedTools = this.tools.pick(task.allowedTools);
    const context = { task, traceId, startedAt, allowedTools };

    try {
      const providerResult = await this.provider.generate({
        task,
        tools: allowedTools,
      });
      return await this.createSuccessResult(
        context,
        unwrapProviderResult(providerResult)
      );
    } catch (error) {
      return await this.createFailureResult(context, error);
    }
  }

  async *stream(task: LlmTaskRequest): AsyncIterable<LlmStreamEvent> {
    const startedAt = this.now();
    const traceId = this.createId();
    const allowedTools = this.tools.pick(task.allowedTools);
    const context = { task, traceId, startedAt, allowedTools };

    yield {
      type: 'started',
      taskId: task.id,
      traceId,
      providerId: this.provider.id,
    };

    if (!this.provider.stream) {
      try {
        const providerResult = await this.provider.generate({
          task,
          tools: allowedTools,
        });
        const result = await this.createSuccessResult(
          context,
          unwrapProviderResult(providerResult)
        );
        yield { type: 'completed', result };
      } catch (error) {
        const result = await this.createFailureResult(context, error);
        yield {
          type: 'diagnostic',
          diagnostic: result.diagnostics[0]!,
        };
        yield { type: 'completed', result };
      }
      return;
    }

    let providerResult: UnwrappedProviderResult | undefined;

    try {
      for await (const event of this.provider.stream({
        task,
        tools: allowedTools,
      })) {
        if (event.type === 'validated-output') {
          providerResult = {
            output: event.output,
            rawResponse: event.rawResponse,
          };
          continue;
        }

        if (event.type !== 'started' && event.type !== 'completed') {
          yield event;
        }
      }

      if (!providerResult) {
        throw new Error('Provider stream completed without structured output.');
      }

      const result = await this.createSuccessResult(context, providerResult);

      yield {
        type: 'validated-output',
        output: providerResult.output,
        rawResponse: result.rawResponse ?? providerResult.rawResponse ?? '',
      };
      yield { type: 'completed', result };
    } catch (error) {
      const result = await this.createFailureResult(context, error);

      yield {
        type: 'diagnostic',
        diagnostic: result.diagnostics[0]!,
      };
      yield { type: 'completed', result };
    }
  }

  private assertOutputChannel(
    task: LlmTaskRequest,
    output: LlmStructuredOutput
  ) {
    const outputChannel = getOutputChannel(output);

    if (
      outputChannel !== 'plan' &&
      !task.outputChannels.includes(outputChannel)
    ) {
      throw new Error(
        `Provider returned disallowed LLM output channel: ${outputChannel}`
      );
    }
  }

  private async createSuccessResult(
    context: GatewayRunContext,
    providerResult: UnwrappedProviderResult
  ): Promise<LlmTaskResult> {
    const { task, traceId, startedAt, allowedTools } = context;
    const { output, rawResponse } = providerResult;

    this.assertOutputChannel(task, output);

    await this.traceStore?.append({
      id: traceId,
      taskId: task.id,
      userIntent: task.intent,
      modelProviderId: this.provider.id,
      context: task.context,
      toolNames: allowedTools.map((tool) => tool.name),
      toolCalls: [],
      diagnostics: [],
      startedAt,
      completedAt: this.now(),
    });

    return {
      taskId: task.id,
      status: task.requiresPlan ? 'planned' : 'dry-run',
      output,
      rawResponse,
      diagnostics: [],
      traceId,
    };
  }

  private async createFailureResult(
    context: GatewayRunContext,
    error: unknown
  ): Promise<LlmTaskResult> {
    const { task, traceId, startedAt, allowedTools } = context;
    const rawResponse =
      error instanceof LlmProviderError ? error.rawResponse : undefined;
    const diagnostic: LlmDiagnostic = {
      code:
        error instanceof LlmProviderError && error.code
          ? error.code
          : 'AI-9001',
      severity:
        error instanceof LlmProviderError && error.severity
          ? error.severity
          : 'error',
      message: error instanceof Error ? error.message : 'LLM provider failed.',
    };

    await this.traceStore?.append({
      id: traceId,
      taskId: task.id,
      userIntent: task.intent,
      modelProviderId: this.provider.id,
      context: task.context,
      toolNames: allowedTools.map((tool) => tool.name),
      toolCalls: [],
      diagnostics: [diagnostic],
      startedAt,
      completedAt: this.now(),
    });

    return {
      taskId: task.id,
      status: 'failed',
      rawResponse,
      diagnostics: [diagnostic],
      traceId,
    };
  }
}
