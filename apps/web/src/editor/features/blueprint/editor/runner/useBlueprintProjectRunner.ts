import { useCallback, useEffect, useState } from 'react';
import type { CompileDiagnostic } from '@prodivix/prodivix-compiler';
import {
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  type ExecutionJobStatus,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createWorkspaceExecutionSnapshotId,
  materializeWorkspaceBinaryAssets,
  type ExecutionFilesystemArtifactReference,
} from '@/editor/features/execution';
import {
  createBlueprintProjectRunPlan,
  type BlueprintProjectRunTarget,
} from './blueprintProjectRunPlan';
import {
  acquireBlueprintProjectRunner,
  BlueprintProjectCancellationPendingError,
  getBlueprintProjectExecutionSessionId,
  getBlueprintProjectArtifactResolver,
  getBlueprintProjectTerminalClient,
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
  target: BlueprintProjectRunTarget;
  authoringSnapshotId?: string;
  activeSnapshotId?: string;
  filesystemChanges?: ExecutionFilesystemArtifactReference;
}>;

const INITIAL_STATE: BlueprintProjectRunnerState = Object.freeze({
  status: 'idle',
  diagnostics: Object.freeze([]),
  provider: 'browser',
  target: 'react-vite',
});

export const useBlueprintProjectRunner = (
  workspace: WorkspaceSnapshot | undefined,
  enabled: boolean,
  provider: BlueprintProjectRunProvider = 'browser',
  accessToken?: string | null,
  target: BlueprintProjectRunTarget = 'react-vite'
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
    const authoringSnapshotId = createWorkspaceExecutionSnapshotId(workspace);
    let active = true;
    let unsubscribe = () => undefined;
    setState((previous) => ({
      status: 'compiling',
      provider,
      target,
      authoringSnapshotId,
      ...(previous.provider === provider &&
      previous.target === target &&
      previous.previewUrl
        ? {
            previewUrl: previous.previewUrl,
            ...(previous.activeSnapshotId
              ? { activeSnapshotId: previous.activeSnapshotId }
              : {}),
          }
        : {}),
      message: 'Compiling the canonical Workspace.',
      diagnostics: Object.freeze([]),
    }));

    void Promise.resolve()
      .then(() =>
        materializeWorkspaceBinaryAssets({
          workspace: activeWorkspace,
          token: accessToken,
        })
      )
      .then((assetMaterializations) =>
        createBlueprintProjectRunPlan(
          activeWorkspace,
          provider,
          assetMaterializations,
          target
        )
      )
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
            target,
            authoringSnapshotId,
          }));
          return;
        }
        const job = await startBlueprintProject(plan.snapshot, plan.request, {
          provider: plan.composition.provider,
          accessToken,
        });
        if (!active) {
          await stopBlueprintProject(
            'Run surface changed before startup completed.'
          );
          return;
        }
        const artifactResolver = getBlueprintProjectArtifactResolver();
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
          if (event.kind === 'artifact') {
            if (event.artifact.uri) {
              setState((previous) => ({
                ...previous,
                previewUrl: event.artifact.uri,
              }));
            }
            if (
              artifactResolver &&
              event.artifact.mediaType ===
                EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
              event.artifact.metadata?.snapshotDigest &&
              event.artifact.metadata.workspaceSnapshotId
            ) {
              const snapshotDigest = event.artifact.metadata.snapshotDigest;
              const workspaceSnapshotId =
                event.artifact.metadata.workspaceSnapshotId;
              const artifactId = event.artifact.artifactId;
              setState((previous) => ({
                ...previous,
                filesystemChanges: Object.freeze({
                  executionId: job.id,
                  jobId: event.jobId,
                  providerId: job.getSnapshot().providerId,
                  artifactId,
                  snapshotDigest,
                  workspaceSnapshotId,
                  async resolve() {
                    const resolved =
                      await artifactResolver.resolveFilesystemDiff({
                        executionId: job.id,
                        artifactId,
                        snapshotDigest,
                        workspaceSnapshotId,
                      });
                    return resolved.diff;
                  },
                }),
              }));
            }
          }
        });
        setState((previous) => ({
          ...previous,
          status: job.getSnapshot().status,
          activeSnapshotId: plan.request.workspace.snapshotId,
          authoringSnapshotId,
        }));
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
        if (error instanceof BlueprintProjectCancellationPendingError) {
          setState((previous) => ({
            ...previous,
            status: 'cancelling',
            message: error.message,
          }));
          return;
        }
        void stopBlueprintProject('Project startup failed.');
        setState(() => ({
          status: 'failed',
          previewUrl: undefined,
          message: error instanceof Error ? error.message : String(error),
          diagnostics: Object.freeze([]),
          provider,
          target,
          authoringSnapshotId,
        }));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accessToken, enabled, provider, retryRevision, target, workspace]);

  const retry = useCallback(() => {
    if (state.status === 'cancelling') return;
    setRetryRevision((revision) => revision + 1);
  }, [state.status]);

  const stop = useCallback(async () => {
    const cancellation = await stopBlueprintProject(
      'Project execution stopped by the user.'
    );
    if (
      cancellation?.status === 'rejected' ||
      cancellation?.status === 'unsupported'
    ) {
      setState((previous) => ({
        ...previous,
        message:
          cancellation.reason ?? 'Project execution could not be stopped.',
      }));
      return;
    }
    if (cancellation?.status === 'already-terminal') return;
    setState((previous) => ({
      ...previous,
      status: 'cancelling',
      message: 'Waiting for the execution provider to confirm cancellation.',
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
    terminalClient: getBlueprintProjectTerminalClient(),
    frameRevision,
    retry,
    reloadPreview,
    stop,
  };
};
