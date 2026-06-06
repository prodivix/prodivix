import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RotateCcw, Search, X } from 'lucide-react';
import type { ProdivixAiSettings } from '@prodivix/ai';
import {
  createDefaultProdivixAiSettings,
  discoverOpenAICompatibleModels,
  type ProdivixAiDiscoveredModel,
} from '@prodivix/ai';
import { useTranslation } from 'react-i18next';
import { useAiSettingsStore } from '@/ai/aiSettingsStore';

type BlueprintAssistantSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type AiSettingsDraft = {
  provider: ProdivixAiSettings['provider'];
  baseURL: string;
  apiKey: string;
  model: string;
  jsonMode: boolean;
  temperature: string;
  maxOutputTokens: string;
};

const toDraft = (settings: ProdivixAiSettings): AiSettingsDraft => {
  if (settings.provider === 'openai-compatible') {
    return {
      provider: settings.provider,
      baseURL: settings.baseURL,
      apiKey: settings.apiKey ?? '',
      model: settings.model,
      jsonMode: settings.modelPreferences?.jsonMode ?? true,
      temperature: String(settings.budget?.temperature ?? 0.2),
      maxOutputTokens: settings.budget?.maxOutputTokens
        ? String(settings.budget.maxOutputTokens)
        : '',
    };
  }

  return {
    provider: 'mock',
    baseURL: '',
    apiKey: '',
    model: '',
    jsonMode: true,
    temperature: '0.2',
    maxOutputTokens: '',
  };
};

const parseNumber = (value: string): number | undefined => {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseInteger = (value: string): number | undefined => {
  const parsed = parseNumber(value);
  if (typeof parsed !== 'number') return undefined;
  return Math.max(1, Math.floor(parsed));
};

const toSettings = (draft: AiSettingsDraft): ProdivixAiSettings => {
  if (draft.provider === 'mock') {
    return createDefaultProdivixAiSettings();
  }

  return {
    enabled: true,
    provider: 'openai-compatible',
    baseURL: draft.baseURL.trim(),
    apiKey: draft.apiKey.trim() || undefined,
    model: draft.model.trim(),
    modelPreferences: {
      jsonMode: draft.jsonMode,
    },
    budget: {
      temperature: parseNumber(draft.temperature),
      maxOutputTokens: parseInteger(draft.maxOutputTokens),
    },
  };
};

const createBrowserFetcher = (fetcher: typeof fetch) => {
  return async (input: string, init?: Parameters<typeof fetch>[1]) => {
    const response = await fetcher(input, init);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: () => response.json() as Promise<unknown>,
    };
  };
};

export function BlueprintAssistantSettingsModal({
  isOpen,
  onClose,
}: BlueprintAssistantSettingsModalProps) {
  const { t } = useTranslation('blueprint');
  const settings = useAiSettingsStore((state) => state.settings);
  const setSettings = useAiSettingsStore((state) => state.setSettings);
  const resetSettings = useAiSettingsStore((state) => state.resetSettings);
  const [draft, setDraft] = useState<AiSettingsDraft>(() => toDraft(settings));
  const [models, setModels] = useState<readonly ProdivixAiDiscoveredModel[]>(
    []
  );
  const [discoveryError, setDiscoveryError] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(toDraft(settings));
    setDiscoveryError('');
    setModels([]);
  }, [isOpen, settings]);

  const validationMessage = useMemo(() => {
    if (draft.provider === 'mock') return '';
    if (!draft.baseURL.trim())
      return t('assistant.settings.validation.baseURL');
    if (!draft.model.trim()) return t('assistant.settings.validation.model');
    const temperature = parseNumber(draft.temperature);
    if (
      draft.temperature.trim() &&
      (typeof temperature !== 'number' || temperature < 0 || temperature > 2)
    ) {
      return t('assistant.settings.validation.temperature');
    }
    return '';
  }, [draft.baseURL, draft.model, draft.provider, draft.temperature, t]);

  if (!isOpen) return null;

  const updateDraft = (partial: Partial<AiSettingsDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const discoverModels = async () => {
    setDiscoveryError('');
    setModels([]);
    if (!draft.baseURL.trim()) {
      setDiscoveryError(t('assistant.settings.validation.baseURL'));
      return;
    }
    setIsDiscovering(true);
    try {
      const nextModels = await discoverOpenAICompatibleModels({
        baseURL: draft.baseURL.trim(),
        apiKey: draft.apiKey.trim() || undefined,
        fetcher: createBrowserFetcher(window.fetch.bind(window)),
      });
      setModels(nextModels);
      if (!draft.model.trim() && nextModels[0]) {
        updateDraft({ model: nextModels[0].id });
      }
      if (!nextModels.length) {
        setDiscoveryError(t('assistant.settings.discovery.empty'));
      }
    } catch (error) {
      setDiscoveryError(
        error instanceof Error
          ? error.message
          : t('assistant.settings.discovery.failed')
      );
    } finally {
      setIsDiscovering(false);
    }
  };

  const saveSettings = () => {
    if (validationMessage) return;
    setSettings(toSettings(draft));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <section className="flex w-[520px] max-w-full flex-col border border-(--border-subtle) bg-(--bg-canvas) shadow-(--shadow-lg)">
        <header className="flex h-12 items-center justify-between border-b border-(--border-subtle) px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
            <Bot size={16} />
            {t('assistant.settings.title')}
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
            aria-label={t('assistant.settings.close')}
            title={t('assistant.settings.close')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="grid gap-3 p-4">
          <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
            {t('assistant.settings.provider')}
            <select
              className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
              value={draft.provider}
              onChange={(event) =>
                updateDraft({
                  provider: event.target.value as AiSettingsDraft['provider'],
                })
              }
            >
              <option value="mock">
                {t('assistant.settings.providers.mock')}
              </option>
              <option value="openai-compatible">
                {t('assistant.settings.providers.openaiCompatible')}
              </option>
            </select>
          </label>
          {draft.provider === 'openai-compatible' ? (
            <>
              <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                {t('assistant.settings.baseURL')}
                <input
                  className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
                  value={draft.baseURL}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) =>
                    updateDraft({ baseURL: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                {t('assistant.settings.apiKey')}
                <input
                  className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
                  value={draft.apiKey}
                  type="password"
                  autoComplete="off"
                  onChange={(event) =>
                    updateDraft({ apiKey: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-2">
                <div className="flex items-end gap-2">
                  <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-(--text-secondary)">
                    {t('assistant.settings.model')}
                    <input
                      className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
                      value={draft.model}
                      list="mfe-ai-discovered-models"
                      onChange={(event) =>
                        updateDraft({ model: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center gap-2 border border-(--border-default) bg-(--bg-panel) px-3 text-sm font-semibold text-(--text-primary) hover:border-(--accent-color)"
                    onClick={() => void discoverModels()}
                    disabled={isDiscovering}
                  >
                    {isDiscovering ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : (
                      <Search size={15} />
                    )}
                    {t('assistant.settings.discovery.action')}
                  </button>
                </div>
                <datalist id="mfe-ai-discovered-models">
                  {models.map((model) => (
                    <option key={model.id} value={model.id} />
                  ))}
                </datalist>
                {discoveryError ? (
                  <div className="text-xs text-(--danger-color)">
                    {discoveryError}
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-(--text-secondary)">
                <input
                  type="checkbox"
                  checked={draft.jsonMode}
                  onChange={(event) =>
                    updateDraft({ jsonMode: event.target.checked })
                  }
                />
                {t('assistant.settings.jsonMode')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                  {t('assistant.settings.temperature')}
                  <input
                    className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
                    value={draft.temperature}
                    inputMode="decimal"
                    onChange={(event) =>
                      updateDraft({ temperature: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                  {t('assistant.settings.maxOutputTokens')}
                  <input
                    className="h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)"
                    value={draft.maxOutputTokens}
                    inputMode="numeric"
                    onChange={(event) =>
                      updateDraft({ maxOutputTokens: event.target.value })
                    }
                  />
                </label>
              </div>
              {validationMessage ? (
                <div className="text-xs text-(--danger-color)">
                  {validationMessage}
                </div>
              ) : null}
            </>
          ) : (
            <div className="border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-xs text-(--text-secondary)">
              {t('assistant.settings.mockHint')}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-(--border-subtle) px-4 py-3">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 border-0 bg-transparent px-2 text-sm text-(--text-muted) hover:text-(--text-primary)"
            onClick={() => {
              resetSettings();
              setDraft(toDraft(createDefaultProdivixAiSettings()));
            }}
          >
            <RotateCcw size={15} />
            {t('assistant.settings.reset')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 border border-(--border-default) bg-transparent px-3 text-sm text-(--text-secondary) hover:text-(--text-primary)"
              onClick={onClose}
            >
              {t('assistant.settings.cancel')}
            </button>
            <button
              type="button"
              className="h-9 border border-(--border-default) bg-(--bg-panel) px-3 text-sm font-semibold text-(--text-primary) hover:border-(--accent-color) disabled:cursor-not-allowed disabled:opacity-50"
              onClick={saveSettings}
              disabled={Boolean(validationMessage)}
            >
              {t('assistant.settings.save')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
