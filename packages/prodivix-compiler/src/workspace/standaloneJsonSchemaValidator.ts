import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

export const STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT =
  'validateStandaloneJsonSchemaValue' as const;

/**
 * Emits one ordinary ESM validator for an already-normalized JSON Schema.
 * Ajv's code generator runs in the Compiler, never in the generated target.
 */
export const compileStandaloneJsonSchemaValidator = (
  schema: boolean | Readonly<Record<string, unknown>>
): string => {
  const schemaId = 'prodivix.compiler.standalone-json-schema';
  const ajv = new Ajv2020({
    allErrors: true,
    messages: false,
    strict: false,
    validateFormats: false,
    code: {
      esm: true,
      lines: true,
      source: true,
    },
  });
  ajv.addSchema(schema, schemaId);
  return standaloneCode(ajv, {
    [STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT]: schemaId,
  });
};
