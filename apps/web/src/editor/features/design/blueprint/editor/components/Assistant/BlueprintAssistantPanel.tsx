import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  ChevronDown,
  Eye,
  Loader2,
  MessageSquareText,
  Send,
  Settings,
} from 'lucide-react';
import {
  createLlmTask,
  createProdivixAiProvider,
  stringifyOpenAICompatibleMessages,
  createOpenAICompatibleMessages,
} from '@prodivix/ai';
import {
  InMemoryLlmTraceStore,
  LlmContextBuilder,
  LlmGateway,
  LlmToolRegistry,
  type LlmPlanArtifact,
  type LlmTaskRequest,
} from '@prodivix/shared';
import {
  headerCollapseButtonClassName,
  rightCollapsedButtonClassName,
} from '../collapseButtonStyles';
import { useAiSettingsStore } from '@/ai/aiSettingsStore';
import { BlueprintAssistantSettingsModal } from './BlueprintAssistantSettingsModal';

type BlueprintAssistantPanelProps = {
  currentPath: string;
  selectedId?: string;
};

const createTaskId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ai-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const isPlanArtifact = (value: unknown): value is LlmPlanArtifact => {
  if (!value || typeof value !== 'object' || 'channel' in value) return false;
  const candidate = value as Partial<LlmPlanArtifact>;
  return (
    typeof candidate.goal === 'string' && Array.isArray(candidate.milestones)
  );
};

const createBlueprintAssistantContext = (
  currentPath: string,
  selectedId?: string
) =>
  new LlmContextBuilder()
    .add({
      id: 'blueprint.route',
      title: 'Current route',
      authority: 'authoritative',
      value: currentPath,
    })
    .add({
      id: 'blueprint.selection',
      title: 'Selected node',
      authority: 'authoritative',
      value: selectedId ?? null,
    })
    .omit('Full PIR is omitted in the minimal assistant loop.')
    .build(1600);

const createBlueprintAssistantTask = (
  normalizedIntent: string,
  currentPath: string,
  selectedId?: string
): LlmTaskRequest =>
  createLlmTask({
    id: createTaskId(),
    intent: normalizedIntent,
    context: createBlueprintAssistantContext(currentPath, selectedId),
    outputChannels: ['pir-command'],
    requiresPlan: true,
    responseMode: 'json',
    modelPreferences: {
      jsonMode: true,
    },
  });

const DebugHoverButton = ({
  label,
  icon,
  content,
}: {
  label: string;
  icon: ReactNode;
  content: string;
}) => (
  <div className="group relative">
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center bg-transparent text-(--text-muted) hover:bg-(--bg-panel) hover:text-(--text-primary)"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
    <div className="absolute right-0 bottom-8 z-20 hidden w-[320px] border border-(--border-default) bg-(--bg-canvas) p-2 shadow-(--shadow-md) group-hover:block">
      <div className="mb-1 text-[10px] font-semibold text-(--text-muted) uppercase">
        {label}
      </div>
      <pre className="max-h-56 overflow-auto text-[11px] whitespace-pre-wrap text-(--text-secondary) select-text">
        {content}
      </pre>
    </div>
  </div>
);

/**
 * 蓝图编辑器右下角的最小 AI 闭环：收集当前路由和选中节点上下文，
 * 通过 @prodivix/ai mock provider 生成 plan，暂不写入 PIR。
 *
 * Minimal bottom-right AI loop for BlueprintEditor: it collects current route
 * and selected node context, generates a plan through the @prodivix/ai mock provider,
 * and does not write to PIR yet.
 */
export function BlueprintAssistantPanel({
  currentPath,
  selectedId,
}: BlueprintAssistantPanelProps) {
  const { t } = useTranslation('blueprint');
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [intent, setIntent] = useState(() =>
    t('assistant.defaultIntent', {
      defaultValue: 'Plan a cleaner hero section',
    })
  );
  const [isRunning, setIsRunning] = useState(false);
  const [plan, setPlan] = useState<LlmPlanArtifact | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [promptPreview, setPromptPreview] = useState('');
  const [traceId, setTraceId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const settings = useAiSettingsStore((state) => state.settings);
  const contextPreview = useMemo(
    () => [
      { label: t('assistant.context.route'), value: currentPath },
      {
        label: t('assistant.context.selected'),
        value: selectedId ?? t('assistant.context.none'),
      },
    ],
    [currentPath, selectedId, t]
  );

  const runAssistant = async () => {
    const normalizedIntent = intent.trim();
    if (!normalizedIntent) return;
    setIsRunning(true);
    setError('');
    setPlan(null);
    setRawResponse('');
    setTraceId(undefined);

    const task = createBlueprintAssistantTask(
      normalizedIntent,
      currentPath,
      selectedId
    );
    setPromptPreview(
      stringifyOpenAICompatibleMessages(createOpenAICompatibleMessages(task))
    );
    const provider = createProdivixAiProvider({
      settings,
      fetcher:
        settings.provider === 'openai-compatible'
          ? async (input, init) => {
              const response = await window.fetch(input, init);
              return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                json: () => response.json() as Promise<unknown>,
              };
            }
          : undefined,
      mockOutput: {
        goal: normalizedIntent,
        assumptions: [
          t('assistant.mock.assumptions.contextOnly'),
          t('assistant.mock.assumptions.planOnly'),
        ],
        milestones: [
          {
            id: 'inspect-context',
            title: t('assistant.mock.milestones.inspectContext'),
          },
          {
            id: 'draft-ui-intent',
            title: t('assistant.mock.milestones.draftPlan'),
          },
          {
            id: 'prepare-dry-run',
            title: t('assistant.mock.milestones.prepareDryRun'),
          },
        ],
      },
    });
    const gateway = new LlmGateway({
      provider,
      tools: new LlmToolRegistry(),
      traceStore: new InMemoryLlmTraceStore(),
    });
    const result = await gateway.run(task);

    setTraceId(result.traceId);
    setRawResponse(result.rawResponse ?? '');
    if (result.status === 'failed') {
      setError(result.diagnostics[0]?.message ?? t('assistant.error'));
      setIsRunning(false);
      return;
    }
    if (isPlanArtifact(result.output)) {
      setPlan(result.output);
    } else if (result.output) {
      setRawResponse(
        result.rawResponse ?? JSON.stringify(result.output, null, 2)
      );
    } else {
      setError(t('assistant.emptyOutput'));
    }
    setIsRunning(false);
  };

  return (
    <aside
      className={`BlueprintAssistantPanel absolute z-[5] flex min-h-0 flex-col rounded-xl border border-(--border-subtle) bg-(--bg-canvas) shadow-(--shadow-md) ${
        isOpen
          ? 'right-[calc(var(--inspector-width)+12px)] bottom-0 w-[360px] max-w-[calc(100vw-var(--sidebar-width)-var(--tree-width)-var(--inspector-width)-40px)]'
          : 'Collapsed right-0 bottom-10 h-0 w-0 overflow-visible border-0 bg-transparent shadow-none'
      }`}
    >
      {isOpen ? (
        <>
          <header className="flex h-10 items-center justify-between border-b border-(--border-subtle) px-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
              <Bot size={16} />
              {t('assistant.title')}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={headerCollapseButtonClassName}
                aria-label={t('assistant.settings.open')}
                title={t('assistant.settings.open')}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={15} />
              </button>
              <button
                type="button"
                className={headerCollapseButtonClassName}
                aria-label={t('assistant.collapse')}
                title={t('assistant.collapse')}
                onClick={() => setIsOpen(false)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </header>
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              {contextPreview.map((item) => (
                <div
                  key={item.label}
                  className="min-w-0 border border-(--border-default) bg-(--bg-panel) px-2 py-1.5"
                >
                  <div className="text-[10px] text-(--text-muted) uppercase">
                    {item.label}
                  </div>
                  <div className="truncate text-xs text-(--text-primary)">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative">
              <textarea
                className="min-h-24 w-full resize-none border border-(--border-default) bg-(--bg-panel) px-3 py-2 pr-11 pb-11 text-sm text-(--text-primary) outline-none focus:border-(--accent-color)"
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 bottom-2 inline-flex size-8 items-center justify-center bg-(--text-primary) text-(--bg-canvas) hover:bg-(--accent-color) disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('assistant.generatePlan')}
                title={t('assistant.generatePlan')}
                onClick={() => void runAssistant()}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
            {error ? (
              <div className="border border-(--danger-color) px-2 py-1.5 text-xs text-(--danger-color)">
                {error}
              </div>
            ) : null}
            {plan ? (
              <div className="space-y-2 border border-(--border-default) bg-(--bg-panel) p-2">
                <div className="text-xs font-semibold text-(--text-primary)">
                  {plan.goal}
                </div>
                <div className="space-y-1">
                  {plan.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="border border-(--border-subtle) bg-(--bg-canvas) px-2 py-1 text-xs text-(--text-secondary)"
                    >
                      {milestone.title}
                    </div>
                  ))}
                </div>
                {traceId ? (
                  <div className="truncate text-[10px] text-(--text-muted)">
                    {t('assistant.trace', { traceId })}
                  </div>
                ) : null}
              </div>
            ) : null}
            {promptPreview || rawResponse ? (
              <div className="flex items-center justify-end gap-1">
                {promptPreview ? (
                  <DebugHoverButton
                    label={t('assistant.prompt.show')}
                    icon={<MessageSquareText size={14} />}
                    content={promptPreview}
                  />
                ) : null}
                {rawResponse ? (
                  <DebugHoverButton
                    label={t('assistant.raw.show')}
                    icon={<Eye size={14} />}
                    content={rawResponse}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          className={`BlueprintAssistantExpand absolute right-0 bottom-0 ${rightCollapsedButtonClassName}`}
          aria-label={t('assistant.expand')}
          title={t('assistant.expand')}
          onClick={() => setIsOpen(true)}
        >
          <Bot size={15} />
        </button>
      )}
      <BlueprintAssistantSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </aside>
  );
}
