import type { ExportImportIntent, ExportModule } from '#src/export';
import type { ServerFunctionDefinition } from '@prodivix/server-runtime';
import {
  compileStandaloneJsonSchemaValidator,
  STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT,
} from '#src/workspace/standaloneJsonSchemaValidator';

const VALIDATOR_MODULE_ID_PREFIX =
  'workspace-server-runtime-validator' as const;

type StandaloneServerRuntimeValidatorProjection = Readonly<{
  modules: readonly ExportModule[];
  imports: readonly ExportImportIntent[];
  registrySource: string;
}>;

const schemaModule = (input: {
  definition: ServerFunctionDefinition;
  ordinal: number;
  direction: 'input' | 'output';
}): Readonly<{ module: ExportModule; localName: string }> => {
  const suffix = `${String(input.ordinal).padStart(3, '0')}-${input.direction}`;
  const moduleId = `${VALIDATOR_MODULE_ID_PREFIX}-${suffix}`;
  const schema =
    input.direction === 'input'
      ? input.definition.inputSchema
      : input.definition.outputSchema;
  const localName = `validateServerRuntime${input.direction === 'input' ? 'Input' : 'Output'}${String(input.ordinal).padStart(3, '0')}`;
  const module: ExportModule = {
    id: moduleId,
    kind: 'runtime-helper',
    suggestedName: moduleId,
    desiredPath: `src/prodivix-server-runtime-validators/${suffix}.ts`,
    language: 'ts',
    imports: [],
    body: `// @ts-nocheck -- machine-generated Ajv standalone validator
${compileStandaloneJsonSchemaValidator(schema)}`,
    sourceTrace: [
      {
        sourceRef: {
          domain: 'workspace',
          id: input.definition.reference.artifactId,
          path: `/metadata/prodivix.serverRuntime/functionsByExport/${input.definition.reference.exportName}/${input.direction}Schema`,
        },
      },
    ],
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
  return Object.freeze({
    localName,
    module,
  });
};

/** Projects CSP-safe schema validators and their exact runtime lookup table. */
export const createStandaloneServerRuntimeValidatorProjection = (
  definitions: readonly ServerFunctionDefinition[]
): StandaloneServerRuntimeValidatorProjection => {
  const modules: ExportModule[] = [];
  const imports: ExportImportIntent[] = [];
  const entries: string[] = [];
  definitions.forEach((definition, ordinal) => {
    const input = schemaModule({ definition, ordinal, direction: 'input' });
    const output = schemaModule({ definition, ordinal, direction: 'output' });
    modules.push(input.module, output.module);
    imports.push(
      {
        kind: 'named',
        source: input.module.id,
        targetModuleId: input.module.id,
        imported: STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT,
        local: input.localName,
      },
      {
        kind: 'named',
        source: output.module.id,
        targetModuleId: output.module.id,
        imported: STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT,
        local: output.localName,
      }
    );
    entries.push(
      `[${JSON.stringify(
        `${definition.reference.artifactId}\0${definition.reference.exportName}`
      )}, Object.freeze({ input: ${input.localName}, output: ${output.localName} })]`
    );
  });
  return Object.freeze({
    modules: Object.freeze(modules),
    imports: Object.freeze(imports),
    registrySource: `type EmbeddedSchemaValidator = (value: unknown) => boolean;
const serverRuntimeSchemaValidators = new Map<string, Readonly<{
  input: EmbeddedSchemaValidator;
  output: EmbeddedSchemaValidator;
}>>([${entries.join(',')}]);
const readServerRuntimeSchemaValidators = (
  reference: WorkspaceServerFunctionReference
): Readonly<{ input: EmbeddedSchemaValidator; output: EmbeddedSchemaValidator }> | undefined =>
  serverRuntimeSchemaValidators.get(reference.artifactId + '\\0' + reference.exportName);`,
  });
};
