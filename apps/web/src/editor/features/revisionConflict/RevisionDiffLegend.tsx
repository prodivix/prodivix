import { Cloud, Laptop, Minus, Pencil, Plus } from 'lucide-react';
import {
  NODE_GRAPH_DIFF_SEMANTICS,
  type NodeGraphDiffStatus,
} from './revisionConflictPresentation';

const LEGEND_STATUSES: readonly NodeGraphDiffStatus[] = [
  'added',
  'deleted',
  'conflict-local',
  'conflict-remote',
  'modified',
];

const toneClasses = {
  neutral: 'border-(--border-strong) text-(--text-secondary)',
  green: 'border-(--success-color) text-(--success-color)',
  red: 'border-(--danger-color) text-(--danger-color)',
  yellow: 'border-(--warning-color) text-(--warning-color)',
  purple: 'border-violet-500 text-violet-500',
} as const;

const iconByStatus = {
  unchanged: Pencil,
  modified: Pencil,
  added: Plus,
  deleted: Minus,
  'conflict-local': Laptop,
  'conflict-remote': Cloud,
} as const;

export type RevisionDiffLegendProps = {
  className?: string;
  statuses?: readonly NodeGraphDiffStatus[];
};

export function RevisionDiffLegend({
  className = '',
  statuses = LEGEND_STATUSES,
}: RevisionDiffLegendProps) {
  return (
    <div
      aria-label="Diff legend"
      className={`flex flex-wrap items-center gap-2 text-[11px] ${className}`.trim()}
      role="list"
    >
      {statuses.map((status) => {
        const semantic = NODE_GRAPH_DIFF_SEMANTICS[status];
        const Icon = iconByStatus[status];
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-md border bg-(--bg-canvas) px-2 py-1 font-semibold tracking-[0.08em] ${toneClasses[semantic.tone]} ${
              semantic.borderStyle === 'dashed'
                ? 'border-dashed'
                : semantic.borderStyle === 'double'
                  ? 'border-3 border-double'
                  : 'border-solid'
            }`}
            key={status}
            role="listitem"
          >
            <Icon aria-hidden="true" size={12} strokeWidth={2} />
            {semantic.label}
          </span>
        );
      })}
    </div>
  );
}
