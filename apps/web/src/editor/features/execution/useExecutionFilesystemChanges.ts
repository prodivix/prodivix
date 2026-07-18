import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeWorkspaceRuntimeFilesystemDiff,
  createWorkspaceRuntimeFilesystemAssetUploadPlan,
  createWorkspaceRuntimeFilesystemProposal,
  type RuntimeFilesystemProposalEntry,
} from '@prodivix/prodivix-compiler';
import type { ExecutionFilesystemDiff } from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useAuthStore } from '@/auth/useAuthStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import type { ExecutionFilesystemArtifactReference } from './executionFilesystemChanges.types';
import { uploadRuntimeFilesystemAssets } from './runtimeFilesystemAssetUpload';

export type ExecutionFilesystemChangesController = Readonly<{
  status:
    | 'unavailable'
    | 'idle'
    | 'loading'
    | 'ready'
    | 'applying'
    | 'applied'
    | 'error';
  complete?: boolean;
  entries: readonly RuntimeFilesystemProposalEntry[];
  selectedChangeIds: readonly string[];
  readonly: boolean;
  message?: string;
  toggle(changeId: string): void;
  apply(): Promise<void>;
  retry(): void;
}>;

type LoadState = Readonly<{
  referenceKey?: string;
  status: 'idle' | 'loading' | 'ready' | 'applying' | 'applied' | 'error';
  diff?: ExecutionFilesystemDiff;
  message?: string;
}>;

const INITIAL_LOAD_STATE: LoadState = Object.freeze({ status: 'idle' });

/** Resolves durable diff bytes on demand and adopts only explicit revision-safe selections. */
export const useExecutionFilesystemChanges = (input: {
  enabled: boolean;
  reference?: ExecutionFilesystemArtifactReference;
  workspace?: WorkspaceSnapshot;
  readonly: boolean;
}): ExecutionFilesystemChangesController => {
  const token = useAuthStore((state) => state.token);
  const [load, setLoad] = useState<LoadState>(INITIAL_LOAD_STATE);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestedKeyRef = useRef<string | undefined>(undefined);
  const [selectedChangeIds, setSelectedChangeIds] = useState<readonly string[]>(
    Object.freeze([])
  );
  const referenceKey = input.reference
    ? `${input.reference.executionId}:${input.reference.artifactId}:${input.reference.snapshotDigest}`
    : 'unavailable';

  useEffect(() => {
    setLoad(Object.freeze({ status: 'idle', referenceKey }));
    setSelectedChangeIds(Object.freeze([]));
  }, [referenceKey]);

  useEffect(() => {
    if (!input.enabled || !input.reference) {
      requestedKeyRef.current = undefined;
      return;
    }
    const requestedKey = `${referenceKey}:${retryRevision}`;
    if (requestedKeyRef.current === requestedKey) return;
    requestedKeyRef.current = requestedKey;
    let active = true;
    setLoad(Object.freeze({ status: 'loading', referenceKey }));
    void input.reference
      .resolve()
      .then((diff) => {
        if (active)
          setLoad(Object.freeze({ status: 'ready', referenceKey, diff }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoad(
          Object.freeze({
            status: 'error',
            referenceKey,
            message: error instanceof Error ? error.message : String(error),
          })
        );
      });
    return () => {
      active = false;
    };
  }, [input.enabled, input.reference, referenceKey, retryRevision]);

  const analysis = useMemo(
    () =>
      load.diff && input.workspace
        ? analyzeWorkspaceRuntimeFilesystemDiff(input.workspace, load.diff)
        : undefined,
    [input.workspace, load.diff]
  );

  useEffect(() => {
    if (!analysis) return;
    const eligible = new Set(analysis.eligibleChangeIds);
    setSelectedChangeIds((current) => {
      const next = current.filter((changeId) => eligible.has(changeId));
      return next.length === current.length ? current : Object.freeze(next);
    });
  }, [analysis]);

  const toggle = useCallback(
    (changeId: string) => {
      if (
        input.readonly ||
        !analysis?.eligibleChangeIds.includes(changeId) ||
        load.status === 'applying'
      )
        return;
      setSelectedChangeIds((current) =>
        current.includes(changeId)
          ? Object.freeze(current.filter((candidate) => candidate !== changeId))
          : Object.freeze([...current, changeId])
      );
    },
    [analysis, input.readonly, load.status]
  );

  const apply = useCallback(async () => {
    if (
      input.readonly ||
      !input.workspace ||
      !load.diff ||
      !selectedChangeIds.length ||
      load.status === 'applying'
    )
      return;
    const uploadPlan = createWorkspaceRuntimeFilesystemAssetUploadPlan({
      workspace: input.workspace,
      diff: load.diff,
      selectedChangeIds,
    });
    if (uploadPlan.status !== 'ready') {
      setLoad(
        Object.freeze({
          status: 'error',
          referenceKey,
          diff: load.diff,
          message: 'Runtime filesystem selection is no longer eligible.',
        })
      );
      return;
    }
    setLoad(
      Object.freeze({
        status: 'applying',
        referenceKey,
        diff: load.diff,
      })
    );
    let proposal: ReturnType<typeof createWorkspaceRuntimeFilesystemProposal>;
    let currentWorkspace: WorkspaceSnapshot;
    try {
      const assetUploadReceipts = await uploadRuntimeFilesystemAssets({
        workspaceId: input.workspace.id,
        token,
        uploads: uploadPlan.uploads,
      });
      currentWorkspace = input.workspace;
      proposal = createWorkspaceRuntimeFilesystemProposal({
        workspace: currentWorkspace,
        diff: load.diff,
        selectedChangeIds,
        assetUploadReceipts,
        transactionId: createWorkspaceClientOperationId(
          'runtime-filesystem-adoption'
        ),
        issuedAt: new Date().toISOString(),
      });
    } catch (error) {
      setLoad(
        Object.freeze({
          status: 'error',
          referenceKey,
          diff: load.diff,
          message:
            error instanceof Error
              ? error.message
              : 'Runtime Asset upload failed.',
        })
      );
      return;
    }
    if (proposal.status !== 'ready') {
      setLoad(
        Object.freeze({
          status: 'error',
          referenceKey,
          diff: load.diff,
          message: 'Runtime filesystem selection is no longer eligible.',
        })
      );
      return;
    }
    let outcome: Awaited<
      ReturnType<typeof dispatchWorkspaceAuthoringOperation>
    >;
    try {
      outcome = await dispatchWorkspaceAuthoringOperation({
        workspace: currentWorkspace,
        readonly: input.readonly,
        operation: { kind: 'transaction', transaction: proposal.transaction },
      });
    } catch {
      setLoad(
        Object.freeze({
          status: 'error',
          referenceKey,
          diff: load.diff,
          message: 'Workspace operation could not be queued.',
        })
      );
      return;
    }
    if (outcome.status === 'rejected') {
      setLoad(
        Object.freeze({
          status: 'error',
          referenceKey,
          diff: load.diff,
          message: outcome.message,
        })
      );
      return;
    }
    setSelectedChangeIds(Object.freeze([]));
    setLoad(
      Object.freeze({
        status: 'applied',
        referenceKey,
        diff: load.diff,
        message: outcome.operationId,
      })
    );
  }, [
    input.readonly,
    input.workspace,
    load,
    referenceKey,
    selectedChangeIds,
    token,
  ]);

  const retry = useCallback(() => {
    if (!input.reference || load.status === 'loading') return;
    setLoad(Object.freeze({ status: 'idle', referenceKey }));
    setRetryRevision((revision) => revision + 1);
  }, [input.reference, load.status, referenceKey]);

  return Object.freeze({
    status: input.reference ? load.status : 'unavailable',
    ...(analysis ? { complete: analysis.complete } : {}),
    entries: analysis?.entries ?? Object.freeze([]),
    selectedChangeIds,
    readonly: input.readonly,
    ...(load.message ? { message: load.message } : {}),
    toggle,
    apply,
    retry,
  });
};
