import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompileDiagnostic } from '@prodivix/prodivix-compiler';
import type { ExecutionJobStatus } from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  executionSessionCoordinator,
  materializeWorkspaceBinaryAssets,
  useExecutionSession,
} from '@/editor/features/execution';
import { createProjectTestExecutionPlan } from './projectTestExecutionPlan';
import {
  getProjectTestExecutionSessionId,
  startProjectTests,
  stopProjectTests,
  type ProjectTestExecutionProvider,
} from './projectTestExecutionClient';
import { createProjectTestReportPresentation } from './projectTestReportModel';

export type ProjectTestRunnerStatus =
  'idle' | 'compiling' | 'blocked' | ExecutionJobStatus;

export const useProjectTestRunner = (
  workspace: WorkspaceSnapshot | undefined
) => {
  const token = useAuthStore((state) => state.token);
  const sessionId = getProjectTestExecutionSessionId(
    workspace?.id ?? 'unavailable'
  );
  const session = useExecutionSession(sessionId);
  const [preflightStatus, setPreflightStatus] = useState<
    'idle' | 'compiling' | 'blocked'
  >('idle');
  const [preflightDiagnostics, setPreflightDiagnostics] = useState<
    readonly CompileDiagnostic[]
  >(Object.freeze([]));
  const [preflightMessage, setPreflightMessage] = useState<string>();
  const [provider, setProvider] =
    useState<ProjectTestExecutionProvider>('browser');
  const [target, setTarget] = useState<'react-vite' | 'vue-vite'>('react-vite');
  const preflightAbortControllerRef = useRef<AbortController | undefined>(
    undefined
  );
  const presentation = useMemo(
    () => createProjectTestReportPresentation(session),
    [session]
  );
  const sessionMessage = useMemo(() => {
    const activeJobId = session?.activeJob?.jobId;
    if (!session || !activeJobId) return undefined;
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
      const record = session.events[index]!;
      if (record.jobId !== activeJobId) continue;
      const event = record.event;
      if (event.kind === 'diagnostic') return event.diagnostic.message;
      if (event.kind === 'state' && event.reason) return event.reason;
      if (event.kind === 'log' && event.log.level === 'error') {
        return event.log.message;
      }
    }
    return undefined;
  }, [session]);

  useEffect(() => {
    preflightAbortControllerRef.current?.abort();
    preflightAbortControllerRef.current = undefined;
    setPreflightStatus('idle');
    setPreflightDiagnostics(Object.freeze([]));
    setPreflightMessage(undefined);
    return () => {
      preflightAbortControllerRef.current?.abort();
      preflightAbortControllerRef.current = undefined;
    };
  }, [workspace?.id]);

  const run = useCallback(async () => {
    if (!workspace) return;
    preflightAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    preflightAbortControllerRef.current = abortController;
    setPreflightStatus('compiling');
    setPreflightDiagnostics(Object.freeze([]));
    setPreflightMessage(undefined);
    try {
      const assetMaterializations = await materializeWorkspaceBinaryAssets({
        workspace,
        token,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) return;
      const plan = createProjectTestExecutionPlan(workspace, {
        assetMaterializations,
        target,
      });
      if (plan.status === 'blocked') {
        await stopProjectTests('Workspace test compilation was blocked.');
        setPreflightStatus('blocked');
        setPreflightDiagnostics(plan.diagnostics);
        setPreflightMessage(
          plan.diagnostics[0]?.message ??
            'Workspace test compilation was blocked.'
        );
        return;
      }
      if (abortController.signal.aborted) return;
      await startProjectTests(plan.snapshot, plan.request, {
        provider,
        accessToken: token,
        signal: abortController.signal,
      });
      if (!abortController.signal.aborted) setPreflightStatus('idle');
    } catch (error) {
      if (abortController.signal.aborted) return;
      setPreflightStatus('blocked');
      setPreflightMessage(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      if (preflightAbortControllerRef.current === abortController) {
        preflightAbortControllerRef.current = undefined;
      }
    }
  }, [provider, target, token, workspace]);

  const stop = useCallback(async () => {
    preflightAbortControllerRef.current?.abort();
    preflightAbortControllerRef.current = undefined;
    setPreflightStatus('idle');
    await executionSessionCoordinator.cancel(sessionId, {
      reason: 'Workspace test execution stopped by the user.',
    });
  }, [sessionId]);

  const status: ProjectTestRunnerStatus =
    preflightStatus !== 'idle' ? preflightStatus : (session?.status ?? 'idle');

  return {
    sessionId,
    session,
    status,
    report: preflightStatus === 'idle' ? presentation?.report : undefined,
    reportSnapshotId:
      preflightStatus === 'idle' ? presentation?.snapshotId : undefined,
    reportJobId: preflightStatus === 'idle' ? presentation?.jobId : undefined,
    reportProviderId:
      preflightStatus === 'idle' ? presentation?.providerId : undefined,
    diagnostics: preflightDiagnostics,
    message: preflightMessage ?? sessionMessage,
    provider,
    setProvider,
    target,
    setTarget,
    remoteAvailable: Boolean(token?.trim()),
    run,
    stop,
  };
};
