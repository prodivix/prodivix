import { useEffect } from 'react';
import type { DiagnosticIssueRevision } from '@prodivix/diagnostics';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { listWorkspaceOutboxEntries } from '@/editor/workspaceSync/workspaceOutboxExecutor';
import { subscribeWorkspaceOutbox } from '@/editor/workspaceSync/workspaceOutboxSignals';
import { listWorkspaceSettingsOutboxEntries } from '@/editor/workspaceSync/workspaceSettingsOutboxExecutor';
import {
  collectRevisionConflictIssueSnapshot,
  collectWorkspaceModelIssueSnapshots,
  collectWorkspaceOutboxIssueSnapshot,
} from './workspaceIssueProviders';
import { useWorkspaceIssuesStore } from './workspaceIssuesStore';

let nextRevisionSequence = 0;

const createIssueRevision = (workspace: {
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
}): DiagnosticIssueRevision => {
  nextRevisionSequence += 1;
  return {
    key: `${workspace.workspaceRev}:${workspace.routeRev}:${workspace.opSeq}:${nextRevisionSequence}`,
    sequence: nextRevisionSequence,
  };
};

/** Publishes one coherent diagnostic revision and discards late async scans. */
export function WorkspaceIssuesEffects() {
  const workspace = useEditorStore(selectWorkspace);
  const conflict = useEditorStore((state) => state.workspaceRevisionConflict);

  useEffect(() => {
    const issuesStore = useWorkspaceIssuesStore.getState();
    if (!workspace) {
      issuesStore.clearWorkspace();
      return;
    }

    const workspaceId = workspace.id;
    const revision = createIssueRevision(workspace);
    const collectedAt = Date.now();
    let cancelled = false;
    issuesStore.ensureWorkspace(workspaceId);

    for (const snapshot of collectWorkspaceModelIssueSnapshots({
      workspace,
      revision,
      collectedAt,
    })) {
      useWorkspaceIssuesStore.getState().publishSnapshot(snapshot);
    }
    useWorkspaceIssuesStore.getState().publishSnapshot(
      collectRevisionConflictIssueSnapshot({
        workspaceId,
        revision,
        collectedAt,
        session: conflict,
      })
    );

    const refreshOutboxIssues = async () => {
      const [operationEntries, settingsEntries] = await Promise.all([
        listWorkspaceOutboxEntries(workspaceId),
        listWorkspaceSettingsOutboxEntries(workspaceId),
      ]);
      if (cancelled) return;
      useWorkspaceIssuesStore.getState().publishSnapshot(
        collectWorkspaceOutboxIssueSnapshot({
          workspaceId,
          revision,
          collectedAt: Date.now(),
          operationEntries,
          settingsEntries,
        })
      );
    };

    void refreshOutboxIssues().catch((error: unknown) => {
      console.warn('[workspace-issues] outbox diagnostics failed', error);
    });
    const unsubscribe = subscribeWorkspaceOutbox((changedWorkspaceId) => {
      if (changedWorkspaceId !== workspaceId) return;
      void refreshOutboxIssues().catch((error: unknown) => {
        console.warn('[workspace-issues] outbox diagnostics failed', error);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conflict, workspace]);

  return null;
}
