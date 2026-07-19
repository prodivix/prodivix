import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  LocateFixed,
  Pause,
  Play,
  RefreshCcw,
  RotateCw,
  Square,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import {
  createExecutionSessionRecoveryPlan,
  getExecutionTerminalAvailability,
  type ExecutionSessionStatus,
  type ExecutionTerminalPermissionStatus,
} from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalClient } from '@prodivix/runtime-remote';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { ExecutionFilesystemChangesPanel } from './ExecutionFilesystemChangesPanel';
import { ExecutionTerminalEmulatorSurface } from './ExecutionTerminalEmulatorSurface';
import type { ExecutionFilesystemArtifactReference } from './executionFilesystemChanges.types';
import {
  createExecutionConsoleCopyText,
  createExecutionConsoleView,
  type ExecutionConsoleDiagnostic,
  type ExecutionConsoleFilter,
} from './executionConsoleModel';
import {
  createExecutionNetworkEntries,
  filterExecutionNetworkEntries,
  type ExecutionNetworkEntry,
  type ExecutionNetworkOperationFilter,
} from './executionNetworkModel';
import { useExecutionCenterNavigationStore } from './executionCenterNavigation';
import {
  createExecutionServerFunctionEntries,
  type ExecutionServerFunctionEntry,
} from './executionServerFunctionModel';
import type {
  ExecutionSourceNavigationInput,
  ExecutionSourceNavigationResult,
} from './executionSourceTraceModel';
import { useExecutionSession } from './useExecutionSession';
import { useExecutionFilesystemChanges } from './useExecutionFilesystemChanges';
import { useRemoteExecutionTerminal } from './useRemoteExecutionTerminal';
import { createWorkspaceExecutionSnapshotId } from './workspaceExecutionIdentity';

type ExecutionCenterProps = Readonly<{
  sessionId: string;
  status?: ExecutionCenterStatus;
  previewUrl?: string;
  diagnostics?: readonly ExecutionConsoleDiagnostic[];
  terminalClient?: RemoteExecutionTerminalClient;
  terminalPermission?: ExecutionTerminalPermissionStatus;
  filesystemArtifact?: ExecutionFilesystemArtifactReference;
  workspace?: WorkspaceSnapshot;
  workspaceReadonly?: boolean;
  onRestart?(): void;
  onStop?(): void;
  onReloadPreview?(): void;
  onOpenPreview?(): void;
  onOpenSourceTrace?(
    input: ExecutionSourceNavigationInput
  ): ExecutionSourceNavigationResult;
  onOpenDataOperation?(target: ExecutionNetworkOperationFilter): void;
}>;

export type ExecutionCenterStatus =
  ExecutionSessionStatus | 'compiling' | 'blocked';

const activeStatuses = new Set<ExecutionCenterStatus>([
  'queued',
  'starting',
  'running',
  'cancelling',
  'compiling',
]);

const statusDotClass = (status: ExecutionCenterStatus): string => {
  if (status === 'failed' || status === 'timed-out' || status === 'blocked') {
    return 'bg-(--danger-color)';
  }
  if (status === 'running') return 'bg-(--text-primary)';
  return 'bg-(--text-muted)';
};

const lineToneClass = (
  level: 'debug' | 'info' | 'warning' | 'error'
): string => {
  if (level === 'error') return 'text-(--danger-color)';
  if (level === 'warning') return 'text-(--warning-color)';
  return 'text-(--text-secondary)';
};

const formatConsoleTime = (timestamp: number | undefined): string => {
  if (timestamp === undefined) return '--:--:--';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '--:--:--'
    : date.toISOString().slice(11, 23);
};

export function ExecutionCenter({
  sessionId,
  status,
  previewUrl,
  diagnostics,
  terminalClient,
  terminalPermission,
  filesystemArtifact,
  workspace,
  workspaceReadonly = true,
  onRestart,
  onStop,
  onReloadPreview,
  onOpenPreview,
  onOpenSourceTrace,
  onOpenDataOperation,
}: ExecutionCenterProps) {
  const { t } = useTranslation('editor');
  const session = useExecutionSession(sessionId);
  const [collapsed, setCollapsed] = useState(false);
  const [surface, setSurface] = useState<
    'console' | 'terminal' | 'network' | 'server' | 'files'
  >('console');
  const [networkFilter, setNetworkFilter] =
    useState<ExecutionNetworkOperationFilter>();
  const [filter, setFilter] = useState<ExecutionConsoleFilter>('all');
  const [clearedConsoleLineIds, setClearedConsoleLineIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [clearedNetworkEntryIds, setClearedNetworkEntryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [clearedServerEntryIds, setClearedServerEntryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pausedConsoleLineIds, setPausedConsoleLineIds] = useState<
    ReadonlySet<string> | undefined
  >();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  const [sourceNavigationFailure, setSourceNavigationFailure] = useState<
    Readonly<{
      entryId: string;
      surface: 'console' | 'network' | 'server' | 'files';
      reason: Extract<
        ExecutionSourceNavigationResult,
        { status: 'unavailable' }
      >['reason'];
    }>
  >();
  const outputRef = useRef<HTMLDivElement | null>(null);
  const effectiveStatus = status ?? session?.status ?? 'idle';
  const sessionSnapshotStale = Boolean(
    workspace &&
    session?.activeJob &&
    createWorkspaceExecutionSnapshotId(workspace) !==
      session.activeJob.workspace.snapshotId
  );
  const allConsoleLines = useMemo(
    () =>
      createExecutionConsoleView({ session, diagnostics, filter: 'all' }).lines,
    [diagnostics, session]
  );
  const consoleView = useMemo(
    () => createExecutionConsoleView({ session, diagnostics, filter }),
    [diagnostics, filter, session]
  );
  const lines = useMemo(
    () =>
      consoleView.lines.filter(
        (line) =>
          !clearedConsoleLineIds.has(line.id) &&
          (!pausedConsoleLineIds || pausedConsoleLineIds.has(line.id))
      ),
    [clearedConsoleLineIds, consoleView.lines, pausedConsoleLineIds]
  );
  const active = activeStatuses.has(effectiveStatus);
  const recovery = useMemo(
    () => createExecutionSessionRecoveryPlan(session),
    [session]
  );
  const networkEntries = useMemo(
    () => createExecutionNetworkEntries(session),
    [session]
  );
  const visibleNetworkEntries = useMemo(
    () =>
      filterExecutionNetworkEntries(networkEntries, networkFilter).filter(
        (entry) => !clearedNetworkEntryIds.has(entry.id)
      ),
    [clearedNetworkEntryIds, networkEntries, networkFilter]
  );
  const navigationRequest = useExecutionCenterNavigationStore(
    (state) => state.request
  );
  const consumeNavigationRequest = useExecutionCenterNavigationStore(
    (state) => state.consume
  );
  const allServerFunctionEntries = useMemo(
    () => createExecutionServerFunctionEntries(session),
    [session]
  );
  const serverFunctionEntries = useMemo(
    () =>
      allServerFunctionEntries.filter(
        (entry) => !clearedServerEntryIds.has(entry.id)
      ),
    [allServerFunctionEntries, clearedServerEntryIds]
  );
  const terminalAvailability = useMemo(
    () =>
      getExecutionTerminalAvailability({
        session,
        ...(terminalPermission ? { permission: terminalPermission } : {}),
      }),
    [session, terminalPermission]
  );
  const terminal = useRemoteExecutionTerminal({
    enabled: surface === 'terminal' && !collapsed,
    availability: terminalAvailability,
    client: terminalClient,
  });
  const filesystem = useExecutionFilesystemChanges({
    enabled: surface === 'files' && !collapsed,
    ...(filesystemArtifact ? { reference: filesystemArtifact } : {}),
    ...(workspace ? { workspace } : {}),
    readonly: workspaceReadonly,
  });

  useEffect(() => {
    setClearedConsoleLineIds(new Set());
    setClearedNetworkEntryIds(new Set());
    setClearedServerEntryIds(new Set());
    setPausedConsoleLineIds(undefined);
  }, [sessionId]);

  useEffect(() => {
    if (
      !navigationRequest ||
      !workspace ||
      navigationRequest.workspaceId !== workspace.id
    ) {
      return;
    }
    setCollapsed(false);
    if (navigationRequest.surface === 'network') {
      setSurface('network');
      setNetworkFilter(
        Object.freeze({
          documentId: navigationRequest.documentId,
          operationId: navigationRequest.operationId,
        })
      );
    } else {
      if (navigationRequest.sessionId !== sessionId) return;
      setSurface('console');
      setFilter('errors');
    }
    consumeNavigationRequest(navigationRequest.id);
  }, [consumeNavigationRequest, navigationRequest, sessionId, workspace]);
  const terminalMessage =
    terminalAvailability.status === 'unavailable'
      ? terminalAvailability.reason === 'no-active-execution'
        ? t('execution.terminal.noActiveExecution')
        : t('execution.terminal.executionNotRunning', {
            status: terminalAvailability.executionStatus,
          })
      : terminalAvailability.status === 'unsupported'
        ? t('execution.terminal.unsupported', {
            providerId: terminalAvailability.providerId,
          })
        : terminalAvailability.status === 'permission-required'
          ? t('execution.terminal.permissionRequired', {
              providerId: terminalAvailability.providerId,
            })
          : terminalAvailability.status === 'denied'
            ? t('execution.terminal.permissionDenied', {
                providerId: terminalAvailability.providerId,
              })
            : t('execution.terminal.available', {
                providerId: terminalAvailability.providerId,
              });

  useEffect(() => {
    if (collapsed) return;
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [
    collapsed,
    lines.length,
    filesystem.entries.length,
    visibleNetworkEntries.length,
    serverFunctionEntries.length,
    surface,
    terminal.emulator.latestOutputCursor,
    terminal.emulator.lines.length,
  ]);

  useEffect(() => {
    if (
      surface !== 'terminal' ||
      terminal.view.phase !== 'open' ||
      !outputRef.current ||
      typeof globalThis.ResizeObserver === 'undefined'
    )
      return undefined;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const observer = new globalThis.ResizeObserver((entries) => {
      const rectangle = entries[0]?.contentRect;
      if (!rectangle) return;
      if (timer !== undefined) globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
        const columns = Math.max(
          2,
          Math.min(500, Math.floor((rectangle.width - 24) / 7))
        );
        const rows = Math.max(
          1,
          Math.min(200, Math.floor((rectangle.height - 42) / 16))
        );
        void terminal.resize(columns, rows);
      }, 80);
    });
    observer.observe(outputRef.current);
    return () => {
      observer.disconnect();
      if (timer !== undefined) globalThis.clearTimeout(timer);
    };
  }, [surface, terminal.resize, terminal.view.phase]);

  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timeout = globalThis.setTimeout(() => setCopyStatus('idle'), 1_500);
    return () => globalThis.clearTimeout(timeout);
  }, [copyStatus]);

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(
        surface === 'terminal'
          ? terminal.copyText
          : createExecutionConsoleCopyText(lines)
      );
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const toggleConsolePause = () => {
    setPausedConsoleLineIds((current) =>
      current ? undefined : new Set(allConsoleLines.map((line) => line.id))
    );
  };

  const clearCurrentView = () => {
    if (surface === 'console') {
      setClearedConsoleLineIds(
        (current) =>
          new Set([...current, ...allConsoleLines.map((line) => line.id)])
      );
      return;
    }
    if (surface === 'network') {
      setClearedNetworkEntryIds(
        (current) =>
          new Set([...current, ...networkEntries.map((entry) => entry.id)])
      );
      return;
    }
    if (surface === 'server') {
      setClearedServerEntryIds(
        (current) =>
          new Set([
            ...current,
            ...allServerFunctionEntries.map((entry) => entry.id),
          ])
      );
    }
  };

  const openSourceTrace = (
    entryId: string,
    entrySurface: 'console' | 'network' | 'server' | 'files',
    input: ExecutionSourceNavigationInput
  ) => {
    if (!onOpenSourceTrace) return;
    let result: ExecutionSourceNavigationResult;
    try {
      result = onOpenSourceTrace(input);
    } catch {
      result = { status: 'unavailable', reason: 'source-unavailable' };
    }
    setSourceNavigationFailure(
      result.status === 'unavailable'
        ? { entryId, surface: entrySurface, reason: result.reason }
        : undefined
    );
  };

  const openServerFunctionSource = (entry: ExecutionServerFunctionEntry) => {
    if (!entry.primarySourceTrace) return;
    openSourceTrace(entry.id, 'server', {
      jobId: entry.jobId,
      providerId: entry.providerId,
      snapshotId: entry.snapshotId,
      sourceTrace: entry.primarySourceTrace,
    });
  };

  const openNetworkSource = (entry: ExecutionNetworkEntry) => {
    if (!entry.primarySourceTrace) return;
    openSourceTrace(entry.id, 'network', {
      jobId: entry.jobId,
      providerId: entry.providerId,
      snapshotId: entry.snapshotId,
      sourceTrace: entry.primarySourceTrace,
    });
  };

  const openConsoleSource = (line: (typeof lines)[number]) => {
    if (!line.primarySourceTrace || !line.correlation) return;
    openSourceTrace(line.id, 'console', {
      jobId: line.correlation.jobId,
      providerId: line.correlation.providerId,
      snapshotId: line.correlation.snapshotId,
      sourceTrace: line.primarySourceTrace,
    });
  };

  const openFilesystemSource = (entry: (typeof filesystem.entries)[number]) => {
    if (!entry.primarySourceTrace || !filesystemArtifact) return;
    openSourceTrace(entry.changeId, 'files', {
      jobId: filesystemArtifact.jobId,
      providerId: filesystemArtifact.providerId,
      snapshotId: filesystemArtifact.workspaceSnapshotId,
      sourceTrace: entry.primarySourceTrace,
    });
  };

  const visibleSourceNavigationFailure =
    sourceNavigationFailure &&
    sourceNavigationFailure.surface === surface &&
    ((surface === 'console' &&
      lines.some((line) => line.id === sourceNavigationFailure.entryId)) ||
      (surface === 'server' &&
        serverFunctionEntries.some(
          (entry) => entry.id === sourceNavigationFailure.entryId
        )) ||
      (surface === 'network' &&
        visibleNetworkEntries.some(
          (entry) => entry.id === sourceNavigationFailure.entryId
        )) ||
      (surface === 'files' &&
        filesystem.entries.some(
          (entry) => entry.changeId === sourceNavigationFailure.entryId
        )))
      ? sourceNavigationFailure.reason
      : undefined;

  const quotaRecovery = diagnostics?.some(
    (diagnostic) => diagnostic.code === 'EXE-4291'
  );
  const workerRecoveryExhausted =
    session?.terminal?.failure?.code === 'REMOTE_WORKER_RECOVERY_EXHAUSTED';
  const authorizationRequired =
    session?.terminal?.failure?.code === 'REMOTE_AUTHORIZATION_REQUIRED';
  const permissionDenied =
    session?.terminal?.failure?.code === 'REMOTE_PERMISSION_DENIED';
  const networkPolicyDenied =
    session?.terminal?.failure?.code === 'REMOTE_NETWORK_POLICY_DENIED';

  const recoveryMessage =
    effectiveStatus === 'cancelling' || recovery.status === 'waiting'
      ? t('execution.recovery.waiting')
      : quotaRecovery
        ? t('execution.recovery.quota')
        : workerRecoveryExhausted
          ? t('execution.recovery.workerExhausted')
          : filesystem.recovery === 'new-request'
            ? t('execution.recovery.artifactUnavailable')
            : authorizationRequired
              ? t('execution.recovery.authorizationRequired')
              : permissionDenied
                ? t('execution.recovery.permissionDenied')
                : networkPolicyDenied
                  ? t('execution.recovery.networkPolicyDenied')
                  : recovery.status === 'blocked'
                    ? t('execution.recovery.identityConflict')
                    : effectiveStatus === 'cancelled'
                      ? t('execution.recovery.cancelled')
                      : effectiveStatus === 'timed-out'
                        ? t('execution.recovery.timedOut')
                        : recovery.status === 'restart'
                          ? recovery.requiresChange
                            ? t('execution.recovery.requiresChange', {
                                code:
                                  recovery.failureCode ?? 'execution-failed',
                              })
                            : t('execution.recovery.newRequest')
                          : effectiveStatus === 'blocked'
                            ? t('execution.recovery.compileBlocked')
                            : effectiveStatus === 'failed'
                              ? t('execution.recovery.newRequest')
                              : undefined;
  const restartDisabled =
    effectiveStatus === 'cancelling' || effectiveStatus === 'compiling';

  const iconButtonClass =
    'inline-flex size-7 items-center justify-center rounded-md text-(--text-muted) transition-colors hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <section
      className={`flex shrink-0 flex-col border-t border-(--border-default) bg-(--bg-canvas) text-(--text-primary) ${collapsed ? 'h-9' : 'h-[210px]'}`}
      aria-label={t('execution.title')}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-(--border-subtle) px-2.5">
        <button
          type="button"
          className={iconButtonClass}
          onClick={() => setCollapsed((current) => !current)}
          title={collapsed ? t('execution.expand') : t('execution.collapse')}
          aria-label={
            collapsed ? t('execution.expand') : t('execution.collapse')
          }
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-xs font-medium">{t('execution.title')}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border-default) px-2 py-0.5 text-[10px] text-(--text-muted)">
          <span
            className={`size-1.5 rounded-full ${statusDotClass(effectiveStatus)}`}
          />
          {t(`execution.status.${effectiveStatus}`, {
            defaultValue: effectiveStatus,
          })}
        </span>
        {session?.activeJob ? (
          <span
            className="min-w-0 truncate text-[10px] text-(--text-muted)"
            title={session.activeJob.workspace.snapshotId}
          >
            {session.activeJob.providerId} ·{' '}
            {session.activeJob.workspace.snapshotId.slice(-12)}
          </span>
        ) : null}
        {sessionSnapshotStale ? (
          <span
            className="rounded-full border border-(--warning-color)/45 px-2 py-0.5 text-[9px] text-(--warning-color)"
            title={t('execution.sourceNavigation.snapshotStale')}
          >
            {t('execution.status.stale')}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {onRestart ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onRestart}
              disabled={restartDisabled}
              title={t('execution.startNewRequest')}
              aria-label={t('execution.startNewRequest')}
            >
              <RefreshCcw size={13} />
            </button>
          ) : null}
          {onStop ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onStop}
              disabled={!active || effectiveStatus === 'cancelling'}
              title={t('execution.stop')}
              aria-label={t('execution.stop')}
            >
              <Square size={12} />
            </button>
          ) : null}
          {onReloadPreview ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onReloadPreview}
              disabled={!previewUrl}
              title={t('execution.reloadPreview')}
              aria-label={t('execution.reloadPreview')}
            >
              <RotateCw size={13} />
            </button>
          ) : null}
          {onOpenPreview ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onOpenPreview}
              disabled={!previewUrl}
              title={t('execution.openPreview')}
              aria-label={t('execution.openPreview')}
            >
              <ExternalLink size={13} />
            </button>
          ) : null}
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => void copyOutput()}
            disabled={
              surface === 'network' ||
              surface === 'server' ||
              surface === 'files' ||
              (surface === 'console' && !lines.length) ||
              (surface === 'terminal' &&
                !terminal.view.records.length &&
                !terminal.view.gap)
            }
            title={
              copyStatus === 'failed'
                ? t('execution.copyFailed')
                : t('execution.copy')
            }
            aria-label={t('execution.copy')}
          >
            {copyStatus === 'copied' ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {surface === 'console' ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={toggleConsolePause}
              title={
                pausedConsoleLineIds
                  ? t('execution.resume')
                  : t('execution.pause')
              }
              aria-label={
                pausedConsoleLineIds
                  ? t('execution.resume')
                  : t('execution.pause')
              }
              aria-pressed={Boolean(pausedConsoleLineIds)}
            >
              {pausedConsoleLineIds ? <Play size={13} /> : <Pause size={13} />}
            </button>
          ) : null}
          <button
            type="button"
            className={iconButtonClass}
            onClick={clearCurrentView}
            disabled={
              surface === 'terminal' ||
              surface === 'files' ||
              (surface === 'console' && !lines.length) ||
              (surface === 'network' && !visibleNetworkEntries.length) ||
              (surface === 'server' && !serverFunctionEntries.length)
            }
            title={t('execution.clear')}
            aria-label={t('execution.clear')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      {!collapsed ? (
        <>
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-(--border-subtle) px-3">
            {(
              ['console', 'terminal', 'network', 'server', 'files'] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-2 py-1 text-[10px] ${surface === value ? 'bg-(--bg-raised) text-(--text-primary)' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
                aria-pressed={surface === value}
                onClick={() => setSurface(value)}
              >
                {t(`execution.surface.${value}`)}
              </button>
            ))}
            {surface === 'console'
              ? (['all', 'errors', 'application', 'system'] as const).map(
                  (value) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-md px-2 py-1 text-[10px] ${filter === value ? 'text-(--text-primary)' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {t(`execution.filter.${value}`)}
                    </button>
                  )
                )
              : null}
            {surface === 'network' && networkFilter ? (
              <button
                type="button"
                className="ml-1 max-w-64 truncate rounded-md bg-(--bg-raised) px-2 py-1 text-[10px] text-(--text-primary)"
                title={`${networkFilter.documentId}#${networkFilter.operationId}`}
                onClick={() => setNetworkFilter(undefined)}
              >
                {networkFilter.operationId} ×
              </button>
            ) : null}
            {surface === 'terminal' ? (
              <span className="ml-auto text-[10px] text-(--text-muted)">
                {terminalAvailability.status === 'available'
                  ? t(`execution.terminal.phase.${terminal.view.phase}`)
                  : t(
                      `execution.terminal.status.${terminalAvailability.status}`
                    )}
              </span>
            ) : (
              <span className="ml-auto text-[10px] text-(--text-muted)">
                {surface === 'console' && pausedConsoleLineIds
                  ? `${t('execution.paused')} · `
                  : null}
                {t('execution.eventCount', {
                  count:
                    surface === 'console'
                      ? lines.length
                      : surface === 'network'
                        ? visibleNetworkEntries.length
                        : surface === 'server'
                          ? serverFunctionEntries.length
                          : filesystem.entries.length,
                })}
              </span>
            )}
          </div>
          {recoveryMessage ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-(--border-subtle) bg-(--bg-raised)/55 px-3 py-1.5 text-[10px] text-(--text-secondary)">
              <span className="size-1.5 shrink-0 rounded-full bg-(--warning-color)" />
              <span className="min-w-0 flex-1">{recoveryMessage}</span>
              {recovery.status === 'restart' ? (
                <span className="text-(--text-muted)">
                  {t('execution.recovery.previousRequest', {
                    requestId: recovery.previousRequestId.slice(-12),
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
          {surface === 'console' && consoleView.truncated ? (
            <div className="shrink-0 border-b border-(--border-subtle) px-3 py-1 text-[10px] text-(--warning-color)">
              {t('execution.consoleTruncated', {
                count: consoleView.droppedRecords,
              })}
            </div>
          ) : null}
          <div
            ref={outputRef}
            className="min-h-0 flex-1 overflow-auto bg-(--bg-panel) px-3 py-2 font-mono text-[10px] leading-4"
          >
            {visibleSourceNavigationFailure ? (
              <div
                role="status"
                className="mb-1 text-[10px] text-(--warning-color)"
              >
                {t(
                  visibleSourceNavigationFailure === 'snapshot-stale'
                    ? 'execution.sourceNavigation.snapshotStale'
                    : 'execution.sourceNavigation.sourceUnavailable'
                )}
              </div>
            ) : null}
            {surface === 'console' && lines.length ? (
              lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[76px_82px_minmax(0,1fr)_28px] items-start gap-2 py-0.5"
                >
                  <span className="text-(--text-muted) tabular-nums">
                    {formatConsoleTime(line.recordedAt)}
                  </span>
                  <span
                    className="truncate text-(--text-muted)"
                    title={`${line.category}/${line.label}`}
                  >
                    {line.category}/{line.label}
                  </span>
                  <span className="min-w-0">
                    <span className={lineToneClass(line.level)}>
                      {line.message}
                    </span>
                    {line.detail ? (
                      <span className="ml-2 break-all text-(--text-muted)">
                        {line.detail}
                      </span>
                    ) : null}
                    {line.redacted || line.truncated ? (
                      <span className="ml-2 text-[9px] text-(--warning-color)">
                        {line.redacted
                          ? t('execution.redacted')
                          : t('execution.truncated')}
                      </span>
                    ) : null}
                  </span>
                  {line.primarySourceTrace &&
                  line.correlation &&
                  onOpenSourceTrace ? (
                    <button
                      type="button"
                      className={iconButtonClass}
                      onClick={() => openConsoleSource(line)}
                      title={t('execution.openSource')}
                      aria-label={t('execution.openSource')}
                    >
                      <LocateFixed size={13} />
                    </button>
                  ) : line.category === 'diagnostic' ? (
                    <span
                      className="inline-flex size-7 items-center justify-center text-(--text-muted) opacity-45"
                      title={t('execution.sourceNavigation.sourceUnavailable')}
                      aria-label={t(
                        'execution.sourceNavigation.sourceUnavailable'
                      )}
                    >
                      <LocateFixed size={13} />
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              ))
            ) : surface === 'terminal' &&
              terminalAvailability.status !== 'available' ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex max-w-xl items-start gap-3 rounded-lg border border-(--border-default) bg-(--bg-canvas) px-4 py-3 font-sans">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-(--bg-raised) text-(--text-muted)">
                    <SquareTerminal size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-(--text-primary)">
                      {t('execution.terminal.title')}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-(--text-secondary)">
                      {terminalMessage}
                    </span>
                  </span>
                </div>
              </div>
            ) : surface === 'terminal' &&
              ['idle', 'closed', 'error'].includes(terminal.view.phase) ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex max-w-xl items-start gap-3 rounded-lg border border-(--border-default) bg-(--bg-canvas) px-4 py-3 font-sans">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-(--bg-raised) text-(--text-muted)">
                    <SquareTerminal size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-(--text-primary)">
                      {t('execution.terminal.title')}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-(--text-secondary)">
                      {terminal.view.error
                        ? t(`execution.terminal.error.${terminal.view.error}`)
                        : terminalMessage}
                    </span>
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-(--border-default) bg-(--bg-raised) px-2.5 py-1 text-[10px] font-medium text-(--text-primary) hover:border-(--border-strong) disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!terminalClient}
                      onClick={() => void terminal.open()}
                    >
                      {t(
                        terminal.view.phase === 'error'
                          ? 'execution.terminal.reconnect'
                          : 'execution.terminal.open'
                      )}
                    </button>
                  </span>
                </div>
              </div>
            ) : surface === 'terminal' ? (
              <div className="flex min-h-full flex-col">
                {terminal.view.gap ? (
                  <div className="mb-1 text-(--warning-color)">
                    {t('execution.terminal.outputGap')}
                  </div>
                ) : null}
                {terminal.emulator.metrics.redactedRecords ||
                terminal.emulator.metrics.truncatedRecords ? (
                  <div className="mb-1 text-(--warning-color)">
                    {t('execution.terminal.protectedOutput', {
                      redacted: terminal.emulator.metrics.redactedRecords,
                      truncated: terminal.emulator.metrics.truncatedRecords,
                    })}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <ExecutionTerminalEmulatorSurface
                    snapshot={terminal.emulator}
                    connected={terminal.view.phase === 'open'}
                    inputLabel={t('execution.terminal.inputLabel')}
                    keyboardHelp={t('execution.terminal.keyboardHelp')}
                    pasteRejectedMessage={t('execution.terminal.pasteTooLarge')}
                    emptyMessage={t(
                      terminal.view.phase === 'opening'
                        ? 'execution.terminal.opening'
                        : 'execution.terminal.noOutput'
                    )}
                    onInput={terminal.send}
                    onInterrupt={terminal.interrupt}
                  />
                </div>
                {terminal.view.error ? (
                  <div role="status" className="mt-1 text-(--warning-color)">
                    {t(`execution.terminal.error.${terminal.view.error}`)}
                  </div>
                ) : null}
                <div className="sticky bottom-0 mt-2 flex items-center gap-1.5 border-t border-(--border-subtle) bg-(--bg-panel) pt-1.5 font-sans">
                  <span className="min-w-0 flex-1 truncate text-[10px] text-(--text-muted)">
                    {terminal.emulator.title ||
                      t('execution.terminal.keyboardHint')}{' '}
                    · {terminal.emulator.size.columns}×
                    {terminal.emulator.size.rows}
                  </span>
                  <button
                    type="button"
                    className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary) hover:bg-(--bg-raised) disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={terminal.view.phase !== 'open'}
                    onClick={() => void terminal.interrupt()}
                  >
                    {t('execution.terminal.interrupt')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary) hover:bg-(--bg-raised)"
                    onClick={() => void terminal.close()}
                  >
                    {t('execution.terminal.close')}
                  </button>
                </div>
              </div>
            ) : surface === 'server' && serverFunctionEntries.length ? (
              <div className="space-y-1">
                {serverFunctionEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[minmax(180px,1fr)_56px_96px_64px_28px] gap-2 py-0.5"
                  >
                    <span
                      className="truncate text-(--text-secondary)"
                      title={`${entry.trace.functionRef.artifactId}#${entry.trace.functionRef.exportName}`}
                    >
                      {entry.trace.functionRef.artifactId}#
                      {entry.trace.functionRef.exportName}
                    </span>
                    <span className="text-(--text-muted)">
                      #{entry.trace.attempt}
                    </span>
                    <span
                      className={
                        entry.trace.outcome === 'succeeded'
                          ? 'truncate text-(--text-secondary)'
                          : 'truncate text-(--danger-color)'
                      }
                      title={entry.trace.outcome}
                    >
                      {entry.trace.resultKind ??
                        entry.trace.errorCode ??
                        entry.trace.outcome}
                    </span>
                    <span className="text-right text-(--text-muted)">
                      {entry.trace.durationMs} ms
                    </span>
                    {entry.primarySourceTrace && onOpenSourceTrace ? (
                      <button
                        type="button"
                        className={iconButtonClass}
                        onClick={() => openServerFunctionSource(entry)}
                        title={t('execution.openSource')}
                        aria-label={t('execution.openSource')}
                      >
                        <LocateFixed size={13} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            ) : surface === 'files' ? (
              <ExecutionFilesystemChangesPanel
                controller={filesystem}
                onOpenSource={
                  onOpenSourceTrace ? openFilesystemSource : undefined
                }
              />
            ) : surface === 'network' && visibleNetworkEntries.length ? (
              <div className="space-y-1">
                {visibleNetworkEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[72px_minmax(160px,1fr)_72px_64px_52px] items-center gap-2 py-0.5"
                  >
                    <span className="truncate text-(--text-secondary)">
                      {entry.trace.correlation
                        ? `${entry.trace.method} · ${entry.trace.correlation.operationId}`
                        : entry.trace.method}
                    </span>
                    <span
                      className="truncate text-(--text-secondary)"
                      title={entry.trace.sanitizedUrl}
                    >
                      {entry.trace.sanitizedUrl}
                    </span>
                    <span
                      className={
                        entry.trace.outcome === 'allowed'
                          ? 'text-(--text-muted)'
                          : 'text-(--danger-color)'
                      }
                    >
                      {entry.trace.status ?? entry.trace.outcome}
                    </span>
                    <span className="text-right text-(--text-muted)">
                      {entry.trace.durationMs} ms
                    </span>
                    <span className="flex items-center gap-0.5">
                      {entry.primarySourceTrace && onOpenSourceTrace ? (
                        <button
                          type="button"
                          className={iconButtonClass}
                          title={t('execution.openSource')}
                          aria-label={t('execution.openSource')}
                          onClick={() => openNetworkSource(entry)}
                        >
                          <LocateFixed size={13} />
                        </button>
                      ) : null}
                      {entry.trace.correlation?.kind === 'data-operation' &&
                      onOpenDataOperation ? (
                        <button
                          type="button"
                          className={iconButtonClass}
                          title={t('execution.openDataInspector')}
                          aria-label={t('execution.openDataInspector')}
                          onClick={() =>
                            onOpenDataOperation({
                              documentId: entry.trace.correlation!.documentId,
                              operationId: entry.trace.correlation!.operationId,
                            })
                          }
                        >
                          <ExternalLink size={13} />
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-(--text-muted)">
                {t(
                  surface === 'console'
                    ? 'execution.empty'
                    : surface === 'server'
                      ? 'execution.serverEmpty'
                      : 'execution.networkEmpty'
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
