import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck2, Gauge, GitBranch, Save, ShieldCheck } from 'lucide-react';
import {
  createWorkspaceVerificationPolicyMutationCommand,
  type WorkspaceCommandEnvelope,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { VerificationEvidencePanel } from '@/editor/features/verification/VerificationEvidencePanel';
import {
  buildVerificationResourceModel,
  type VerificationPolicyResourceDocument,
} from './verificationResourceModel';

const readyPolicy = (
  policies: readonly VerificationPolicyResourceDocument[],
  documentId: string | undefined
) =>
  policies.find(
    (
      policy
    ): policy is Extract<
      VerificationPolicyResourceDocument,
      { status: 'ready' }
    > => policy.status === 'ready' && policy.documentId === documentId
  ) ??
  policies.find(
    (
      policy
    ): policy is Extract<
      VerificationPolicyResourceDocument,
      { status: 'ready' }
    > => policy.status === 'ready'
  );

const resolveScenarioDocumentId = (
  workspace: ReturnType<typeof useEditorStore.getState>['workspace'],
  scenarioId: string
): string | undefined =>
  workspace
    ? Object.values(workspace.docsById).find((document) => {
        if (document.type !== 'behavior-scenario') return false;
        const content = document.content as Readonly<{ id?: unknown }>;
        return content?.id === scenarioId;
      })?.id
    : undefined;

export function VerificationPlanResourcePage() {
  const { t } = useTranslation('editor');
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const projection = useEditorStore((state) =>
    workspace
      ? state.verificationProjectionByWorkspaceId[workspace.id]
      : undefined
  );
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const model = useMemo(
    () => buildVerificationResourceModel(workspace, projection),
    [projection, workspace]
  );
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>();
  const selectedPolicy = readyPolicy(model.policies, selectedPolicyId);
  const [policyName, setPolicyName] = useState('');
  const [pendingCommand, setPendingCommand] =
    useState<WorkspaceCommandEnvelope | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setPolicyName(selectedPolicy?.policy.name ?? '');
  }, [selectedPolicy?.documentId, selectedPolicy?.policy.name]);

  const stageRename = () => {
    if (!workspace || !selectedPolicy) return;
    const command = createWorkspaceVerificationPolicyMutationCommand({
      workspace,
      documentId: selectedPolicy.documentId,
      mutation: { kind: 'rename-policy', name: policyName },
      commandId: createWorkspaceClientOperationId(
        'verification-policy-command'
      ),
      issuedAt: new Date().toISOString(),
    });
    if (!command) {
      setFeedback(t('resourceManager.verification.feedback.invalid'));
      return;
    }
    setPendingCommand(command);
    setFeedback('');
  };

  const applyPending = async () => {
    if (!workspace || !pendingCommand) return;
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: { kind: 'command', command: pendingCommand },
      readonly: workspaceReadonly,
      workspace,
    });
    setFeedback(
      outcome.status === 'applied'
        ? t('resourceManager.verification.feedback.applied')
        : outcome.message
    );
    setPendingCommand(null);
  };

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
          <ShieldCheck size={14} />
          {t('resourceManager.verification.header.badge')}
        </p>
        <h2 className="mt-2 text-base font-medium text-(--text-primary)">
          {t('resourceManager.verification.header.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-(--text-secondary)">
          {t('resourceManager.verification.header.description')}
        </p>
      </article>

      {model.projectionStatus !== 'ready' ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {t(
            `resourceManager.verification.projection.${model.projectionStatus}`
          )}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <h3 className="inline-flex items-center gap-2 text-sm font-medium text-(--text-primary)">
            <GitBranch size={15} />
            {t('resourceManager.verification.impact.title')}
          </h3>
          {model.impact.status === 'blocked' ? (
            <p className="mt-3 text-sm text-red-700">{model.impact.message}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span
                  className="rounded-full border border-black/10 px-2 py-1"
                  title={t(
                    'resourceManager.verification.impact.completenessHelp'
                  )}
                >
                  {model.impact.completeness}
                </span>
                <span className="rounded-full border border-black/10 px-2 py-1">
                  {model.impact.source}
                </span>
                <span className="rounded-full border border-black/10 px-2 py-1">
                  rev {model.impact.workspaceRevision}
                </span>
              </div>
              <code className="mt-3 block rounded-lg bg-black/4 p-2 text-xs break-all text-(--text-secondary)">
                {model.impact.digest}
              </code>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.impact.documents')}
                  </dt>
                  <dd>{model.impact.changedDocumentIds.length}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.impact.scenarios')}
                  </dt>
                  <dd>{model.impact.impactedScenarioIds.length}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.impact.domains')}
                  </dt>
                  <dd>{model.impact.impactedDomains.length}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.impact.paths')}
                  </dt>
                  <dd>{model.impact.paths.length}</dd>
                </div>
              </dl>
              <div className="mt-4 grid gap-2">
                {model.impact.reasons.map((reason) => (
                  <div
                    key={reason.id}
                    className="rounded-lg border border-black/8 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{reason.kind}</span>
                    <span className="ml-2 text-(--text-secondary)">
                      {reason.message}
                    </span>
                  </div>
                ))}
              </div>
              {model.impact.paths.length ? (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-(--text-secondary)">
                    {t('resourceManager.verification.impact.explainPaths')}
                  </summary>
                  <ol className="mt-2 grid gap-2">
                    {model.impact.paths.map((path) => (
                      <li
                        key={path.id}
                        className="rounded-lg bg-black/4 px-3 py-2"
                      >
                        <strong>{path.relationship}</strong>{' '}
                        {path.nodes.join(' → ')}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </>
          )}
        </article>

        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <h3 className="text-sm font-medium text-(--text-primary)">
            {t('resourceManager.verification.policy.title')}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {model.policies.map((policy) => (
              <button
                key={policy.documentId}
                type="button"
                onClick={() => {
                  setSelectedPolicyId(policy.documentId);
                  setActiveDocumentId(policy.documentId);
                }}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  policy.documentId === selectedPolicy?.documentId
                    ? 'border-black bg-black text-white'
                    : 'border-black/10 text-(--text-secondary)'
                }`}
              >
                {policy.status === 'ready'
                  ? policy.policy.name
                  : `${policy.path} (${policy.issueCount})`}
              </button>
            ))}
          </div>
          {selectedPolicy ? (
            <>
              <label className="mt-4 grid gap-1 text-xs text-(--text-secondary)">
                {t('resourceManager.verification.policy.name')}
                <input
                  value={policyName}
                  onChange={(event) => setPolicyName(event.target.value)}
                  className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
                />
              </label>
              <button
                type="button"
                disabled={workspaceReadonly || !policyName.trim()}
                onClick={stageRename}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                <Save size={14} />
                {t('resourceManager.verification.policy.stageRename')}
              </button>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.policy.rules')}
                  </dt>
                  <dd>{selectedPolicy.policy.rules.length}</dd>
                </div>
                <div>
                  <dt className="text-(--text-muted)">
                    {t('resourceManager.verification.policy.matrixProfiles')}
                  </dt>
                  <dd>{selectedPolicy.policy.matrixProfiles.length}</dd>
                </div>
              </dl>
              <div className="mt-3 grid gap-2">
                {selectedPolicy.exemptions.map((exemption) => (
                  <div
                    key={exemption.id}
                    className="rounded-lg border border-black/8 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{exemption.status}</span>{' '}
                    {exemption.targetId} · {exemption.issueRef}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-(--text-muted)">
              {t('resourceManager.verification.policy.empty')}
            </p>
          )}
        </article>
      </div>

      {pendingCommand ? (
        <article
          aria-label={t('resourceManager.verification.policy.preview')}
          className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
        >
          <h3 className="text-sm font-medium text-blue-950">
            {t('resourceManager.verification.policy.preview')}
          </h3>
          <p className="mt-1 text-sm text-blue-900">
            {selectedPolicy?.policy.name} → {policyName}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void applyPending()}
              className="rounded-lg bg-black px-3 py-2 text-sm text-white"
            >
              {t('resourceManager.verification.policy.apply')}
            </button>
            <button
              type="button"
              onClick={() => setPendingCommand(null)}
              className="rounded-lg border border-black/12 px-3 py-2 text-sm"
            >
              {t('resourceManager.verification.policy.cancel')}
            </button>
          </div>
        </article>
      ) : null}

      {model.explanation ? (
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-sm font-medium text-(--text-primary)">
              <FileCheck2 size={15} />
              {t('resourceManager.verification.plan.title')}
            </h3>
            <span
              className="rounded-full border border-black/10 px-2 py-1 text-xs"
              title={t('resourceManager.verification.plan.statusHelp')}
            >
              {model.explanation.status}
            </span>
          </div>
          <code className="mt-3 block rounded-lg bg-black/4 p-2 text-xs break-all">
            {model.explanation.planDigest}
          </code>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(model.explanation.summary).map(([key, value]) => (
              <div key={key}>
                <p className="text-xs text-(--text-muted)">{key}</p>
                <p className="text-lg font-medium">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-black/8 p-3">
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              <Gauge size={14} />
              {t('resourceManager.verification.plan.budget')}
            </p>
            <p className="mt-1 text-xs text-(--text-secondary)">
              {model.explanation.budget.cells} cells ·{' '}
              {model.explanation.budget.totalMs} ms ·{' '}
              {model.explanation.budget.artifactBytes} bytes ·{' '}
              {model.explanation.budget.estimatedComputeUnits} compute
            </p>
            {model.explanation.budget.overBudgetDimensions.length ? (
              <p className="mt-1 text-xs text-red-700">
                {model.explanation.budget.overBudgetDimensions.join(', ')}
              </p>
            ) : null}
          </div>
          {model.explanation.issues.length ? (
            <ul className="mt-4 grid gap-2">
              {model.explanation.issues.map((issue, index) => (
                <li
                  key={`${issue.code}:${issue.cellId ?? index}`}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
                >
                  <strong>{issue.code}</strong> {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {model.explanation.selections.some(
            (selection) => selection.status !== 'selected'
          ) ? (
            <details className="mt-4 rounded-xl border border-black/8 p-3 text-xs">
              <summary className="cursor-pointer font-medium">
                {t('resourceManager.verification.plan.decisions')}
              </summary>
              <ul className="mt-2 grid gap-2">
                {model.explanation.selections
                  .filter((selection) => selection.status !== 'selected')
                  .map((selection, index) => (
                    <li
                      key={`${selection.cellId ?? selection.checkId}:${selection.status}:${index}`}
                    >
                      <strong>{selection.status}</strong> · {selection.checkId}{' '}
                      · {selection.targetId} — {selection.messages.join(' ')}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 text-(--text-muted)">
                  <th className="p-2">
                    {t('resourceManager.verification.plan.check')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.scenario')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.matrix')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.requirement')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.preflight')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.dependencies')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.evidence')}
                  </th>
                  <th className="p-2">
                    {t('resourceManager.verification.plan.why')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.explanation.cells.map((cell) => (
                  <tr key={cell.id} className="border-b border-black/6">
                    <td className="p-2">
                      {cell.checkId}
                      <div className="text-(--text-muted)">
                        {cell.checkKind}
                      </div>
                    </td>
                    <td className="p-2">
                      {cell.scenarioId ? (
                        <button
                          type="button"
                          onClick={() => {
                            const documentId = resolveScenarioDocumentId(
                              workspace,
                              cell.scenarioId!
                            );
                            if (documentId) setActiveDocumentId(documentId);
                          }}
                          className="underline decoration-black/20 underline-offset-2"
                        >
                          {cell.scenarioId}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2">
                      {cell.surface} / {cell.frameworkTarget} /{' '}
                      {cell.browserEngine ?? 'none'} / {cell.viewportId} /{' '}
                      {cell.colorScheme} / {cell.motion} / {cell.locale}
                    </td>
                    <td className="p-2">{cell.requirement}</td>
                    <td className="p-2">{cell.preflight.status}</td>
                    <td className="p-2">
                      {cell.dependencyCellIds.length
                        ? cell.dependencyCellIds.join(', ')
                        : '—'}
                    </td>
                    <td className="p-2">
                      <div>{cell.inputKinds.join(', ') || '—'}</div>
                      <div className="text-(--text-muted)">
                        {cell.artifactKinds.join(', ') || '—'}
                      </div>
                    </td>
                    <td className="p-2" title={cell.policyRuleIds.join(', ')}>
                      {cell.impactPathIds.length} path ·{' '}
                      {cell.policyRuleIds.length} rule
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {model.explanation.closure ? (
            <div className="mt-4 rounded-xl border border-black/8 p-3">
              <p className="text-sm font-medium">
                {t('resourceManager.verification.closure.title')} ·{' '}
                {model.explanation.closure.verdict}
              </p>
              <code className="mt-1 block text-xs break-all text-(--text-secondary)">
                {model.explanation.closure.closureDigest}
              </code>
              <dl className="mt-2 grid gap-1 text-xs">
                {Object.entries(model.explanation.closure.cellStatuses).map(
                  ([cellId, status]) => (
                    <div key={cellId} className="flex gap-2">
                      <dt className="min-w-0 flex-1 truncate">{cellId}</dt>
                      <dd className="font-medium">{status}</dd>
                    </div>
                  )
                )}
              </dl>
              {model.explanation.closure.issues.length ? (
                <ul className="mt-2 grid gap-1 text-xs text-red-700">
                  {model.explanation.closure.issues.map((issue, index) => (
                    <li key={`${issue.cellId ?? 'closure'}:${index}`}>
                      {issue.status}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : (
        <article className="rounded-2xl border border-dashed border-black/12 p-5 text-sm text-(--text-muted)">
          {t('resourceManager.verification.plan.empty')}
        </article>
      )}

      {workspace &&
      projection?.plan &&
      model.projectionStatus === 'ready' &&
      model.explanation ? (
        <VerificationEvidencePanel
          workspace={workspace}
          plan={projection.plan}
        />
      ) : null}

      {feedback ? (
        <p role="status" className="text-sm text-(--text-secondary)">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
