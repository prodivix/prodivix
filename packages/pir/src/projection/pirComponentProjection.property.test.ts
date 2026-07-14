import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRComponentContract } from '../pir.types';
import {
  projectPirValueBinding,
  resolvePirComponentPropValues,
  resolvePirComponentVariantValues,
  selectPirSlotProjection,
} from './pirComponentProjection';

const propertyParameters = Object.freeze({
  numRuns: 40,
  seed: 0x15_07_2026,
});

const contract = (defaultValue: string): PIRComponentContract => ({
  propsById: {
    title: {
      id: 'title',
      name: 'Title',
      typeRef: 'string',
      defaultValue,
    },
  },
  eventsById: {},
  slotsById: {},
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
});

describe('PIR-current Component projection properties', () => {
  it('projects stable-id component values and defaults deterministically', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (value, bind) => {
        const currentContract = contract('fallback');
        const props = resolvePirComponentPropValues(
          currentContract,
          bind ? { title: { kind: 'param', paramId: 'input' } } : {},
          { paramsById: { input: value } }
        );
        const variants = resolvePirComponentVariantValues(
          currentContract,
          bind ? { tone: 'strong' } : {}
        );

        expect(props.title).toBe(bind ? value : 'fallback');
        expect(variants.tone).toBe(bind ? 'strong' : 'neutral');
        expect(
          projectPirValueBinding(
            { kind: 'component-variant', memberId: 'tone' },
            {
              literal: String,
              reference: (kind, id) => `${kind}:${id}`,
              code: ({ artifactId }) => artifactId,
              accessPath: (source, path) => `${source}.${path}`,
            }
          )
        ).toBe('component-variant:tone');
      }),
      propertyParameters
    );
  });

  it('treats an explicitly empty consumer slot as provided content', () => {
    const consumerGraph = {
      rootId: 'instance',
      nodesById: {},
      childIdsById: {},
      regionsById: { instance: { content: [] } },
    };

    expect(
      selectPirSlotProjection({
        consumerGraph,
        instanceNodeId: 'instance',
        slotMemberId: 'content',
        fallbackNodeIds: ['fallback'],
      })
    ).toEqual({ kind: 'consumer', nodeIds: [] });
    expect(
      selectPirSlotProjection({
        consumerGraph: { ...consumerGraph, regionsById: undefined },
        instanceNodeId: 'instance',
        slotMemberId: 'content',
        fallbackNodeIds: ['fallback'],
      })
    ).toEqual({ kind: 'fallback', nodeIds: ['fallback'] });
  });
});
