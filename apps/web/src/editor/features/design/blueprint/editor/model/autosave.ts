import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/auth/authApi';
import { editorApi, type WorkspaceCommandEnvelope } from '@/editor/editorApi';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { validatePirDocument } from '@/pir/validator/validator';
import { isLocalProjectId } from '@/editor/localProjectStore';

export type AutosaveMode = 'manual' | 'on-change' | 'interval';
export type SaveTransport = 'workspace' | 'local' | null;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type SaveIndicatorTone = 'error' | 'warning' | 'success' | 'neutral';

type WorkspaceMutation = Awaited<
  ReturnType<typeof editorApi.patchWorkspaceDocument>
>;

type UseBlueprintAutosaveOptions = {
  token: string | null;
  projectId?: string;
  pirDoc: PIRDocument;
  pirDocRevision: number;
  autosaveMode: AutosaveMode;
  autosaveIntervalMs: number;
  workspaceId?: string;
  activeDocumentId?: string;
  activeDocumentContentRev?: number;
  canUpdateWorkspaceDocument: boolean;
  workspaceCapabilitiesLoaded: boolean;
  workspaceReadonly: boolean;
  applyWorkspaceMutation: (mutation: WorkspaceMutation) => void;
  markLocalWorkspaceDocumentSaved: (
    workspaceId: string,
    documentId: string
  ) => void;
};

type UseBlueprintAutosaveResult = {
  saveStatus: SaveStatus;
  saveTransport: SaveTransport;
  saveIndicatorTone: SaveIndicatorTone;
  saveIndicatorLabel: string;
  isWorkspaceSaveDisabled: boolean;
  hasPendingChanges: boolean;
  saveNow: () => void;
};

const ON_CHANGE_AUTOSAVE_DELAY_MS = 1000;

const createCommandId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createDocumentUpdateCommand = (
  workspaceId: string,
  documentId: string,
  nextGraph: PIRDocument['ui']['graph'],
  previousGraph: PIRDocument['ui']['graph']
): WorkspaceCommandEnvelope => ({
  id: createCommandId(),
  namespace: 'core.pir',
  type: 'graph.replace',
  version: '1.0',
  issuedAt: new Date().toISOString(),
  forwardOps: [{ op: 'replace', path: '/ui/graph', value: nextGraph }],
  reverseOps: [{ op: 'replace', path: '/ui/graph', value: previousGraph }],
  target: { workspaceId, documentId },
});

const resolveApiErrorMessage = (error: unknown): string | null => {
  if (!(error instanceof ApiError)) return null;
  if (Array.isArray(error.details) && error.details.length > 0) {
    const first = error.details[0] as {
      path?: string;
      message?: string;
    };
    if (first?.message) {
      return first.path ? `${first.path}: ${first.message}` : first.message;
    }
  }
  return error.message || null;
};

export const useBlueprintAutosave = ({
  token,
  projectId,
  pirDoc,
  pirDocRevision,
  autosaveMode,
  autosaveIntervalMs,
  workspaceId,
  activeDocumentId,
  activeDocumentContentRev,
  canUpdateWorkspaceDocument,
  workspaceCapabilitiesLoaded,
  workspaceReadonly,
  applyWorkspaceMutation,
  markLocalWorkspaceDocumentSaved,
}: UseBlueprintAutosaveOptions): UseBlueprintAutosaveResult => {
  const { t } = useTranslation('blueprint');
  const saveRequestSeqRef = useRef(0);
  const isSavingRef = useRef(false);
  const lastSavedGraphRef = useRef(pirDoc.ui.graph);
  const [trackedDocumentId, setTrackedDocumentId] = useState(activeDocumentId);
  const [lastSavedRevision, setLastSavedRevision] = useState(pirDocRevision);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveTransport, setSaveTransport] = useState<SaveTransport>(null);
  const [saveMessage, setSaveMessage] = useState('');

  // Re-anchor save baseline when the active document changes. Without this,
  // lastSavedGraphRef would still point at the previous document's graph and
  // the next save would emit reverseOps that fail the backend round-trip
  // check (see workspace/store.go: command.reverseOps must restore original).
  // The trackedDocumentId !== activeDocumentId guard on hasPendingChanges
  // suppresses any save attempt during the render cycle in which the switch
  // is observed, until this effect has committed the new baseline.
  useEffect(() => {
    if (trackedDocumentId === activeDocumentId) return;
    lastSavedGraphRef.current = pirDoc.ui.graph;
    setTrackedDocumentId(activeDocumentId);
    setLastSavedRevision(pirDocRevision);
  }, [activeDocumentId, pirDoc, pirDocRevision, trackedDocumentId]);

  const hasPendingChanges =
    trackedDocumentId === activeDocumentId &&
    pirDocRevision > lastSavedRevision;
  const normalizedAutosaveIntervalMs = Math.max(
    1000,
    Number.isFinite(autosaveIntervalMs) ? Math.round(autosaveIntervalMs) : 1000
  );

  const hasWorkspaceTarget =
    Boolean(workspaceId) &&
    Boolean(activeDocumentId) &&
    typeof activeDocumentContentRev === 'number' &&
    activeDocumentContentRev > 0;
  const isWorkspaceSaveDisabled =
    hasWorkspaceTarget &&
    workspaceCapabilitiesLoaded &&
    !canUpdateWorkspaceDocument;
  const saveIndicatorTone: SaveIndicatorTone =
    saveStatus === 'error'
      ? 'error'
      : saveStatus === 'saving'
        ? 'neutral'
        : workspaceReadonly || isWorkspaceSaveDisabled
          ? 'warning'
          : saveStatus === 'saved'
            ? 'success'
            : autosaveMode === 'manual' && hasPendingChanges
              ? 'warning'
              : 'neutral';

  const saveIndicatorLabel = useMemo(() => {
    if (hasWorkspaceTarget && !workspaceCapabilitiesLoaded) {
      return t('autosave.capabilities.loading', {
        defaultValue: 'Checking workspace capabilities...',
      });
    }
    if (saveStatus === 'saving') {
      return t('autosave.status.saving', { defaultValue: 'Saving...' });
    }
    if (workspaceReadonly) {
      return t('autosave.status.readonlyCache', {
        defaultValue: 'Synced cache is read-only. Save a local copy to edit.',
      });
    }
    if (saveStatus === 'error') {
      return (
        saveMessage ||
        t('autosave.status.error', {
          defaultValue: 'Save failed. Retrying on next change.',
        })
      );
    }
    if (autosaveMode === 'manual' && hasPendingChanges) {
      return t('autosave.status.manualPending', {
        defaultValue: 'Unsaved changes. Click to save.',
      });
    }
    if (saveStatus === 'saved') {
      if (saveMessage) return saveMessage;
      if (saveTransport === 'workspace') {
        return t('autosave.status.workspaceSaved', {
          defaultValue: 'Saved to workspace.',
        });
      }
      return t('autosave.status.saved', { defaultValue: 'Saved.' });
    }
    return t('autosave.status.idle', { defaultValue: 'Ready' });
  }, [
    autosaveMode,
    hasPendingChanges,
    hasWorkspaceTarget,
    saveMessage,
    saveStatus,
    saveTransport,
    t,
    workspaceCapabilitiesLoaded,
    workspaceReadonly,
  ]);
  const workspaceRetryMessage = t('autosave.messages.workspaceRetry', {
    defaultValue: 'Workspace save failed. Retrying on next change.',
  });
  const workspaceUnavailableMessage = t(
    'autosave.messages.workspaceUnavailableUsingProject',
    {
      defaultValue: 'Workspace document save unavailable. Using project save.',
    }
  );
  const pirValidationFailedMessageKey = 'autosave.messages.pirValidationFailed';

  const flushSave = useCallback(() => {
    if (!hasPendingChanges) return;
    if (workspaceReadonly) {
      setSaveTransport(null);
      setSaveStatus('idle');
      setSaveMessage('');
      return;
    }
    if (hasWorkspaceTarget && !workspaceCapabilitiesLoaded) return;
    if (isSavingRef.current) return;

    const targetRevision = pirDocRevision;
    const validation = validatePirDocument(pirDoc);
    if (validation.hasError) {
      setSaveTransport(null);
      setSaveStatus('error');
      setSaveMessage(
        t(pirValidationFailedMessageKey, {
          defaultValue: 'PIR validation failed: {{message}}',
          message: validation.issues[0]?.message ?? 'Invalid PIR document.',
        })
      );
      return;
    }

    if (projectId && isLocalProjectId(projectId)) {
      if (workspaceId && activeDocumentId) {
        markLocalWorkspaceDocumentSaved(workspaceId, activeDocumentId);
      }
      lastSavedGraphRef.current = pirDoc.ui.graph;
      setLastSavedRevision((previous) => Math.max(previous, targetRevision));
      setSaveTransport('local');
      setSaveStatus('saved');
      setSaveMessage(
        t('autosave.status.localSaved', {
          defaultValue: 'Saved to local workspace.',
        })
      );
      return;
    }

    if (!token) return;

    if (
      workspaceId &&
      activeDocumentId &&
      typeof activeDocumentContentRev === 'number' &&
      activeDocumentContentRev > 0 &&
      canUpdateWorkspaceDocument
    ) {
      const command = createDocumentUpdateCommand(
        workspaceId,
        activeDocumentId,
        pirDoc.ui.graph,
        lastSavedGraphRef.current
      );
      const requestSeq = saveRequestSeqRef.current + 1;
      saveRequestSeqRef.current = requestSeq;
      isSavingRef.current = true;
      setSaveTransport('workspace');
      setSaveStatus('saving');
      setSaveMessage('');
      editorApi
        .patchWorkspaceDocument(token, workspaceId, activeDocumentId, {
          expectedContentRev: activeDocumentContentRev,
          command,
        })
        .then((mutation) => {
          if (saveRequestSeqRef.current !== requestSeq) {
            return;
          }
          applyWorkspaceMutation(mutation);
          lastSavedGraphRef.current = pirDoc.ui.graph;
          setLastSavedRevision((previous) =>
            Math.max(previous, targetRevision)
          );
          setSaveStatus('saved');
          setSaveMessage('');
        })
        .catch((error: unknown) => {
          if (saveRequestSeqRef.current !== requestSeq) {
            return;
          }
          setSaveStatus('error');
          setSaveMessage(
            resolveApiErrorMessage(error) || workspaceRetryMessage
          );
        })
        .finally(() => {
          if (saveRequestSeqRef.current === requestSeq) {
            isSavingRef.current = false;
          }
        });
      return;
    }

    setSaveTransport(null);
    setSaveStatus('error');
    setSaveMessage(workspaceUnavailableMessage);
  }, [
    activeDocumentContentRev,
    activeDocumentId,
    applyWorkspaceMutation,
    canUpdateWorkspaceDocument,
    hasPendingChanges,
    hasWorkspaceTarget,
    markLocalWorkspaceDocumentSaved,
    pirDoc,
    pirDocRevision,
    projectId,
    t,
    token,
    workspaceCapabilitiesLoaded,
    workspaceId,
    workspaceReadonly,
    workspaceRetryMessage,
    workspaceUnavailableMessage,
  ]);

  useEffect(() => {
    if (autosaveMode !== 'on-change') return;
    if (!hasPendingChanges) return;
    let disposed = false;

    const timeoutId = window.setTimeout(() => {
      if (!disposed) flushSave();
    }, ON_CHANGE_AUTOSAVE_DELAY_MS);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [autosaveMode, flushSave, hasPendingChanges]);

  useEffect(() => {
    if (autosaveMode !== 'interval') return;
    const intervalId = window.setInterval(() => {
      flushSave();
    }, normalizedAutosaveIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [autosaveMode, flushSave, normalizedAutosaveIntervalMs]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timeoutId = window.setTimeout(() => {
      setSaveStatus('idle');
      setSaveTransport(null);
      setSaveMessage('');
    }, 1500);
    return () => window.clearTimeout(timeoutId);
  }, [saveStatus]);

  return {
    saveStatus,
    saveTransport,
    saveIndicatorTone,
    saveIndicatorLabel,
    isWorkspaceSaveDisabled,
    hasPendingChanges,
    saveNow: flushSave,
  };
};
