import { describe, expect, it } from 'vitest';
import type { PIRElementNode } from '@prodivix/pir';
import { projectEvents, toElementNode } from './bindingProjection';

describe('Blueprint Inspector Data mutation projection', () => {
  it('round-trips a typed mutation event without degrading its binding', () => {
    const current: PIRElementNode = {
      id: 'remove-button',
      kind: 'element',
      type: 'button',
      events: {
        onClick: {
          kind: 'dispatch-data-operation',
          operation: { documentId: 'catalog', operationId: 'remove' },
          input: {
            kind: 'object',
            propertiesByKey: {
              id: { kind: 'trigger-payload', path: '/id' },
            },
          },
        },
      },
    };
    const events = projectEvents(current.events);
    expect(events?.onClick).toMatchObject({
      action: 'executeDataMutation',
      editable: true,
      params: {
        operation: { documentId: 'catalog', operationId: 'remove' },
      },
    });
    expect(
      toElementNode(
        {
          id: current.id,
          type: current.type,
          events,
        },
        current
      )
    ).toEqual(current);
  });
});

describe('Blueprint Inspector navigation projection', () => {
  it('does not persist an internal path as an opaque route id', () => {
    const current: PIRElementNode = {
      id: 'link',
      kind: 'element',
      type: 'a',
    };
    const next = toElementNode(
      {
        id: current.id,
        type: current.type,
        events: {
          onClick: {
            trigger: 'onClick',
            action: 'navigate',
            params: { to: '/products' },
            editable: true,
          },
        },
      },
      current
    );
    expect(next.events).toBeUndefined();
  });

  it('persists the resolved route identity', () => {
    const current: PIRElementNode = {
      id: 'link',
      kind: 'element',
      type: 'a',
    };
    const next = toElementNode(
      {
        id: current.id,
        type: current.type,
        events: {
          onClick: {
            trigger: 'onClick',
            action: 'navigate',
            params: { to: '/products', routeId: 'route-products' },
            editable: true,
          },
        },
      },
      current
    );
    expect(next.events?.onClick).toEqual({
      kind: 'navigate-route',
      routeId: 'route-products',
    });
  });
});
