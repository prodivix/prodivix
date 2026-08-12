import type { AgentJsonValue } from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_WORKSPACE_SCHEMA_LIMITS,
  compileControlledWorkspaceToolSchema,
  validateControlledWorkspaceCompiledToolArguments,
  validateControlledWorkspaceToolArguments,
} from './controlledWorkspaceRuntimeSchema';

const objectSchema = (
  required: readonly string[],
  properties: Readonly<Record<string, AgentJsonValue>>
): AgentJsonValue => ({
  type: 'object',
  additionalProperties: false,
  required: [...required],
  properties,
});

describe('controlled Workspace schema compilation', () => {
  it('compiles the complete tree once and validates exact bounded arguments', () => {
    const schema = objectSchema(['name', 'items'], {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 16,
        pattern: '^[A-Za-z0-9._:@/-]{1,16}$',
      },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        items: objectSchema(['value'], {
          value: { type: 'number', minimum: 0, maximum: 10 },
        }),
      },
      optional: { type: 'boolean' },
    });
    const compilation = compileControlledWorkspaceToolSchema(schema);
    expect(compilation.ok).toBe(true);
    if (!compilation.ok) return;
    expect(
      validateControlledWorkspaceCompiledToolArguments(
        compilation.compiledSchema,
        {
          name: 'target-1',
          items: [{ value: 1 }, { value: 2 }],
        }
      )
    ).toEqual({ ok: true });
  });

  it.each([
    [
      'an invalid optional property',
      objectSchema([], { optional: { type: 'unsupported' } }),
      {},
    ],
    [
      'invalid items under an empty array',
      { type: 'array', items: { type: 'unsupported' } },
      [],
    ],
    ['an unsupported keyword', { type: 'string', undocumented: true }, 'value'],
  ])(
    'reports %s as schema-invalid before argument grading',
    (_label, schema, value) => {
      expect(
        validateControlledWorkspaceToolArguments(
          schema as AgentJsonValue,
          value as AgentJsonValue
        )
      ).toEqual({ ok: false, code: 'schema-invalid' });
    }
  );

  it('keeps a valid-schema value mismatch distinct from schema drift', () => {
    expect(
      validateControlledWorkspaceToolArguments(
        objectSchema(['count'], { count: { type: 'integer', minimum: 1 } }),
        { count: 0 }
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
  });

  it('rejects incoherent bounds and non-integer numeric schema bounds', () => {
    for (const schema of [
      { type: 'string', minLength: 2, maxLength: 1 },
      { type: 'number', minimum: 2, maximum: 1 },
      { type: 'number', minimum: 0.5 },
      { type: 'array', minItems: 2, maxItems: 1, items: { type: 'null' } },
      objectSchema(['required'], { required: { type: 'null' } }) as Record<
        string,
        unknown
      >,
    ]) {
      const candidate =
        Object.hasOwn(schema, 'properties') && schema.properties
          ? { ...schema, maxProperties: 0 }
          : schema;
      expect(
        compileControlledWorkspaceToolSchema(candidate as AgentJsonValue)
      ).toEqual({ ok: false, code: 'schema-invalid' });
    }
  });

  it('accepts only provably linear anchored pattern forms', () => {
    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'string', pattern: '^literal-value$' },
        'literal-value'
      )
    ).toEqual({ ok: true });
    expect(
      validateControlledWorkspaceToolArguments(
        {
          type: 'string',
          pattern: '^capability-effect-ref\\.provider-job\\.[0-9a-f]{64}$',
        },
        `capability-effect-ref.provider-job.${'a'.repeat(64)}`
      )
    ).toEqual({ ok: true });
    expect(
      validateControlledWorkspaceToolArguments(
        {
          type: 'string',
          pattern: '^capability-effect-ref\\.provider-job\\.[0-9a-f]{64}$',
        },
        `capability-effect-ref.provider-cache.${'a'.repeat(64)}`
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
    for (const pattern of ['^(a+)+$', 'a+', '^[a-z]+$', '^[^a]{1,8}$']) {
      expect(
        compileControlledWorkspaceToolSchema({ type: 'string', pattern })
      ).toEqual({ ok: false, code: 'schema-invalid' });
    }
  });

  it('counts string length by Unicode code point', () => {
    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'string', minLength: 1, maxLength: 1 },
        '😀'
      )
    ).toEqual({ ok: true });
    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'string', minLength: 2 },
        '😀'
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
  });

  it('uses safe integers for the complete Agent JSON number surface', () => {
    expect(
      validateControlledWorkspaceToolArguments({ type: 'number' }, 42)
    ).toEqual({ ok: true });
    expect(
      validateControlledWorkspaceToolArguments({ type: 'number' }, 1.5)
    ).toEqual({ ok: false, code: 'arguments-invalid' });
    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'integer' },
        Number.MAX_SAFE_INTEGER + 1
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
  });

  it('uses canonical JSON equality for enum and uniqueItems', () => {
    expect(
      compileControlledWorkspaceToolSchema({
        type: 'object',
        additionalProperties: false,
        required: ['a', 'b'],
        properties: {
          a: { type: 'integer' },
          b: { type: 'integer' },
        },
        enum: [
          { a: 1, b: 2 },
          { b: 2, a: 1 },
        ],
      })
    ).toEqual({ ok: false, code: 'schema-invalid' });
    expect(
      validateControlledWorkspaceToolArguments(
        {
          type: 'array',
          uniqueItems: true,
          items: objectSchema(['a', 'b'], {
            a: { type: 'integer' },
            b: { type: 'integer' },
          }),
        },
        [
          { a: 1, b: 2 },
          { b: 2, a: 1 },
        ]
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
  });

  it('enforces schema and argument aggregate limits', () => {
    const properties = Object.fromEntries(
      Array.from(
        {
          length:
            CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaPropertiesPerObject +
            1,
        },
        (_, index) => [`p${index}`, { type: 'null' }]
      )
    );
    expect(
      compileControlledWorkspaceToolSchema(objectSchema([], properties))
    ).toEqual({ ok: false, code: 'schema-invalid' });

    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'string' },
        'x'.repeat(CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentBytes + 1)
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });

    expect(
      validateControlledWorkspaceToolArguments(
        { type: 'array', items: { type: 'null' } },
        Array.from(
          {
            length:
              CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray +
              1,
          },
          () => null
        )
      )
    ).toEqual({ ok: false, code: 'arguments-invalid' });
  });

  it('enforces complete-schema depth, node, property, and enum budgets', () => {
    let tooDeep: AgentJsonValue = { type: 'null' };
    for (
      let depth = 0;
      depth <= CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaDepth;
      depth += 1
    ) {
      tooDeep = { type: 'array', items: tooDeep };
    }
    expect(compileControlledWorkspaceToolSchema(tooDeep)).toEqual({
      ok: false,
      code: 'schema-invalid',
    });

    expect(
      compileControlledWorkspaceToolSchema({
        type: 'string',
        enum: Array.from(
          {
            length:
              CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaEnumItemsPerNode +
              1,
          },
          (_, index) => `value-${index}`
        ),
      })
    ).toEqual({ ok: false, code: 'schema-invalid' });

    const nestedProperties = Object.fromEntries(
      Array.from({ length: 90 }, (_, index) => [
        `nested${index}`,
        { type: 'null' },
      ])
    );
    expect(
      compileControlledWorkspaceToolSchema(
        objectSchema([], {
          first: objectSchema([], nestedProperties),
          second: objectSchema([], nestedProperties),
          third: objectSchema([], nestedProperties),
        })
      )
    ).toEqual({ ok: false, code: 'schema-invalid' });
  });

  it('rejects a forged compiled token', () => {
    expect(
      validateControlledWorkspaceCompiledToolArguments(
        {
          format:
            'prodivix.agent-evaluation-controlled-workspace-compiled-schema',
          version: 1,
        },
        null
      )
    ).toEqual({ ok: false, code: 'schema-invalid' });
  });
});
