import { forwardRef } from 'react';
import type {
  AgentApprovalDecision,
  AgentProductView,
  AgentRunUserCommandKind,
} from '@prodivix/ai';

type AgentRunViewProps = Readonly<{
  view: AgentProductView;
  busy: boolean;
  onReload: () => void;
  onCommand: (kind: AgentRunUserCommandKind) => void;
  onOpenApproval: (decision: AgentApprovalDecision['decision']) => void;
  onAudit: () => void;
  onRepair: () => void;
}>;

const JsonArtifact = ({ label, value }: { label: string; value: unknown }) => (
  <section className="grid gap-2" aria-label={label}>
    <h4 className="m-0 text-sm font-semibold">{label}</h4>
    <pre
      tabIndex={0}
      className="max-h-72 overflow-auto rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3 text-xs"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  </section>
);

export const AgentRunView = forwardRef<HTMLHeadingElement, AgentRunViewProps>(
  function AgentRunView(
    { view, busy, onReload, onCommand, onOpenApproval, onAudit, onRepair },
    headingRef
  ) {
    const actions = new Set(view.availableActions);
    const latestClosure = view.verificationClosures.at(-1);
    return (
      <div className="grid gap-4">
        <section className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="m-0 text-base font-semibold outline-none"
              >
                Run {view.identity.runId}
              </h2>
              <p className="m-0 mt-1 text-sm text-(--text-secondary)">
                Phase <strong>{view.run.phase}</strong> · generation{' '}
                {view.identity.generation} · attempt {view.identity.attempt} ·
                cleanup {view.cleanupState}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onReload}
                className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
              >
                Refresh durable state
              </button>
              {actions.has('cancel') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCommand('cancel')}
                  className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
                >
                  Request cancellation
                </button>
              ) : null}
              {actions.has('recover') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCommand('recover')}
                  className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
                >
                  Request bounded recovery
                </button>
              ) : null}
              {actions.has('export-audit') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAudit}
                  className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
                >
                  Export audit JSON
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {view.diagnostics.length ? (
          <section
            aria-labelledby="agent-diagnostics-title"
            className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
          >
            <h3
              id="agent-diagnostics-title"
              className="m-0 text-base font-semibold"
            >
              Diagnostics
            </h3>
            <ul className="mt-3 mb-0 grid gap-2 pl-5">
              {view.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}:${index}`}>
                  <strong>{diagnostic.code}</strong> · {diagnostic.severity} ·{' '}
                  {diagnostic.message}
                  {diagnostic.nextAction ? (
                    <div className="text-sm text-(--text-secondary)">
                      Next: {diagnostic.nextAction}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-labelledby="agent-timeline-title"
          className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
        >
          <h3 id="agent-timeline-title" className="m-0 text-base font-semibold">
            Run timeline
          </h3>
          <ol className="mt-3 mb-0 grid gap-2 pl-6">
            {view.timeline.map((entry) => (
              <li key={entry.eventId}>
                <span className="font-medium">{entry.type}</span>{' '}
                <span className="text-sm text-(--text-secondary)">
                  generation {entry.generation} · {entry.occurredAt}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="agent-context-title"
          className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
        >
          <h3 id="agent-context-title" className="m-0 text-base font-semibold">
            Context inspector
          </h3>
          {view.context ? (
            <>
              <p className="text-sm text-(--text-secondary)">
                Metadata only · {view.context.items.length} included ·{' '}
                {view.context.omitted.length} omitted
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-(--border-subtle) p-2">
                        Source
                      </th>
                      <th className="border-b border-(--border-subtle) p-2">
                        Authority
                      </th>
                      <th className="border-b border-(--border-subtle) p-2">
                        Sensitivity
                      </th>
                      <th className="border-b border-(--border-subtle) p-2">
                        Boundary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.context.items.map((item) => (
                      <tr key={item.itemId}>
                        <td className="border-b border-(--border-subtle) p-2">
                          {item.source.kind}: {item.source.id}
                        </td>
                        <td className="border-b border-(--border-subtle) p-2">
                          {item.authority}
                        </td>
                        <td className="border-b border-(--border-subtle) p-2">
                          {item.sensitivity}
                        </td>
                        <td className="border-b border-(--border-subtle) p-2">
                          {item.instructionBoundary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {view.context.omitted.length ? (
                <ul className="mt-3 mb-0 pl-5 text-sm">
                  {view.context.omitted.map((omission, index) => (
                    <li
                      key={`${omission.source.kind}:${omission.source.id}:${index}`}
                    >
                      Omitted {omission.source.kind}:{omission.source.id} ·{' '}
                      {omission.reason} · {omission.diagnosticCode}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mb-0 text-sm text-(--text-secondary)">
              No Context Pack metadata has been projected for this Run snapshot.
            </p>
          )}
        </section>

        {view.proposal &&
        view.preview &&
        view.planning &&
        view.proposalReview ? (
          <section
            aria-labelledby="agent-proposal-title"
            className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
          >
            <h3
              id="agent-proposal-title"
              className="m-0 text-base font-semibold"
            >
              Exact proposal review
            </h3>
            <p className="text-sm text-(--text-secondary)">
              Preview {view.preview.previewId} expires {view.preview.expiresAt}.
              Streaming/model prose is not rendered as applied state.
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <JsonArtifact
                label="Semantic diff"
                value={view.proposalReview.semanticDiff}
              />
              <JsonArtifact label="Impact" value={view.proposalReview.impact} />
              <JsonArtifact
                label="Verification Plan"
                value={view.proposalReview.verificationPlan}
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <section aria-label="Required permissions">
                <h4 className="m-0 text-sm font-semibold">
                  Required permissions
                </h4>
                <ul className="mt-2 mb-0 pl-5 text-sm">
                  {view.proposalReview.permissions.map((permission) => (
                    <li key={permission}>{permission}</li>
                  ))}
                </ul>
              </section>
              <section aria-label="Proposal risks">
                <h4 className="m-0 text-sm font-semibold">Risks</h4>
                <ul className="mt-2 mb-0 pl-5 text-sm">
                  {view.proposalReview.risks.map((risk) => (
                    <li key={risk.id}>
                      {risk.level}: {risk.message}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label="Rollback boundary">
                <h4 className="m-0 text-sm font-semibold">Rollback</h4>
                <p className="mt-2 mb-0 text-sm break-all">
                  {view.proposalReview.rollback.authorization} ·{' '}
                  {view.proposalReview.rollback.reverseTransactionDigest}
                </p>
              </section>
            </div>

            <section
              aria-labelledby="agent-human-decision-title"
              className="mt-5 rounded-lg border-2 border-(--border-default) p-4"
            >
              <h4
                id="agent-human-decision-title"
                className="m-0 text-base font-semibold"
              >
                Human decision
              </h4>
              {view.approval ? (
                <p className="mt-2 mb-0 text-sm">
                  {view.approval.decision} by {view.approval.actor.principalId}{' '}
                  · rollback {view.approval.rollbackAuthorization}
                </p>
              ) : actions.has('approve') || actions.has('reject') ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenApproval('approved')}
                    className="rounded-lg bg-(--accent-primary) px-3 py-2 text-sm font-semibold text-white"
                  >
                    Review and approve exact proposal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenApproval('rejected')}
                    className="rounded-lg border border-(--border-default) px-3 py-2 text-sm font-semibold"
                  >
                    Review and reject proposal
                  </button>
                </div>
              ) : (
                <p className="mt-2 mb-0 text-sm text-(--text-secondary)">
                  No decision is currently available for this actor and
                  snapshot.
                </p>
              )}
            </section>
          </section>
        ) : null}

        <section
          aria-labelledby="agent-verification-title"
          className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                id="agent-verification-title"
                className="m-0 text-base font-semibold"
              >
                Verification and repair
              </h3>
              <p className="mt-2 mb-0 text-sm text-(--text-secondary)">
                {latestClosure
                  ? `Latest Closure: ${latestClosure.verdict} (${latestClosure.receiptId})`
                  : 'No promoted Verification Closure is bound yet.'}
              </p>
              <p className="mt-1 mb-0 text-sm text-(--text-secondary)">
                {view.verificationBindings.length} Plan bindings ·{' '}
                {view.verificationClosures.length} Closure receipts ·{' '}
                {view.repairRounds.length} repair receipts
              </p>
            </div>
            {actions.has('repair') ? (
              <button
                type="button"
                onClick={onRepair}
                className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
              >
                Open G3 Verification surface
              </button>
            ) : null}
          </div>
        </section>

        <details className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Advanced identities, model, tool, usage, and cost
          </summary>
          <div className="mt-3 grid gap-3 text-xs">
            <JsonArtifact label="Product identity" value={view.identity} />
            <JsonArtifact
              label="Model identities"
              value={view.runtime.models}
            />
            <JsonArtifact label="Tool identities" value={view.runtime.tools} />
            <JsonArtifact label="Usage" value={view.runtime.usage} />
            <JsonArtifact label="Cost" value={view.runtime.costs} />
          </div>
        </details>
      </div>
    );
  }
);
