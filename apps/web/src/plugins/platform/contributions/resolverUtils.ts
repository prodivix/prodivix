import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '@prodivix/plugin-host';

type DescriptorValidationResult<TDescriptor> =
  | Readonly<{
      ok: true;
      descriptor: TDescriptor;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly PluginDiagnostic[];
    }>;

export const toHostDescriptorValidationResult = <TDescriptor>(
  result: DescriptorValidationResult<TDescriptor>,
  point: string,
  contractVersion = '1.0'
): PluginHostResult<TDescriptor> => {
  if (result.ok) return pluginHostSuccess(result.descriptor);
  return pluginHostFailure(
    asNonEmptyDiagnostics(result.diagnostics) ?? [
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
        `${point} descriptor validation failed without a diagnostic.`,
        { contributionPoint: point, contractVersion }
      ),
    ]
  );
};

export const resolverFailure = (
  point: string,
  message: string,
  meta: Record<string, string | number | boolean | undefined> = {},
  contractVersion = '1.0'
): PluginHostResult<never> =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
      message,
      {
        contributionPoint: point,
        contractVersion,
        ...meta,
      }
    ),
  ]);

export const cloneAndFreezeJson = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreezeJson)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          cloneAndFreezeJson(entry),
        ])
      )
    ) as T;
  }
  return value;
};
