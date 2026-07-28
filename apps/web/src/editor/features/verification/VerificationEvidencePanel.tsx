import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  BadgeCheck,
  Download,
  Eye,
  GitCompare,
  History,
  LocateFixed,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  decodeVerificationArtifactEnvelope,
  isVerificationArtifactJsonMediaType,
  isVerificationStructuredArtifactKind,
} from '@prodivix/verification';
import type {
  VerificationEvidenceRetentionProtection,
  VerificationPlan,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useAuthStore } from '@/auth/useAuthStore';
import { useWorkspaceExecutionSourceNavigation } from '@/editor/features/execution';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { ApiError } from '@/infra/api';
import {
  createVerificationEvidenceClient,
  type VerificationEvidenceClient,
} from './verificationEvidenceClient';
import type {
  VerificationEvidenceComparison,
  VerificationEvidenceTransportRecord,
} from './verificationEvidenceCodec';
import {
  MAX_PAGE_RECORDS,
  MAX_VERIFIED_VIEW_RECORDS,
} from './verificationEvidenceCodec.shared';
import {
  buildVerificationEvidenceResourceModel,
  getVerificationArtifactPresentation,
  getVerificationEvidenceSupersessionCandidates,
  resolveVerificationArtifactSourceTrace,
  resolveVerificationEvidenceSourceTraces,
  type VerificationEvidenceProjection,
} from './verificationEvidenceResourceModel';

const MAX_EVIDENCE_RECORDS = MAX_VERIFIED_VIEW_RECORDS;
const MAX_EVIDENCE_PAGES = Math.ceil(MAX_EVIDENCE_RECORDS / MAX_PAGE_RECORDS);

const createVerificationMutationOperationId = (scope: string): string => {
  const nonce =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `web:${scope}:${nonce}`;
};

export const loadVerificationEvidenceProjection = async (input: {
  client: VerificationEvidenceClient;
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
  signal?: AbortSignal;
}): Promise<VerificationEvidenceProjection> => {
  const verifiedEvidenceViewPromise = input.client.getVerifiedEvidenceView({
    workspaceId: input.workspace.id,
    workspaceRevision: input.plan.targetRevision,
    planDigest: input.plan.planDigest,
    signal: input.signal,
  });
  const records: VerificationEvidenceTransportRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < MAX_EVIDENCE_PAGES; pageIndex += 1) {
    const page = await input.client.listEvidence({
      workspaceId: input.workspace.id,
      workspaceRevision: input.plan.targetRevision,
      planDigest: input.plan.planDigest,
      limit: MAX_PAGE_RECORDS,
      ...(cursor ? { cursor } : {}),
      signal: input.signal,
    });
    records.push(...page.records);
    if (records.length > MAX_EVIDENCE_RECORDS) {
      throw new TypeError(
        'Verification Evidence history exceeds the Web projection budget.'
      );
    }
    if (!page.nextCursor) {
      cursor = undefined;
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new TypeError(
        'Verification Evidence pagination repeated a cursor.'
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  if (cursor) {
    throw new TypeError(
      'Verification Evidence pagination exceeds the Web page budget.'
    );
  }
  const evidenceIds = records.map(({ evidence }) => evidence.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new TypeError(
      'Verification Evidence pagination returned duplicate identities.'
    );
  }
  const verifiedEvidenceView = await verifiedEvidenceViewPromise;
  return Object.freeze({
    workspaceId: input.workspace.id,
    workspaceRevision: input.plan.targetRevision,
    partitionRevisions: input.plan.targetPartitionRevisions,
    planDigest: input.plan.planDigest,
    records: Object.freeze(records),
    verifiedEvidenceView,
    loadedAt: Date.now(),
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Verification Evidence failed.';

const copyBytes = (contents: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(contents.byteLength);
  copy.set(contents);
  return copy.buffer;
};

type VerificationArtifactPreview =
  | Readonly<{
      artifactId: string;
      path: string;
      mediaType: string;
      kind: 'text';
      text: string;
    }>
  | Readonly<{
      artifactId: string;
      path: string;
      mediaType: 'image/jpeg' | 'image/png';
      kind: 'raster';
      objectUrl: string;
    }>;

const outcomeTone = (outcome: string): string => {
  if (outcome === 'passed') return 'text-emerald-700';
  if (outcome === 'failed' || outcome === 'infrastructure-error') {
    return 'text-red-700';
  }
  return 'text-amber-700';
};

export function VerificationEvidencePanel({
  workspace,
  plan,
}: Readonly<{
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
}>) {
  const { t } = useTranslation('editor');
  const token = useAuthStore((state) => state.token);
  const projection = useEditorStore(
    (state) => state.verificationEvidenceProjectionByWorkspaceId[workspace.id]
  );
  const setProjection = useEditorStore(
    (state) => state.setVerificationEvidenceProjection
  );
  const clearProjection = useEditorStore(
    (state) => state.clearVerificationEvidenceProjection
  );
  const client = useMemo(
    () =>
      token
        ? createVerificationEvidenceClient({ accessToken: token })
        : undefined,
    [token]
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [reloadSequence, setReloadSequence] = useState(0);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
  const [comparison, setComparison] =
    useState<VerificationEvidenceComparison>();
  const [supersedeTargetEvidenceId, setSupersedeTargetEvidenceId] =
    useState('');
  const [supersedeReason, setSupersedeReason] = useState('');
  const [supersedeReview, setSupersedeReview] = useState<
    Readonly<{
      targetEvidenceId: string;
      reason: string;
      operationId: string;
    }>
  >();
  const [externalRef, setExternalRef] = useState(
    `change:${workspace.workspaceRev}`
  );
  const [deleteReason, setDeleteReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>();
  const [artifactPreview, setArtifactPreview] =
    useState<VerificationArtifactPreview>();
  const [sourceNavigationFailure, setSourceNavigationFailure] = useState<
    'snapshot-stale' | 'source-unavailable'
  >();

  const localOnly = isLocalProjectId(workspace.id);
  const sourceNavigation = useWorkspaceExecutionSourceNavigation({
    workspace,
    originSurface: 'resources',
  });

  useEffect(() => {
    if (localOnly || !client) {
      clearProjection(workspace.id);
      setLoading(false);
      setLoadError(undefined);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(undefined);
    void loadVerificationEvidenceProjection({
      client,
      workspace,
      plan,
      signal: controller.signal,
    })
      .then((next) => {
        if (!active) return;
        setProjection(workspace.id, next);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    clearProjection,
    client,
    localOnly,
    plan,
    reloadSequence,
    setProjection,
    workspace,
  ]);

  const model = useMemo(
    () => buildVerificationEvidenceResourceModel(workspace, plan, projection),
    [plan, projection, workspace]
  );
  const selectedRecord =
    model.status === 'ready'
      ? (model.records.find(
          ({ evidence }) => evidence.id === selectedEvidenceId
        ) ?? model.records[model.records.length - 1])
      : undefined;
  const selectedSourceTraces = selectedRecord
    ? resolveVerificationEvidenceSourceTraces(selectedRecord, workspace, plan)
    : undefined;
  const supersessionCandidates =
    model.status === 'ready' && selectedRecord
      ? getVerificationEvidenceSupersessionCandidates(
          selectedRecord,
          model.records
        )
      : [];

  useEffect(() => {
    if (selectedRecord && selectedEvidenceId !== selectedRecord.evidence.id) {
      setSelectedEvidenceId(selectedRecord.evidence.id);
    }
  }, [selectedEvidenceId, selectedRecord]);

  useEffect(() => {
    setComparison(undefined);
    setSupersedeTargetEvidenceId('');
    setSupersedeReason('');
    setSupersedeReview(undefined);
    setConfirmDelete(false);
    setDeleteReason('');
    setActionMessage(undefined);
    setArtifactPreview(undefined);
  }, [selectedEvidenceId]);

  useEffect(
    () => () => {
      if (artifactPreview?.kind === 'raster') {
        URL.revokeObjectURL(artifactPreview.objectUrl);
      }
    },
    [artifactPreview]
  );

  useEffect(() => {
    setSourceNavigationFailure(undefined);
  }, [selectedRecord?.evidence.id]);

  const executeAction = async (
    action: () => Promise<void>,
    successMessage: string,
    reload = true
  ): Promise<boolean> => {
    if (actionPending) return false;
    setActionPending(true);
    setActionMessage(undefined);
    try {
      await action();
      setActionMessage(successMessage);
      if (reload) setReloadSequence((current) => current + 1);
      return true;
    } catch (error) {
      setActionMessage(
        error instanceof ApiError && error.code === 'VER-5002'
          ? t('resourceManager.verification.evidence.feedback.securityRejected')
          : errorMessage(error)
      );
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const compareWith = (otherEvidenceId: string) => {
    if (!client || !selectedRecord) return;
    void executeAction(
      async () => {
        const result = await client.compareEvidence({
          workspaceId: workspace.id,
          evidenceId: selectedRecord.evidence.id,
          otherEvidenceId,
        });
        setComparison(result);
      },
      t('resourceManager.verification.evidence.feedback.compared'),
      false
    );
  };

  const protectRetention = (kind: 'change' | 'release') => {
    if (!client || !selectedRecord || !externalRef.trim()) return;
    const operationId = createVerificationMutationOperationId(
      `retention-protect-${kind}`
    );
    void executeAction(async () => {
      await client.updateRetention({
        workspaceId: workspace.id,
        evidenceId: selectedRecord.evidence.id,
        action: 'protect',
        kind,
        externalRef,
        operationId,
      });
    }, t('resourceManager.verification.evidence.feedback.protected'));
  };

  const reviewSupersession = (): void => {
    if (
      !supersedeTargetEvidenceId ||
      !supersedeReason.trim() ||
      !supersessionCandidates.some(
        ({ evidence }) => evidence.id === supersedeTargetEvidenceId
      )
    ) {
      return;
    }
    setSupersedeReview(
      Object.freeze({
        targetEvidenceId: supersedeTargetEvidenceId,
        reason: supersedeReason.trim(),
        operationId:
          createVerificationMutationOperationId('evidence-supersede'),
      })
    );
  };

  const supersedeEvidence = (): void => {
    if (
      !client ||
      !selectedRecord ||
      !supersedeReview ||
      !supersessionCandidates.some(
        ({ evidence }) => evidence.id === supersedeReview.targetEvidenceId
      )
    ) {
      return;
    }
    void (async () => {
      const succeeded = await executeAction(
        () =>
          client.supersedeEvidence({
            workspaceId: workspace.id,
            evidenceId: selectedRecord.evidence.id,
            newEvidenceId: supersedeReview.targetEvidenceId,
            reason: supersedeReview.reason,
            operationId: supersedeReview.operationId,
          }),
        t('resourceManager.verification.evidence.feedback.superseded')
      );
      if (!succeeded) return;
      setSupersedeReview(undefined);
      setSupersedeTargetEvidenceId('');
      setSupersedeReason('');
    })();
  };

  const releaseRetention = (
    protection: VerificationEvidenceRetentionProtection
  ) => {
    const kind = protection.kind;
    if (!client || !selectedRecord || kind === 'legal-hold') {
      return;
    }
    const operationId =
      createVerificationMutationOperationId('retention-release');
    void executeAction(async () => {
      await client.updateRetention({
        workspaceId: workspace.id,
        evidenceId: selectedRecord.evidence.id,
        action: 'release',
        kind,
        externalRef: protection.externalRef,
        protectionId: protection.id,
        expectedVersion: protection.version,
        operationId,
      });
    }, t('resourceManager.verification.evidence.feedback.released'));
  };

  const tombstone = () => {
    if (!client || !selectedRecord || !deleteReason.trim()) return;
    const operationId =
      createVerificationMutationOperationId('evidence-tombstone');
    void executeAction(
      () =>
        client.tombstoneEvidence({
          workspaceId: workspace.id,
          evidenceId: selectedRecord.evidence.id,
          reason: deleteReason,
          operationId,
        }),
      t('resourceManager.verification.evidence.feedback.tombstoned')
    );
    setConfirmDelete(false);
  };

  const downloadArtifact = (
    artifact: VerificationEvidenceTransportRecord['artifacts'][number]
  ) => {
    if (!client || !selectedRecord) return;
    void executeAction(
      async () => {
        const downloaded = await client.downloadArtifact({
          workspaceId: workspace.id,
          evidenceId: selectedRecord.evidence.id,
          artifact,
        });
        const url = URL.createObjectURL(
          new Blob([copyBytes(downloaded.contents)], {
            type: downloaded.mediaType,
          })
        );
        try {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = downloaded.fileName;
          anchor.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      t('resourceManager.verification.evidence.feedback.downloaded'),
      false
    );
  };

  const previewArtifact = (
    artifact: VerificationEvidenceTransportRecord['artifacts'][number]
  ) => {
    if (!client || !selectedRecord) return;
    const presentation = getVerificationArtifactPresentation(artifact);
    if (presentation === 'attachment-only') return;
    void executeAction(
      async () => {
        const downloaded = await client.downloadArtifact({
          workspaceId: workspace.id,
          evidenceId: selectedRecord.evidence.id,
          artifact,
        });
        if (presentation === 'text-preview') {
          if (
            downloaded.mediaType !== 'text/plain' &&
            !isVerificationArtifactJsonMediaType(downloaded.mediaType)
          ) {
            throw new TypeError(
              'Verification Evidence text preview media type drifted.'
            );
          }
          const text = new TextDecoder('utf-8', { fatal: true }).decode(
            downloaded.contents
          );
          if (text.includes('\0')) {
            throw new TypeError(
              'Verification Evidence text preview contains invalid text.'
            );
          }
          if (isVerificationArtifactJsonMediaType(downloaded.mediaType)) {
            const parsed: unknown = JSON.parse(text);
            if (!isVerificationStructuredArtifactKind(artifact.kind)) {
              throw new TypeError(
                'Verification Evidence structured artifact kind drifted.'
              );
            }
            const envelope = decodeVerificationArtifactEnvelope(
              parsed,
              artifact.kind,
              artifact.sourceTraceDigest
                ? { expectedSourceTraceDigest: artifact.sourceTraceDigest }
                : {}
            );
            if (envelope.ok === false) {
              throw new TypeError(
                'Verification Evidence structured artifact envelope drifted.'
              );
            }
          }
          setArtifactPreview(
            Object.freeze({
              artifactId: artifact.id,
              path: artifact.path,
              mediaType: downloaded.mediaType,
              kind: 'text',
              text,
            })
          );
          return;
        }
        if (
          downloaded.mediaType !== 'image/png' &&
          downloaded.mediaType !== 'image/jpeg'
        ) {
          throw new TypeError(
            'Verification Evidence raster preview media type drifted.'
          );
        }
        setArtifactPreview(
          Object.freeze({
            artifactId: artifact.id,
            path: artifact.path,
            mediaType: downloaded.mediaType,
            kind: 'raster',
            objectUrl: URL.createObjectURL(
              new Blob([copyBytes(downloaded.contents)], {
                type: downloaded.mediaType,
              })
            ),
          })
        );
      },
      t('resourceManager.verification.evidence.feedback.previewed'),
      false
    );
  };

  const openSourceTrace = (
    sourceTrace: VerificationEvidenceTransportRecord['evidence']['sourceTraces'][number]
  ): void => {
    if (!selectedRecord || selectedSourceTraces?.status !== 'ready') {
      setSourceNavigationFailure('source-unavailable');
      return;
    }
    const result = sourceNavigation.openSourceTrace({
      jobId:
        selectedRecord.evidence.run.jobId ?? selectedRecord.evidence.run.runId,
      providerId: selectedRecord.evidence.run.providerId,
      snapshotId: selectedSourceTraces.snapshotId,
      sourceTrace,
    });
    setSourceNavigationFailure(
      result.status === 'unavailable' ? result.reason : undefined
    );
  };

  if (localOnly || !token) {
    return (
      <article className="rounded-2xl border border-dashed border-black/12 p-5">
        <h3 className="inline-flex items-center gap-2 text-sm font-medium">
          <History size={15} />
          {t('resourceManager.verification.evidence.title')}
        </h3>
        <p className="mt-2 text-sm text-(--text-muted)">
          {t(
            localOnly
              ? 'resourceManager.verification.evidence.localUnavailable'
              : 'resourceManager.verification.evidence.authRequired'
          )}
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-medium text-(--text-primary)">
            <History size={15} />
            {t('resourceManager.verification.evidence.title')}
          </h3>
          <p className="mt-1 text-xs text-(--text-secondary)">
            {t('resourceManager.verification.evidence.description')}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setReloadSequence((current) => current + 1)}
          className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
        >
          {loading
            ? t('resourceManager.verification.evidence.loading')
            : t('resourceManager.verification.evidence.reload')}
        </button>
      </div>

      {loadError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}
      {!loadError && model.status !== 'ready' ? (
        <p role="status" className="mt-3 text-sm text-(--text-muted)">
          {loading
            ? t('resourceManager.verification.evidence.loading')
            : model.message}
        </p>
      ) : null}

      {model.status === 'ready' ? (
        <>
          <section className="mt-4 rounded-xl border border-black/8 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="inline-flex items-center gap-2 text-sm font-medium">
                <BadgeCheck size={14} />
                {t(
                  'resourceManager.verification.evidence.verifiedEvidenceView'
                )}
              </h4>
              <span className="text-xs text-(--text-muted)">
                {model.verifiedEvidenceView.records.length}{' '}
                {t('resourceManager.verification.evidence.records')}
              </span>
            </div>
            <p className="mt-2 text-xs text-(--text-secondary)">
              {model.verifiedEvidenceView.closureEvaluationInstant}
            </p>
            <span className="mt-2 block text-xs text-(--text-muted)">
              {t('resourceManager.verification.evidence.verifiedViewDigest')}
            </span>
            <code className="mt-2 block text-xs break-all">
              {model.verifiedEvidenceView.viewDigest}
            </code>
            <code className="mt-1 block text-xs break-all text-(--text-muted)">
              {model.verifiedEvidenceView.revocationRecordDigest}
            </code>
          </section>

          <section className="mt-4 rounded-xl border border-black/8 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
                {t('resourceManager.verification.evidence.closure')}
              </h4>
              <span className="rounded-full border border-black/10 px-2 py-1 text-xs">
                {model.closure.verdict}
              </span>
            </div>
            <code className="mt-2 block text-xs break-all">
              {model.closure.closureDigest}
            </code>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {Object.entries(model.closure.cellStatuses).map(
                ([cellId, status]) => (
                  <div key={cellId}>
                    <dt className="text-(--text-muted)">{cellId}</dt>
                    <dd>{status}</dd>
                  </div>
                )
              )}
            </dl>
            {model.closure.issues.length ? (
              <ul className="mt-3 grid gap-1 text-xs text-(--text-secondary)">
                {model.closure.issues.map((issue, index) => (
                  <li
                    key={`${issue.cellId ?? 'closure'}-${issue.status}-${index}`}
                  >
                    {issue.cellId ? `${issue.cellId} · ` : ''}
                    {issue.status} · {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {model.timelines.length ? (
            <div className="mt-4 grid gap-3">
              {model.timelines.map((timeline) => (
                <section
                  key={timeline.cellId}
                  className="rounded-xl border border-black/8 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-medium">
                        {timeline.checkId}
                      </h4>
                      <code className="text-xs text-(--text-muted)">
                        {timeline.cellId}
                      </code>
                    </div>
                    <div className="text-right text-xs">
                      <span className="block font-medium">
                        {timeline.status}
                      </span>
                      <span className="text-(--text-muted)">
                        {timeline.records.length}{' '}
                        {t('resourceManager.verification.evidence.attempts')}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {timeline.records.map((record) => (
                      <button
                        key={record.evidence.id}
                        type="button"
                        aria-pressed={
                          selectedRecord?.evidence.id === record.evidence.id
                        }
                        onClick={() =>
                          setSelectedEvidenceId(record.evidence.id)
                        }
                        className={`rounded-lg border px-3 py-2 text-left text-xs ${
                          selectedRecord?.evidence.id === record.evidence.id
                            ? 'border-black bg-black text-white'
                            : 'border-black/10'
                        }`}
                      >
                        <span className="block font-medium">
                          {record.evidence.attemptId}
                        </span>
                        <span
                          className={
                            selectedRecord?.evidence.id === record.evidence.id
                              ? 'text-white/75'
                              : outcomeTone(record.evidence.result.outcome)
                          }
                        >
                          {record.evidence.result.outcome}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-(--text-muted)">
              {t('resourceManager.verification.evidence.empty')}
            </p>
          )}

          {selectedRecord ? (
            <section className="mt-4 grid gap-4 rounded-xl border border-black/8 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium">
                    {selectedRecord.evidence.attemptId}
                  </h4>
                  <p
                    className={`mt-1 text-xs ${outcomeTone(
                      selectedRecord.evidence.result.outcome
                    )}`}
                  >
                    {selectedRecord.evidence.result.outcome} ·{' '}
                    {selectedRecord.verifiedView.trustStatus} ·{' '}
                    {selectedRecord.verifiedView.retentionState}
                  </p>
                </div>
                <span
                  aria-label={t(
                    'resourceManager.verification.evidence.trustAccessible',
                    {
                      trust: selectedRecord.verifiedView.effectiveTrust,
                      status: selectedRecord.verifiedView.trustStatus,
                    }
                  )}
                  className="rounded-full border border-black/10 px-2 py-1 text-xs"
                >
                  {selectedRecord.verifiedView.effectiveTrust}
                </span>
              </div>

              <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.evidence.provider')}
                  </dt>
                  <dd>{selectedRecord.evidence.run.providerId}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.evidence.completed')}
                  </dt>
                  <dd>{selectedRecord.evidence.timing.completedAt}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.evidence.retention')}
                  </dt>
                  <dd>
                    {selectedRecord.evidence.retention} ·{' '}
                    {selectedRecord.verifiedView.retentionState}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.evidence.attestation')}
                  </dt>
                  <dd
                    aria-label={t(
                      'resourceManager.verification.evidence.attestationAccessible',
                      {
                        trust: selectedRecord.verifiedView.effectiveTrust,
                        status: selectedRecord.verifiedView.trustStatus,
                      }
                    )}
                  >
                    {selectedRecord.verifiedView.trustStatus === 'verified' &&
                    selectedRecord.verifiedView.attestationDigest
                      ? t('resourceManager.verification.evidence.verified')
                      : t('resourceManager.verification.evidence.unattested')}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-xs font-medium">
                  {t('resourceManager.verification.evidence.identity')}
                </p>
                <code className="mt-1 block text-xs break-all">
                  {selectedRecord.evidence.manifestDigest}
                </code>
                <span className="mt-2 block text-xs text-(--text-muted)">
                  {t(
                    'resourceManager.verification.evidence.materializedEvidence'
                  )}
                </span>
                <code className="mt-1 block text-xs break-all text-(--text-muted)">
                  {selectedRecord.verifiedView.materializedEvidenceDigest}
                </code>
                <code className="mt-1 block text-xs break-all text-(--text-muted)">
                  {selectedRecord.verifiedView.recordDigest}
                </code>
              </div>

              <div>
                <p className="text-xs font-medium">
                  {t('resourceManager.verification.evidence.sourceTrace')}
                </p>
                <code className="mt-1 block text-xs break-all text-(--text-muted)">
                  {selectedRecord.evidence.sourceTraceDigest}
                </code>
                {selectedSourceTraces?.status === 'ready' ? (
                  <ul className="mt-2 grid gap-2">
                    {selectedSourceTraces.sourceTraces.map(
                      (sourceTrace, index) => (
                        <li
                          key={`${selectedRecord.evidence.sourceTraceDigest}:${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/8 px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 break-all text-(--text-secondary)">
                            {sourceTrace.label ?? sourceTrace.sourceRef.kind}
                          </span>
                          <button
                            type="button"
                            onClick={() => openSourceTrace(sourceTrace)}
                            className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 text-xs"
                          >
                            <LocateFixed size={13} />
                            {t(
                              'resourceManager.verification.evidence.openSourceTrace'
                            )}
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {t(
                      `resourceManager.verification.evidence.sourceTraceStatus.${
                        selectedSourceTraces?.reason ?? 'source-unavailable'
                      }`
                    )}
                  </p>
                )}
                {sourceNavigationFailure ? (
                  <p role="alert" className="mt-1 text-xs text-red-700">
                    {t(
                      `resourceManager.verification.evidence.sourceTraceStatus.${sourceNavigationFailure}`
                    )}
                  </p>
                ) : null}
              </div>

              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  {t('resourceManager.verification.evidence.resultSummary')}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/4 p-3 text-xs">
                  {JSON.stringify(
                    selectedRecord.evidence.result.summary,
                    null,
                    2
                  )}
                </pre>
              </details>

              <section>
                <h5 className="text-xs font-medium">
                  {t('resourceManager.verification.evidence.artifacts')}
                </h5>
                {selectedRecord.artifacts.length ? (
                  <ul className="mt-2 grid gap-2">
                    {selectedRecord.artifacts.map((artifact) => {
                      const artifactSourceTrace =
                        selectedSourceTraces?.status === 'ready'
                          ? resolveVerificationArtifactSourceTrace(
                              artifact,
                              selectedSourceTraces.sourceTraces
                            )
                          : undefined;
                      return (
                        <li
                          key={artifact.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/8 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {artifact.path}
                            </p>
                            <p className="text-(--text-muted)">
                              {artifact.kind} · {artifact.mediaType} ·{' '}
                              {artifact.availability} ·{' '}
                              {getVerificationArtifactPresentation(artifact)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {artifactSourceTrace ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openSourceTrace(artifactSourceTrace)
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2"
                              >
                                <LocateFixed size={13} />
                                {t(
                                  'resourceManager.verification.evidence.openArtifactSourceTrace'
                                )}
                              </button>
                            ) : null}
                            {getVerificationArtifactPresentation(artifact) !==
                            'attachment-only' ? (
                              <button
                                type="button"
                                disabled={
                                  actionPending ||
                                  artifact.availability !== 'available'
                                }
                                onClick={() => previewArtifact(artifact)}
                                className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 disabled:opacity-40"
                              >
                                <Eye size={13} />
                                {t(
                                  'resourceManager.verification.evidence.preview'
                                )}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={
                                actionPending ||
                                artifact.availability !== 'available'
                              }
                              onClick={() => downloadArtifact(artifact)}
                              className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 disabled:opacity-40"
                            >
                              <Download size={13} />
                              {t(
                                'resourceManager.verification.evidence.download'
                              )}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-(--text-muted)">
                    {t('resourceManager.verification.evidence.noArtifacts')}
                  </p>
                )}
                {artifactPreview ? (
                  <section
                    aria-label={t(
                      'resourceManager.verification.evidence.artifactPreview'
                    )}
                    className="mt-3 rounded-lg border border-black/8 bg-black/2 p-3"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <p className="min-w-0 truncate font-medium">
                        {artifactPreview.path} · {artifactPreview.mediaType}
                      </p>
                      <button
                        type="button"
                        onClick={() => setArtifactPreview(undefined)}
                        className="shrink-0 rounded-lg border border-black/12 px-3 py-1.5"
                      >
                        {t(
                          'resourceManager.verification.evidence.closePreview'
                        )}
                      </button>
                    </div>
                    {artifactPreview.kind === 'text' ? (
                      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-white p-3 text-xs break-words whitespace-pre-wrap">
                        {artifactPreview.text}
                      </pre>
                    ) : (
                      <img
                        src={artifactPreview.objectUrl}
                        alt={t(
                          'resourceManager.verification.evidence.rasterPreviewAlt',
                          { path: artifactPreview.path }
                        )}
                        decoding="async"
                        draggable={false}
                        referrerPolicy="no-referrer"
                        className="mt-3 max-h-96 max-w-full rounded-lg border border-black/8 bg-white object-contain"
                      />
                    )}
                  </section>
                ) : null}
              </section>

              <section>
                <h5 className="inline-flex items-center gap-2 text-xs font-medium">
                  <GitCompare size={13} />
                  {t('resourceManager.verification.evidence.compare')}
                </h5>
                <div className="mt-2 flex flex-wrap gap-2">
                  {model.records
                    .filter(
                      (record) =>
                        record.evidence.cellId ===
                          selectedRecord.evidence.cellId &&
                        record.evidence.id !== selectedRecord.evidence.id
                    )
                    .map((record) => (
                      <button
                        key={record.evidence.id}
                        type="button"
                        disabled={actionPending}
                        onClick={() => compareWith(record.evidence.id)}
                        className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                      >
                        {record.evidence.attemptId}
                      </button>
                    ))}
                </div>
                {comparison ? (
                  <div className="mt-3 rounded-lg bg-black/4 p-3 text-xs">
                    <p className="font-medium">{comparison.compatibility}</p>
                    {comparison.mismatchFields.map((field) => (
                      <p key={field} className="mt-1 break-all">
                        {field}
                      </p>
                    ))}
                    <code className="mt-2 block break-all text-(--text-muted)">
                      {comparison.comparisonDigest}
                    </code>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-black/8 p-3">
                <h5 className="inline-flex items-center gap-2 text-xs font-medium">
                  <History size={13} />
                  {t('resourceManager.verification.evidence.supersede')}
                </h5>
                {supersedeReview ? (
                  <div className="mt-2 grid gap-2 text-xs">
                    <p className="font-medium">
                      {t(
                        'resourceManager.verification.evidence.supersedeConfirmation',
                        {
                          source: selectedRecord.evidence.attemptId,
                          target:
                            supersessionCandidates.find(
                              ({ evidence }) =>
                                evidence.id === supersedeReview.targetEvidenceId
                            )?.evidence.attemptId ??
                            supersedeReview.targetEvidenceId,
                        }
                      )}
                    </p>
                    <p className="break-words text-(--text-secondary)">
                      {supersedeReview.reason}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionPending}
                        onClick={supersedeEvidence}
                        className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-40"
                      >
                        {t(
                          'resourceManager.verification.evidence.confirmSupersede'
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={actionPending}
                        onClick={() => setSupersedeReview(undefined)}
                        className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                      >
                        {t(
                          'resourceManager.verification.evidence.cancelSupersede'
                        )}
                      </button>
                    </div>
                  </div>
                ) : supersessionCandidates.length ? (
                  <div className="mt-2 grid gap-2">
                    <label className="grid gap-1 text-xs text-(--text-secondary)">
                      {t(
                        'resourceManager.verification.evidence.supersedeTarget'
                      )}
                      <select
                        value={supersedeTargetEvidenceId}
                        onChange={(event) =>
                          setSupersedeTargetEvidenceId(event.target.value)
                        }
                        className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
                      >
                        <option value="">
                          {t(
                            'resourceManager.verification.evidence.supersedeTargetPlaceholder'
                          )}
                        </option>
                        {supersessionCandidates.map(({ evidence }) => (
                          <option key={evidence.id} value={evidence.id}>
                            {evidence.attemptId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-(--text-secondary)">
                      {t(
                        'resourceManager.verification.evidence.supersedeReason'
                      )}
                      <input
                        value={supersedeReason}
                        maxLength={512}
                        onChange={(event) =>
                          setSupersedeReason(event.target.value)
                        }
                        className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        actionPending ||
                        !supersedeTargetEvidenceId ||
                        !supersedeReason.trim()
                      }
                      onClick={reviewSupersession}
                      className="w-fit rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                    >
                      {t(
                        'resourceManager.verification.evidence.reviewSupersede'
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-(--text-muted)">
                    {t(
                      'resourceManager.verification.evidence.noSupersessionCandidates'
                    )}
                  </p>
                )}
              </section>

              <section>
                <h5 className="inline-flex items-center gap-2 text-xs font-medium">
                  <Archive size={13} />
                  {t('resourceManager.verification.evidence.retentionActions')}
                </h5>
                {selectedRecord.activeProtections.length ? (
                  <ul
                    aria-label={t(
                      'resourceManager.verification.evidence.activeProtections'
                    )}
                    className="mt-2 grid gap-2"
                  >
                    {selectedRecord.activeProtections.map(
                      (activeProtection) => (
                        <li
                          key={activeProtection.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/8 px-3 py-2 text-xs"
                        >
                          <span className="break-all text-(--text-secondary)">
                            {activeProtection.kind} ·{' '}
                            {activeProtection.externalRef} · v
                            {activeProtection.version}
                          </span>
                          {activeProtection.kind === 'legal-hold' ? (
                            <span className="text-(--text-muted)">
                              {t(
                                'resourceManager.verification.evidence.legalHoldReadOnly'
                              )}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={actionPending}
                              onClick={() => releaseRetention(activeProtection)}
                              className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                            >
                              {t(
                                'resourceManager.verification.evidence.release'
                              )}
                            </button>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-(--text-muted)">
                    {t(
                      'resourceManager.verification.evidence.noActiveProtections'
                    )}
                  </p>
                )}
                <label className="mt-2 grid gap-1 text-xs text-(--text-secondary)">
                  {t('resourceManager.verification.evidence.externalRef')}
                  <input
                    value={externalRef}
                    maxLength={512}
                    onChange={(event) => setExternalRef(event.target.value)}
                    className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionPending || !externalRef.trim()}
                    onClick={() => protectRetention('change')}
                    className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                  >
                    {t('resourceManager.verification.evidence.protectChange')}
                  </button>
                  <button
                    type="button"
                    disabled={actionPending || !externalRef.trim()}
                    onClick={() => protectRetention('release')}
                    className="rounded-lg border border-black/12 px-3 py-2 text-xs disabled:opacity-40"
                  >
                    {t('resourceManager.verification.evidence.protectRelease')}
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-red-200 bg-red-50 p-3">
                <h5 className="inline-flex items-center gap-2 text-xs font-medium text-red-900">
                  <Trash2 size={13} />
                  {t('resourceManager.verification.evidence.tombstone')}
                </h5>
                {!confirmDelete ? (
                  <button
                    type="button"
                    disabled={
                      actionPending ||
                      selectedRecord.verifiedView.retentionState !== 'active'
                    }
                    onClick={() => setConfirmDelete(true)}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-2 text-xs text-red-900 disabled:opacity-40"
                  >
                    {t('resourceManager.verification.evidence.reviewDelete')}
                  </button>
                ) : (
                  <div className="mt-2 grid gap-2">
                    <label className="grid gap-1 text-xs text-red-900">
                      {t('resourceManager.verification.evidence.deleteReason')}
                      <input
                        value={deleteReason}
                        maxLength={512}
                        onChange={(event) =>
                          setDeleteReason(event.target.value)
                        }
                        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-950"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={actionPending || !deleteReason.trim()}
                        onClick={tombstone}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-800 px-3 py-2 text-xs text-white disabled:opacity-40"
                      >
                        <ShieldAlert size={13} />
                        {t(
                          'resourceManager.verification.evidence.confirmDelete'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-900"
                      >
                        {t(
                          'resourceManager.verification.evidence.cancelDelete'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {actionMessage ? (
                <p role="status" className="text-xs text-(--text-secondary)">
                  {actionMessage}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
