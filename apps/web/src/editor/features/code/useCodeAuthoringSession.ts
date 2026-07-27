import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  beginCodeAuthoringSessionSave,
  completeCodeAuthoringSessionSave,
  createCodeAuthoringSession,
  decodeControlledSourceManifest,
  discardCodeAuthoringSessionDraft,
  getActiveCodeAuthoringDraft,
  hasCodeAuthoringCapability,
  isCodeAuthoringDraftDirty,
  isCodeAuthoringDraftStale,
  isCodeAuthoringSessionDirty,
  reconcileCodeAuthoringSessionArtifact,
  setCodeAuthoringSessionError,
  synchronizeCodeAuthoringSessionRequest,
  updateCodeAuthoringSessionDraft,
  type CodeAuthoringArtifactSnapshot,
  type CodeAuthoringRequest,
  type CodeAuthoringSession,
} from '@prodivix/authoring';
import { createControlledCodeEditPlan } from '@prodivix/prodivix-compiler';
import {
  createWorkspaceCodeSourceUpdateCommand,
  isWorkspaceCodeDocumentContent,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';

export type CodeAuthoringSaveResult =
  | Readonly<{ status: 'saved'; operationId: string }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{
      status: 'unavailable';
      reason:
        | 'artifact-unavailable'
        | 'capability-unavailable'
        | 'readonly'
        | 'session-busy'
        | 'stale-draft';
    }>
  | Readonly<{ status: 'rejected'; message: string }>;

const projectArtifactSnapshot = (
  workspace: WorkspaceSnapshot | null | undefined,
  artifactId: string | undefined
): CodeAuthoringArtifactSnapshot | null => {
  if (!workspace || !artifactId) return null;
  const document = workspace.docsById[artifactId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return null;
  }
  return Object.freeze({
    artifactId: document.id,
    revision: String(document.contentRev),
    source: document.content.source,
  });
};

/**
 * Binds the framework-neutral CodeAuthoringSession to the canonical Workspace
 * write path. The hook owns drafts and source saves; editor surfaces only render
 * the returned session projection.
 */
export const useCodeAuthoringSession = (input: {
  request: CodeAuthoringRequest;
  workspace: WorkspaceSnapshot | null;
  artifactId?: string;
  readonly: boolean;
}) => {
  const [session, setSession] = useState<CodeAuthoringSession>(() =>
    createCodeAuthoringSession(input.request)
  );
  const sessionRef = useRef(session);

  const updateSession = useCallback(
    (update: (current: CodeAuthoringSession) => CodeAuthoringSession): void => {
      setSession((current) => {
        const next = update(current);
        sessionRef.current = next;
        return next;
      });
    },
    []
  );

  const artifactSnapshot = useMemo(
    () => projectArtifactSnapshot(input.workspace, input.artifactId),
    [input.artifactId, input.workspace]
  );

  useLayoutEffect(() => {
    updateSession((current) =>
      synchronizeCodeAuthoringSessionRequest(current, input.request)
    );
  }, [input.request, updateSession]);

  useLayoutEffect(() => {
    updateSession((current) =>
      reconcileCodeAuthoringSessionArtifact(current, artifactSnapshot)
    );
  }, [artifactSnapshot, input.request.requestId, updateSession]);

  const activeDraft = getActiveCodeAuthoringDraft(session);
  const activeArtifactId = session.activeArtifactId;
  const source = activeDraft?.source ?? artifactSnapshot?.source ?? '';
  const activeDirty = activeDraft
    ? isCodeAuthoringDraftDirty(activeDraft)
    : false;
  const dirty = isCodeAuthoringSessionDirty(session);
  const stale = activeDraft ? isCodeAuthoringDraftStale(activeDraft) : false;
  const isSaving = Boolean(session.savingArtifactId);
  const error = session.error?.message ?? '';

  const setSource = useCallback(
    (nextSource: string) => {
      updateSession((current) =>
        updateCodeAuthoringSessionDraft(current, nextSource)
      );
    },
    [updateSession]
  );

  /**
   * A save failure has to name the artifact it was saving, not whatever artifact
   * happens to be active when the commit settles: only a matching id releases
   * `savingArtifactId`, so an in-flight selection change would otherwise pin the
   * session busy for the rest of its life.
   */
  const reportError = useCallback(
    (message: string, artifactId?: string) => {
      updateSession((current) =>
        setCodeAuthoringSessionError(current, message, artifactId)
      );
    },
    [updateSession]
  );

  const clearError = useCallback(() => {
    updateSession((current) => setCodeAuthoringSessionError(current, ''));
  }, [updateSession]);

  const discard = useCallback(() => {
    updateSession((current) => discardCodeAuthoringSessionDraft(current));
  }, [updateSession]);

  const save = useCallback(async (): Promise<CodeAuthoringSaveResult> => {
    const currentSession = sessionRef.current;
    const draft = getActiveCodeAuthoringDraft(currentSession);
    const artifactId = currentSession.activeArtifactId;
    if (!artifactId || !draft) {
      return { status: 'unavailable', reason: 'artifact-unavailable' };
    }
    if (!hasCodeAuthoringCapability(currentSession.request, 'save-source')) {
      return { status: 'unavailable', reason: 'capability-unavailable' };
    }
    if (input.readonly) {
      return { status: 'unavailable', reason: 'readonly' };
    }
    if (currentSession.savingArtifactId) {
      return { status: 'unavailable', reason: 'session-busy' };
    }
    if (isCodeAuthoringDraftStale(draft)) {
      const message =
        'The canonical code document changed while this draft was open. Discard or reconcile the draft before saving.';
      reportError(message, artifactId);
      return { status: 'unavailable', reason: 'stale-draft' };
    }

    const workspace = useEditorStore.getState().workspace;
    const document = workspace?.docsById[artifactId];
    if (
      !workspace ||
      workspace.id !== currentSession.request.workspaceId ||
      !document ||
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content)
    ) {
      return { status: 'unavailable', reason: 'artifact-unavailable' };
    }
    const sourceToSave = draft.source;
    if (document.content.source === sourceToSave) {
      updateSession((current) =>
        reconcileCodeAuthoringSessionArtifact(
          current,
          projectArtifactSnapshot(workspace, artifactId)
        )
      );
      return { status: 'unchanged' };
    }

    const operationId = createWorkspaceClientOperationId('code-authoring');
    const controlledManifest = decodeControlledSourceManifest(
      document.content.metadata
    );

    let operation: WorkspaceOperation;
    if (controlledManifest.status !== 'absent') {
      if (controlledManifest.status === 'invalid') {
        const message =
          controlledManifest.issues[0]?.message ||
          'The controlled source manifest is invalid.';
        reportError(message, artifactId);
        return { status: 'rejected', message };
      }
      const controlledPlan = createControlledCodeEditPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        codeDocumentId: document.id,
        source: sourceToSave,
        operationId,
        issuedAt: new Date().toISOString(),
      });
      if (controlledPlan.status === 'rejected') {
        const message =
          controlledPlan.issues[0]?.message ||
          'The controlled visual/code update was rejected.';
        reportError(message, artifactId);
        return { status: 'rejected', message };
      }
      if (controlledPlan.status === 'unchanged') {
        updateSession((current) =>
          reconcileCodeAuthoringSessionArtifact(
            current,
            projectArtifactSnapshot(workspace, artifactId)
          )
        );
        return { status: 'unchanged' };
      }
      operation = controlledPlan.operation;
    } else {
      const command = createWorkspaceCodeSourceUpdateCommand({
        workspaceId: workspace.id,
        document,
        source: sourceToSave,
        commandId: operationId,
        issuedAt: new Date().toISOString(),
      });
      if (!command) return { status: 'unchanged' };
      operation = { kind: 'command' as const, command };
    }

    updateSession((current) =>
      beginCodeAuthoringSessionSave(current, artifactId)
    );
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: input.readonly,
        operation,
      });
      if (outcome.status === 'rejected') {
        reportError(outcome.message, artifactId);
        return { status: 'rejected', message: outcome.message };
      }

      const latestWorkspace = useEditorStore.getState().workspace;
      const latest = projectArtifactSnapshot(latestWorkspace, artifactId);
      const saved =
        latest?.source === sourceToSave
          ? latest
          : Object.freeze({
              artifactId,
              revision: `pending:${outcome.operationId}`,
              source: sourceToSave,
            });
      updateSession((current) =>
        completeCodeAuthoringSessionSave(current, saved)
      );
      return { status: 'saved', operationId: outcome.operationId };
    } catch (cause) {
      console.warn('[code-authoring] code document save failed', cause);
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Could not save the code document.';
      reportError(message, artifactId);
      return { status: 'rejected', message };
    }
  }, [input.readonly, reportError, updateSession]);

  return {
    request: session.request,
    session,
    activeArtifactId,
    source,
    activeDirty,
    dirty,
    stale,
    isSaving,
    error,
    setSource,
    reportError,
    clearError,
    discard,
    save,
  } as const;
};
