import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { Check, Cloud, Laptop, Minus, Pencil, Plus } from 'lucide-react';
import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import { RevisionDiffLegend } from './RevisionDiffLegend';
import {
  NODE_GRAPH_DIFF_SEMANTICS,
  summarizeNodeGraphDiff,
  validateNodeGraphDiffPresentation,
  type NodeGraphDiffEdgePresentation,
  type NodeGraphDiffFieldPresentation,
  type NodeGraphDiffNodePresentation,
  type NodeGraphDiffPortPresentation,
  type NodeGraphDiffStatus,
  type NodeGraphDiffTone,
  type RevisionConflictChoice,
} from './revisionConflictPresentation';

const nodeToneClasses: Readonly<Record<NodeGraphDiffTone, string>> = {
  neutral: 'border-(--border-strong) bg-(--bg-canvas)',
  green: 'border-(--success-color) bg-green-500/10',
  red: 'border-(--danger-color) bg-red-500/10',
  yellow:
    'border-(--warning-color) bg-amber-500/10 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgb(245_158_11/0.07)_10px,rgb(245_158_11/0.07)_11px)]',
  purple:
    'border-violet-500 bg-violet-500/10 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_10px,rgb(139_92_246/0.075)_10px,rgb(139_92_246/0.075)_11px)]',
};

const badgeToneClasses: Readonly<Record<NodeGraphDiffTone, string>> = {
  neutral: 'border-(--border-subtle) text-(--text-secondary)',
  green: 'border-(--success-color) text-(--success-color)',
  red: 'border-(--danger-color) text-(--danger-color)',
  yellow: 'border-(--warning-color) text-(--warning-color)',
  purple: 'border-violet-500 text-violet-500',
};

const iconByStatus = {
  unchanged: Pencil,
  modified: Pencil,
  added: Plus,
  deleted: Minus,
  'conflict-local': Laptop,
  'conflict-remote': Cloud,
} as const;

const edgeColorByTone: Readonly<Record<NodeGraphDiffTone, string>> = {
  neutral: 'var(--border-strong)',
  green: 'var(--success-color)',
  red: 'var(--danger-color)',
  yellow: 'var(--warning-color)',
  purple: '#8b5cf6',
};

const hiddenHandleStyle: CSSProperties = {
  border: 0,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  width: 1,
};

export type NodeGraphDiffLabels = {
  base: string;
  changedFields: string;
  conflicts: string;
  edgeConflicts: string;
  field: string;
  graph: string;
  invalidPresentation: string;
  local: string;
  noFieldDetails: string;
  remote: string;
  unresolved: string;
  useLocal: string;
  useRemote: string;
};

const DEFAULT_LABELS: NodeGraphDiffLabels = {
  base: 'BASE',
  changedFields: 'Changed fields',
  conflicts: 'conflicts',
  edgeConflicts: 'Edge conflicts',
  field: 'Field',
  graph: 'Node graph revision diff',
  invalidPresentation: 'Invalid graph diff presentation.',
  local: 'LOCAL',
  noFieldDetails: 'No field-level details supplied.',
  remote: 'REMOTE',
  unresolved: 'unresolved',
  useLocal: 'Use local',
  useRemote: 'Use remote',
};

type NodeGraphDiffFlowData = Record<string, unknown> & {
  labels: NodeGraphDiffLabels;
  onResolveConflict?: (
    entityId: string,
    choice: RevisionConflictChoice
  ) => void;
  onSelectNode?: (visualId: string, entityId: string) => void;
  presentation: NodeGraphDiffNodePresentation;
};

type NodeGraphDiffFlowNode = Node<
  NodeGraphDiffFlowData,
  'revisionConflictDiffNode'
>;

const resolveBorderClass = (status: NodeGraphDiffStatus) => {
  const style = NODE_GRAPH_DIFF_SEMANTICS[status].borderStyle;
  if (style === 'dashed') return 'border-dashed';
  if (style === 'double') return 'border-3 border-double';
  return 'border-solid';
};

const handleKeyboardSelection = (
  event: KeyboardEvent<HTMLDivElement>,
  onSelect: (() => void) | undefined
) => {
  if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  onSelect();
};

function NodeGraphDiffPortList({
  ports,
}: {
  ports: readonly NodeGraphDiffPortPresentation[];
}) {
  return (
    <div aria-label="Changed ports" className="grid gap-1" role="list">
      {ports.map((port) => {
        const semantic = NODE_GRAPH_DIFF_SEMANTICS[port.status];
        const Icon = iconByStatus[port.status];
        return (
          <div
            className={`flex items-center justify-between gap-2 rounded-md border bg-(--bg-canvas)/85 px-1.5 py-1 ${badgeToneClasses[semantic.tone]} ${resolveBorderClass(
              port.status
            )}`}
            key={port.visualId}
            role="listitem"
          >
            <span className="flex min-w-0 items-center gap-1">
              <Icon aria-hidden="true" size={10} />
              <span className="truncate">{port.label}</span>
            </span>
            <span className="shrink-0 font-mono text-[8px] font-bold tracking-[0.08em]">
              {port.role === 'input' ? 'IN' : 'OUT'} · {semantic.symbol}{' '}
              {semantic.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NodeGraphDiffFlowNode({
  data,
  selected,
}: NodeProps<NodeGraphDiffFlowNode>) {
  const { labels, onResolveConflict, onSelectNode, presentation } = data;
  const semantic = NODE_GRAPH_DIFF_SEMANTICS[presentation.status];
  const Icon = iconByStatus[presentation.status];
  const conflictChoice =
    presentation.status === 'conflict-local'
      ? 'local'
      : presentation.status === 'conflict-remote'
        ? 'remote'
        : undefined;
  const selectNode = onSelectNode
    ? () => onSelectNode(presentation.visualId, presentation.entityId)
    : undefined;

  return (
    <div
      aria-label={`${semantic.label} ${presentation.label}`}
      className={`min-w-[210px] overflow-hidden rounded-xl border-2 text-(--text-primary) shadow-(--shadow-md) ${nodeToneClasses[semantic.tone]} ${resolveBorderClass(
        presentation.status
      )} ${presentation.status === 'deleted' ? 'opacity-70' : ''} ${
        selected
          ? 'ring-2 ring-(--text-primary) ring-offset-2 ring-offset-(--bg-canvas)'
          : ''
      }`}
      onClick={selectNode}
      onKeyDown={(event) => handleKeyboardSelection(event, selectNode)}
      role={selectNode ? 'button' : 'group'}
      tabIndex={selectNode ? 0 : undefined}
    >
      <Handle
        position={Position.Left}
        style={hiddenHandleStyle}
        type="target"
      />
      <header className="flex items-center justify-between gap-2 border-b border-b-(--border-subtle) bg-(--bg-canvas)/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" size={14} strokeWidth={2.2} />
          <span className="truncate text-[12px] font-semibold">
            {presentation.label}
          </span>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border bg-(--bg-canvas) px-1.5 py-0.5 text-[9px] font-bold tracking-[0.12em] ${badgeToneClasses[semantic.tone]} ${resolveBorderClass(
            presentation.status
          )}`}
        >
          <span aria-hidden="true">{semantic.symbol}</span>
          {semantic.label}
        </span>
      </header>
      <div className="grid gap-1.5 px-3 py-2.5 text-[10px] text-(--text-secondary)">
        {presentation.nodeKind ? (
          <code className="truncate text-(--text-muted)">
            {presentation.nodeKind}
          </code>
        ) : null}
        {presentation.description ? (
          <p className="m-0 line-clamp-2 leading-4">
            {presentation.description}
          </p>
        ) : null}
        {presentation.changedFields?.length ? (
          <p className="m-0 truncate font-mono text-[9px] text-(--text-muted)">
            {presentation.changedFields
              .slice(0, 3)
              .map((field) => field.path)
              .join(' · ')}
          </p>
        ) : null}
        {presentation.ports?.length ? (
          <NodeGraphDiffPortList ports={presentation.ports} />
        ) : null}
        {conflictChoice && onResolveConflict ? (
          <button
            aria-pressed={presentation.resolution === conflictChoice}
            className={`nodrag nopan mt-1 inline-flex h-7 items-center justify-center gap-1 rounded-md border bg-(--bg-canvas) px-2 font-semibold ${badgeToneClasses[semantic.tone]} ${resolveBorderClass(
              presentation.status
            )} hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-primary)`}
            onClick={(event) => {
              event.stopPropagation();
              onResolveConflict(presentation.entityId, conflictChoice);
            }}
            type="button"
          >
            {presentation.resolution === conflictChoice ? (
              <Check aria-hidden="true" size={12} />
            ) : (
              <Icon aria-hidden="true" size={12} />
            )}
            {conflictChoice === 'local' ? labels.useLocal : labels.useRemote}
          </button>
        ) : null}
      </div>
      <Handle
        position={Position.Right}
        style={hiddenHandleStyle}
        type="source"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  revisionConflictDiffNode: NodeGraphDiffFlowNode,
};

const createFlowEdge = (edge: NodeGraphDiffEdgePresentation): Edge => {
  const semantic = NODE_GRAPH_DIFF_SEMANTICS[edge.status];
  const color = edgeColorByTone[semantic.tone];
  return {
    id: edge.visualId,
    source: edge.sourceVisualId,
    target: edge.targetVisualId,
    label: `${semantic.symbol} ${semantic.label}${edge.label ? ` · ${edge.label}` : ''}`,
    labelBgBorderRadius: 4,
    labelBgPadding: [4, 2],
    labelBgStyle: {
      fill: 'var(--bg-canvas)',
      fillOpacity: 0.94,
    },
    labelStyle: {
      fill: color,
      fontFamily: 'var(--font-family-ui)',
      fontSize: 9,
      fontWeight: 700,
    },
    style: {
      stroke: color,
      strokeDasharray: semantic.edgeDash,
      strokeWidth: semantic.borderStyle === 'double' ? 4 : 2,
    },
    type: 'smoothstep',
  };
};

const formatFieldValue = (value: string | undefined) => value ?? '—';

export type NodeGraphDiffDetailsPanelProps = {
  labels?: Partial<NodeGraphDiffLabels>;
  node: NodeGraphDiffNodePresentation;
  onResolveConflict?: (
    entityId: string,
    choice: RevisionConflictChoice
  ) => void;
};

export function NodeGraphDiffDetailsPanel({
  labels: labelsOverride,
  node,
  onResolveConflict,
}: NodeGraphDiffDetailsPanelProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsOverride };
  const fields = node.changedFields ?? [];
  const isConflict =
    node.status === 'conflict-local' || node.status === 'conflict-remote';

  return (
    <aside
      aria-label={`Diff details for ${node.label}`}
      className="overflow-hidden rounded-xl border border-(--border-default) bg-(--bg-canvas)"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-b-(--border-subtle) bg-(--bg-panel) px-3 py-2">
        <div>
          <h3 className="m-0 text-[12px] font-semibold">{node.label}</h3>
          <p className="m-0 mt-0.5 font-mono text-[10px] text-(--text-muted)">
            {node.entityId} · {labels.changedFields}: {fields.length}
          </p>
        </div>
        {isConflict && onResolveConflict ? (
          <div className="flex items-center gap-1.5">
            <button
              aria-pressed={node.resolution === 'local'}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-(--warning-color) bg-amber-500/5 px-2 text-[10px] font-semibold text-(--warning-color) hover:bg-amber-500/15"
              onClick={() => onResolveConflict(node.entityId, 'local')}
              type="button"
            >
              <Laptop aria-hidden="true" size={12} />
              {labels.useLocal}
            </button>
            <button
              aria-pressed={node.resolution === 'remote'}
              className="inline-flex h-7 items-center gap-1 rounded-md border-3 border-double border-violet-500 bg-violet-500/5 px-2 text-[10px] font-semibold text-violet-500 hover:bg-violet-500/15"
              onClick={() => onResolveConflict(node.entityId, 'remote')}
              type="button"
            >
              <Cloud aria-hidden="true" size={12} />
              {labels.useRemote}
            </button>
          </div>
        ) : null}
      </header>

      {fields.length ? (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-left font-mono text-[10px]">
            <thead className="bg-(--bg-panel) text-(--text-muted)">
              <tr>
                <th className="border-b border-b-(--border-subtle) px-3 py-2 font-semibold">
                  {labels.field}
                </th>
                <th className="border-b border-b-(--border-subtle) px-3 py-2 font-semibold">
                  {labels.base}
                </th>
                <th className="border-b border-b-(--warning-color) bg-amber-500/5 px-3 py-2 font-semibold text-(--warning-color)">
                  {labels.local}
                </th>
                <th className="border-b border-b-violet-500 bg-violet-500/5 px-3 py-2 font-semibold text-violet-500">
                  {labels.remote}
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <NodeGraphDiffFieldRow field={field} key={field.path} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 p-4 text-[11px] text-(--text-muted)">
          {labels.noFieldDetails}
        </p>
      )}
    </aside>
  );
}

function NodeGraphDiffFieldRow({
  field,
}: {
  field: NodeGraphDiffFieldPresentation;
}) {
  return (
    <tr>
      <th className="border-b border-b-(--border-subtle) px-3 py-2 font-medium text-(--text-secondary)">
        {field.path}
      </th>
      <td className="max-w-64 border-b border-b-(--border-subtle) px-3 py-2 whitespace-pre-wrap text-(--text-muted)">
        {formatFieldValue(field.base)}
      </td>
      <td
        className={`max-w-64 border-b px-3 py-2 whitespace-pre-wrap ${
          field.isConflict
            ? 'border-b-(--warning-color) bg-amber-500/10 text-(--text-primary)'
            : 'border-b-(--border-subtle) text-(--text-secondary)'
        }`}
      >
        {formatFieldValue(field.local)}
      </td>
      <td
        className={`max-w-64 border-b px-3 py-2 whitespace-pre-wrap ${
          field.isConflict
            ? 'border-b-violet-500 bg-violet-500/10 text-(--text-primary)'
            : 'border-b-(--border-subtle) text-(--text-secondary)'
        }`}
      >
        {formatFieldValue(field.remote)}
      </td>
    </tr>
  );
}

export type NodeGraphDiffViewProps = {
  className?: string;
  colorMode?: 'light' | 'dark';
  edges: readonly NodeGraphDiffEdgePresentation[];
  height?: number;
  labels?: Partial<NodeGraphDiffLabels>;
  nodes: readonly NodeGraphDiffNodePresentation[];
  onResolveConflict?: (
    entityId: string,
    choice: RevisionConflictChoice
  ) => void;
  onSelectNode?: (visualId: string, entityId: string) => void;
  selectedVisualId?: string;
};

/**
 * Displays semantic graph changes on a read-only React Flow canvas. Conflicted
 * entities remain two separate LOCAL and REMOTE visuals; this component never
 * combines them into a blended state.
 */
export function NodeGraphDiffView({
  className = '',
  colorMode = 'light',
  edges,
  height = 520,
  labels: labelsOverride,
  nodes,
  onResolveConflict,
  onSelectNode,
  selectedVisualId,
}: NodeGraphDiffViewProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsOverride };
  const issues = useMemo(
    () => validateNodeGraphDiffPresentation(nodes, edges),
    [edges, nodes]
  );
  const summary = useMemo(() => summarizeNodeGraphDiff(nodes), [nodes]);
  const flowNodes = useMemo<NodeGraphDiffFlowNode[]>(
    () =>
      nodes.map((presentation) => ({
        data: {
          labels,
          onResolveConflict,
          onSelectNode,
          presentation,
        },
        id: presentation.visualId,
        position: presentation.position,
        selected: presentation.visualId === selectedVisualId,
        type: 'revisionConflictDiffNode',
      })),
    [labels, nodes, onResolveConflict, onSelectNode, selectedVisualId]
  );
  const flowEdges = useMemo(() => edges.map(createFlowEdge), [edges]);
  const selectedNode = nodes.find((node) => node.visualId === selectedVisualId);
  const conflictedEdges = useMemo(() => {
    const byEntityId = new Map<
      string,
      {
        entityId: string;
        label?: string;
        resolution?: RevisionConflictChoice;
      }
    >();
    edges.forEach((edge) => {
      if (!edge.conflictIds?.length) return;
      byEntityId.set(edge.entityId, {
        entityId: edge.entityId,
        label: edge.label,
        resolution: edge.resolution,
      });
    });
    return [...byEntityId.values()];
  }, [edges]);

  return (
    <section
      aria-label={labels.graph}
      className={`flex min-h-0 flex-col gap-3 rounded-xl border border-(--border-default) bg-(--bg-panel) p-3 text-(--text-primary) ${className}`.trim()}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[13px] font-semibold">{labels.graph}</h2>
          <p className="m-0 mt-1 text-[10px] text-(--text-muted)">
            +{summary.addedCount} · −{summary.deletedCount} · ~
            {summary.modifiedCount} · {summary.conflictCount} {labels.conflicts}
            {' · '}
            {summary.unresolvedConflictCount} {labels.unresolved}
          </p>
        </div>
        <RevisionDiffLegend />
      </header>

      {issues.length ? (
        <div
          className="rounded-lg border border-(--danger-color) bg-red-500/10 px-3 py-2 text-[11px] text-(--danger-color)"
          role="alert"
        >
          <strong>{labels.invalidPresentation}</strong>{' '}
          {issues.map((issue) => issue.message).join(' ')}
        </div>
      ) : null}

      <div
        className="min-h-80 overflow-hidden rounded-lg border border-(--border-subtle) bg-(--bg-canvas)"
        style={{ height }}
      >
        <ReactFlowProvider>
          <ReactFlow<NodeGraphDiffFlowNode, Edge>
            colorMode={colorMode}
            edges={flowEdges}
            edgesFocusable
            edgesReconnectable={false}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.25 }}
            maxZoom={1.8}
            minZoom={0.25}
            nodes={flowNodes}
            nodesConnectable={false}
            nodesDraggable={false}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) =>
              onSelectNode?.(node.id, node.data.presentation.entityId)
            }
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color={
                colorMode === 'dark'
                  ? 'rgb(255 255 255 / 0.12)'
                  : 'rgb(15 23 42 / 0.14)'
              }
              gap={20}
              size={1}
              variant={BackgroundVariant.Dots}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {selectedNode ? (
        <NodeGraphDiffDetailsPanel
          labels={labels}
          node={selectedNode}
          onResolveConflict={onResolveConflict}
        />
      ) : null}

      {conflictedEdges.length && onResolveConflict ? (
        <aside className="overflow-hidden rounded-xl border border-(--border-default) bg-(--bg-canvas)">
          <header className="border-b border-b-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-[11px] font-semibold">
            {labels.edgeConflicts}
          </header>
          <div className="grid gap-1.5 p-2">
            {conflictedEdges.map((edge) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--border-subtle) px-2.5 py-2"
                key={edge.entityId}
              >
                <code className="min-w-0 truncate text-[10px] text-(--text-secondary)">
                  {edge.label ?? edge.entityId}
                </code>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-pressed={edge.resolution === 'local'}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-(--warning-color) bg-amber-500/5 px-2 text-[10px] font-semibold text-(--warning-color) hover:bg-amber-500/15"
                    onClick={() => onResolveConflict(edge.entityId, 'local')}
                    type="button"
                  >
                    <Laptop aria-hidden="true" size={12} />
                    {labels.useLocal}
                  </button>
                  <button
                    aria-pressed={edge.resolution === 'remote'}
                    className="inline-flex h-7 items-center gap-1 rounded-md border-3 border-double border-violet-500 bg-violet-500/5 px-2 text-[10px] font-semibold text-violet-500 hover:bg-violet-500/15"
                    onClick={() => onResolveConflict(edge.entityId, 'remote')}
                    type="button"
                  >
                    <Cloud aria-hidden="true" size={12} />
                    {labels.useRemote}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
