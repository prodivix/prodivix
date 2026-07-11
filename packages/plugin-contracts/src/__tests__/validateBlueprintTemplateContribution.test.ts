import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA_ID,
  matchesBlueprintCompositionSequence,
  validateBlueprintTemplateContribution,
  type BlueprintTemplateContributionV1,
} from '#contracts/index';

const createDescriptor = (): BlueprintTemplateContributionV1 => ({
  $schema: BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA_ID,
  schemaVersion: '1.0',
  surface: 'blueprint.components',
  templates: [
    {
      id: 'fixture.field',
      palette: {
        contributionId: 'fixture.palette',
        itemId: 'fixture-field',
      },
      primaryLocalId: 'field',
      fragment: {
        rootLocalIds: ['field'],
        nodesByLocalId: {
          field: { type: 'FixtureField', props: { label: 'Field' } },
          control: {
            type: 'FixtureInput',
            props: { placeholder: 'Type here' },
          },
        },
        childIdsByLocalId: { field: ['control'] },
      },
    },
  ],
  compositionRules: [
    {
      id: 'fixture.field-children',
      runtimeType: 'FixtureField',
      parent: { mode: 'any' },
      slots: [
        {
          target: 'children',
          sequence: [
            {
              match: 'runtime-types',
              runtimeTypes: ['FixtureInput'],
              minItems: 1,
              maxItems: 1,
            },
          ],
        },
      ],
    },
    {
      id: 'fixture.input-parent',
      runtimeType: 'FixtureInput',
      parent: { mode: 'listed', runtimeTypes: ['FixtureField'] },
      slots: [],
    },
  ],
});

describe('validateBlueprintTemplateContribution', () => {
  it('shares the runtime sequence matcher with graph mutation validation', () => {
    expect(
      matchesBlueprintCompositionSequence(
        [
          {
            match: 'runtime-types',
            runtimeTypes: ['FixtureSummary'],
            minItems: 1,
            maxItems: 1,
          },
          {
            match: 'runtime-types',
            runtimeTypes: ['FixtureDetails'],
            minItems: 1,
            maxItems: 1,
          },
        ],
        ['FixtureSummary', 'FixtureDetails']
      )
    ).toBe(true);
    expect(
      matchesBlueprintCompositionSequence(
        [
          {
            match: 'runtime-types',
            runtimeTypes: ['FixtureSummary'],
            minItems: 1,
            maxItems: 1,
          },
        ],
        ['FixtureDetails']
      )
    ).toBe(false);
  });

  it('accepts a normalized fragment satisfying its composition grammar', () => {
    const descriptor = createDescriptor();

    expect(validateBlueprintTemplateContribution(descriptor)).toEqual({
      ok: true,
      descriptor,
      diagnostics: [],
    });
  });

  it('rejects executable and code-owned fields at the wire boundary', () => {
    const descriptor = createDescriptor() as unknown as Record<string, unknown>;
    const template = (
      descriptor.templates as Array<Record<string, unknown>>
    )[0]!;
    const fragment = template.fragment as Record<string, unknown>;
    const nodes = fragment.nodesByLocalId as Record<
      string,
      Record<string, unknown>
    >;
    nodes.field!.events = { click: { source: 'alert(1)' } };

    const result = validateBlueprintTemplateContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain('PLG-1014');
  });

  it('rejects cycles, duplicate parents, and orphan nodes', () => {
    const descriptor = createDescriptor();
    descriptor.templates[0]!.fragment.nodesByLocalId.extra = {
      type: 'FixtureInput',
    };
    descriptor.templates[0]!.fragment.childIdsByLocalId.control = ['field'];
    descriptor.templates[0]!.fragment.childIdsByLocalId.extra = ['control'];

    const result = validateBlueprintTemplateContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('more than one parent'),
        expect.stringContaining('cycle'),
        expect.stringContaining('orphaned'),
      ])
    );
  });

  it('rejects ambiguous sequence matchers and invalid cardinality', () => {
    const descriptor = createDescriptor();
    descriptor.compositionRules![0]!.slots[0]!.sequence = [
      { match: 'any', minItems: 2, maxItems: 1 },
      {
        match: 'runtime-types',
        runtimeTypes: ['FixtureInput'],
        minItems: 0,
        maxItems: 1,
      },
    ];

    const result = validateBlueprintTemplateContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('any segment'),
        expect.stringContaining('minItems'),
      ])
    );
  });

  it('rejects fragments that violate a listed parent or slot sequence', () => {
    const descriptor = createDescriptor();
    descriptor.compositionRules![1]!.parent = {
      mode: 'listed',
      runtimeTypes: ['OtherField'],
    };

    const result = validateBlueprintTemplateContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.message.includes('allowed parent'))
    ).toBe(true);
  });
});
