import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataSourceDocument } from '@prodivix/data';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { DataManualAuthoringPanel } from './DataManualAuthoringPanel';

const dataDocument = (): DataSourceDocument => ({
  source: {
    id: 'catalog',
    adapterId: 'http',
    runtimeZone: 'server',
    bindingsById: {},
    configurationByKey: {},
  },
  schemasById: {
    product: {
      id: 'product',
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {},
      },
    },
  },
  operationsById: {},
});

const workspaceWithData = (): WorkspaceSnapshot => ({
  id: 'project-data',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: { id: 'root', kind: 'dir', name: '/', parentId: null, children: [] },
  },
  docsById: {
    'data-catalog': {
      id: 'data-catalog',
      type: 'data-source',
      path: '/data/catalog.data.json',
      contentRev: 3,
      metaRev: 1,
      content: dataDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const schemaField = () =>
  screen.getByLabelText(
    'resourceManager.data.authoring.schemaJson'
  ) as HTMLTextAreaElement;

afterEach(() => {
  act(() => useEditorStore.setState({ workspace: null }));
});

describe('DataManualAuthoringPanel drafts', () => {
  it('keeps a manual JSON draft when an unrelated Workspace mutation lands', () => {
    const workspace = workspaceWithData();
    act(() => useEditorStore.setState({ workspace, workspaceReadonly: false }));
    render(<DataManualAuthoringPanel documentId="data-catalog" />);

    fireEvent.change(schemaField(), {
      target: { value: '{ "title": "authored by hand"' },
    });

    // A settings commit or outbox ack replaces the snapshot object while every
    // untouched document keeps its identity.
    act(() =>
      useEditorStore.setState({
        workspace: { ...workspace, workspaceRev: 2, opSeq: 2 },
      })
    );

    expect(schemaField().value).toBe('{ "title": "authored by hand"');
  });

  it('keeps a focused draft even when the Data document itself changes', () => {
    const workspace = workspaceWithData();
    act(() => useEditorStore.setState({ workspace, workspaceReadonly: false }));
    render(<DataManualAuthoringPanel documentId="data-catalog" />);

    fireEvent.focus(schemaField());
    fireEvent.change(schemaField(), {
      target: { value: '{ "title": "authored by hand"' },
    });

    act(() =>
      useEditorStore.setState({
        workspace: {
          ...workspace,
          workspaceRev: 2,
          opSeq: 2,
          docsById: {
            'data-catalog': {
              ...workspace.docsById['data-catalog'],
              contentRev: 4,
            },
          },
        },
      })
    );

    expect(schemaField().value).toBe('{ "title": "authored by hand"');
  });
});
