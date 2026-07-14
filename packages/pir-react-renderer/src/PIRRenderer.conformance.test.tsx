import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PIRRenderer } from './PIRRenderer';
import {
  createContract,
  createProjectionPlan,
  createWorkspaceDocument,
  nativeHost,
} from './__tests__/pirRendererFixtures';

const emptyIssues = vi.fn();

describe('PIRRenderer Component projection conformance', () => {
  it('isolates Definition state per instance and consumes updated Definition content', () => {
    const contract = createContract({
      propsById: {
        label: { id: 'label', name: 'Label', typeRef: 'string' },
      },
    });
    const createDefinition = (heading: boolean, contentRev: number) =>
      createWorkspaceDocument({
        id: 'counter',
        type: 'pir-component',
        rootId: 'root',
        contract,
        contentRev,
        nodesById: {
          root: { id: 'root', kind: 'element', type: 'div' },
          action: {
            id: 'action',
            kind: 'element',
            type: heading ? 'h2' : 'button',
            text: { kind: 'component-prop', memberId: 'label' },
            ...(heading
              ? {}
              : {
                  events: {
                    click: {
                      kind: 'call-code' as const,
                      slotId: 'increment',
                      reference: { artifactId: 'increment-code' },
                    },
                  },
                }),
          },
          count: {
            id: 'count',
            kind: 'element',
            type: 'span',
            text: { kind: 'state', stateId: 'count' },
          },
        },
        childIdsById: { root: ['action', 'count'] },
        logic: {
          state: { count: { typeRef: 'number', initial: 0 } },
        },
      });
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'main' },
        alpha: {
          id: 'alpha',
          kind: 'component-instance',
          componentDocumentId: 'counter',
          bindings: {
            props: { label: { kind: 'literal', value: 'Alpha' } },
            events: {},
            variants: {},
          },
        },
        beta: {
          id: 'beta',
          kind: 'component-instance',
          componentDocumentId: 'counter',
          bindings: {
            props: { label: { kind: 'literal', value: 'Beta' } },
            events: {},
            variants: {},
          },
        },
      },
      childIdsById: { root: ['alpha', 'beta'] },
    });
    const initialDefinition = createDefinition(false, 1);
    const dispatchTrigger = vi.fn((request) => {
      if (request.trigger.kind !== 'call-code') return;
      request.setStateById('count', Number(request.scope.stateById.count) + 1);
    });
    const rendered = render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, initialDefinition])}
        host={nativeHost}
        dispatchTrigger={dispatchTrigger}
        onBlockingIssues={emptyIssues}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(dispatchTrigger).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(screen.getAllByText('0')).toHaveLength(1);

    const updatedDefinition = createDefinition(true, 2);
    rendered.rerender(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, updatedDefinition])}
        host={nativeHost}
        dispatchTrigger={dispatchTrigger}
        onBlockingIssues={emptyIssues}
      />
    );
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeTruthy();
  });

  it('resolves nested instances without leaking consumer params into Definition scope', () => {
    const inner = createWorkspaceDocument({
      id: 'inner',
      type: 'pir-component',
      rootId: 'inner-root',
      contract: createContract({
        propsById: {
          message: { id: 'message', name: 'Message', typeRef: 'string' },
        },
      }),
      nodesById: {
        'inner-root': {
          id: 'inner-root',
          kind: 'element',
          type: 'button',
          text: { kind: 'component-prop', memberId: 'message' },
        },
      },
    });
    const outer = createWorkspaceDocument({
      id: 'outer',
      type: 'pir-component',
      rootId: 'outer-root',
      contract: createContract({
        propsById: {
          label: { id: 'label', name: 'Label', typeRef: 'string' },
        },
      }),
      logic: {
        props: {
          local: {
            name: 'Local',
            typeRef: 'string',
            defaultValue: 'definition-default',
          },
        },
      },
      nodesById: {
        'outer-root': { id: 'outer-root', kind: 'element', type: 'section' },
        local: {
          id: 'local',
          kind: 'element',
          type: 'span',
          text: { kind: 'param', paramId: 'local' },
        },
        nested: {
          id: 'nested',
          kind: 'component-instance',
          componentDocumentId: 'inner',
          bindings: {
            props: {
              message: { kind: 'component-prop', memberId: 'label' },
            },
            events: {},
            variants: {},
          },
        },
      },
      childIdsById: { 'outer-root': ['local', 'nested'] },
    });
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'instance',
      nodesById: {
        instance: {
          id: 'instance',
          kind: 'component-instance',
          componentDocumentId: 'outer',
          bindings: {
            props: { label: { kind: 'literal', value: 'nested-value' } },
            events: {},
            variants: {},
          },
        },
      },
    });
    const onNodeSelect = vi.fn();
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, outer, inner])}
        host={nativeHost}
        rootParamsById={{ local: 'consumer-value' }}
        dispatchTrigger={vi.fn()}
        onNodeSelect={onNodeSelect}
        onBlockingIssues={emptyIssues}
      />
    );

    expect(screen.getByText('definition-default')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'nested-value' }));
    expect(onNodeSelect).toHaveBeenCalledTimes(1);
    expect(onNodeSelect.mock.calls[0]?.[0]).toMatchObject({
      documentId: 'inner',
      nodeId: 'inner-root',
      role: 'definition',
    });
    expect(onNodeSelect.mock.calls[0]?.[0].instancePath).toContain(
      '/component/'
    );
  });

  it('projects variants, public events, slot props, consumer scope, and explicit empty slots', () => {
    const definition = createWorkspaceDocument({
      id: 'card',
      type: 'pir-component',
      rootId: 'root',
      contract: createContract({
        propsById: {
          title: { id: 'title', name: 'Title', typeRef: 'string' },
          slotLabel: {
            id: 'slotLabel',
            name: 'Slot label',
            typeRef: 'string',
          },
        },
        eventsById: {
          activate: { id: 'activate', name: 'Activate' },
        },
        slotsById: {
          content: {
            id: 'content',
            name: 'Content',
            propsById: {
              label: { id: 'label', name: 'Label', typeRef: 'string' },
            },
          },
        },
        variantAxesById: {
          tone: {
            id: 'tone',
            name: 'Tone',
            defaultOptionId: 'neutral',
            optionsById: {
              neutral: { id: 'neutral', name: 'Neutral' },
              strong: { id: 'strong', name: 'Strong' },
            },
          },
        },
      }),
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'article' },
        variant: {
          id: 'variant',
          kind: 'element',
          type: 'span',
          text: { kind: 'component-variant', memberId: 'tone' },
        },
        action: {
          id: 'action',
          kind: 'element',
          type: 'button',
          text: { kind: 'component-prop', memberId: 'title' },
          events: {
            click: {
              kind: 'emit-component-event',
              memberId: 'activate',
              payload: { kind: 'component-prop', memberId: 'title' },
            },
          },
        },
        outlet: {
          id: 'outlet',
          kind: 'component-slot-outlet',
          slotMemberId: 'content',
          bindings: {
            props: {
              label: { kind: 'component-prop', memberId: 'slotLabel' },
            },
          },
        },
        fallback: {
          id: 'fallback',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'fallback-content' },
        },
      },
      childIdsById: {
        root: ['variant', 'action', 'outlet'],
        outlet: ['fallback'],
      },
    });
    const instance = (id: string) => ({
      id,
      kind: 'component-instance' as const,
      componentDocumentId: 'card',
      bindings: {
        props: {
          title: { kind: 'literal' as const, value: 'event-payload' },
          slotLabel: { kind: 'literal' as const, value: 'slot-value' },
        },
        events: {
          activate: {
            kind: 'call-code' as const,
            slotId: 'activate-handler',
            reference: { artifactId: 'activate-code' },
          },
        },
        variants: { tone: 'strong' },
      },
    });
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'root',
      logic: {
        props: {
          outside: { typeRef: 'string', defaultValue: 'outside-default' },
        },
      },
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'main' },
        fallbackInstance: instance('fallbackInstance'),
        emptyInstance: instance('emptyInstance'),
        providedInstance: instance('providedInstance'),
        providedLabel: {
          id: 'providedLabel',
          kind: 'element',
          type: 'p',
          text: { kind: 'slot-prop', memberId: 'label' },
        },
        consumerValue: {
          id: 'consumerValue',
          kind: 'element',
          type: 'p',
          text: { kind: 'param', paramId: 'outside' },
        },
      },
      childIdsById: {
        root: ['fallbackInstance', 'emptyInstance', 'providedInstance'],
      },
      regionsById: {
        emptyInstance: { content: [] },
        providedInstance: {
          content: ['providedLabel', 'consumerValue'],
        },
      },
    });
    const dispatchTrigger = vi.fn();
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page, definition])}
        host={nativeHost}
        rootParamsById={{ outside: 'consumer-only' }}
        dispatchTrigger={dispatchTrigger}
        onBlockingIssues={emptyIssues}
      />
    );

    expect(screen.getAllByText('strong')).toHaveLength(3);
    expect(screen.getByText('fallback-content')).toBeTruthy();
    expect(screen.getByText('slot-value')).toBeTruthy();
    expect(screen.getByText('consumer-only')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'event-payload' })[0]!
    );
    expect(dispatchTrigger).toHaveBeenCalledTimes(1);
    expect(dispatchTrigger.mock.calls[0]?.[0]).toMatchObject({
      trigger: { kind: 'call-code', slotId: 'activate-handler' },
      payload: 'event-payload',
      source: { documentId: 'page', nodeId: 'fallbackInstance' },
      emissionSource: { documentId: 'card', nodeId: 'action' },
    });
  });

  it('fails closed when an Element host cannot resolve a type', async () => {
    const page = createWorkspaceDocument({
      id: 'page',
      type: 'pir-page',
      rootId: 'root',
      nodesById: {
        root: {
          id: 'root',
          kind: 'element',
          type: 'UnresolvedElement',
          text: { kind: 'literal', value: 'must-not-render' },
        },
      },
    });
    const onBlockingIssues = vi.fn();
    render(
      <PIRRenderer
        plan={createProjectionPlan('page', [page])}
        host={{ resolveElement: () => undefined }}
        dispatchTrigger={vi.fn()}
        onBlockingIssues={onBlockingIssues}
      />
    );

    expect(screen.queryByText('must-not-render')).toBeNull();
    await waitFor(() =>
      expect(onBlockingIssues).toHaveBeenCalledWith([
        expect.objectContaining({
          code: 'PIR_RENDER_ELEMENT_RESOLVER_MISSING',
          documentId: 'page',
          nodeId: 'root',
        }),
      ])
    );
  });
});
