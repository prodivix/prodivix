import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CodeDocumentDiffView,
  NodeGraphDiffDetailsPanel,
  type CodeDocumentDiffHunkPresentation,
  type NodeGraphDiffNodePresentation,
} from '@/editor/features/revisionConflict';

const conflictHunk: CodeDocumentDiffHunkPresentation = {
  base: {
    lines: [
      { content: 'const mode = "base";', kind: 'deleted', lineNumber: 4 },
    ],
    startLine: 4,
  },
  header: '@@ mode @@',
  id: 'mode-hunk',
  isConflict: true,
  local: {
    lines: [
      { content: 'const mode = "local";', kind: 'modified', lineNumber: 4 },
    ],
    startLine: 4,
  },
  remote: {
    lines: [
      { content: 'const mode = "remote";', kind: 'modified', lineNumber: 4 },
    ],
    startLine: 4,
  },
};

const conflictNode: NodeGraphDiffNodePresentation = {
  changedFields: [
    {
      base: 'base-value',
      isConflict: true,
      local: 'local-value',
      path: 'data.value',
      remote: 'remote-value',
    },
  ],
  entityId: 'node-a',
  label: 'Transform',
  position: { x: 0, y: 0 },
  status: 'conflict-local',
  visualId: 'node-a::local',
};

describe('revision conflict views', () => {
  it('reports a code hunk resolution through its pure callback', () => {
    const onResolveHunk = vi.fn();
    render(
      <CodeDocumentDiffView
        documentPath="scripts/mode.ts"
        hunks={[conflictHunk]}
        onResolveHunk={onResolveHunk}
      />
    );

    expect(screen.getByRole('region', { name: 'BASE mode-hunk' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'LOCAL mode-hunk' })
    ).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'REMOTE mode-hunk' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use remote' }));
    expect(onResolveHunk).toHaveBeenCalledWith('mode-hunk', 'remote');
  });

  it('reports field-level node resolution without owning conflict state', () => {
    const onResolveConflict = vi.fn();
    render(
      <NodeGraphDiffDetailsPanel
        node={conflictNode}
        onResolveConflict={onResolveConflict}
      />
    );

    expect(screen.getByText('base-value')).toBeTruthy();
    expect(screen.getByText('local-value')).toBeTruthy();
    expect(screen.getByText('remote-value')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use local' }));
    expect(onResolveConflict).toHaveBeenCalledWith('node-a', 'local');
  });
});
