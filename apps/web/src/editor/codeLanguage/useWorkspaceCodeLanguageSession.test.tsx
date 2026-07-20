import { act, renderHook } from '@testing-library/react';
import type { CodeArtifact, CodeLanguageSession } from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceCodeLanguageSession } from './useWorkspaceCodeLanguageSession';

const environmentFactory = vi.hoisted(() => vi.fn());

vi.mock('./workspaceCodeLanguageEnvironment', () => ({
  createWorkspaceCodeLanguageEnvironment: environmentFactory,
}));

const artifact = (revision: string): CodeArtifact => ({
  id: 'code-main',
  path: '/src/main.ts',
  language: 'ts',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-main' },
  source: 'export const value = 1;',
  revision,
});

const session = () => ({ dispose: vi.fn() }) as unknown as CodeLanguageSession;

const workspace = (workspaceRev: number) =>
  ({
    id: 'workspace-1',
    workspaceRev,
  }) as unknown as WorkspaceSnapshot;

describe('useWorkspaceCodeLanguageSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    environmentFactory.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the ready view visible until a saved revision session is ready', async () => {
    const firstSession = session();
    const secondSession = session();
    let resolveSecond:
      | ((value: { status: 'ready'; session: CodeLanguageSession }) => void)
      | undefined;
    const firstArtifact = artifact('1');
    const secondArtifact = artifact('2');
    environmentFactory
      .mockReturnValueOnce({
        artifacts: [firstArtifact],
        openSession: vi.fn().mockResolvedValue({
          status: 'ready',
          session: firstSession,
        }),
      })
      .mockReturnValueOnce({
        artifacts: [secondArtifact],
        openSession: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveSecond = resolve;
            })
        ),
      });

    const rendered = renderHook(
      ({ snapshot }) =>
        useWorkspaceCodeLanguageSession({
          workspace: snapshot,
          artifactId: 'code-main',
          source: 'export const value = 1;',
        }),
      { initialProps: { snapshot: workspace(1) } }
    );
    expect(rendered.result.current.status).toBe('loading');
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(rendered.result.current).toMatchObject({
      status: 'ready',
      session: firstSession,
    });

    rendered.rerender({ snapshot: workspace(2) });
    expect(rendered.result.current).toMatchObject({
      status: 'ready',
      session: firstSession,
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(firstSession.dispose).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond?.({ status: 'ready', session: secondSession });
      await Promise.resolve();
    });
    expect(rendered.result.current).toMatchObject({
      status: 'ready',
      session: secondSession,
    });
    expect(firstSession.dispose).toHaveBeenCalledTimes(1);

    rendered.unmount();
    expect(secondSession.dispose).toHaveBeenCalledTimes(1);
  });
});
