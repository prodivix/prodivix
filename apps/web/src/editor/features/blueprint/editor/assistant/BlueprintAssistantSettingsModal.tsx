import { useEffect, useState } from 'react';
import { Bot, Loader2, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  listDraftProviders,
  type PublicDraftProvider,
} from '@/ai/aiDraftClient';
import {
  useAiSettingsStore,
  type BlueprintAssistantPreferences,
} from '@/ai/aiSettingsStore';

export function BlueprintAssistantSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose(): void;
}) {
  const { t } = useTranslation('blueprint');
  const token = useAuthStore((state) => state.token);
  const settings = useAiSettingsStore((state) => state.settings);
  const setSettings = useAiSettingsStore((state) => state.setSettings);
  const resetSettings = useAiSettingsStore((state) => state.resetSettings);
  const [draft, setDraft] = useState<BlueprintAssistantPreferences>(settings);
  const [providers, setProviders] = useState<readonly PublicDraftProvider[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setDraft(settings);
    setProviders([]);
    setError('');
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    void listDraftProviders(token, controller.signal)
      .then((catalog) => {
        if (!controller.signal.aborted) setProviders(catalog);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : t('assistant.settings.discovery.failed')
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, settings, token, t]);
  if (!isOpen) return null;
  const selected = providers.find(
    (provider) => provider.id === draft.providerId
  );
  const valid =
    draft.provider === 'mock' ||
    Boolean(selected?.models.some((model) => model.id === draft.modelId));
  const field =
    'h-9 border border-(--border-default) bg-(--bg-panel) px-2 text-sm text-(--text-primary)';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('assistant.settings.title')}
        className="flex w-[520px] max-w-full flex-col border border-(--border-subtle) bg-(--bg-canvas) shadow-(--shadow-lg)"
      >
        <header className="flex h-12 items-center justify-between border-b border-(--border-subtle) px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
            <Bot size={16} />
            {t('assistant.settings.title')}
          </div>
          <button
            type="button"
            aria-label={t('assistant.settings.close')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="grid gap-3 p-4">
          <label className="grid gap-1 text-xs text-(--text-secondary)">
            {t('assistant.settings.provider')}
            <select
              className={field}
              value={draft.provider}
              onChange={(event) =>
                setDraft({
                  provider: event.target.value === 'server' ? 'server' : 'mock',
                })
              }
            >
              <option value="mock">
                {t('assistant.settings.providers.mock')}
              </option>
              <option value="server">
                {t(
                  'assistant.settings.providers.server',
                  'Server configured provider'
                )}
              </option>
            </select>
          </label>
          {draft.provider === 'server' ? (
            <>
              <p className="text-xs text-(--text-secondary)">
                {t(
                  'assistant.settings.serverHint',
                  'Provider connections and credentials are configured on the server.'
                )}
              </p>
              {!token ? (
                <p role="status">
                  {t(
                    'assistant.settings.signIn',
                    'Sign in to use a server provider.'
                  )}
                </p>
              ) : loading ? (
                <p role="status">
                  <Loader2 size={14} className="animate-spin" />
                  {t('assistant.settings.discovery.action')}
                </p>
              ) : !providers.length ? (
                <p role="status">
                  {t(
                    'assistant.settings.serverUnconfigured',
                    'No server provider is available. Configure a provider on the server, then reopen these settings.'
                  )}
                </p>
              ) : (
                <>
                  <label className="grid gap-1 text-xs text-(--text-secondary)">
                    {t(
                      'assistant.settings.serverProvider',
                      'Configured provider'
                    )}
                    <select
                      className={field}
                      value={draft.providerId ?? ''}
                      onChange={(event) => {
                        const provider = providers.find(
                          (item) => item.id === event.target.value
                        );
                        setDraft({
                          ...draft,
                          providerId: provider?.id ?? '',
                          modelId: provider?.models[0]?.id ?? '',
                        });
                      }}
                    >
                      <option value="">
                        {t(
                          'assistant.settings.selectProvider',
                          'Select a provider'
                        )}
                      </option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-(--text-secondary)">
                    {t('assistant.settings.model')}
                    <select
                      className={field}
                      value={draft.modelId ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, modelId: event.target.value })
                      }
                    >
                      <option value="">
                        {t('assistant.settings.selectModel', 'Select a model')}
                      </option>
                      {selected?.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName ?? model.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {error ? (
                <p role="alert" className="text-xs text-(--danger-color)">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-(--text-secondary)">
              {t('assistant.settings.mockHint')}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-(--border-subtle) p-4">
          <button
            type="button"
            className="flex items-center gap-1 text-xs"
            onClick={() => {
              resetSettings();
              setDraft({ provider: 'mock' });
            }}
          >
            <RotateCcw size={14} />
            {t('assistant.settings.reset')}
          </button>
          <button
            type="button"
            className="h-9 border border-(--border-default) bg-(--bg-panel) px-3 text-sm text-(--text-primary) disabled:opacity-50"
            disabled={!valid}
            onClick={() => {
              if (valid) {
                setSettings(draft);
                onClose();
              }
            }}
          >
            {t('assistant.settings.save')}
          </button>
        </footer>
      </section>
    </div>
  );
}
