import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiSettingsStore } from '@/ai/aiSettingsStore';
import { BlueprintAssistantSettingsModal } from './BlueprintAssistantSettingsModal';
const fixture = vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  return {
    catalog: vi.fn(),
    t: (key: string, fallback?: string) => fallback ?? key,
  };
});
const catalog = fixture.catalog;
vi.mock('@/ai/aiDraftClient', () => ({ listDraftProviders: fixture.catalog }));
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (select: (state: { token: string }) => unknown) =>
    select({ token: 'session' }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: fixture.t }) }));

describe('server AI settings', () => {
  beforeEach(() => {
    useAiSettingsStore.getState().resetSettings();
    catalog.mockReset();
  });
  it('selects a public configured model without collecting provider credentials or URLs', async () => {
    catalog.mockResolvedValue([
      {
        id: 'configured',
        displayName: 'Configured',
        models: [{ id: 'public-model' }],
        capabilities: { plan: true },
      },
    ]);
    const user = userEvent.setup();
    const close = vi.fn();
    render(<BlueprintAssistantSettingsModal isOpen onClose={close} />);
    await user.selectOptions(
      screen.getByLabelText('assistant.settings.provider'),
      'server'
    );
    await user.selectOptions(
      await screen.findByLabelText('Configured provider'),
      'configured'
    );
    expect(
      (screen.getByLabelText('assistant.settings.model') as HTMLSelectElement)
        .value
    ).toBe('public-model');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText('assistant.settings.apiKey')).toBeNull();
    expect(screen.queryByLabelText('assistant.settings.baseURL')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'assistant.settings.save' })
    );
    expect(close).toHaveBeenCalledOnce();
    expect(useAiSettingsStore.getState().settings).toMatchObject({
      provider: 'server',
      providerId: 'configured',
      modelId: 'public-model',
    });
  });
  it('keeps an unavailable server provider unconfigured with an actionable message', async () => {
    catalog.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<BlueprintAssistantSettingsModal isOpen onClose={vi.fn()} />);
    await user.selectOptions(
      screen.getByLabelText('assistant.settings.provider'),
      'server'
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'No server provider is available'
      )
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'assistant.settings.save',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
