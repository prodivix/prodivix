import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '#contracts/diagnostics';
import { appendJsonPointer } from '#contracts/jsonPointer';
import {
  validateJsonValue,
  type JsonValueValidationOptions,
} from '#contracts/jsonValue';

export type ContributionDescriptorValidationResult<TDescriptor> =
  | {
      ok: true;
      descriptor: TDescriptor;
      diagnostics: readonly [];
    }
  | {
      ok: false;
      diagnostics: readonly PluginDiagnostic[];
    };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});

export const compileContributionSchema = <TDescriptor>(schema: object) =>
  ajv.compile<TDescriptor>(schema);

const schemaErrorPath = (error: ErrorObject): string => {
  if (error.keyword === 'required') {
    return appendJsonPointer(
      error.instancePath,
      String(error.params.missingProperty)
    );
  }
  if (error.keyword === 'additionalProperties') {
    return appendJsonPointer(
      error.instancePath,
      String(error.params.additionalProperty)
    );
  }
  return error.instancePath;
};

export const contributionContractDiagnostic = (
  point: string,
  message: string,
  documentPath: string,
  schema?: Pick<ErrorObject, 'schemaPath' | 'keyword'>,
  contractVersion = '1.0'
): PluginDiagnostic =>
  createPluginDiagnostic(
    PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
    message,
    {
      contributionPoint: point,
      contractVersion,
      documentPath,
      schemaPath: schema?.schemaPath,
      schemaKeyword: schema?.keyword,
    }
  );

export const validateContributionStructure = <TDescriptor>(
  input: unknown,
  options: Readonly<{
    point: string;
    label: string;
    validate: ValidateFunction<TDescriptor>;
    json?: JsonValueValidationOptions;
    contractVersion?: string;
  }>
): ContributionDescriptorValidationResult<TDescriptor> => {
  const jsonResult = validateJsonValue(input, options.json);
  if (!jsonResult.ok) return jsonResult;
  if (options.validate(jsonResult.value)) {
    return {
      ok: true,
      descriptor: jsonResult.value,
      diagnostics: [],
    };
  }
  return {
    ok: false,
    diagnostics: (options.validate.errors ?? []).map((error) => {
      const documentPath = schemaErrorPath(error);
      return contributionContractDiagnostic(
        options.point,
        `${options.label} field ${documentPath || '<root>'} ${error.message ?? 'is invalid'}.`,
        documentPath,
        error,
        options.contractVersion
      );
    }),
  };
};

type PropsTransform = Readonly<{
  defaults?: Readonly<Record<string, unknown>>;
  rename?: readonly Readonly<{ from: string; to: string }>[];
  omit?: readonly string[];
}>;

export const validatePropsTransform = (
  point: string,
  transform: PropsTransform | undefined,
  path: string,
  contractVersion = '1.0'
): PluginDiagnostic[] => {
  if (!transform) return [];
  const diagnostics: PluginDiagnostic[] = [];
  const renameSources = new Set<string>();
  const renameTargets = new Set<string>();
  transform.rename?.forEach((entry, index) => {
    if (renameSources.has(entry.from)) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          `Property rename source ${JSON.stringify(entry.from)} is declared more than once.`,
          `${path}/rename/${index}/from`,
          undefined,
          contractVersion
        )
      );
    }
    if (renameTargets.has(entry.to)) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          `Property rename target ${JSON.stringify(entry.to)} is declared more than once.`,
          `${path}/rename/${index}/to`,
          undefined,
          contractVersion
        )
      );
    }
    if (entry.from === entry.to) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          'Property rename source and target must differ.',
          `${path}/rename/${index}`,
          undefined,
          contractVersion
        )
      );
    }
    renameSources.add(entry.from);
    renameTargets.add(entry.to);
  });

  transform.rename?.forEach((entry, index) => {
    if (renameSources.has(entry.to)) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          `Property rename target ${JSON.stringify(entry.to)} cannot also be a rename source.`,
          `${path}/rename/${index}/to`,
          undefined,
          contractVersion
        )
      );
    }
  });

  const omitted = new Set<string>();
  transform.omit?.forEach((property, index) => {
    if (omitted.has(property)) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          `Omitted property ${JSON.stringify(property)} is declared more than once.`,
          `${path}/omit/${index}`,
          undefined,
          contractVersion
        )
      );
    }
    omitted.add(property);
  });

  Object.keys(transform.defaults ?? {}).forEach((property) => {
    if (omitted.has(property)) {
      diagnostics.push(
        contributionContractDiagnostic(
          point,
          `Defaulted property ${JSON.stringify(property)} is also omitted.`,
          `${path}/defaults/${property}`,
          undefined,
          contractVersion
        )
      );
    }
  });
  return diagnostics;
};
