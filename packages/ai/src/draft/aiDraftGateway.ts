import type {
  AiDraftDiagnostic,
  AiDraftPlan,
  AiDraftProvider,
  AiDraftProviderGenerateResult,
  AiDraftRequest,
  AiDraftResult,
  AiDraftStreamEvent,
  AiDraftToolDefinition,
} from './draft.types';
import { AiDraftProviderError } from './draft.types';
import { AiDraftToolRegistry } from './aiDraftToolRegistry';
import { validateAiDraftPlan } from './validateAiDraftPlan';

export interface AiDraftGatewayOptions {
  provider: AiDraftProvider;
  tools: AiDraftToolRegistry;
  createId?: () => string;
}

const defaultCreateId = () =>
  `ai_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

const isProviderResultEnvelope = (
  result: AiDraftProviderGenerateResult
): result is { output: AiDraftPlan; rawResponse?: string } =>
  typeof result === 'object' &&
  result !== null &&
  'output' in result &&
  validateAiDraftPlan((result as { output?: unknown }).output).output !==
    undefined;

const unwrapProviderResult = (
  result: AiDraftProviderGenerateResult
): { output: AiDraftPlan; rawResponse?: string } =>
  isProviderResultEnvelope(result) ? result : { output: result };

type DraftRunContext = Readonly<{
  draft: AiDraftRequest;
  traceId: string;
  allowedTools: readonly AiDraftToolDefinition[];
}>;

/**
 * Admission-only provider loop for explain/plan drafts. It cannot emit a
 * Command, approval, commit, rollback, WorkspaceOperation, or durable run fact.
 */
export class AiDraftGateway {
  private readonly provider: AiDraftProvider;
  private readonly tools: AiDraftToolRegistry;
  private readonly createId: () => string;

  constructor(options: AiDraftGatewayOptions) {
    this.provider = options.provider;
    this.tools = options.tools;
    this.createId = options.createId ?? defaultCreateId;
  }

  async run(draft: AiDraftRequest): Promise<AiDraftResult> {
    let context: DraftRunContext | undefined;
    try {
      context = this.createContext(draft);
      const result = unwrapProviderResult(
        await this.provider.generate({
          draft,
          tools: context.allowedTools,
        })
      );
      return this.createSuccessResult(context, result);
    } catch (error) {
      return this.createFailureResult(
        context ?? {
          draft,
          traceId: this.createId(),
          allowedTools: [],
        },
        error
      );
    }
  }

  async *stream(draft: AiDraftRequest): AsyncIterable<AiDraftStreamEvent> {
    let context: DraftRunContext;
    try {
      context = this.createContext(draft);
    } catch (error) {
      const traceId = this.createId();
      const result = this.createFailureResult(
        { draft, traceId, allowedTools: [] },
        error
      );
      yield {
        type: 'started',
        requestId: draft.id,
        traceId,
        providerId: this.provider.id,
      };
      yield { type: 'diagnostic', diagnostic: result.diagnostics[0]! };
      yield { type: 'completed', result };
      return;
    }

    yield {
      type: 'started',
      requestId: draft.id,
      traceId: context.traceId,
      providerId: this.provider.id,
    };

    if (!this.provider.stream) {
      const result = await this.runWithContext(context);
      if (result.status === 'failed') {
        yield { type: 'diagnostic', diagnostic: result.diagnostics[0]! };
      }
      yield { type: 'completed', result };
      return;
    }

    let providerResult:
      Readonly<{ output: AiDraftPlan; rawResponse?: string }> | undefined;
    try {
      for await (const event of this.provider.stream({
        draft,
        tools: context.allowedTools,
      })) {
        if (event.type === 'validated-output') {
          providerResult = {
            output: event.output,
            rawResponse: event.rawResponse,
          };
          continue;
        }
        if (event.type !== 'started' && event.type !== 'completed') yield event;
      }
      if (!providerResult) {
        throw new AiDraftProviderError(
          'Provider stream completed without a validated draft.',
          { code: 'AI-4001' }
        );
      }
      const result = this.createSuccessResult(context, providerResult);
      yield {
        type: 'validated-output',
        output: providerResult.output,
        rawResponse: result.rawResponse ?? providerResult.rawResponse ?? '',
      };
      yield { type: 'completed', result };
    } catch (error) {
      const result = this.createFailureResult(context, error);
      yield { type: 'diagnostic', diagnostic: result.diagnostics[0]! };
      yield { type: 'completed', result };
    }
  }

  private createContext(draft: AiDraftRequest): DraftRunContext {
    return {
      draft,
      traceId: this.createId(),
      allowedTools: this.tools.pick(draft.allowedTools),
    };
  }

  private async runWithContext(
    context: DraftRunContext
  ): Promise<AiDraftResult> {
    try {
      const providerResult = unwrapProviderResult(
        await this.provider.generate({
          draft: context.draft,
          tools: context.allowedTools,
        })
      );
      return this.createSuccessResult(context, providerResult);
    } catch (error) {
      return this.createFailureResult(context, error);
    }
  }

  private createSuccessResult(
    context: DraftRunContext,
    providerResult: Readonly<{ output: AiDraftPlan; rawResponse?: string }>
  ): AiDraftResult {
    const validated = validateAiDraftPlan(providerResult.output);
    if (!validated.output) {
      throw new AiDraftProviderError(
        validated.diagnostics[0]?.message ?? 'AI draft output is invalid.',
        { code: 'AI-4002', rawResponse: providerResult.rawResponse }
      );
    }
    return {
      requestId: context.draft.id,
      status: 'planned',
      output: validated.output,
      rawResponse: providerResult.rawResponse,
      diagnostics: [],
      traceId: context.traceId,
    };
  }

  private createFailureResult(
    context: DraftRunContext,
    error: unknown
  ): AiDraftResult {
    const diagnostic: AiDraftDiagnostic = {
      code:
        error instanceof AiDraftProviderError && error.code
          ? error.code
          : 'AI-9001',
      severity:
        error instanceof AiDraftProviderError && error.severity
          ? error.severity
          : 'error',
      message:
        error instanceof Error ? error.message : 'AI draft provider failed.',
    };
    return {
      requestId: context.draft.id,
      status: 'failed',
      rawResponse:
        error instanceof AiDraftProviderError ? error.rawResponse : undefined,
      diagnostics: [diagnostic],
      traceId: context.traceId,
    };
  }
}
