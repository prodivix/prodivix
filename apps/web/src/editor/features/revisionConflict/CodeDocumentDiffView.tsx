import { Check, Cloud, FileCode2, Laptop } from 'lucide-react';
import { RevisionDiffLegend } from './RevisionDiffLegend';
import {
  summarizeCodeDocumentDiff,
  type CodeDiffLinePresentation,
  type CodeDiffSidePresentation,
  type CodeDocumentDiffHunkPresentation,
  type RevisionConflictChoice,
} from './revisionConflictPresentation';

export type CodeDocumentDiffLabels = {
  base: string;
  conflict: string;
  conflicts: string;
  hunk: string;
  hunks: string;
  local: string;
  noChanges: string;
  noLines: string;
  remote: string;
  resolved: string;
  unresolved: string;
  useLocal: string;
  useRemote: string;
};

const DEFAULT_LABELS: CodeDocumentDiffLabels = {
  base: 'BASE',
  conflict: 'conflict',
  conflicts: 'conflicts',
  hunk: 'hunk',
  hunks: 'hunks',
  local: 'LOCAL',
  noChanges: 'No text changes to review.',
  noLines: 'No lines in this version',
  remote: 'REMOTE',
  resolved: 'Resolved',
  unresolved: 'unresolved',
  useLocal: 'Use local',
  useRemote: 'Use remote',
};

const lineKindPresentation = {
  context: {
    className: 'text-(--text-secondary)',
    marker: ' ',
  },
  added: {
    className:
      'bg-green-500/10 text-(--text-primary) selection:bg-green-500/30',
    marker: '+',
  },
  deleted: {
    className: 'bg-red-500/10 text-(--text-primary) selection:bg-red-500/30',
    marker: '−',
  },
  modified: {
    className: 'bg-(--bg-raised) text-(--text-primary)',
    marker: '~',
  },
} as const;

type CodeDiffPaneProps = {
  choice?: RevisionConflictChoice;
  hunkId: string;
  isConflict: boolean;
  label: string;
  noLinesLabel: string;
  side: CodeDiffSidePresentation;
  version: 'base' | 'local' | 'remote';
};

const paneToneClasses = {
  base: 'border-(--border-subtle)',
  local:
    'border-(--warning-color) bg-amber-500/5 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_9px,rgb(245_158_11/0.035)_9px,rgb(245_158_11/0.035)_10px)]',
  remote:
    'border-violet-500 bg-violet-500/5 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_9px,rgb(139_92_246/0.04)_9px,rgb(139_92_246/0.04)_10px)]',
} as const;

function resolveLineNumber(
  line: CodeDiffLinePresentation,
  index: number,
  startLine?: number
) {
  return line.lineNumber ?? (startLine !== undefined ? startLine + index : '');
}

function CodeDiffPane({
  choice,
  hunkId,
  isConflict,
  label,
  noLinesLabel,
  side,
  version,
}: CodeDiffPaneProps) {
  const isUnselectedConflictSide =
    isConflict &&
    choice !== undefined &&
    version !== 'base' &&
    choice !== version;
  const toneClass =
    isConflict && version !== 'base'
      ? paneToneClasses[version]
      : paneToneClasses.base;

  return (
    <section
      aria-label={`${label} ${hunkId}`}
      className={`min-w-0 overflow-hidden rounded-lg border bg-(--bg-canvas) ${toneClass} ${
        isUnselectedConflictSide ? 'opacity-55' : ''
      }`}
    >
      <header className="flex h-8 items-center justify-between border-b border-b-(--border-subtle) bg-(--bg-panel) px-2.5 font-mono text-[10px] font-bold tracking-[0.12em] text-(--text-secondary)">
        <span>{label}</span>
        {side.startLine !== undefined ? (
          <span className="font-normal tracking-normal text-(--text-muted)">
            L{side.startLine}
          </span>
        ) : null}
      </header>
      <div className="max-h-[420px] overflow-auto py-1 font-mono text-[12px] leading-5">
        {side.lines.length ? (
          side.lines.map((line, index) => {
            const presentation = lineKindPresentation[line.kind];
            return (
              <div
                className={`grid min-w-max grid-cols-[20px_44px_minmax(160px,1fr)] ${presentation.className}`}
                key={`${hunkId}-${version}-${index}`}
              >
                <span
                  aria-hidden="true"
                  className="text-center font-bold opacity-75 select-none"
                >
                  {presentation.marker}
                </span>
                <span
                  aria-hidden="true"
                  className="border-r border-r-(--border-subtle) pr-2 text-right text-(--text-muted) select-none"
                >
                  {resolveLineNumber(line, index, side.startLine)}
                </span>
                <code className="px-2 whitespace-pre">
                  {line.content || ' '}
                </code>
              </div>
            );
          })
        ) : (
          <p className="m-0 px-3 py-4 text-center font-sans text-[11px] text-(--text-muted)">
            {noLinesLabel}
          </p>
        )}
      </div>
    </section>
  );
}

export type CodeDocumentDiffViewProps = {
  className?: string;
  documentPath: string;
  hunks: readonly CodeDocumentDiffHunkPresentation[];
  labels?: Partial<CodeDocumentDiffLabels>;
  onResolveHunk?: (hunkId: string, choice: RevisionConflictChoice) => void;
};

/**
 * Renders display-ready text hunks without creating an editable CodeMirror
 * history boundary. Diff calculation and revision reconciliation stay in core.
 */
export function CodeDocumentDiffView({
  className = '',
  documentPath,
  hunks,
  labels: labelsOverride,
  onResolveHunk,
}: CodeDocumentDiffViewProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsOverride };
  const summary = summarizeCodeDocumentDiff(hunks);

  return (
    <section
      aria-label={`Code diff for ${documentPath}`}
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-(--border-default) bg-(--bg-canvas) text-(--text-primary) ${className}`.trim()}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-b-(--border-subtle) bg-(--bg-panel) px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileCode2
            aria-hidden="true"
            className="shrink-0 text-(--text-muted)"
            size={16}
          />
          <div className="min-w-0">
            <h2 className="m-0 truncate font-mono text-[12px] font-semibold">
              {documentPath}
            </h2>
            <p className="m-0 mt-0.5 text-[11px] text-(--text-muted)">
              {summary.hunkCount}{' '}
              {summary.hunkCount === 1 ? labels.hunk : labels.hunks}
              {' · '}
              {summary.conflictCount}{' '}
              {summary.conflictCount === 1 ? labels.conflict : labels.conflicts}
              {summary.conflictCount
                ? ` · ${summary.unresolvedConflictCount} ${labels.unresolved}`
                : ''}
            </p>
          </div>
        </div>
        <RevisionDiffLegend statuses={['added', 'deleted']} />
      </header>

      <div className="flex min-h-0 flex-col gap-3 overflow-auto p-3">
        {hunks.map((hunk, hunkIndex) => (
          <article
            aria-label={`Diff hunk ${hunk.id}`}
            className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-2.5"
            key={hunk.id}
          >
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <code className="truncate text-[11px] text-(--text-muted)">
                  {hunk.header ?? `@@ hunk ${hunkIndex + 1} @@`}
                </code>
                {hunk.resolution ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-(--border-subtle) bg-(--bg-canvas) px-2 py-0.5 text-[10px] font-semibold text-(--text-secondary)">
                    <Check aria-hidden="true" size={11} />
                    {labels.resolved}: {hunk.resolution.toUpperCase()}
                  </span>
                ) : null}
              </div>
              {hunk.isConflict && onResolveHunk ? (
                <div
                  aria-label={`Resolve ${hunk.id}`}
                  className="flex items-center gap-1.5"
                  role="group"
                >
                  <button
                    aria-pressed={hunk.resolution === 'local'}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-(--warning-color) bg-amber-500/5 px-2 text-[10px] font-semibold text-(--warning-color) transition-colors hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--warning-color)"
                    onClick={() => onResolveHunk(hunk.id, 'local')}
                    type="button"
                  >
                    <Laptop aria-hidden="true" size={12} />
                    {labels.useLocal}
                  </button>
                  <button
                    aria-pressed={hunk.resolution === 'remote'}
                    className="inline-flex h-7 items-center gap-1 rounded-md border-3 border-double border-violet-500 bg-violet-500/5 px-2 text-[10px] font-semibold text-violet-500 transition-colors hover:bg-violet-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                    onClick={() => onResolveHunk(hunk.id, 'remote')}
                    type="button"
                  >
                    <Cloud aria-hidden="true" size={12} />
                    {labels.useRemote}
                  </button>
                </div>
              ) : null}
            </header>

            <div
              className={`grid gap-2 ${
                hunk.base ? 'lg:grid-cols-3' : 'md:grid-cols-2'
              }`}
            >
              {hunk.base ? (
                <CodeDiffPane
                  choice={hunk.resolution}
                  hunkId={hunk.id}
                  isConflict={hunk.isConflict}
                  label={labels.base}
                  noLinesLabel={labels.noLines}
                  side={hunk.base}
                  version="base"
                />
              ) : null}
              <CodeDiffPane
                choice={hunk.resolution}
                hunkId={hunk.id}
                isConflict={hunk.isConflict}
                label={labels.local}
                noLinesLabel={labels.noLines}
                side={hunk.local}
                version="local"
              />
              <CodeDiffPane
                choice={hunk.resolution}
                hunkId={hunk.id}
                isConflict={hunk.isConflict}
                label={labels.remote}
                noLinesLabel={labels.noLines}
                side={hunk.remote}
                version="remote"
              />
            </div>
          </article>
        ))}

        {!hunks.length ? (
          <p className="m-0 rounded-lg border border-dashed border-(--border-subtle) p-8 text-center text-[12px] text-(--text-muted)">
            {labels.noChanges}
          </p>
        ) : null}
      </div>
    </section>
  );
}
