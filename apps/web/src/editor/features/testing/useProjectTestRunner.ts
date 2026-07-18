import { useCallback, useEffect, useMemo, useState } from 'react';
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
    setPreflightStatus('idle');
    setPreflightDiagnostics(Object.freeze([]));
    setPreflightMessage(undefined);
  }, [workspace?.id]);

  const run = useCallback(async () => {
    if (!workspace) return;
    setPreflightStatus('compiling');
    setPreflightDiagnostics(Object.freeze([]));
    setPreflightMessage(undefined);
    try {
      const assetMaterializations = await materializeWorkspaceBinaryAssets({
        workspace,
        token,
      });
      const plan = createProjectTestExecutionPlan(workspace, {
        assetMaterializations,
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
      await startProjectTests(plan.snapshot, plan.request);
      setPreflightStatus('idle');
    } catch (error) {
      setPreflightStatus('blocked');
      setPreflightMessage(
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [token, workspace]);

  const stop = useCallback(async () => {
    await executionSessionCoordinator.cancel(sessionId, {
      reason: 'Workspace test execution stopped by the user.',
    });
  }, [sessionId]);

  const status: ProjectTestRunnerStatus =
    preflightStatus !== 'idle' ? preflightStatus : (session?.status ?? 'idle');

  return Object.freeze({
    sessionId,
    session,
    status,
    report: preflightStatus === 'idle' ? presentation?.report : undefined,
    reportSnapshotId:
      preflightStatus === 'idle' ? presentation?.snapshotId : undefined,
    diagnostics: preflightDiagnostics,
    message: preflightMessage ?? sessionMessage,
    run,
    stop,
  });
};
