import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  ChevronDown,
  ChevronRight,
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
  isInspectorCollapsed: boolean;
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

const parsedDebugJsonStringKey = Symbol('parsedDebugJsonString');

type ParsedDebugJsonString = {
  [parsedDebugJsonStringKey]: true;
  value: DebugJsonValue;
};

type DebugJsonValue =
  | null
  | boolean
  | number
  | string
  | ParsedDebugJsonString
  | DebugJsonValue[]
  | { [key: string]: DebugJsonValue };

const shouldParseJsonString = (value: string) => {
  const trimmedValue = value.trim();
  return (
    (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
    (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
  );
};

const isParsedDebugJsonString = (
  value: DebugJsonValue
): value is ParsedDebugJsonString =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      parsedDebugJsonStringKey in value
  );

const parseDebugJsonValue = (value: unknown, depth = 0): DebugJsonValue => {
  if (depth > 4) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  if (typeof value === 'string') {
    if (shouldParseJsonString(value)) {
      try {
        return {
          [parsedDebugJsonStringKey]: true,
          value: parseDebugJsonValue(JSON.parse(value), depth + 1),
        };
      } catch {
        return value;
      }
    }

    return value;
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value as null | boolean | number;
  }

  if (Array.isArray(value)) {
    return value.map((item) => parseDebugJsonValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const parsedObject: Record<string, DebugJsonValue> = {};
    Object.entries(value).forEach(([key, entry]) => {
      parsedObject[key] = parseDebugJsonValue(entry, depth + 1);
    });
    return parsedObject;
  }

  return String(value);
};

const parseDebugContent = (content: string): DebugJsonValue => {
  const trimmed = content.trim();
  if (!trimmed) return content;

  try {
    return parseDebugJsonValue(JSON.parse(trimmed));
  } catch {
    return content;
  }
};

const renderDebugValue = (
  value: DebugJsonValue,
  options: {
    dimmed?: boolean;
    propertyName?: string;
  } = {}
): ReactNode => {
  const dimmed = options.dimmed || options.propertyName === 'content';
  const textClassName = dimmed
    ? 'text-(--text-muted)'
    : 'text-(--text-secondary)';

  if (isParsedDebugJsonString(value)) {
    return (
      <span className="text-(--text-muted)">
        {renderDebugValue(value.value, { dimmed: true })}
      </span>
    );
  }

  if (typeof value === 'string') {
    const displayValue =
      dimmed || value.includes('\n') ? value : JSON.stringify(value);
    return (
      <span className={`break-words whitespace-pre-wrap ${textClassName}`}>
        {displayValue}
      </span>
    );
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-(--text-primary)">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="text-(--text-muted)">null</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;

    return (
      <span>
        <span>[</span>
        <span className="block pl-3">
          {value.map((item, index) => (
            <span key={index} className="block">
              {renderDebugValue(item, { dimmed })}
              {index < value.length - 1 ? ',' : ''}
            </span>
          ))}
        </span>
        <span>]</span>
      </span>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return <span>{'{}'}</span>;

  return (
    <span>
      <span>{'{'}</span>
      <span className="block pl-3">
        {entries.map(([key, entry], index) => (
          <span key={key} className="block">
            <span className="text-(--text-muted)">{JSON.stringify(key)}</span>
            <span>: </span>
            {renderDebugValue(entry, {
              dimmed,
              propertyName: key,
            })}
            {index < entries.length - 1 ? ',' : ''}
          </span>
        ))}
      </span>
      <span>{'}'}</span>
    </span>
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
  selectedId?: string,
  abortSignal?: AbortSignal
): LlmTaskRequest =>
  createLlmTask({
    id: createTaskId(),
    intent: normalizedIntent,
    context: createBlueprintAssistantContext(currentPath, selectedId),
    outputChannels: ['pir-command'],
    requiresPlan: true,
    responseMode: 'json',
    streaming: true,
    modelPreferences: {
      jsonMode: true,
    },
    providerMetadata: abortSignal ? { abortSignal } : undefined,
  });

type DebugPanelKey = 'prompt' | 'raw';

const DebugToggleButton = ({
  label,
  icon,
  content,
  isOpen,
  onToggle,
}: {
  label: string;
  icon: ReactNode;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <div className="relative">
    <button
      type="button"
      className={`inline-flex size-7 items-center justify-center bg-transparent text-(--text-muted) hover:bg-(--bg-panel) hover:text-(--text-primary) ${
        isOpen ? 'bg-(--bg-panel) text-(--text-primary)' : ''
      }`}
      aria-label={label}
      aria-expanded={isOpen}
      title={label}
      onClick={onToggle}
    >
      {icon}
    </button>
    {isOpen ? (
      <div className="absolute right-0 bottom-8 z-20 w-[320px] border border-(--border-default) bg-(--bg-canvas) p-2 shadow-(--shadow-md)">
        <div className="mb-1 text-[10px] font-medium text-(--text-muted) uppercase">
          {label}
        </div>
        <div className="max-h-56 overflow-auto [font-family:var(--font-family-mono)] text-[11px] whitespace-pre-wrap text-(--text-secondary) select-text">
          {renderDebugValue(parseDebugContent(content))}
        </div>
      </div>
    ) : null}
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
  isInspectorCollapsed,
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
  const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<
    Record<string, boolean>
  >({});
  const [openDebugPanel, setOpenDebugPanel] = useState<
    DebugPanelKey | undefined
  >(undefined);
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
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
    const requestId = createTaskId();
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    setIsRunning(true);
    setError('');
    setPlan(null);
    setExpandedMilestoneIds({});
    setOpenDebugPanel(undefined);
    setRawResponse('');
    setTraceId(undefined);

    const task = createBlueprintAssistantTask(
      normalizedIntent,
      currentPath,
      selectedId,
      abortController.signal
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
                body: response.body,
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

    try {
      for await (const event of gateway.stream(task)) {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        if (event.type === 'started') {
          setTraceId(event.traceId);
        }

        if (event.type === 'raw-delta') {
          setRawResponse((value) => value + event.delta);
        }

        if (event.type === 'validated-output') {
          if (isPlanArtifact(event.output)) {
            setPlan(event.output);
          } else {
            setRawResponse(
              event.rawResponse || JSON.stringify(event.output, null, 2)
            );
          }
        }

        if (event.type === 'diagnostic') {
          setError(event.diagnostic.message);
        }

        if (event.type === 'completed') {
          setTraceId(event.result.traceId);
          if (event.result.status === 'failed') {
            setError(
              event.result.diagnostics[0]?.message ?? t('assistant.error')
            );
          } else if (isPlanArtifact(event.result.output)) {
            setPlan(event.result.output);
          } else if (event.result.output) {
            setRawResponse(
              event.result.rawResponse ??
                JSON.stringify(event.result.output, null, 2)
            );
          } else {
            setError(t('assistant.emptyOutput'));
          }
          setIsRunning(false);
        }
      }
    } catch (error) {
      if (activeRequestIdRef.current === requestId) {
        setError(error instanceof Error ? error.message : t('assistant.error'));
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsRunning(false);
        abortControllerRef.current = undefined;
      }
    }
  };

  return (
    <aside
      className={`BlueprintAssistantPanel absolute z-[5] flex min-h-0 flex-col rounded-xl border border-(--border-subtle) bg-(--bg-canvas) shadow-(--shadow-md) ${
        isOpen
          ? `bottom-0 w-[360px] ${
              isInspectorCollapsed
                ? 'right-0 max-w-[calc(100vw-max(var(--sidebar-width),var(--tree-width))-28px)]'
                : 'right-[calc(var(--inspector-width)+12px)] max-w-[calc(100vw-max(var(--sidebar-width),var(--tree-width))-var(--inspector-width)-40px)]'
            }`
          : 'Collapsed right-0 bottom-10 h-0 w-0 overflow-visible border-0 bg-transparent shadow-none'
      }`}
    >
      {isOpen ? (
        <>
          <header className="flex h-10 items-center justify-between border-b border-(--border-subtle) px-3">
            <div className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
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
                <div className="text-xs font-medium text-(--text-primary)">
                  {plan.goal}
                </div>
                <div className="space-y-1">
                  {plan.milestones.map((milestone) => {
                    const hasDescription = Boolean(
                      milestone.description?.trim()
                    );
                    const isExpanded = expandedMilestoneIds[milestone.id];

                    return (
                      <button
                        key={milestone.id}
                        type="button"
                        className={`w-full border border-(--border-subtle) bg-(--bg-canvas) px-2 py-1 text-left text-xs text-(--text-secondary) ${
                          hasDescription
                            ? 'hover:border-(--border-default) hover:text-(--text-primary)'
                            : 'cursor-default'
                        }`}
                        onClick={() => {
                          if (!hasDescription) return;
                          setExpandedMilestoneIds((current) => ({
                            ...current,
                            [milestone.id]: !current[milestone.id],
                          }));
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {hasDescription ? (
                            isExpanded ? (
                              <ChevronDown
                                className="shrink-0 text-(--text-muted)"
                                size={13}
                              />
                            ) : (
                              <ChevronRight
                                className="shrink-0 text-(--text-muted)"
                                size={13}
                              />
                            )
                          ) : (
                            <span className="size-[13px] shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {milestone.title}
                          </span>
                        </div>
                        {isExpanded && hasDescription ? (
                          <div className="mt-1 pl-[19px] text-[11px] leading-4 whitespace-pre-wrap text-(--text-muted)">
                            {milestone.description}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
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
                  <DebugToggleButton
                    label={t('assistant.prompt.show')}
                    icon={<MessageSquareText size={14} />}
                    content={promptPreview}
                    isOpen={openDebugPanel === 'prompt'}
                    onToggle={() =>
                      setOpenDebugPanel((current) =>
                        current === 'prompt' ? undefined : 'prompt'
                      )
                    }
                  />
                ) : null}
                {rawResponse ? (
                  <DebugToggleButton
                    label={t('assistant.raw.show')}
                    icon={<Eye size={14} />}
                    content={rawResponse}
                    isOpen={openDebugPanel === 'raw'}
                    onToggle={() =>
                      setOpenDebugPanel((current) =>
                        current === 'raw' ? undefined : 'raw'
                      )
                    }
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
