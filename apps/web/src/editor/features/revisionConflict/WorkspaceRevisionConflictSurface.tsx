import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Cloud,
  FileCode2,
  GitCompareArrows,
  Laptop,
  Network,
} from 'lucide-react';
import { PdxButton, PdxModal } from '@prodivix/ui';
import {
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  resolveWorkspaceOperationScope,
  undoWorkspaceHistory,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  autoRebaseWorkspaceSnapshots,
  createWorkspaceConflictSession,
  resolveWorkspaceConflictSession,
  resolveWorkspaceConflictSessionBatch,
  type WorkspaceConflictResolutionChoice,
  type WorkspaceConflictSession,
  type WorkspaceMergeConflict,
} from '@prodivix/workspace-sync';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { executeWorkspaceConflictResolution } from '@/editor/workspaceSync/workspaceConflictResolutionExecutor';
import { prepareWorkspaceConflictResolution } from '@/editor/workspaceSync/workspaceConflictResolutionPreparation';
import { CodeDocumentDiffView } from './CodeDocumentDiffView';
import { NodeGraphDiffView } from './NodeGraphDiffView';
import { adaptWorkspaceConflictSession } from './workspaceConflictPresentationAdapter';
import type {
  CodeDocumentRevisionDiffPresentation,
  NodeGraphRevisionDiffPresentation,
} from './revisionConflictAdapterTypes';

type RevisionArtifact =
  | {
      key: string;
      kind: 'code';
      presentation: CodeDocumentRevisionDiffPresentation;
    }
  | {
      key: string;
      kind: 'graph';
      presentation: NodeGraphRevisionDiffPresentation;
    };

const createRuntimeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const createArtifacts = (
  session: WorkspaceConflictSession
): RevisionArtifact[] => {
  const presentation = adaptWorkspaceConflictSession(session);
  return [
    ...presentation.codeDocuments.map((document): RevisionArtifact => ({
      key: `code:${document.documentId}`,
      kind: 'code',
      presentation: document,
    })),
    ...presentation.nodeGraphs.map((graph): RevisionArtifact => ({
      key: `graph:${graph.documentId}`,
      kind: 'graph',
      presentation: graph,
    })),
  ];
};

const formatConflictTarget = (
  conflict: WorkspaceMergeConflict,
  session: WorkspaceConflictSession
): string => {
  if (conflict.target.kind === 'workspace-tree') {
    return `workspace.json${conflict.target.path || '/'}`;
  }
  if (conflict.target.kind === 'route-manifest') {
    return `route-manifest.json${conflict.target.path || '/'}`;
  }
  const document =
    session.localSnapshot.docsById[conflict.target.documentId] ??
    session.remoteSnapshot.docsById[conflict.target.documentId] ??
    session.baseSnapshot.docsById[conflict.target.documentId];
  return `${document?.path ?? conflict.target.documentId}${
    conflict.target.path || '/'
  }`;
};

const formatConflictValue = (
  state: WorkspaceMergeConflict['local']
): string => {
  if (!state.present) return '∅';
  if (typeof state.value === 'string') return state.value;
  try {
    return JSON.stringify(state.value);
  } catch {
    return String(state.value);
  }
};

const resolveSessionFailureMessage = (
  issues: readonly { message: string }[],
  fallback: string
): string => issues[0]?.message || fallback;

const recoverOperationServerBase = (
  confirmedSnapshot: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceSnapshot | null => {
  const history = recordWorkspaceOperation(
    createWorkspaceHistoryState({ maxEntries: 1, mergeWindowMs: 0 }),
    operation
  );
  const reverted = undoWorkspaceHistory(
    confirmedSnapshot,
    history,
    resolveWorkspaceOperationScope(operation)
  );
  return reverted.ok ? reverted.snapshot : null;
};

function RevisionConflictChoiceButton({
  active,
  choice,
  label,
  onChoose,
}: {
  active: boolean;
  choice: WorkspaceConflictResolutionChoice;
  label: string;
  onChoose: () => void;
}) {
  const isLocal = choice === 'local';
  const Icon = isLocal ? Laptop : Cloud;
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 rounded-md bg-(--bg-canvas) px-2 text-[10px] font-semibold transition-colors ${
        isLocal
          ? 'border border-(--warning-color) text-(--warning-color) hover:bg-amber-500/15'
          : 'border-3 border-double border-violet-500 text-violet-500 hover:bg-violet-500/15'
      } ${active ? 'ring-1 ring-current ring-offset-1 ring-offset-(--bg-panel)' : ''}`}
      onClick={onChoose}
      type="button"
    >
      {active ? (
        <Check aria-hidden="true" size={11} />
      ) : (
        <Icon aria-hidden="true" size={11} />
      )}
      {label}
    </button>
  );
}

/**
 * Global recovery surface for optimistic workspace writes. It owns review UI
 * state only; canonical conflict snapshots and choices remain in the Store.
 */
export function WorkspaceRevisionConflictSurface() {
  const { t } = useTranslation('editor');
  const token = useAuthStore((state) => state.token);
  const session = useEditorStore((state) => state.workspaceRevisionConflict);
  const resolutionStatus = useEditorStore(
    (state) => state.workspaceConflictResolutionStatus
  );
  const resolutionError = useEditorStore(
    (state) => state.workspaceConflictResolutionError
  );
  const openConflict = useEditorStore(
    (state) => state.openWorkspaceRevisionConflict
  );
  const beginResolution = useEditorStore(
    (state) => state.beginWorkspaceConflictResolution
  );
  const failResolution = useEditorStore(
    (state) => state.failWorkspaceConflictResolution
  );
  const clearConflict = useEditorStore(
    (state) => state.clearWorkspaceRevisionConflict
  );
  const setWorkspaceSnapshot = useEditorStore(
    (state) => state.setWorkspaceSnapshot
  );
  const adoptRebasedOperation = useEditorStore(
    (state) => state.adoptRebasedWorkspaceOperation
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeArtifactKey, setActiveArtifactKey] = useState<string>();
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string>();
  const sessionId = session?.id;
  const artifacts = useMemo(
    () => (session ? createArtifacts(session) : []),
    [session]
  );
  const activeArtifact =
    artifacts.find((artifact) => artifact.key === activeArtifactKey) ??
    artifacts[0];

  useEffect(() => {
    if (!sessionId) {
      setReviewOpen(false);
      return;
    }
    setReviewOpen(true);
    setActiveArtifactKey(undefined);
    setSelectedGraphNodeId(undefined);
  }, [sessionId]);

  if (!session) return null;

  const chooseConflict = (
    conflictId: string,
    choice: WorkspaceConflictResolutionChoice
  ) => {
    const current = useEditorStore.getState().workspaceRevisionConflict;
    if (!current || current.id !== session.id) return;
    const resolved = resolveWorkspaceConflictSession(
      current,
      conflictId,
      choice,
      new Date().toISOString()
    );
    if (resolved.ok === true) {
      openConflict(resolved.session, current.id);
      return;
    }
    failResolution(
      session.id,
      resolveSessionFailureMessage(
        resolved.issues,
        t(
          'revisionConflict.status.invalidResolution',
          'Could not apply that conflict choice.'
        )
      )
    );
  };

  const chooseConflicts = (
    conflictIds: readonly string[],
    choice: WorkspaceConflictResolutionChoice
  ) => {
    const current = useEditorStore.getState().workspaceRevisionConflict;
    if (!current || current.id !== session.id || !conflictIds.length) return;
    const choices = Object.fromEntries(
      conflictIds.map((conflictId) => [conflictId, choice])
    );
    const resolved = resolveWorkspaceConflictSessionBatch(
      current,
      choices,
      new Date().toISOString()
    );
    if (resolved.ok === true) {
      openConflict(resolved.session, current.id);
      return;
    }
    failResolution(
      session.id,
      resolveSessionFailureMessage(
        resolved.issues,
        t(
          'revisionConflict.status.invalidResolution',
          'Could not apply those conflict choices.'
        )
      )
    );
  };

  const adoptAlreadyApplied = (input: {
    remoteSnapshot: WorkspaceConflictSession['remoteSnapshot'];
    requestSnapshot: WorkspaceConflictSession['localSnapshot'];
  }) => {
    const state = useEditorStore.getState();
    if (
      !state.workspace ||
      state.workspace.id !== input.requestSnapshot.id ||
      state.workspaceRevisionConflict?.id !== session.id
    ) {
      failResolution(
        session.id,
        t(
          'revisionConflict.status.workspaceChanged',
          'The active workspace changed before the resolution completed.'
        )
      );
      return;
    }
    const rebased = autoRebaseWorkspaceSnapshots(
      input.requestSnapshot,
      state.workspace,
      input.remoteSnapshot
    );
    if (rebased.ok === true) {
      setWorkspaceSnapshot(rebased.snapshot);
      clearConflict(session.id);
      return;
    }
    if (rebased.status === 'conflicted') {
      const createdAt = new Date().toISOString();
      const refreshed = createWorkspaceConflictSession({
        id: createRuntimeId('revision-conflict'),
        createdAt,
        baseSnapshot: input.requestSnapshot,
        localSnapshot: state.workspace,
        remoteSnapshot: input.remoteSnapshot,
      });
      if (refreshed.ok === true) {
        openConflict(refreshed.session, session.id);
        return;
      }
      failResolution(
        session.id,
        resolveSessionFailureMessage(
          refreshed.issues,
          t(
            'revisionConflict.status.retryFailed',
            'The workspace changed again. Review the refreshed conflict.'
          )
        )
      );
      return;
    }
    failResolution(
      session.id,
      resolveSessionFailureMessage(
        rebased.issues,
        t(
          'revisionConflict.status.invalidResolution',
          'The resolved workspace is invalid.'
        )
      )
    );
  };

  const applyResolution = async () => {
    const state = useEditorStore.getState();
    const currentSession = state.workspaceRevisionConflict;
    const requestSnapshot = state.workspace;
    if (
      !currentSession ||
      currentSession.id !== session.id ||
      !requestSnapshot ||
      !token ||
      !beginResolution(session.id)
    ) {
      if (!token) {
        failResolution(
          session.id,
          t(
            'revisionConflict.status.authenticationRequired',
            'Authentication is required to apply this resolution.'
          )
        );
      }
      return;
    }

    const preparedAt = new Date().toISOString();
    const prepared = prepareWorkspaceConflictResolution({
      currentSnapshot: requestSnapshot,
      preparedAt,
      preparedSessionId: createRuntimeId('revision-conflict'),
      session: currentSession,
    });
    if (prepared.kind === 'conflict') {
      openConflict(prepared.session, currentSession.id);
      return;
    }
    if (prepared.kind === 'invalid') {
      failResolution(
        session.id,
        resolveSessionFailureMessage(
          prepared.issues,
          t(
            'revisionConflict.status.invalidResolution',
            'The resolved workspace is invalid.'
          )
        )
      );
      return;
    }

    const expectedDocumentEditSeqById = {
      ...state.documentEditSeqById,
    };
    const preparedSession: WorkspaceConflictSession = {
      ...currentSession,
      resolvedSnapshot: prepared.resolvedSnapshot,
    };

    try {
      const result = await executeWorkspaceConflictResolution({
        session: preparedSession,
        token,
      });
      if (result.kind === 'conflict') {
        openConflict(result.session, currentSession.id);
        return;
      }
      if (result.kind === 'unsupported') {
        failResolution(session.id, result.message);
        return;
      }
      if (result.kind === 'queued') {
        const adoption = adoptRebasedOperation({
          requestSnapshot,
          serverBaseSnapshot: result.serverBaseSnapshot,
          rebasedSnapshot: result.optimisticSnapshot,
          operation: result.operation,
          expectedDocumentEditSeqById,
          expectedConflictSessionId: currentSession.id,
        });
        if (adoption.status === 'rejected') {
          failResolution(session.id, adoption.message);
        } else if (adoption.status === 'conflict') {
          setReviewOpen(true);
        } else {
          clearConflict(session.id);
        }
        return;
      }
      if (result.kind === 'already-applied') {
        const recoveredServerBase = result.operation
          ? recoverOperationServerBase(result.snapshot, result.operation)
          : null;
        if (result.operation && recoveredServerBase) {
          const adoption = adoptRebasedOperation({
            requestSnapshot,
            serverBaseSnapshot: recoveredServerBase,
            rebasedSnapshot: result.snapshot,
            operation: result.operation,
            expectedDocumentEditSeqById,
            expectedConflictSessionId: currentSession.id,
          });
          if (adoption.status === 'rejected') {
            failResolution(session.id, adoption.message);
          } else if (adoption.status === 'conflict') {
            setReviewOpen(true);
          } else {
            clearConflict(session.id);
          }
          return;
        }
        adoptAlreadyApplied({
          requestSnapshot,
          remoteSnapshot: result.snapshot,
        });
        return;
      }
      const adoption = adoptRebasedOperation({
        requestSnapshot,
        serverBaseSnapshot: result.serverBaseSnapshot,
        rebasedSnapshot: result.optimisticSnapshot,
        operation: result.operation,
        mutation: result.mutation,
        expectedDocumentEditSeqById,
        expectedConflictSessionId: currentSession.id,
      });
      if (adoption.status === 'rejected') {
        failResolution(session.id, adoption.message);
      } else if (adoption.status === 'conflict') {
        setReviewOpen(true);
      } else {
        clearConflict(session.id);
      }
    } catch (error) {
      failResolution(
        session.id,
        error instanceof Error
          ? error.message
          : t(
              'revisionConflict.status.retryFailed',
              'The workspace changed again. Review the refreshed conflict.'
            )
      );
    }
  };

  const unresolvedCount = session.unresolvedConflictIds.length;
  const resolving = resolutionStatus === 'resolving';
  const localLabel = t('revisionConflict.actions.useLocal', 'Use local');
  const remoteLabel = t('revisionConflict.actions.useRemote', 'Use remote');

  return (
    <>
      {!reviewOpen ? (
        <button
          className="fixed right-5 bottom-5 z-[900] inline-flex items-center gap-2 rounded-full border border-(--warning-color) bg-(--bg-canvas) px-4 py-2 text-xs font-semibold text-(--text-primary) shadow-lg hover:bg-(--bg-raised)"
          onClick={() => setReviewOpen(true)}
          type="button"
        >
          <AlertTriangle
            aria-hidden="true"
            className="text-(--warning-color)"
            size={15}
          />
          {t('revisionConflict.actions.resumeReview', 'Review conflict')}
          <span className="rounded-full bg-(--bg-raised) px-1.5 py-0.5 text-[10px] text-(--text-muted)">
            {unresolvedCount}
          </span>
        </button>
      ) : null}

      <PdxModal
        closeLabel={t('modals.close', 'Close')}
        description={t('revisionConflict.description')}
        footer={
          <>
            <PdxButton
              disabled={resolving}
              onClick={() => setReviewOpen(false)}
              size="Small"
              text={t('revisionConflict.actions.reviewLater', 'Review later')}
              variant="Ghost"
            />
            <PdxButton
              disabled={resolving}
              icon={<Laptop size={14} />}
              onClick={() =>
                chooseConflicts(
                  session.analysis.conflicts.map((conflict) => conflict.id),
                  'local'
                )
              }
              size="Small"
              text={t('revisionConflict.actions.useAllLocal', 'Use all local')}
              tone="Warning"
              variant="Secondary"
            />
            <PdxButton
              disabled={resolving}
              icon={<Cloud size={14} />}
              onClick={() =>
                chooseConflicts(
                  session.analysis.conflicts.map((conflict) => conflict.id),
                  'remote'
                )
              }
              size="Small"
              text={t(
                'revisionConflict.actions.useAllRemote',
                'Use all remote'
              )}
              variant="Secondary"
            />
            <PdxButton
              disabled={session.status !== 'resolved'}
              icon={<GitCompareArrows size={14} />}
              loading={resolving}
              loadingText={t(
                'revisionConflict.status.resolving',
                'Applying resolution…'
              )}
              onClick={() => void applyResolution()}
              size="Small"
              text={t(
                'revisionConflict.actions.applyResolution',
                'Apply resolution'
              )}
              variant="Primary"
            />
          </>
        }
        onClose={() => setReviewOpen(false)}
        open={reviewOpen}
        size="Large"
        style={{
          maxHeight: 'calc(100dvh - 32px)',
          width: 'min(1400px, calc(100vw - 32px))',
        }}
        title={t('revisionConflict.title')}
      >
        <div className="grid min-h-[560px] grid-cols-[300px_minmax(0,1fr)] gap-3">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-(--border-default) bg-(--bg-panel)">
            <header className="border-b border-b-(--border-subtle) px-3 py-3">
              <p className="m-0 text-xs font-semibold text-(--text-primary)">
                {t('revisionConflict.labels.conflicts', 'Conflicts')}
              </p>
              <p className="m-0 mt-1 text-[10px] text-(--text-muted)">
                {t(
                  'revisionConflict.status.conflictCount',
                  '{{unresolved}} unresolved of {{total}}',
                  {
                    unresolved: unresolvedCount,
                    total: session.analysis.conflicts.length,
                  }
                )}
              </p>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
              {session.analysis.conflicts.map((conflict) => {
                const resolution = session.resolutions[conflict.id];
                return (
                  <article
                    className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-2.5"
                    key={conflict.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 truncate font-mono text-[10px] font-semibold text-(--text-primary)">
                          {formatConflictTarget(conflict, session)}
                        </p>
                        <p className="m-0 mt-0.5 text-[9px] tracking-[0.08em] text-(--text-muted) uppercase">
                          {t(`revisionConflict.kinds.${conflict.kind}`, {
                            defaultValue: conflict.kind,
                          })}
                        </p>
                      </div>
                      {resolution ? (
                        <Check
                          aria-label={t(
                            'revisionConflict.labels.resolved',
                            'Resolved'
                          )}
                          className="shrink-0 text-(--success-color)"
                          size={13}
                        />
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[9px]">
                      <p className="m-0 line-clamp-2 rounded border border-(--warning-color) bg-amber-500/5 p-1.5 text-(--text-secondary)">
                        {formatConflictValue(conflict.local)}
                      </p>
                      <p className="m-0 line-clamp-2 rounded border-3 border-double border-violet-500 bg-violet-500/5 p-1.5 text-(--text-secondary)">
                        {formatConflictValue(conflict.remote)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <RevisionConflictChoiceButton
                        active={resolution === 'local'}
                        choice="local"
                        label={localLabel}
                        onChoose={() => chooseConflict(conflict.id, 'local')}
                      />
                      <RevisionConflictChoiceButton
                        active={resolution === 'remote'}
                        choice="remote"
                        label={remoteLabel}
                        onChoose={() => chooseConflict(conflict.id, 'remote')}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col gap-3">
            {artifacts.length ? (
              <nav
                aria-label={t(
                  'revisionConflict.labels.changedArtifacts',
                  'Changed artifacts'
                )}
                className="flex flex-wrap gap-1.5 rounded-xl border border-(--border-default) bg-(--bg-panel) p-2"
              >
                {artifacts.map((artifact) => {
                  const Icon = artifact.kind === 'code' ? FileCode2 : Network;
                  const label =
                    artifact.kind === 'code'
                      ? artifact.presentation.documentPath
                      : artifact.presentation.graphLabel;
                  return (
                    <button
                      aria-pressed={activeArtifact?.key === artifact.key}
                      className={`inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium ${
                        activeArtifact?.key === artifact.key
                          ? 'border-(--border-strong) bg-(--bg-raised) text-(--text-primary)'
                          : 'border-(--border-subtle) bg-(--bg-canvas) text-(--text-secondary) hover:bg-(--bg-raised)'
                      }`}
                      key={artifact.key}
                      onClick={() => {
                        setActiveArtifactKey(artifact.key);
                        setSelectedGraphNodeId(undefined);
                      }}
                      title={label}
                      type="button"
                    >
                      <Icon aria-hidden="true" size={13} />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </nav>
            ) : null}

            {activeArtifact?.kind === 'code' ? (
              <CodeDocumentDiffView
                className="min-h-0 flex-1"
                documentPath={activeArtifact.presentation.documentPath}
                hunks={activeArtifact.presentation.hunks}
                labels={{
                  base: t('revisionConflict.labels.base', 'BASE'),
                  conflict: t('revisionConflict.labels.conflict', 'conflict'),
                  conflicts: t(
                    'revisionConflict.labels.conflicts',
                    'conflicts'
                  ),
                  hunk: t('revisionConflict.labels.hunk', 'hunk'),
                  hunks: t('revisionConflict.labels.hunks', 'hunks'),
                  local: t('revisionConflict.labels.local', 'LOCAL'),
                  noChanges: t(
                    'revisionConflict.labels.noTextChanges',
                    'No text changes to review.'
                  ),
                  noLines: t(
                    'revisionConflict.labels.noLines',
                    'No lines in this version'
                  ),
                  remote: t('revisionConflict.labels.remote', 'REMOTE'),
                  resolved: t('revisionConflict.labels.resolved', 'Resolved'),
                  unresolved: t(
                    'revisionConflict.labels.unresolved',
                    'unresolved'
                  ),
                  useLocal: localLabel,
                  useRemote: remoteLabel,
                }}
                onResolveHunk={(hunkId, choice) => {
                  const hunk = activeArtifact.presentation.hunks.find(
                    (candidate) => candidate.id === hunkId
                  );
                  if (hunk?.resolutionTargetId) {
                    chooseConflict(hunk.resolutionTargetId, choice);
                  }
                }}
              />
            ) : activeArtifact?.kind === 'graph' ? (
              <NodeGraphDiffView
                className="min-h-0 flex-1"
                edges={activeArtifact.presentation.edges}
                height={430}
                labels={{
                  base: t('revisionConflict.labels.base', 'BASE'),
                  changedFields: t(
                    'revisionConflict.labels.changedFields',
                    'Changed fields'
                  ),
                  conflicts: t(
                    'revisionConflict.labels.conflicts',
                    'conflicts'
                  ),
                  edgeConflicts: t(
                    'revisionConflict.labels.edgeConflicts',
                    'Edge conflicts'
                  ),
                  field: t('revisionConflict.labels.field', 'Field'),
                  graph: activeArtifact.presentation.graphLabel,
                  invalidPresentation: t(
                    'revisionConflict.labels.invalidGraphPresentation',
                    'Invalid graph diff presentation.'
                  ),
                  local: t('revisionConflict.labels.local', 'LOCAL'),
                  noFieldDetails: t(
                    'revisionConflict.labels.noFieldDetails',
                    'No field-level details supplied.'
                  ),
                  remote: t('revisionConflict.labels.remote', 'REMOTE'),
                  unresolved: t(
                    'revisionConflict.labels.unresolved',
                    'unresolved'
                  ),
                  useLocal: localLabel,
                  useRemote: remoteLabel,
                }}
                nodes={activeArtifact.presentation.nodes}
                onResolveConflict={(entityId, choice) => {
                  const conflictIds = activeArtifact.presentation.nodes
                    .filter((node) => node.entityId === entityId)
                    .flatMap((node) => node.conflictIds ?? [])
                    .concat(
                      activeArtifact.presentation.edges
                        .filter((edge) => edge.entityId === entityId)
                        .flatMap((edge) => edge.conflictIds ?? [])
                    );
                  chooseConflicts([...new Set(conflictIds)], choice);
                }}
                onSelectNode={(visualId) => setSelectedGraphNodeId(visualId)}
                selectedVisualId={selectedGraphNodeId}
              />
            ) : (
              <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-panel) p-8 text-center text-sm text-(--text-muted)">
                {t(
                  'revisionConflict.genericSummary',
                  'This change cannot be merged automatically.'
                )}
              </div>
            )}

            {resolutionError ? (
              <p
                className="m-0 rounded-lg border border-(--danger-color) bg-red-500/10 px-3 py-2 text-xs text-(--danger-color)"
                role="alert"
              >
                {resolutionError}
              </p>
            ) : session.status !== 'resolved' ? (
              <p className="m-0 rounded-lg border border-(--warning-color) bg-amber-500/5 px-3 py-2 text-xs text-(--text-secondary)">
                {t(
                  'revisionConflict.status.unresolved',
                  'Choose a version for every conflict before applying.'
                )}
              </p>
            ) : null}
          </main>
        </div>
      </PdxModal>
    </>
  );
}
