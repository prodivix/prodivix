import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceNodeGraphListItem } from '../nodeGraphWorkspaceDocuments';
import type { NodeGraphWorkspaceWriteOutcome } from '../nodeGraphEditorTypes';
import { useNodeGraphWorkspaceDocumentManager } from '../useNodeGraphWorkspaceDocumentManager';

const createGraphListItem = (id: string): WorkspaceNodeGraphListItem => {
  const document = {
    id,
    type: 'pir-graph' as const,
    path: `/graphs/${id}.graph.json`,
    contentRev: 1,
    metaRev: 1,
    content: { version: 2 as const, nodes: [], edges: [] },
  };
  return {
    id,
    name: id,
    path: document.path,
    status: 'valid',
    read: {
      status: 'valid',
      document,
      decodedContent: { nodes: [], edges: [] },
      sourceWireVersion: 2,
    },
  };
};

const renderManager = (
  persistCanvas: () => Promise<NodeGraphWorkspaceWriteOutcome>
) => {
  const graphDocs = [createGraphListItem('graph-a'), createGraphListItem('b')];
  const setActiveDocumentId = vi.fn();
  const setHint = vi.fn();
  const view = renderHook(() =>
    useNodeGraphWorkspaceDocumentManager({
      activeGraph: graphDocs[0],
      activeGraphId: graphDocs[0]!.id,
      edges: [],
      graphDocs,
      keepAtLeastOneGraphHint: 'keep-one',
      localizeNodeLabel: (node) => node,
      nodes: [],
      persistCanvas,
      scheduleWorkspaceIntent: () => Promise.resolve(true),
      setActiveDocumentId,
      setHint,
      t: (key) => key,
    })
  );
  return { setActiveDocumentId, setHint, view };
};

describe('NodeGraph document switching', () => {
  it('switches graphs when the canvas already matches its document', async () => {
    const { setActiveDocumentId, setHint, view } = renderManager(() =>
      Promise.resolve('unchanged')
    );

    view.result.current.switchGraph('b');

    await waitFor(() => expect(setActiveDocumentId).toHaveBeenCalledWith('b'));
    expect(setHint).not.toHaveBeenCalled();
  });

  it('switches graphs after the pending canvas revision is written', async () => {
    const { setActiveDocumentId, setHint, view } = renderManager(() =>
      Promise.resolve('applied')
    );

    view.result.current.switchGraph('b');

    await waitFor(() => expect(setActiveDocumentId).toHaveBeenCalledWith('b'));
    expect(setHint).not.toHaveBeenCalled();
  });

  it('keeps the active graph and explains why when the write is refused', async () => {
    const { setActiveDocumentId, setHint, view } = renderManager(() =>
      Promise.resolve('rejected')
    );

    view.result.current.switchGraph('b');

    await waitFor(() => expect(setHint).toHaveBeenCalledTimes(1));
    expect(setActiveDocumentId).not.toHaveBeenCalled();
  });
});
