import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { digestVerificationValue } from '@prodivix/verification';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { ApiError } from '@/infra/api';
import { decodeVerificationEvidenceVerifiedView } from './verificationEvidenceCodec';
import {
  createPlanFixture,
  createVerifiedEvidenceViewPayload,
  createWorkspaceFixture,
  decodeEvidenceRecordFixture,
} from './__tests__/verificationEvidence.fixture';

const evidenceClient = vi.hoisted(() => ({
  listEvidence: vi.fn(),
  getEvidence: vi.fn(),
  getVerifiedEvidenceView: vi.fn(),
  compareEvidence: vi.fn(),
  supersedeEvidence: vi.fn(),
  updateRetention: vi.fn(),
  tombstoneEvidence: vi.fn(),
  downloadArtifact: vi.fn(),
}));
const authState = vi.hoisted(() => ({ token: 'token-a' as string | null }));
const openSourceTrace = vi.hoisted(() =>
  vi.fn(
    ():
      | { status: 'opened' }
      | {
          status: 'unavailable';
          reason: 'snapshot-stale' | 'source-unavailable';
        } => ({ status: 'opened' })
  )
);

vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown): unknown =>
    selector(authState),
}));

vi.mock('./verificationEvidenceClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./verificationEvidenceClient')>()),
  createVerificationEvidenceClient: () => evidenceClient,
}));

vi.mock('@/editor/features/execution', () => ({
  useWorkspaceExecutionSourceNavigation: () => ({ openSourceTrace }),
}));

import {
  loadVerificationEvidenceProjection,
  VerificationEvidencePanel,
} from './VerificationEvidencePanel';
import { buildVerificationEvidenceResourceModel } from './verificationEvidenceResourceModel';

const createPagedEvidenceRecords = (recordCount: number) => {
  const baseRecord = decodeEvidenceRecordFixture();
  const { recordDigest: _recordDigest, ...verifiedViewTemplate } =
    baseRecord.verifiedView;
  return Array.from({ length: recordCount }, (_, index) => {
    const evidence = Object.freeze({
      ...baseRecord.evidence,
      id: `evidence-${index}`,
      attemptId: `attempt-${index}`,
    });
    const verifiedViewWithoutDigest = Object.freeze({
      ...verifiedViewTemplate,
      evidenceId: evidence.id,
      materializedEvidenceDigest: digestVerificationValue(evidence),
    });
    return Object.freeze({
      ...baseRecord,
      evidence,
      verifiedView: Object.freeze({
        ...verifiedViewWithoutDigest,
        recordDigest: digestVerificationValue(verifiedViewWithoutDigest),
      }),
    });
  });
};

describe('Verification Evidence product slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.token = 'token-a';
    useEditorStore.setState({
      verificationEvidenceProjectionByWorkspaceId: {},
    });
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
      activeProtections: [
        {
          id: 'protection-a',
          evidenceId: 'evidence-passed',
          kind: 'change',
          externalRef: 'change:7',
          active: true,
          version: 1,
        },
      ],
    });
    evidenceClient.listEvidence.mockResolvedValue({
      records: [failed, passed],
    });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([failed, passed])
      )
    );
    evidenceClient.compareEvidence.mockResolvedValue({
      compatibility: 'exact-compatible',
      leftEvidenceId: 'evidence-passed',
      rightEvidenceId: 'evidence-failed',
      mismatchFields: [],
      comparisonDigest: `sha256-${'e'.repeat(64)}`,
    });
    evidenceClient.updateRetention.mockResolvedValue({
      id: 'protection-a',
      evidenceId: 'evidence-passed',
      kind: 'change',
      externalRef: 'change:7',
      active: true,
      version: 1,
    });
    evidenceClient.supersedeEvidence.mockResolvedValue(undefined);
    evidenceClient.tombstoneEvidence.mockResolvedValue(undefined);
    evidenceClient.downloadArtifact.mockResolvedValue({
      contents: new TextEncoder().encode('bounded plain text'),
      fileName: 'build.log',
      mediaType: 'text/plain',
    });
  });

  it('shows exact attempt history, trust, Closure, and guarded lifecycle actions', async () => {
    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    expect(
      (await screen.findAllByText('attempt-failed')).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('passed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('unstable').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'resourceManager.verification.evidence.verifiedEvidenceView'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('resourceManager.verification.evidence.closure')
    ).toBeTruthy();
    expect(screen.getByText('ci-attested')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.openSourceTrace',
      })
    );
    expect(openSourceTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-a',
        providerId: 'provider-a',
        sourceTrace: expect.objectContaining({
          sourceRef: expect.objectContaining({
            kind: 'verification-plan-cell',
            cellId: 'cell-a',
          }),
        }),
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.openArtifactSourceTrace',
      })
    );
    expect(openSourceTrace).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceTrace: expect.objectContaining({
          sourceRef: expect.objectContaining({
            kind: 'verification-plan-cell',
            cellId: 'cell-a',
          }),
        }),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.protectChange',
      })
    );
    await waitFor(() =>
      expect(evidenceClient.updateRetention).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceId: 'evidence-passed',
          action: 'protect',
          kind: 'change',
        })
      )
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.reviewDelete',
      })
    );
    fireEvent.change(
      screen.getByLabelText(
        'resourceManager.verification.evidence.deleteReason'
      ),
      { target: { value: 'superseded after review' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.confirmDelete',
      })
    );
    await waitFor(() =>
      expect(evidenceClient.tombstoneEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceId: 'evidence-passed',
          reason: 'superseded after review',
        })
      )
    );
  });

  it('releases the exact active protection projected by the Backend', async () => {
    evidenceClient.updateRetention.mockResolvedValue(undefined);

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    expect(
      await screen.findByRole('list', {
        name: 'resourceManager.verification.evidence.activeProtections',
      })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.release',
      })
    );

    await waitFor(() =>
      expect(evidenceClient.updateRetention).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-a',
          evidenceId: 'evidence-passed',
          action: 'release',
          kind: 'change',
          externalRef: 'change:7',
          protectionId: 'protection-a',
          expectedVersion: 1,
          operationId: expect.stringMatching(/^web:/),
        })
      )
    );
  });

  it('shows legal holds from the Backend as read-only', async () => {
    const legalHold = decodeEvidenceRecordFixture({
      activeProtections: [
        {
          id: 'protection-hold',
          evidenceId: 'evidence-a',
          kind: 'legal-hold',
          externalRef: 'hold:1',
          active: true,
          version: 3,
        },
      ],
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [legalHold] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([legalHold])
      )
    );

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    expect(
      await screen.findByText(
        'resourceManager.verification.evidence.legalHoldReadOnly'
      )
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'resourceManager.verification.evidence.release',
      })
    ).toBeNull();
  });

  it('does not echo VER-5002 server details into the Evidence surface', async () => {
    evidenceClient.updateRetention.mockRejectedValue(
      new ApiError(
        'secret token sk-do-not-render was rejected',
        422,
        'VER-5002'
      )
    );

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.protectChange',
      })
    );

    expect(
      await screen.findByText(
        'resourceManager.verification.evidence.feedback.securityRejected'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/sk-do-not-render/u)).toBeNull();
  });

  it('does not query or promote durable Evidence for a local-only Workspace', () => {
    render(
      <VerificationEvidencePanel
        workspace={{
          ...createWorkspaceFixture(),
          id: 'local-workspace-a',
        }}
        plan={createPlanFixture()}
      />
    );

    expect(
      screen.getByText('resourceManager.verification.evidence.localUnavailable')
    ).toBeTruthy();
    expect(evidenceClient.listEvidence).not.toHaveBeenCalled();
  });

  it.each([513, 1000])(
    'loads all %s legal Evidence records across bounded pages',
    async (recordCount) => {
      const records = createPagedEvidenceRecords(recordCount);
      const listEvidence = vi.fn(
        async ({ cursor, limit }: { cursor?: string; limit: number }) => {
          const start = cursor ? Number(cursor) : 0;
          const end = Math.min(start + limit, records.length);
          return {
            records: records.slice(start, end),
            ...(end < records.length ? { nextCursor: String(end) } : {}),
          };
        }
      );
      const verifiedEvidenceView = decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload(records)
      );
      const workspace = createWorkspaceFixture();
      const plan = createPlanFixture();

      const projection = await loadVerificationEvidenceProjection({
        client: {
          listEvidence,
          getVerifiedEvidenceView: vi
            .fn()
            .mockResolvedValue(verifiedEvidenceView),
        } as never,
        workspace,
        plan,
      });

      expect(projection.records).toHaveLength(recordCount);
      expect(listEvidence).toHaveBeenCalledTimes(Math.ceil(recordCount / 100));
      expect(listEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
      expect(
        buildVerificationEvidenceResourceModel(workspace, plan, projection)
          .status
      ).toBe('ready');
    }
  );

  it('fails closed above 1000 records and when a cursor repeats', async () => {
    const records = createPagedEvidenceRecords(1001);
    const verifiedEvidenceView = decodeVerificationEvidenceVerifiedView(
      createVerifiedEvidenceViewPayload([])
    );
    const listEvidence = vi.fn(
      async ({ cursor, limit }: { cursor?: string; limit: number }) => {
        const start = cursor ? Number(cursor) : 0;
        const end = Math.min(start + limit, records.length);
        return {
          records: records.slice(start, end),
          ...(end < records.length ? { nextCursor: String(end) } : {}),
        };
      }
    );

    await expect(
      loadVerificationEvidenceProjection({
        client: {
          listEvidence,
          getVerifiedEvidenceView: vi
            .fn()
            .mockResolvedValue(verifiedEvidenceView),
        } as never,
        workspace: createWorkspaceFixture(),
        plan: createPlanFixture(),
      })
    ).rejects.toThrow(/page budget|projection budget/u);

    const repeatedCursor = vi
      .fn()
      .mockResolvedValueOnce({
        records: [records[0]],
        nextCursor: 'cursor-repeat',
      })
      .mockResolvedValueOnce({
        records: [records[1]],
        nextCursor: 'cursor-repeat',
      });
    await expect(
      loadVerificationEvidenceProjection({
        client: {
          listEvidence: repeatedCursor,
          getVerifiedEvidenceView: vi
            .fn()
            .mockResolvedValue(verifiedEvidenceView),
        } as never,
        workspace: createWorkspaceFixture(),
        plan: createPlanFixture(),
      })
    ).rejects.toThrow(/repeated a cursor/u);
  });

  it('labels trust and attestation only from the Backend-verified view', async () => {
    const downgraded = decodeEvidenceRecordFixture({
      effectiveTrust: 'imported-untrusted',
      trustStatus: 'unverified',
      verifiedAttestation: false,
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [downgraded] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([downgraded])
      )
    );

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    expect(await screen.findByText('imported-untrusted')).toBeTruthy();
    expect(
      screen.getByText('resourceManager.verification.evidence.unattested')
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'resourceManager.verification.evidence.trustAccessible'
      )
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'resourceManager.verification.evidence.attestationAccessible'
      )
    ).toBeTruthy();
  });

  it('renders safe text as escaped preformatted content', async () => {
    const text = 'bounded plain text\nsecond line';
    evidenceClient.downloadArtifact.mockResolvedValue({
      contents: new TextEncoder().encode(text),
      fileName: 'build.log',
      mediaType: 'text/plain',
    });

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.preview',
      })
    );
    expect(
      await screen.findByText(
        (_content, element) =>
          element?.tagName === 'PRE' && element.textContent === text
      )
    ).toBeTruthy();
    expect(
      screen.getByRole('region', {
        name: 'resourceManager.verification.evidence.artifactPreview',
      })
    ).toBeTruthy();
  });

  it('renders only an exact structured console envelope for application/*+json', async () => {
    const structured = decodeEvidenceRecordFixture({
      artifactKind: 'console-summary',
      artifactMediaType: 'application/vnd.prodivix.console+json',
      artifactPath: 'reports/console.json',
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [structured] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([structured])
      )
    );
    const envelopeText = JSON.stringify({
      format: 'prodivix.verification-artifact',
      version: 1,
      kind: 'console-summary',
      sourceTraceDigest: structured.artifacts[0]?.sourceTraceDigest,
      events: [
        {
          sequence: 0,
          eventId: 'event-a',
          level: 'error',
          timestampOffsetMs: 1,
          diagnosticCodes: ['VER-1001'],
        },
      ],
    });
    evidenceClient.downloadArtifact.mockResolvedValue({
      contents: new TextEncoder().encode(envelopeText),
      fileName: 'console.json',
      mediaType: 'application/vnd.prodivix.console+json',
    });

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.preview',
      })
    );

    expect(
      await screen.findByText(
        (_content, element) =>
          element?.tagName === 'PRE' && element.textContent === envelopeText
      )
    ).toBeTruthy();
  });

  it('fails closed on generic JSON that is not a structured artifact envelope', async () => {
    const structured = decodeEvidenceRecordFixture({
      artifactKind: 'console-summary',
      artifactMediaType: 'application/json',
      artifactPath: 'reports/console.json',
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [structured] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([structured])
      )
    );
    evidenceClient.downloadArtifact.mockResolvedValue({
      contents: new TextEncoder().encode(
        JSON.stringify({ message: 'raw console message is unsupported' })
      ),
      fileName: 'console.json',
      mediaType: 'application/json',
    });

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.preview',
      })
    );

    expect(
      await screen.findByText(
        'Verification Evidence structured artifact envelope drifted.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/raw console message/u)).toBeNull();
    expect(
      screen.queryByRole('region', {
        name: 'resourceManager.verification.evidence.artifactPreview',
      })
    ).toBeNull();
  });

  it('displays only Backend-validated PNG/JPEG classes through a blob URL', async () => {
    const raster = decodeEvidenceRecordFixture({
      artifactKind: 'screenshot',
      artifactMediaType: 'image/png',
      artifactPath: 'screenshots/catalog.png',
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [raster] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([raster])
      )
    );
    evidenceClient.downloadArtifact.mockResolvedValue({
      contents: new Uint8Array([137, 80, 78, 71]),
      fileName: 'catalog.png',
      mediaType: 'image/png',
    });
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:verified-raster');
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    const { unmount } = render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.preview',
      })
    );

    const preview = await screen.findByRole('img', {
      name: 'resourceManager.verification.evidence.rasterPreviewAlt',
    });
    expect(preview.getAttribute('src')).toBe('blob:verified-raster');
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:verified-raster');
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it('keeps active, archive, and unallowlisted media download-only', async () => {
    const active = decodeEvidenceRecordFixture({
      artifactMediaType: 'text/html',
      artifactPath: 'reports/active.html',
    });
    evidenceClient.listEvidence.mockResolvedValue({ records: [active] });
    evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
      decodeVerificationEvidenceVerifiedView(
        createVerifiedEvidenceViewPayload([active])
      )
    );

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    expect(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.download',
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'resourceManager.verification.evidence.preview',
      })
    ).toBeNull();
  });

  it('confirms supersession explicitly and reuses its operation id on retry', async () => {
    evidenceClient.supersedeEvidence
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    const failedAttemptButton = (
      await screen.findAllByRole('button', {
        name: /attempt-failed/u,
      })
    ).find((button) => button.getAttribute('aria-pressed') === 'false');
    expect(failedAttemptButton).toBeDefined();
    fireEvent.click(failedAttemptButton!);
    fireEvent.change(
      await screen.findByLabelText(
        'resourceManager.verification.evidence.supersedeTarget'
      ),
      { target: { value: 'evidence-passed' } }
    );
    fireEvent.change(
      screen.getByLabelText(
        'resourceManager.verification.evidence.supersedeReason'
      ),
      { target: { value: 'passed rerun replaces failed attempt' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.reviewSupersede',
      })
    );
    const confirm = await screen.findByRole('button', {
      name: 'resourceManager.verification.evidence.confirmSupersede',
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(evidenceClient.supersedeEvidence).toHaveBeenCalledTimes(1)
    );
    const firstOperationId =
      evidenceClient.supersedeEvidence.mock.calls[0]?.[0].operationId;
    expect(firstOperationId).toEqual(expect.stringMatching(/^web:/));
    expect(await screen.findByText('temporary failure')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.evidence.confirmSupersede',
      })
    );
    await waitFor(() =>
      expect(evidenceClient.supersedeEvidence).toHaveBeenCalledTimes(2)
    );
    expect(evidenceClient.supersedeEvidence).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: 'workspace-a',
        evidenceId: 'evidence-failed',
        newEvidenceId: 'evidence-passed',
        reason: 'passed rerun replaces failed attempt',
        operationId: firstOperationId,
      })
    );
    expect(
      await screen.findByText(
        'resourceManager.verification.evidence.feedback.superseded'
      )
    ).toBeTruthy();
  });

  it.each([
    ['expired', { trustStatus: 'expired' as const }, 'expired'],
    ['revoked', { trustStatus: 'revoked' as const }, 'revoked'],
    ['tombstoned', { retentionState: 'tombstoned' as const }, 'tombstoned'],
  ])(
    'renders Backend-derived %s lifecycle Evidence as stale',
    async (_label, viewState, visibleState) => {
      const record = decodeEvidenceRecordFixture(viewState);
      evidenceClient.listEvidence.mockResolvedValue({ records: [record] });
      evidenceClient.getVerifiedEvidenceView.mockResolvedValue(
        decodeVerificationEvidenceVerifiedView(
          createVerifiedEvidenceViewPayload([record])
        )
      );

      render(
        <VerificationEvidencePanel
          workspace={createWorkspaceFixture()}
          plan={createPlanFixture()}
        />
      );

      expect((await screen.findAllByText('stale')).length).toBeGreaterThan(0);
      expect(
        screen.getByText(
          (_content, element) =>
            element?.tagName === 'P' &&
            Boolean(element.textContent?.includes(visibleState))
        )
      ).toBeTruthy();
    }
  );

  it('fails closed when exact-snapshot SourceTrace navigation becomes stale', async () => {
    openSourceTrace.mockReturnValueOnce({
      status: 'unavailable',
      reason: 'snapshot-stale',
    });

    render(
      <VerificationEvidencePanel
        workspace={createWorkspaceFixture()}
        plan={createPlanFixture()}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'resourceManager.verification.evidence.openSourceTrace',
      })
    );
    expect(openSourceTrace).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        'resourceManager.verification.evidence.sourceTraceStatus.snapshot-stale'
      )
    ).toBeTruthy();
  });
});
