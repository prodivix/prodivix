import { useEffect, useRef, useState } from 'react';
import type { WorkspaceNodeGraphListItem } from './nodeGraphWorkspaceDocuments';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type NodeGraphGraphManagerProps = {
  activeGraphId?: string;
  activeGraphName: string;
  graphDocs: readonly WorkspaceNodeGraphListItem[];
  isBusy?: boolean;
  isExecuting?: boolean;
  onCreateGraph: () => void;
  onDeleteGraph: () => void;
  onDuplicateGraph: () => void;
  onRenameGraph: (value: string) => void;
  onDebugGraph: () => void;
  onRunGraph: () => void;
  onStopGraph: () => void;
  onSwitchGraph: (graphId: string) => void;
  t: TranslateFn;
};

export const NodeGraphGraphManager = ({
  activeGraphId,
  activeGraphName,
  graphDocs,
  isBusy = false,
  isExecuting = false,
  onCreateGraph,
  onDeleteGraph,
  onDuplicateGraph,
  onRenameGraph,
  onDebugGraph,
  onRunGraph,
  onStopGraph,
  onSwitchGraph,
  t,
}: NodeGraphGraphManagerProps) => {
  const [draftName, setDraftName] = useState(activeGraphName);
  const cancelRenameRef = useRef(false);

  useEffect(
    () => setDraftName(activeGraphName),
    [activeGraphId, activeGraphName]
  );

  const commitRename = () => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setDraftName(activeGraphName);
      return;
    }
    const nextName = draftName.trim() || activeGraphName;
    setDraftName(nextName);
    if (activeGraphId && nextName !== activeGraphName) onRenameGraph(nextName);
  };

  return (
    <div
      className="nodegraph-graph-manager nodrag nopan"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="nodegraph-graph-manager__title">
        {t('nodeGraph.manager.title', { defaultValue: 'Node Graphs' })}
      </div>
      <select
        className="nodegraph-graph-manager__select"
        value={activeGraphId ?? ''}
        disabled={!graphDocs.length || isBusy}
        onChange={(event) => onSwitchGraph(event.target.value)}
      >
        {!graphDocs.length ? (
          <option value="">
            {t('nodeGraph.manager.empty', { defaultValue: 'No graphs yet' })}
          </option>
        ) : null}
        {graphDocs.map((graph) => (
          <option key={graph.id} value={graph.id}>
            {graph.name}
            {graph.status === 'invalid' ? ' (Invalid)' : ''}
          </option>
        ))}
      </select>
      <input
        className="nodegraph-graph-manager__name"
        value={draftName}
        disabled={!activeGraphId || isBusy}
        onChange={(event) => setDraftName(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            cancelRenameRef.current = true;
            setDraftName(activeGraphName);
            event.currentTarget.blur();
          }
        }}
        placeholder={t('nodeGraph.manager.namePlaceholder', {
          defaultValue: 'Graph name',
        })}
        spellCheck={false}
      />
      <div className="nodegraph-graph-manager__actions">
        <button
          type="button"
          disabled={!activeGraphId || isBusy}
          onClick={isExecuting ? onStopGraph : onRunGraph}
        >
          {isExecuting
            ? t('nodeGraph.manager.stop', { defaultValue: 'Stop' })
            : t('nodeGraph.manager.run', { defaultValue: 'Run' })}
        </button>
        <button
          type="button"
          disabled={!activeGraphId || isBusy || isExecuting}
          onClick={onDebugGraph}
        >
          {t('nodeGraph.manager.debug', { defaultValue: 'Debug' })}
        </button>
        <button type="button" disabled={isBusy} onClick={onCreateGraph}>
          {t('nodeGraph.manager.new', { defaultValue: 'New' })}
        </button>
        <button
          type="button"
          disabled={!activeGraphId || isBusy}
          onClick={onDuplicateGraph}
        >
          {t('nodeGraph.manager.clone', { defaultValue: 'Clone' })}
        </button>
        <button
          type="button"
          disabled={!activeGraphId || isBusy}
          onClick={onDeleteGraph}
        >
          {t('nodeGraph.manager.delete', { defaultValue: 'Delete' })}
        </button>
      </div>
    </div>
  );
};
