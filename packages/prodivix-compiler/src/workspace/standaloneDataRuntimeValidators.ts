import type { ExportImportIntent, ExportModule } from '#src/export';
import { decodeWorkspaceDataSourceDocument } from '@prodivix/workspace';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  compileStandaloneJsonSchemaValidator,
  STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT,
} from '#src/workspace/standaloneJsonSchemaValidator';

export const WORKSPACE_DATA_RUNTIME_VALIDATOR_AUTHORITY_MODULE_ID =
  'workspace-data-runtime-validator-authority' as const;

type StandaloneDataRuntimeValidatorProjection = Readonly<{
  authorityModule: ExportModule;
  validatorModules: readonly ExportModule[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const pointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Projects every canonical Data schema into a CSP-safe exact-key validator. */
export const createStandaloneDataRuntimeValidatorProjection = (
  workspace: WorkspaceSnapshot
): StandaloneDataRuntimeValidatorProjection => {
  const validatorModules: ExportModule[] = [];
  const authorityImports: ExportImportIntent[] = [];
  const registryEntries: string[] = [];
  let ordinal = 0;
  Object.values(workspace.docsById)
    .filter((document) => document.type === 'data-source')
    .sort((left, right) => compareText(left.id, right.id))
    .forEach((document) => {
      const read = decodeWorkspaceDataSourceDocument(document);
      if (read.status !== 'valid') return;
      Object.values(read.decodedContent.schemasById)
        .sort((left, right) => compareText(left.id, right.id))
        .forEach((schema) => {
          const suffix = String(ordinal).padStart(3, '0');
          const moduleId = `workspace-data-runtime-validator-${suffix}`;
          const localName = `validateDataRuntimeSchema${suffix}`;
          const module: ExportModule = {
            id: moduleId,
            kind: 'runtime-helper',
            suggestedName: moduleId,
            desiredPath: `src/prodivix-data-runtime-validators/${suffix}.ts`,
            language: 'ts',
            imports: [],
            body: `// @ts-nocheck -- machine-generated Ajv standalone validator
${compileStandaloneJsonSchemaValidator(schema.schema)}`,
            sourceTrace: [
              {
                sourceRef: {
                  domain: 'workspace-document',
                  id: document.id,
                  path: `/schemasById/${pointerSegment(schema.id)}/schema`,
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
          validatorModules.push(module);
          authorityImports.push({
            kind: 'named',
            source: module.id,
            targetModuleId: module.id,
            imported: STANDALONE_JSON_SCHEMA_VALIDATOR_EXPORT,
            local: localName,
          });
          registryEntries.push(
            `[${JSON.stringify(
              `${document.id}:${document.contentRev}.${document.metaRev}:${schema.id}`
            )}, ${localName}]`
          );
          ordinal += 1;
        });
    });
  const authorityModule: ExportModule = {
    id: WORKSPACE_DATA_RUNTIME_VALIDATOR_AUTHORITY_MODULE_ID,
    kind: 'runtime-helper',
    suggestedName: 'prodivix-data-runtime-validator-authority',
    desiredPath: 'src/prodivix-data-runtime-validator-authority.ts',
    language: 'ts',
    imports: authorityImports,
    body: `type DataRuntimeSchemaValidator = (value: unknown) => boolean;
const dataRuntimeSchemaValidators = new Map<string, DataRuntimeSchemaValidator>([
  ${registryEntries.join(',\n  ')}
]);

export default class PrecompiledDataRuntimeSchemaAuthority {
  constructor(_options?: unknown) {}

  compile(
    _schema: boolean | object,
    key?: string
  ): DataRuntimeSchemaValidator {
    const validator =
      typeof key === 'string' ? dataRuntimeSchemaValidators.get(key) : undefined;
    if (!validator) throw new Error('DATA_SCHEMA_UNSUPPORTED');
    return validator;
  }
}`,
    sourceTrace: validatorModules.flatMap(({ sourceTrace }) => sourceTrace),
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
  return Object.freeze({
    authorityModule,
    validatorModules: Object.freeze(validatorModules),
  });
};
