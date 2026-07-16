import { useCallback, useEffect, useState } from 'react';
import type { CompileDiagnostic } from '@prodivix/prodivix-compiler';
import type { ExecutionJobStatus } from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createBlueprintProjectRunPlan } from './blueprintProjectRunPlan';
import {
  acquireBlueprintProjectRunner,
  getBlueprintProjectExecutionSessionId,
  startBlueprintProject,
  stopBlueprintProject,
  type BlueprintProjectRunProvider,
} from './blueprintProjectRunnerClient';

export type BlueprintProjectRunnerState = Readonly<{
  status: 'idle' | 'compiling' | 'blocked' | ExecutionJobStatus;
  previewUrl?: string;
  message?: string;
  diagnostics: readonly CompileDiagnostic[];
  provider: BlueprintProjectRunProvider;
}>;

const INITIAL_STATE: BlueprintProjectRunnerState = Object.freeze({
  status: 'idle',
  diagnostics: Object.freeze([]),
  provider: 'browser',
});

export const useBlueprintProjectRunner = (
  workspace: WorkspaceSnapshot | undefined,
  enabled: boolean,
  provider: BlueprintProjectRunProvider = 'browser',
  accessToken?: string | null
) => {
  const workspaceId = workspace?.id;
  const [retryRevision, setRetryRevision] = useState(0);
  const [frameRevision, setFrameRevision] = useState(0);
  const [state, setState] =
    useState<BlueprintProjectRunnerState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    return acquireBlueprintProjectRunner();
  }, [enabled, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspace) {
      setState(INITIAL_STATE);
      return;
    }
    const activeWorkspace = workspace;
    let active = true;
    let unsubscribe = () => undefined;
    setState((previous) => ({
      status: 'compiling',
      provider,
      ...(previous.provider === provider && previous.previewUrl
        ? { previewUrl: previous.previewUrl }
        : {}),
      message: 'Compiling the canonical Workspace.',
      diagnostics: Object.freeze([]),
    }));

    void Promise.resolve()
      .then(() => createBlueprintProjectRunPlan(activeWorkspace, provider))
      .then(async (plan) => {
        if (!active) return;
        if (plan.status === 'blocked') {
          await stopBlueprintProject('Project compilation was blocked.');
          setState(() => ({
            status: 'blocked',
            message:
              plan.diagnostics[0]?.message ??
              'Project compilation was blocked.',
            diagnostics: plan.diagnostics,
            provider,
          }));
          return;
        }
        const job = await startBlueprintProject(plan.snapshot, plan.request, {
          provider,
          accessToken,
        });
        if (!active) {
          await job.cancel({ reason: 'Run surface changed before startup.' });
          return;
        }
        unsubscribe = job.subscribe((event) => {
          if (!active) return;
          if (event.kind === 'state') {
            const clearPreview = ['cancelled', 'failed', 'timed-out'].includes(
              event.snapshot.status
            );
            setState((previous) => ({
              ...previous,
              status: event.snapshot.status,
              ...(clearPreview ? { previewUrl: undefined } : {}),
              ...(event.reason ? { message: event.reason } : {}),
            }));
            return;
          }
          if (event.kind === 'log') {
            setState((previous) => ({
              ...previous,
              message: event.log.message,
            }));
            return;
          }
          if (event.kind === 'artifact' && event.artifact.uri) {
            setState((previous) => ({
              ...previous,
              previewUrl: event.artifact.uri,
            }));
          }
        });
        void job.completion.then((result) => {
          if (!active) return;
          if (result.status === 'failed') {
            setState((previous) => ({
              ...previous,
              status: 'failed',
              message: result.failure.message,
            }));
          }
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        void stopBlueprintProject('Project startup failed.');
        setState(() => ({
          status: 'failed',
          previewUrl: undefined,
          message: error instanceof Error ? error.message : String(error),
          diagnostics: Object.freeze([]),
          provider,
        }));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accessToken, enabled, provider, retryRevision, workspace]);

  const retry = useCallback(() => {
    setRetryRevision((revision) => revision + 1);
  }, []);

  const stop = useCallback(async () => {
    await stopBlueprintProject('Project execution stopped by the user.');
    setState((previous) => ({
      ...previous,
      status: 'cancelled',
      previewUrl: undefined,
      message: 'Project execution stopped.',
    }));
  }, []);

  const reloadPreview = useCallback(() => {
    setFrameRevision((revision) => revision + 1);
  }, []);

  return {
    sessionId: getBlueprintProjectExecutionSessionId(
      workspace?.id ?? 'unavailable'
    ),
    state,
    frameRevision,
    retry,
    reloadPreview,
    stop,
  };
};
