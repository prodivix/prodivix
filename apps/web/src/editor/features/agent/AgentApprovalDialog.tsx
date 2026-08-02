import { useEffect, useRef, useState } from 'react';
import type { AgentApprovalDecision, AgentProductView } from '@prodivix/ai';

type AgentApprovalDialogProps = Readonly<{
  decision: AgentApprovalDecision['decision'] | null;
  view: AgentProductView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    input: Readonly<{
      decision: AgentApprovalDecision['decision'];
      rollbackAuthorization: AgentApprovalDecision['rollbackAuthorization'];
      reason?: string;
    }>
  ) => Promise<void>;
}>;

export function AgentApprovalDialog({
  decision,
  view,
  busy,
  onClose,
  onSubmit,
}: AgentApprovalDialogProps) {
  const [rollback, setRollback] = useState<
    '' | AgentApprovalDecision['rollbackAuthorization']
  >('');
  const [reason, setReason] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!decision) return;
    setRollback(decision === 'rejected' ? 'none' : '');
    setReason('');
    queueMicrotask(() => headingRef.current?.focus());
  }, [decision]);

  useEffect(() => {
    if (!decision) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, decision, onClose]);

  if (!decision) return null;
  const isApproval = decision === 'approved';
  const canAuthorizeRollback =
    view.proposalReview?.rollback.authorization === 'on-unsatisfied-closure';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-approval-title"
      aria-describedby="agent-approval-description"
    >
      <form
        className="w-full max-w-xl rounded-xl border border-(--border-default) bg-(--bg-panel) p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!rollback) return;
          void onSubmit({
            decision,
            rollbackAuthorization: rollback,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          });
        }}
      >
        <h2
          id="agent-approval-title"
          ref={headingRef}
          tabIndex={-1}
          className="m-0 text-lg font-semibold outline-none"
        >
          {isApproval ? 'Approve exact proposal' : 'Reject exact proposal'}
        </h2>
        <p
          id="agent-approval-description"
          className="mt-2 text-sm text-(--text-secondary)"
        >
          This decision binds preview <code>{view.identity.previewId}</code>,
          transaction <code>{view.planning?.transactionDigest}</code>, and the
          displayed Impact and Verification Plan. Model text cannot submit this
          form.
        </p>

        {isApproval ? (
          <fieldset className="mt-4 grid gap-2 rounded-lg border border-(--border-subtle) p-3">
            <legend className="px-1 text-sm font-semibold">
              Rollback authorization (choose one)
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="rollbackAuthorization"
                value="none"
                checked={rollback === 'none'}
                onChange={() => setRollback('none')}
              />
              <span>No automatic rollback authorization</span>
            </label>
            {canAuthorizeRollback ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="rollbackAuthorization"
                  value="on-unsatisfied-closure"
                  checked={rollback === 'on-unsatisfied-closure'}
                  onChange={() => setRollback('on-unsatisfied-closure')}
                />
                <span>
                  Authorize only the exact reverse Transaction after an
                  unsatisfied Verification Closure
                </span>
              </label>
            ) : null}
          </fieldset>
        ) : (
          <p className="mt-4 rounded-lg border border-(--border-subtle) p-3 text-sm">
            Rejection grants no rollback or Workspace mutation authority.
          </p>
        )}

        <label className="mt-4 grid gap-1 text-sm">
          Decision reason (optional)
          <textarea
            value={reason}
            maxLength={4096}
            onChange={(event) => setReason(event.currentTarget.value)}
            className="min-h-24 rounded-lg border border-(--border-default) bg-(--bg-canvas) p-2"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-(--border-default) px-3 py-2 text-sm"
          >
            Close without deciding
          </button>
          <button
            type="submit"
            disabled={busy || !rollback}
            className="rounded-lg bg-(--accent-primary) px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? 'Submitting exact decision…'
              : isApproval
                ? 'Confirm exact approval'
                : 'Confirm rejection'}
          </button>
        </div>
      </form>
    </div>
  );
}
