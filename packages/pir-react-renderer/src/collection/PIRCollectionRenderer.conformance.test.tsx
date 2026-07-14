import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  appendPirProjectionComponentPath,
  createPirProjectionRootPath,
  type PIRCollectionPreviewInput,
  type PIRJsonValue,
} from '@prodivix/pir';
import { PIRRenderer } from '../PIRRenderer';
import {
  createContract,
  createProjectionPlan,
  createWorkspaceDocument,
  nativeHost,
} from '../__tests__/pirRendererFixtures';

const createCounterDefinition = () =>
  createWorkspaceDocument({
    id: 'counter',
    type: 'pir-component',
    rootId: 'action',
    contract: createContract({
      propsById: {
        label: { id: 'label', name: 'Label', typeRef: 'string' },
      },
    }),
    logic: {
      state: { count: { typeRef: 'number', initial: 0 } },
    },
    nodesById: {
      action: {
        id: 'action',
        kind: 'element',
        type: 'button',
        text: { kind: 'state', stateId: 'count' },
        props: {
          'aria-label': { kind: 'component-prop', memberId: 'label' },
        },
        events: {
          click: {
            kind: 'call-code',
            slotId: 'increment',
            reference: { artifactId: 'increment-code' },
          },
        },
      },
    },
  });

const createNestedCollectionPage = (
  groups: readonly Readonly<{
    id: string;
    label: string;
    children: readonly Readonly<{ id: string; name: string }>[];
  }>[]
) =>
  createWorkspaceDocument({
    id: 'page',
    type: 'pir-page',
    rootId: 'root',
    nodesById: {
      root: { id: 'root', kind: 'element', type: 'main' },
      groups: {
        id: 'groups',
        kind: 'collection',
        source: { kind: 'literal', value: groups },
        key: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'group-item',
            path: 'id',
          },
        },
        symbols: {
          itemId: 'group-item',
          itemName: 'group',
          indexId: 'group-index',
          indexName: 'groupIndex',
        },
      },
      groupLabel: {
        id: 'groupLabel',
        kind: 'element',
        type: 'h2',
        text: {
          kind: 'collection-symbol',
          symbolId: 'group-item',
          path: 'label',
        },
      },
      children: {
        id: 'children',
        kind: 'collection',
        source: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'group-item',
            path: 'children',
          },
        },
        key: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'child-item',
            path: 'id',
          },
        },
        symbols: {
          itemId: 'child-item',
          itemName: 'child',
          indexId: 'child-index',
          indexName: 'childIndex',
        },
      },
      parentLabel: {
        id: 'parentLabel',
        kind: 'element',
        type: 'span',
        text: {
          kind: 'collection-symbol',
          symbolId: 'group-item',
          path: 'label',
        },
      },
      counter: {
        id: 'counter',
        kind: 'component-instance',
        componentDocumentId: 'counter',
        bindings: {
          props: {
            label: {
              kind: 'collection-symbol',
              symbolId: 'child-item',
              path: 'name',
            },
          },
          events: {},
          variants: {},
        },
      },
    },
    childIdsById: { root: ['groups'] },
    regionsById: {
      groups: { item: ['groupLabel', 'children'] },
      children: { item: ['parentLabel', 'counter'] },
    },
  });

describe('PIRRenderer Collection conformance', () => {
  it('keeps nested parent scope and Component state attached to stable item keys', () => {
    const alpha = {
      id: 'alpha',
      label: 'Group Alpha',
      children: [
        { id: 'alpha-one', name: 'Alpha One' },
        { id: 'alpha-two', name: 'Alpha Two' },
      ],
    } as const;
    const beta = {
      id: 'beta',
      label: 'Group Beta',
      children: [{ id: 'beta-one', name: 'Beta One' }],
    } as const;
    const definition = createCounterDefinition();
    const dispatchTrigger = vi.fn((request) => {
      if (request.trigger.kind !== 'call-code') return;
      request.setStateById('count', Number(request.scope.stateById.count) + 1);
    });
    const page = createNestedCollectionPage([alpha, beta]);
    const rendered = render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, definition])}
        host={nativeHost}
        dispatchTrigger={dispatchTrigger}
        onBlockingIssues={vi.fn()}
      />
    );

    expect(screen.getAllByText('Group Alpha')).toHaveLength(3);
    expect(screen.getAllByText('Group Beta')).toHaveLength(2);
    const alphaOne = screen.getByRole('button', { name: 'Alpha One' });
    fireEvent.click(alphaOne);
    expect(alphaOne.textContent).toBe('1');

    const reorderedPage = createNestedCollectionPage([beta, alpha]);
    rendered.rerender(
      <PIRRenderer
        plan={createProjectionPlan('page', [reorderedPage, definition])}
        host={nativeHost}
        dispatchTrigger={dispatchTrigger}
        onBlockingIssues={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Alpha One' }).textContent).toBe(
      '1'
    );
    expect(screen.getByRole('button', { name: 'Beta One' }).textContent).toBe(
      '0'
    );
  });

  it.each([
    ['auto', 'item-region'],
    ['item', 'item-region'],
    ['empty', 'empty-region'],
    ['loading', 'loading-region'],
    ['error', 'manual-error'],
  ] as const)('projects the %s preview state', (state, expectedText) => {
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'collection',
      nodesById: {
        collection: {
          id: 'collection',
          kind: 'collection',
          source: { kind: 'literal', value: [{ id: 'one' }] },
          key: {
            kind: 'binding',
            value: {
              kind: 'collection-symbol',
              symbolId: 'item',
              path: 'id',
            },
          },
          symbols: {
            itemId: 'item',
            itemName: 'item',
            indexId: 'index',
            indexName: 'index',
            errorId: 'error',
          },
        },
        item: {
          id: 'item',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'item-region' },
        },
        empty: {
          id: 'empty',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'empty-region' },
        },
        loading: {
          id: 'loading',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'loading-region' },
        },
        error: {
          id: 'error',
          kind: 'element',
          type: 'p',
          text: {
            kind: 'collection-symbol',
            symbolId: 'error',
            path: 'message',
          },
        },
      },
      regionsById: {
        collection: {
          item: ['item'],
          empty: ['empty'],
          loading: ['loading'],
          error: ['error'],
        },
      },
    });
    const preview: PIRCollectionPreviewInput =
      state === 'error'
        ? { state, errorValue: { message: 'manual-error' } }
        : { state };
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page])}
        host={nativeHost}
        resolveCollectionPreviewState={() => preview}
        dispatchTrigger={vi.fn()}
        onBlockingIssues={vi.fn()}
      />
    );

    expect(screen.getByText(expectedText)).toBeTruthy();
  });

  it('resolves manual preview state by the full Component instance path', () => {
    const definition = createWorkspaceDocument({
      id: 'list',
      type: 'pir-component',
      rootId: 'collection',
      contract: createContract(),
      nodesById: {
        collection: {
          id: 'collection',
          kind: 'collection',
          source: { kind: 'literal', value: ['value'] },
          key: { kind: 'index' },
          symbols: {
            itemId: 'item',
            itemName: 'item',
            indexId: 'index',
            indexName: 'index',
          },
        },
        item: {
          id: 'item',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'instance-item' },
        },
        loading: {
          id: 'loading',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'instance-loading' },
        },
      },
      regionsById: {
        collection: { item: ['item'], loading: ['loading'] },
      },
    });
    const instance = (id: string) => ({
      id,
      kind: 'component-instance' as const,
      componentDocumentId: 'list',
      bindings: { props: {}, events: {}, variants: {} },
    });
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'main' },
        left: instance('left'),
        right: instance('right'),
      },
      childIdsById: { root: ['left', 'right'] },
    });
    const leftPath = appendPirProjectionComponentPath(
      createPirProjectionRootPath('page'),
      'page',
      'left',
      'list'
    );
    const resolveCollectionPreviewState = vi.fn(
      (location) =>
        ({
          state: location.instancePath === leftPath ? 'loading' : 'auto',
        }) as const
    );
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, definition])}
        host={nativeHost}
        resolveCollectionPreviewState={resolveCollectionPreviewState}
        dispatchTrigger={vi.fn()}
        onBlockingIssues={vi.fn()}
      />
    );

    expect(screen.getByText('instance-loading')).toBeTruthy();
    expect(screen.getByText('instance-item')).toBeTruthy();
    expect(
      new Set(
        resolveCollectionPreviewState.mock.calls.map(
          ([location]) => location.instancePath
        )
      )
    ).toEqual(
      new Set([
        leftPath,
        appendPirProjectionComponentPath(
          createPirProjectionRootPath('page'),
          'page',
          'right',
          'list'
        ),
      ])
    );
    for (const [location] of resolveCollectionPreviewState.mock.calls) {
      expect(Object.keys(location).sort()).toEqual([
        'documentId',
        'instancePath',
        'nodeId',
      ]);
      expect(location).not.toHaveProperty('role');
    }
  });

  it('fails closed and reports a dynamic non-array source', async () => {
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'collection',
      nodesById: {
        collection: {
          id: 'collection',
          kind: 'collection',
          source: {
            kind: 'binding',
            value: { kind: 'param', paramId: 'items' },
          },
          key: { kind: 'index' },
          symbols: {
            itemId: 'item',
            itemName: 'item',
            indexId: 'index',
            indexName: 'index',
          },
        },
        item: {
          id: 'item',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'must-not-render' },
        },
      },
      regionsById: { collection: { item: ['item'] } },
    });
    const onBlockingIssues = vi.fn();
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page])}
        host={nativeHost}
        rootParamsById={{ items: { not: 'an array' } }}
        dispatchTrigger={vi.fn()}
        onBlockingIssues={onBlockingIssues}
      />
    );

    expect(screen.queryByText('must-not-render')).toBeNull();
    await waitFor(() =>
      expect(onBlockingIssues).toHaveBeenLastCalledWith([
        expect.objectContaining({
          code: 'PIR_RENDER_COLLECTION_PROJECTION_BLOCKED',
          documentId: 'page',
          nodeId: 'collection',
        }),
      ])
    );
  });

  it('locates a dynamic Collection issue to one Component instance path', async () => {
    const definition = createWorkspaceDocument({
      id: 'list',
      type: 'pir-component',
      rootId: 'collection',
      contract: createContract({
        propsById: {
          items: { id: 'items', name: 'Items', typeRef: 'unknown' },
        },
      }),
      nodesById: {
        collection: {
          id: 'collection',
          kind: 'collection',
          source: {
            kind: 'binding',
            value: { kind: 'component-prop', memberId: 'items' },
          },
          key: { kind: 'index' },
          symbols: {
            itemId: 'item',
            itemName: 'item',
            indexId: 'index',
            indexName: 'index',
          },
        },
        item: {
          id: 'item',
          kind: 'element',
          type: 'p',
          text: { kind: 'collection-symbol', symbolId: 'item' },
        },
      },
      regionsById: { collection: { item: ['item'] } },
    });
    const instance = (id: string, items: PIRJsonValue) => ({
      id,
      kind: 'component-instance' as const,
      componentDocumentId: 'list',
      bindings: {
        props: { items: { kind: 'literal' as const, value: items } },
        events: {},
        variants: {},
      },
    });
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'main' },
        left: instance('left', { invalid: true }),
        right: instance('right', ['right-item']),
      },
      childIdsById: { root: ['left', 'right'] },
    });
    const rootPath = createPirProjectionRootPath('page');
    const leftPath = appendPirProjectionComponentPath(
      rootPath,
      'page',
      'left',
      'list'
    );
    const rightPath = appendPirProjectionComponentPath(
      rootPath,
      'page',
      'right',
      'list'
    );
    const onBlockingIssues = vi.fn();
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, definition])}
        host={nativeHost}
        dispatchTrigger={vi.fn()}
        onBlockingIssues={onBlockingIssues}
      />
    );

    expect(screen.getByText('right-item')).toBeTruthy();
    await waitFor(() =>
      expect(onBlockingIssues).toHaveBeenLastCalledWith([
        expect.objectContaining({
          code: 'PIR_RENDER_COLLECTION_PROJECTION_BLOCKED',
          causeCode: 'PIR_COLLECTION_SOURCE_NOT_ARRAY',
          documentId: 'list',
          nodeId: 'collection',
          instancePath: leftPath,
        }),
      ])
    );
    const latestIssues = onBlockingIssues.mock.calls.at(-1)?.[0] ?? [];
    expect(latestIssues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instancePath: rightPath }),
      ])
    );
  });
});
