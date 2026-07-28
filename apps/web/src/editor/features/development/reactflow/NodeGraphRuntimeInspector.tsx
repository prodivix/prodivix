import { useMemo, useState } from 'react';
import type {
  NodeGraphDebugCommand,
  NodeGraphDebugCommandResult,
  NodeGraphDebugSnapshot,
} from '@prodivix/nodegraph';
import type {
  ExecutionSessionSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  createNodeGraphRuntimeInspectorCommand,
  createNodeGraphRuntimeInspectorModel,
} from './nodeGraphRuntimeInspectorModel';

type NodeGraphRuntimeInspectorProps = Readonly<{
  session?: ExecutionSessionSnapshot;
  debug?: NodeGraphDebugSnapshot;
  snapshotId?: string;
  onCommand?(
    command: NodeGraphDebugCommand
  ): NodeGraphDebugCommandResult | Promise<NodeGraphDebugCommandResult>;
  onCancel?(): void;
  onFreshReplay?(): void;
  onOpenSourceTrace?(
    request: Readonly<{
      jobId: string;
      providerId: string;
      snapshotId: string;
      sourceTrace: ExecutionSourceTrace;
    }>
  ): void;
}>;

export const NodeGraphRuntimeInspector = ({
  session,
  debug,
  snapshotId,
  onCommand,
  onCancel,
  onFreshReplay,
  onOpenSourceTrace,
}: NodeGraphRuntimeInspectorProps) => {
  const [expanded, setExpanded] = useState(false);
  const model = useMemo(
    () => createNodeGraphRuntimeInspectorModel({ session, debug }),
    [debug, session]
  );
  const command = (
    kind: Parameters<typeof createNodeGraphRuntimeInspectorCommand>[1]
  ) => {
    if (!debug || !onCommand) return;
    void onCommand(createNodeGraphRuntimeInspectorCommand(debug, kind));
  };
  const cancel = () => {
    if (debug && onCommand) {
      command('cancel');
      return;
    }
    onCancel?.();
  };

  return (
    <section
      aria-label="NodeGraph runtime inspector"
      className={`shrink-0 border-t border-black/10 bg-(--bg-primary) ${expanded ? 'h-[70vh]' : 'h-64'}`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-black/8 px-3">
        <h2 className="mr-auto text-xs font-semibold text-(--text-primary)">
          Runtime Inspector
        </h2>
        <span
          role="status"
          className="rounded-full bg-black/5 px-2 py-1 text-[10px] text-(--text-secondary)"
        >
          {model.status}
        </span>
        <button
          type="button"
          disabled={!model.canPause || !onCommand}
          onClick={() => command('pause')}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Pause
        </button>
        <button
          type="button"
          disabled={!model.canContinue || !onCommand}
          onClick={() => command('continue')}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Continue
        </button>
        <button
          type="button"
          disabled={!model.canStep || !onCommand}
          onClick={() => command('step-into')}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Step into
        </button>
        <button
          type="button"
          disabled={!model.canStep || !onCommand}
          onClick={() => command('step-over')}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Step over
        </button>
        <button
          type="button"
          disabled={!model.canCancel}
          onClick={cancel}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!model.canFreshReplay || !onFreshReplay}
          onClick={onFreshReplay}
          className="rounded-lg px-2 py-1 text-[11px] disabled:opacity-40"
        >
          Fresh replay
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="rounded-lg px-2 py-1 text-[11px]"
        >
          {expanded ? 'Restore' : 'Maximize'}
        </button>
      </header>

      <div className="grid h-[calc(100%-2.5rem)] min-h-0 grid-cols-4 divide-x divide-black/8">
        <section aria-label="Call stack" className="min-w-0 overflow-auto p-3">
          <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-(--text-muted)">
            CALL STACK
          </h3>
          {model.callStack.length ? (
            <ol className="space-y-1">
              {model.callStack.map((frame) => (
                <li key={frame.frameId} className="text-[11px]">
                  <div className="truncate font-medium">{frame.nodeId}</div>
                  <div className="truncate text-(--text-muted)">
                    {frame.sourcePath}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[11px] text-(--text-muted)">No paused frame.</p>
          )}
        </section>

        <section aria-label="Variables" className="min-w-0 overflow-auto p-3">
          <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-(--text-muted)">
            VARIABLES
          </h3>
          <dl className="space-y-2">
            {model.variables.map((variable) => (
              <div key={variable.nodeId}>
                <dt className="truncate text-[11px] font-medium">
                  {variable.nodeId}
                </dt>
                <dd className="font-mono text-[10px] break-all text-(--text-muted)">
                  {variable.redacted ? '[redacted]' : variable.text}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-label="Semantic trace"
          className="col-span-2 min-w-0 overflow-auto p-3"
        >
          <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-(--text-muted)">
            SEMANTIC TRACE
          </h3>
          <ol className="space-y-1">
            {model.trace.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-8 shrink-0 text-right font-mono text-(--text-muted)">
                  {row.sequence}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {row.label}
                  {row.phase ? ` · ${row.phase}` : ''}
                  {row.nodeId ? ` · ${row.nodeId}` : ''}
                </span>
                {row.sourceTrace?.length &&
                session?.activeJob &&
                snapshotId &&
                onOpenSourceTrace ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenSourceTrace({
                        jobId: session.activeJob!.jobId,
                        providerId: session.activeJob!.providerId,
                        snapshotId,
                        sourceTrace: row.sourceTrace![0]!,
                      })
                    }
                    className="rounded px-1.5 py-0.5 text-[10px]"
                  >
                    Source
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
          {model.issue ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[11px]"
            >
              <div className="font-medium">{model.issue.code}</div>
              <div>{model.issue.safeMessage}</div>
            </div>
          ) : null}
          {model.droppedEventCount ? (
            <p className="mt-2 text-[10px] text-(--text-muted)">
              {model.droppedEventCount} older trace events were dropped.
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
};
