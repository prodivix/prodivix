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
  it('round-trips an http open-url binding', () => {
    const current: PIRElementNode = {
      id: 'link',
      kind: 'element',
      type: 'a',
      events: {
        onClick: { kind: 'open-url', href: 'http://example.test/path' },
      },
    };

    expect(
      toElementNode(
        {
          id: current.id,
          type: current.type,
          events: projectEvents(current.events),
        },
        current
      )
    ).toEqual(current);
  });

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

  it('re-saves a stored internal route after only its event changed', () => {
    const current: PIRElementNode = {
      id: 'link',
      kind: 'element',
      type: 'a',
      events: { onClick: { kind: 'navigate-route', routeId: 'route-2' } },
    };
    const events = projectEvents(current.events)!;

    expect(events.onClick.params.to).toBeUndefined();
    expect(
      toElementNode(
        {
          id: current.id,
          type: current.type,
          events: {
            onClick: { ...events.onClick, trigger: 'onPointerEnter' },
          },
        },
        current
      ).events
    ).toEqual({
      onPointerEnter: { kind: 'navigate-route', routeId: 'route-2' },
    });
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

describe('Blueprint Inspector read-only binding preservation', () => {
  it('keeps a read-only event when an editable event is renamed onto it', () => {
    const callCode = {
      kind: 'call-code' as const,
      slotId: 'slot-submit',
      reference: { artifactId: 'artifact-submit' },
    };
    const current: PIRElementNode = {
      id: 'button',
      kind: 'element',
      type: 'button',
      events: {
        onClick: callCode,
        onChange: { kind: 'navigate-route', routeId: 'route-products' },
      },
    };
    const events = projectEvents(current.events)!;

    const next = toElementNode(
      {
        id: current.id,
        type: current.type,
        events: {
          ...events,
          onChange: { ...events.onChange!, trigger: 'onClick' },
        },
      },
      current
    );

    expect(next.events).toEqual({ onClick: callCode });
  });

  it('keeps non-literal data bindings when the inspector view omits data', () => {
    const current: PIRElementNode = {
      id: 'catalog',
      kind: 'element',
      type: 'section',
      data: {
        source: { kind: 'data', dataId: 'catalog-source' },
        value: { kind: 'literal', value: 'editable' },
        extend: {
          selected: { kind: 'state', stateId: 'selected-id' },
          label: { kind: 'literal', value: 'editable' },
        },
      },
    };

    const next = toElementNode({ id: current.id, type: current.type }, current);

    expect(next.data).toEqual({
      source: { kind: 'data', dataId: 'catalog-source' },
      extend: { selected: { kind: 'state', stateId: 'selected-id' } },
    });
  });
});
