import { useEffect, useMemo, useState } from 'react';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceComponentExtractionTransactionPlanResult } from '@prodivix/workspace';
import { useWorkspaceComponentAuthoring } from '@/editor/features/component/controller/useWorkspaceComponentAuthoring';

export const ComponentExtractionDialog = ({
  open,
  selection,
  onClose,
  onApplied,
}: {
  open: boolean;
  selection?: PIRRenderLocation;
  onClose: () => void;
  onApplied: (input: {
    sourceDocumentId: string;
    componentDocumentId: string;
    instanceNodeId: string;
  }) => void;
}) => {
  const { workspace, readonly, planExtraction, applyTransaction } =
    useWorkspaceComponentAuthoring();
  const [name, setName] = useState('Extracted Component');
  const [planResult, setPlanResult] =
    useState<WorkspaceComponentExtractionTransactionPlanResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlanResult(null);
    setStatusMessage(null);
    setApplying(false);
  }, [open, selection?.documentId, selection?.nodeId]);

  const stale = useMemo(
    () =>
      planResult?.status === 'ready' &&
      workspace?.workspaceRev !== planResult.plan.baseRevision,
    [planResult, workspace?.workspaceRev]
  );

  if (!open) return null;
  const canPlan = Boolean(selection && name.trim() && workspace && !readonly);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/35 p-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Extract Component Definition"
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-black/12 bg-(--bg-canvas) p-5 shadow-[0_28px_80px_rgba(0,0,0,0.22)]"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-(--text-muted) uppercase">
              Atomic Workspace Transaction
            </p>
            <h2 className="mt-1 text-lg font-semibold text-(--text-primary)">
              Extract Component Definition
            </h2>
            <p className="mt-1 text-xs text-(--text-secondary)">
              Review relocation and reference rewrites before applying the exact
              transaction.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary)"
          >
            Close
          </button>
        </header>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-(--text-secondary)">
            Definition name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setPlanResult(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-black/12 bg-transparent px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-black"
            />
          </label>
          <div className="rounded-xl border border-black/8 bg-black/2 p-3 text-xs">
            <p className="text-(--text-muted)">Selected source</p>
            <p className="mt-1 truncate font-mono text-(--text-primary)">
              {selection
                ? `${selection.documentId} / ${selection.nodeId}`
                : 'No node selected'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!canPlan}
            onClick={() => {
              if (!selection) return;
              setStatusMessage(null);
              setPlanResult(
                planExtraction({
                  sourceDocumentId: selection.documentId,
                  subtreeRootId: selection.nodeId,
                  componentName: name,
                })
              );
            }}
            className="rounded-lg border border-black/12 px-3 py-2 text-xs font-semibold text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview plan
          </button>
          {stale ? (
            <span className="text-xs text-(--text-secondary)">
              Workspace changed. Generate a new plan.
            </span>
          ) : null}
        </div>

        {planResult?.status === 'rejected' ? (
          <div className="mt-4 rounded-xl border border-black/12 bg-black/3 p-4">
            <h3 className="text-xs font-semibold text-(--text-primary)">
              Extraction is blocked
            </h3>
            <ul className="mt-2 space-y-2 text-xs text-(--text-secondary)">
              {planResult.issues.map((issue) => (
                <li key={`${issue.path}:${issue.code}`}>
                  <span className="font-mono text-[10px] text-(--text-muted)">
                    {issue.code}
                  </span>{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {planResult?.status === 'ready' ? (
          <div className="mt-4 space-y-4 rounded-xl border border-black/10 bg-black/2 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [
                  'Moved nodes',
                  planResult.plan.extraction.subtreeNodeIds.length,
                ],
                [
                  'Reference rewrites',
                  planResult.plan.referencePlan.references.filter(
                    (reference) => reference.rewrite
                  ).length,
                ],
                ['Public members', planResult.plan.publicMemberMappings.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-(--bg-canvas) p-3">
                  <p className="text-[10px] tracking-wide text-(--text-muted) uppercase">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-(--text-primary)">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="text-xs text-(--text-secondary)">
              <p>
                Definition:{' '}
                <span className="font-mono text-(--text-primary)">
                  {planResult.plan.componentDocument.path}
                </span>
              </p>
              <p className="mt-1">
                Replacement Instance:{' '}
                <span className="font-mono text-(--text-primary)">
                  {planResult.plan.extraction.instance.id}
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={applying || stale || readonly}
              onClick={async () => {
                setApplying(true);
                setStatusMessage(null);
                const outcome = await applyTransaction(
                  planResult.plan.transaction
                );
                setApplying(false);
                if (outcome.status === 'rejected') {
                  setStatusMessage(outcome.message);
                  return;
                }
                onApplied({
                  sourceDocumentId: planResult.plan.sourceDocumentId,
                  componentDocumentId: planResult.plan.componentDocument.id,
                  instanceNodeId: planResult.plan.extraction.instance.id,
                });
                onClose();
              }}
              className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? 'Applying…' : 'Apply atomic extraction'}
            </button>
          </div>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 text-xs text-(--text-secondary)">
            {statusMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
};
