import { describe, expect, it, vi } from 'vitest';
import {
  closeCodeAuthoringOverlay,
  useCodeAuthoringOverlayStore,
} from '@/editor/features/code';
import {
  createWorkspaceExecutionSnapshotId,
  openWorkspaceExecutionSourceTrace,
} from '@/editor/features/execution';
import { navigateToWorkspaceSemanticTarget } from '@/editor/navigation';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  buildVerificationEvidenceResourceModel,
  getVerificationEvidenceSupersessionCandidates,
  getVerificationArtifactPresentation,
  resolveVerificationArtifactSourceTrace,
  resolveVerificationEvidenceSourceTraces,
  type VerificationEvidenceProjection,
} from './verificationEvidenceResourceModel';
import { decodeVerificationEvidenceVerifiedView } from './verificationEvidenceCodec';
import {
  createPlanFixture,
  createVerifiedEvidenceViewPayload,
  createWorkspaceFixture,
  decodeEvidenceRecordFixture,
  evidenceDigest,
  evidencePartitionRevisions,
} from './__tests__/verificationEvidence.fixture';

const projectionFor = (
  records: readonly ReturnType<typeof decodeEvidenceRecordFixture>[]
): VerificationEvidenceProjection => ({
  workspaceId: 'workspace-a',
  workspaceRevision: 7,
  partitionRevisions: evidencePartitionRevisions,
  planDigest: records[0]?.evidence.planDigest ?? '',
  records,
  verifiedEvidenceView: decodeVerificationEvidenceVerifiedView(
    createVerifiedEvidenceViewPayload(records)
  ),
  loadedAt: 1,
});

describe('Verification Evidence resource model', () => {
  it('offers only a later active attempt in the canonical Backend lineage', () => {
    const failed = decodeEvidenceRecordFixture({
      evidenceId: 'evidence-failed',
      attemptId: 'attempt-failed',
      outcome: 'failed',
      completedAt: '2026-07-28T01:00:02Z',
    });
    const passed = decodeEvidenceRecordFixture({
      evidenceId: 'evidence-passed',
      attemptId: 'attempt-passed',
      outcome: 'passed',
      completedAt: '2026-07-28T01:00:03Z',
    });
    const otherCell = {
      ...passed,
      evidence: { ...passed.evidence, id: 'evidence-other', cellId: 'cell-b' },
    };
    const otherWorkspace = {
      ...passed,
      evidence: {
        ...passed.evidence,
        id: 'evidence-other-workspace',
        workspaceId: 'workspace-b',
      },
    };
    const otherProject = {
      ...passed,
      evidence: {
        ...passed.evidence,
        id: 'evidence-other-project',
        projectId: 'project-b',
      },
    };
    const otherTarget = {
      ...passed,
      evidence: {
        ...passed.evidence,
        id: 'evidence-other-target',
        targetId: 'target-b',
      },
    };
    const otherCheckKind = {
      ...passed,
      evidence: {
        ...passed.evidence,
        id: 'evidence-other-kind',
        checkKind: 'visual' as const,
      },
    };

    expect(
      getVerificationEvidenceSupersessionCandidates(failed, [
        failed,
        passed,
        otherCell,
        otherWorkspace,
        otherProject,
        otherTarget,
        otherCheckKind,
      ]).map(({ evidence }) => evidence.id)
    ).toEqual(['evidence-passed', 'evidence-other', 'evidence-other-project']);
    expect(
      getVerificationEvidenceSupersessionCandidates(passed, [failed, passed])
    ).toEqual([]);

    const tombstonedSource = {
      ...failed,
      verifiedView: {
        ...failed.verifiedView,
        retentionState: 'tombstoned' as const,
        tombstoneDigest: evidenceDigest('1'),
      },
    };
    expect(
      getVerificationEvidenceSupersessionCandidates(tombstonedSource, [
        tombstonedSource,
        passed,
      ])
    ).toEqual([]);
  });

  it('preserves failed and passed attempts in deterministic cell timelines', () => {
    const failed = decodeEvidenceRecordFixture({
      evidenceId: 'evidence-failed',
      attemptId: 'attempt-failed',
      outcome: 'failed',
      completedAt: '2026-07-28T01:00:02Z',
    });
    const passed = decodeEvidenceRecordFixture({
      evidenceId: 'evidence-passed',
      attemptId: 'attempt-passed',
      outcome: 'passed',
      completedAt: '2026-07-28T01:00:03Z',
    });

    const model = buildVerificationEvidenceResourceModel(
      createWorkspaceFixture(),
      createPlanFixture(),
      projectionFor([passed, failed])
    );

    expect(model.status).toBe('ready');
    if (model.status !== 'ready') return;
    expect(
      model.timelines[0]?.records.map(({ evidence }) => evidence.result.outcome)
    ).toEqual(['failed', 'passed']);
    expect(model.timelines[0]?.status).toBe('unstable');
    expect(model.closure).toMatchObject({
      verdict: 'unsatisfied',
      cellStatuses: { 'cell-a': 'unstable' },
    });
    expect(model.closure.closureDigest).not.toBe(
      model.verifiedEvidenceView.viewDigest
    );
  });

  it.each([
    ['expired', { trustStatus: 'expired' as const }],
    ['revoked', { trustStatus: 'revoked' as const }],
    ['tombstoned', { retentionState: 'tombstoned' as const }],
  ])('derives %s verified-view Evidence as stale', (_label, viewState) => {
    const record = decodeEvidenceRecordFixture(viewState);
    const model = buildVerificationEvidenceResourceModel(
      createWorkspaceFixture(),
      createPlanFixture(),
      projectionFor([record])
    );

    expect(model.status).toBe('ready');
    if (model.status !== 'ready') return;
    expect(model.timelines[0]?.status).toBe('stale');
    expect(model.closure.cellStatuses['cell-a']).toBe('stale');
    expect(model.closure.verdict).toBe('stale');
  });

  it('fails closed when a materialized Evidence digest or revision drifts', () => {
    const record = decodeEvidenceRecordFixture();
    const projection = projectionFor([record]);
    const viewRecord = projection.verifiedEvidenceView.records[0]!;
    const drifted: VerificationEvidenceProjection = {
      ...projection,
      verifiedEvidenceView: {
        ...projection.verifiedEvidenceView,
        records: [
          {
            ...viewRecord,
            materializedEvidenceDigest: `sha256-${'0'.repeat(64)}`,
          },
        ],
      },
    };

    expect(
      buildVerificationEvidenceResourceModel(
        createWorkspaceFixture(),
        createPlanFixture(),
        drifted
      ).status
    ).toBe('invalid');

    expect(
      resolveVerificationEvidenceSourceTraces(
        record,
        { ...createWorkspaceFixture(), workspaceRev: 8 },
        createPlanFixture()
      )
    ).toEqual({ status: 'unavailable', reason: 'stale-revision' });
  });

  it('opens persisted exact-current SourceTrace through real semantic navigation', () => {
    const record = decodeEvidenceRecordFixture();
    const workspace = createWorkspaceFixture();
    const resolved = resolveVerificationEvidenceSourceTraces(
      record,
      workspace,
      createPlanFixture()
    );
    expect(resolved).toMatchObject({
      status: 'ready',
      sourceTraces: [
        {
          sourceRef: {
            kind: 'verification-plan-cell',
            planDigest: record.evidence.planDigest,
            cellId: 'cell-a',
          },
        },
      ],
    });
    if (resolved.status !== 'ready') {
      throw new Error('Expected exact-current SourceTrace resolution.');
    }
    const navigate = vi.fn();
    useEditorStore.setState({ workspace });
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId: resolved.snapshotId,
        sourceTrace: resolved.sourceTraces[0]!,
        originSurface: 'resources',
        openSemanticTarget: (sourceTrace) =>
          navigateToWorkspaceSemanticTarget({
            projectId: workspace.id,
            target: {
              kind: 'diagnostic-target',
              targetRef: sourceTrace.sourceRef,
            },
            navigate,
          }).status === 'navigated',
      })
    ).toEqual({ status: 'opened' });
    expect(navigate).toHaveBeenCalledWith('/editor/project/workspace-a/issues');
  });

  it('preserves a persisted SourceSpan and opens its exact CodeArtifact', () => {
    const sourceTrace = {
      sourceRef: {
        kind: 'code-artifact' as const,
        artifactId: 'code-a',
      },
      sourceSpan: {
        artifactId: 'code-a',
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 20,
      },
      label: 'Exact failing expression',
    };
    const record = decodeEvidenceRecordFixture({
      sourceTraces: [sourceTrace],
    });
    const workspace = {
      ...createWorkspaceFixture(),
      docsById: {
        'code-a': {
          id: 'code-a',
          type: 'code' as const,
          path: '/code-a.ts',
          contentRev: 1,
          metaRev: 1,
          content: {
            language: 'ts' as const,
            source: 'export const answer = 42;\n',
          },
        },
      },
    };
    expect(record.evidence.sourceTraces).toEqual([sourceTrace]);
    expect(
      resolveVerificationArtifactSourceTrace(
        record.artifacts[0]!,
        record.evidence.sourceTraces
      )
    ).toEqual(sourceTrace);
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId: createWorkspaceExecutionSnapshotId(workspace),
        sourceTrace: record.evidence.sourceTraces[0]!,
        originSurface: 'resources',
      })
    ).toEqual({ status: 'opened' });
    expect(useCodeAuthoringOverlayStore.getState().request).toMatchObject({
      artifactId: 'code-a',
      sourceSpan: sourceTrace.sourceSpan,
    });
    closeCodeAuthoringOverlay();
  });

  it('allowlists only safe artifact viewers', () => {
    const record = decodeEvidenceRecordFixture();
    const artifact = record.artifacts[0]!;
    expect(getVerificationArtifactPresentation(artifact)).toBe('text-preview');
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'screenshot',
        mediaType: 'image/png',
      })
    ).toBe('raster-preview');
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'visual-diff',
        mediaType: 'image/jpeg',
      })
    ).toBe('raster-preview');
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'accessibility-report',
        mediaType: 'application/vnd.prodivix.accessibility+json',
      })
    ).toBe('text-preview');
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'console-summary',
        mediaType: 'application/json',
      })
    ).toBe('text-preview');
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'console-summary',
        mediaType: 'text/plain',
      })
    ).toBe('attachment-only');
    for (const mediaType of [
      'text/html',
      'image/svg+xml',
      'application/javascript',
      'application/zip',
      'application/pdf',
      'application/octet-stream',
    ]) {
      expect(
        getVerificationArtifactPresentation({ ...artifact, mediaType })
      ).toBe('attachment-only');
    }
    expect(
      getVerificationArtifactPresentation({
        ...artifact,
        kind: 'screenshot',
        mediaType: 'text/plain',
      })
    ).toBe('attachment-only');
  });
});
