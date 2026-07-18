export const SERVER_RUNTIME_AUTH_CONFIGURATION_SCHEMA_VERSION = '1.0' as const;
export const SERVER_RUNTIME_AUTH_CONFIGURATION_MAX_PERMISSIONS = 32;
export const PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID =
  'prodivix-product-session' as const;

export type ServerRuntimeAuthConfiguration = Readonly<{
  schemaVersion: typeof SERVER_RUNTIME_AUTH_CONFIGURATION_SCHEMA_VERSION;
  providerId: string;
  permissionIds: readonly string[];
}>;

export type ServerRuntimeAuthConfigurationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ServerRuntimeAuthConfigurationResult =
  | Readonly<{
      status: 'valid';
      configuration: ServerRuntimeAuthConfiguration;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ServerRuntimeAuthConfigurationIssue[];
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isCanonicalId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);

const invalid = (
  path: string,
  message: string
): ServerRuntimeAuthConfigurationResult =>
  Object.freeze({
    status: 'invalid' as const,
    issues: Object.freeze([Object.freeze({ path, message })]),
  });

/** Strictly decodes reference-only Auth provider and permission declarations. */
export const decodeServerRuntimeAuthConfiguration = (
  value: unknown
): ServerRuntimeAuthConfigurationResult => {
  if (!isRecord(value)) {
    return invalid('/', 'Server Runtime Auth configuration must be an object.');
  }
  const keys = Object.keys(value).sort(compareText);
  if (
    keys.join('\0') !==
    ['permissionIds', 'providerId', 'schemaVersion']
      .sort(compareText)
      .join('\0')
  ) {
    return invalid(
      '/',
      'Server Runtime Auth configuration contains missing or unknown fields.'
    );
  }
  if (
    value.schemaVersion !== SERVER_RUNTIME_AUTH_CONFIGURATION_SCHEMA_VERSION
  ) {
    return invalid('/schemaVersion', 'Auth configuration version is invalid.');
  }
  if (!isCanonicalId(value.providerId)) {
    return invalid('/providerId', 'Auth provider id is invalid.');
  }
  if (
    !Array.isArray(value.permissionIds) ||
    value.permissionIds.length >
      SERVER_RUNTIME_AUTH_CONFIGURATION_MAX_PERMISSIONS
  ) {
    return invalid(
      '/permissionIds',
      `Auth configuration accepts at most ${SERVER_RUNTIME_AUTH_CONFIGURATION_MAX_PERMISSIONS} permission ids.`
    );
  }
  const permissionIds: string[] = [];
  for (let index = 0; index < value.permissionIds.length; index += 1) {
    const permissionId = value.permissionIds[index];
    if (!isCanonicalId(permissionId)) {
      return invalid(
        `/permissionIds/${index}`,
        'Auth permission id is invalid.'
      );
    }
    if (
      index > 0 &&
      compareText(permissionIds[index - 1]!, permissionId) >= 0
    ) {
      return invalid(
        `/permissionIds/${index}`,
        'Auth permission ids must be sorted and unique.'
      );
    }
    permissionIds.push(permissionId);
  }
  return Object.freeze({
    status: 'valid' as const,
    configuration: Object.freeze({
      schemaVersion: SERVER_RUNTIME_AUTH_CONFIGURATION_SCHEMA_VERSION,
      providerId: value.providerId,
      permissionIds: Object.freeze(permissionIds),
    }),
  });
};

/** Creates the normalized canonical shape without accepting credential material. */
export const createServerRuntimeAuthConfiguration = (input: {
  providerId: string;
  permissionIds?: readonly string[];
}): ServerRuntimeAuthConfiguration => {
  const configuration = {
    schemaVersion: SERVER_RUNTIME_AUTH_CONFIGURATION_SCHEMA_VERSION,
    providerId: input.providerId.trim(),
    permissionIds: [...new Set(input.permissionIds ?? [])].sort(compareText),
  };
  const decoded = decodeServerRuntimeAuthConfiguration(configuration);
  if (decoded.status !== 'valid') {
    throw new TypeError(
      decoded.issues[0]?.message ?? 'Auth configuration is invalid.'
    );
  }
  return decoded.configuration;
};
