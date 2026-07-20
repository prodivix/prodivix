import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { SettingsEffects } from './SettingsEffects';

const harness = vi.hoisted(() => ({
  adoptResult: vi.fn(),
  createOperationId: vi.fn(() => 'settings-operation'),
  editorState: {
    workspace: null as unknown,
    setWorkspaceHistoryLimit: vi.fn(),
  },
  ensureProjectGlobal: vi.fn(),
  executeCommit: vi.fn(),
  settingsState: {
    global: {
      language: 'zh-CN',
      theme: 'home',
      density: 'comfortable',
      fontScale: 100,
      undoSteps: 80,
    },
    projectGlobalById: {},
    ensureProjectGlobal: vi.fn(),
  },
}));

vi.mock('react-router', () => ({
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (
    selector: (state: { token: string; isAuthenticated(): boolean }) => unknown
  ) => selector({ token: 'token', isAuthenticated: () => true }),
}));

vi.mock('@/editor/store/useEditorStore', () => ({
  selectWorkspace: (state: { workspace: unknown }) => state.workspace,
  useEditorStore: (selector: (state: typeof harness.editorState) => unknown) =>
    selector(harness.editorState),
}));

vi.mock('@/editor/store/useSettingsStore', () => ({
  useSettingsStore: (
    selector: (state: typeof harness.settingsState) => unknown
  ) => selector(harness.settingsState),
}));

vi.mock('@/editor/localProjectStore', () => ({
  isLocalProjectId: () => false,
}));

vi.mock('@/editor/workspaceSync/workspaceSettingsOutboxExecutor', () => ({
  executeWorkspaceSettingsOutboxCommit: harness.executeCommit,
}));

vi.mock('@/editor/workspaceSync/workspaceSettingsOutboxAdoption', () => ({
  adoptWorkspaceSettingsOutboxResult: harness.adoptResult,
}));

vi.mock('@/editor/workspaceSync/workspaceOperationIdentity', () => ({
  createWorkspaceClientOperationId: harness.createOperationId,
}));

vi.mock('@/theme/themeRuntime', () => ({
  applyThemePreference: vi.fn(),
  normalizeThemePreference: (value: unknown) => value,
  watchSystemThemePreference: vi.fn(),
}));

describe('SettingsEffects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    harness.editorState.workspace = createEditorWorkspace();
    harness.settingsState.global = {
      language: 'zh-CN',
      theme: 'home',
      density: 'comfortable',
      fontScale: 100,
      undoSteps: 80,
    };
    harness.settingsState.projectGlobalById = {};
    harness.settingsState.ensureProjectGlobal = harness.ensureProjectGlobal;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not resubmit an acknowledged value whose object keys were reordered', async () => {
    harness.executeCommit.mockResolvedValue({
      kind: 'acknowledged',
      settings: {
        global: {
          density: 'comfortable',
          fontScale: 100,
          language: 'zh-CN',
          theme: 'home',
          undoSteps: 81,
        },
        projectGlobalById: {},
      },
    });
    const rendered = render(<SettingsEffects />);

    harness.settingsState.global = {
      language: 'zh-CN',
      theme: 'home',
      density: 'comfortable',
      fontScale: 100,
      undoSteps: 81,
    };
    rendered.rerender(<SettingsEffects />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(harness.executeCommit).toHaveBeenCalledTimes(1);

    const acknowledgedWorkspace = harness.editorState.workspace as ReturnType<
      typeof createEditorWorkspace
    >;
    harness.editorState.workspace = {
      ...acknowledgedWorkspace,
      workspaceRev: acknowledgedWorkspace.workspaceRev + 1,
      opSeq: acknowledgedWorkspace.opSeq + 1,
    };
    rendered.rerender(<SettingsEffects />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(harness.executeCommit).toHaveBeenCalledTimes(1);
  });
});
