/**
 * Generated from specs/plugins/palette-contribution-v1.schema.json.
 * DO NOT EDIT. Run `pnpm --filter @prodivix/plugin-contracts generate`.
 */

export const PALETTE_CONTRIBUTION_V1_SCHEMA_ID =
  'https://prodivix.dev/schemas/palette-contribution-v1.schema.json';
export const PALETTE_CONTRIBUTION_V1_SCHEMA_VERSION = '1.0';
export const PALETTE_CONTRIBUTION_V1_SCHEMA: object = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/palette-contribution-v1.schema.json',
  title: 'PaletteContributionV1',
  description:
    'Serializable component palette contribution contract for Prodivix Blueprint.',
  $comment:
    'React nodes, callbacks, component implementations, and other runtime objects are resolved by the host and are never part of this wire descriptor.',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'surface', 'groups'],
  properties: {
    $schema: {
      const: 'https://prodivix.dev/schemas/palette-contribution-v1.schema.json',
    },
    schemaVersion: { const: '1.0' },
    surface: { const: 'blueprint.components' },
    groups: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: { $ref: '#/$defs/group' },
    },
  },
  $defs: {
    localId: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$',
    },
    label: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
    choiceId: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
    runtimeType: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '\\S',
    },
    jsonValue: {
      oneOf: [
        { type: 'null' },
        { type: 'boolean' },
        { type: 'number' },
        { type: 'string' },
        { type: 'array', items: { $ref: '#/$defs/jsonValue' } },
        { type: 'object', additionalProperties: { $ref: '#/$defs/jsonValue' } },
      ],
    },
    jsonObject: {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/jsonValue' },
    },
    option: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'value'],
      properties: {
        id: { $ref: '#/$defs/choiceId' },
        label: { $ref: '#/$defs/label' },
        value: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
    variant: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label'],
      properties: {
        id: { $ref: '#/$defs/choiceId' },
        label: { $ref: '#/$defs/label' },
        scale: { type: 'number', minimum: 0.1, maximum: 4 },
        props: { $ref: '#/$defs/jsonObject' },
      },
    },
    status: {
      type: 'object',
      additionalProperties: false,
      required: ['prop', 'label', 'options'],
      properties: {
        prop: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
        label: { $ref: '#/$defs/label' },
        defaultValue: { type: 'string', minLength: 1, maxLength: 160 },
        options: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: { $ref: '#/$defs/option' },
        },
      },
    },
    presentation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scale: { type: 'number', minimum: 0.1, maximum: 4 },
        sizes: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: { $ref: '#/$defs/option' },
        },
        variants: {
          type: 'array',
          minItems: 1,
          maxItems: 128,
          items: { $ref: '#/$defs/variant' },
        },
        status: { $ref: '#/$defs/status' },
      },
    },
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'id', 'label'],
      properties: {
        kind: { const: 'component' },
        id: { $ref: '#/$defs/localId' },
        label: { $ref: '#/$defs/label' },
        runtimeType: { $ref: '#/$defs/runtimeType' },
        defaultProps: { $ref: '#/$defs/jsonObject' },
        propOptions: {
          type: 'object',
          maxProperties: 256,
          additionalProperties: {
            type: 'array',
            maxItems: 128,
            items: { type: 'string', maxLength: 240 },
          },
        },
        presentation: { $ref: '#/$defs/presentation' },
      },
    },
    placement: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['section'],
          properties: { section: { const: 'builtIn' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['section', 'libraryId'],
          properties: {
            section: { const: 'external' },
            libraryId: { $ref: '#/$defs/localId' },
          },
        },
      ],
    },
    group: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'placement', 'items'],
      properties: {
        id: { $ref: '#/$defs/localId' },
        label: { $ref: '#/$defs/label' },
        placement: { $ref: '#/$defs/placement' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 512,
          items: { $ref: '#/$defs/item' },
        },
      },
    },
  },
};
