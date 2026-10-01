import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiSettingsStore } from '@/ai/aiSettingsStore';
import { BlueprintAssistantPanel } from './BlueprintAssistantPanel';

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
    storage,
    token: 'browser-session' as string | null,
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string' ? fallback : (fallback?.defaultValue ?? key),
  };
});
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ token: fixture.token }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: fixture.t }) }));

const publicPreferences = {
  provider: 'server' as const,
  providerId: 'configured',
  modelId: 'public-model',
};
const openAssistant = async () => {
  render(
    <BlueprintAssistantPanel
      currentPath="/home"
      selectedId="hero"
      isInspectorCollapsed
    />
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'assistant.expand' })
  );
  await userEvent.clear(screen.getByRole('textbox'));
  await userEvent.type(screen.getByRole('textbox'), 'Plan a clearer hero');
  return screen.getByRole('button', {
    name: 'assistant.generatePlan',
  }) as HTMLButtonElement;
};

describe('Blueprint server draft browser journey', () => {
  beforeEach(() => {
    fixture.token = 'browser-session';
    fixture.storage.clear();
    useAiSettingsStore.getState().setSettings(publicPreferences);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the authenticated draft endpoint with public model references and displays a validated plan', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      const output = {
        goal: 'Server hero plan',
        assumptions: [],
        milestones: [{ id: 'inspect', title: 'Inspect the current hero' }],
      };
      return new Response(
        JSON.stringify({
          events: [
            {
              type: 'started',
              requestId: payload.draft.id,
              providerId: 'configured',
              traceId: 'server-draft-trace',
            },
            { type: 'validated-output', output, rawResponse: '' },
            {
              type: 'completed',
              result: {
                requestId: payload.draft.id,
                status: 'planned',
                output,
                diagnostics: [],
                rawResponse: '',
              },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const button = await openAssistant();
    await userEvent.click(button);
    expect(await screen.findByText('Server hero plan')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Inspect the current hero' })
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toMatch(/\/api\/agent\/drafts$/);
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer browser-session'
    );
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      providerId: 'configured',
      modelId: 'public-model',
      draft: {
        intent: 'Plan a clearer hero',
        allowedTools: [],
        streaming: false,
      },
    });
    expect(payload.draft.context.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'blueprint.route',
          value: '/home',
          instructionBoundary: 'data-only',
        }),
        expect.objectContaining({
          id: 'blueprint.selection',
          value: 'hero',
          instructionBoundary: 'data-only',
        }),
      ])
    );
    expect(Object.keys(payload.draft)).not.toContain('providerMetadata');
    expect(Object.keys(payload)).not.toContain('baseURL');
    expect(Object.keys(payload)).not.toContain('apiKey');
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('rejects write-bearing malformed output, recovers its button, and refuses unauthenticated transport', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          events: [
            {
              type: 'completed',
              result: {
                requestId: payload.draft.id,
                status: 'planned',
                output: {
                  goal: 'Forbidden mutation',
                  milestones: [],
                  commands: [{ kind: 'write' }],
                },
                diagnostics: [],
              },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const button = await openAssistant();
    await userEvent.click(button);
    expect(await screen.findByText(/invalid plan-only/)).toBeTruthy();
    expect(screen.queryByText('Forbidden mutation')).toBeNull();
    await waitFor(() => expect(button.disabled).toBe(false));
    fixture.token = null;
    useAiSettingsStore
      .getState()
      .setSettings({ ...publicPreferences, modelId: 'another-public-model' });
    await userEvent.click(button);
    expect(
      await screen.findByText('Sign in to use a server provider.')
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledOnce();
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});
