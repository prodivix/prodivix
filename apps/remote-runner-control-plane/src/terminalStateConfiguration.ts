import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export const REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC = 'static-key-ring';
export const REMOTE_TERMINAL_STATE_KMS_PROVIDER_AWS = 'aws-kms';

const maximumKeys = 8;

export type RemoteTerminalStateStaticKey = Readonly<{
  keyId: string;
  key: Uint8Array;
}>;

export type RemoteTerminalStateCipherConfiguration =
  | Readonly<{
      provider: typeof REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC;
      activeKeyId: string;
      keys: readonly RemoteTerminalStateStaticKey[];
      encodedSecretValues: readonly string[];
    }>
  | Readonly<{
      provider: typeof REMOTE_TERMINAL_STATE_KMS_PROVIDER_AWS;
      activeKeyId: string;
      region: string;
      keyArns: Readonly<Record<string, string>>;
      operationTimeoutMs: number;
      legacyStaticKeys: readonly RemoteTerminalStateStaticKey[];
      encodedSecretValues: readonly string[];
    }>;

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
};

const keyId = (value: string, name: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value))
    throw new TypeError(`${name} contains an invalid key id.`);
  return value;
};

const jsonRecord = (
  raw: string,
  name: string
): Readonly<Record<string, unknown>> => {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(`${name} must be valid JSON.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${name} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > maximumKeys)
    throw new TypeError(`${name} has an invalid key count.`);
  return Object.freeze(Object.fromEntries(entries));
};

const staticKeys = (
  raw: string,
  name: string
): Readonly<{
  keys: readonly RemoteTerminalStateStaticKey[];
  encodedValues: readonly string[];
}> => {
  const entries = Object.entries(jsonRecord(raw, name)).sort(
    ([left], [right]) => compareUnicodeCodePoints(left, right)
  );
  const keys = entries.map(([rawKeyId, encoded]) => {
    const normalizedKeyId = keyId(rawKeyId, name);
    if (typeof encoded !== 'string')
      throw new TypeError(`${name} values must be strings.`);
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.byteLength !== 32 || decoded.toString('base64') !== encoded)
      throw new TypeError(
        `${name} values must be canonical 32-byte base64 keys.`
      );
    return Object.freeze({
      keyId: normalizedKeyId,
      key: Uint8Array.from(decoded),
    });
  });
  return Object.freeze({
    keys: Object.freeze(keys),
    encodedValues: Object.freeze(
      entries.map(([, encoded]) => encoded as string)
    ),
  });
};

const keyArns = (
  raw: string,
  name: string
): Readonly<Record<string, string>> => {
  const entries = Object.entries(jsonRecord(raw, name)).sort(
    ([left], [right]) => compareUnicodeCodePoints(left, right)
  );
  return Object.freeze(
    Object.fromEntries(
      entries.map(([rawKeyId, arn]) => {
        const normalizedKeyId = keyId(rawKeyId, name);
        if (typeof arn !== 'string')
          throw new TypeError(`${name} values must be strings.`);
        return [normalizedKeyId, arn] as const;
      })
    )
  );
};

const timeout = (environment: NodeJS.ProcessEnv): number => {
  const raw = environment.REMOTE_TERMINAL_STATE_KMS_TIMEOUT_MS;
  const value = raw === undefined ? 5_000 : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000)
    throw new TypeError(
      'REMOTE_TERMINAL_STATE_KMS_TIMEOUT_MS must be between 1 and 30000.'
    );
  return value;
};

export const readRemoteTerminalStateCipherConfiguration = (
  environment: NodeJS.ProcessEnv
): RemoteTerminalStateCipherConfiguration => {
  const provider =
    environment.REMOTE_TERMINAL_STATE_KMS_PROVIDER?.trim() ||
    REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC;
  const activeKeyId = keyId(
    required(environment, 'REMOTE_TERMINAL_STATE_ACTIVE_KEY_ID'),
    'REMOTE_TERMINAL_STATE_ACTIVE_KEY_ID'
  );
  if (provider === REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC) {
    const parsed = staticKeys(
      required(environment, 'REMOTE_TERMINAL_STATE_KEYS_JSON'),
      'REMOTE_TERMINAL_STATE_KEYS_JSON'
    );
    if (!parsed.keys.some((entry) => entry.keyId === activeKeyId))
      throw new TypeError(
        'REMOTE_TERMINAL_STATE_ACTIVE_KEY_ID is not present in the static key ring.'
      );
    return Object.freeze({
      provider,
      activeKeyId,
      keys: parsed.keys,
      encodedSecretValues: parsed.encodedValues,
    });
  }
  if (provider !== REMOTE_TERMINAL_STATE_KMS_PROVIDER_AWS)
    throw new TypeError('REMOTE_TERMINAL_STATE_KMS_PROVIDER is unsupported.');
  const configuredKeyArns = keyArns(
    required(environment, 'REMOTE_TERMINAL_STATE_KMS_AWS_KEY_ARNS_JSON'),
    'REMOTE_TERMINAL_STATE_KMS_AWS_KEY_ARNS_JSON'
  );
  if (!Object.hasOwn(configuredKeyArns, activeKeyId))
    throw new TypeError(
      'REMOTE_TERMINAL_STATE_ACTIVE_KEY_ID is not present in the AWS KMS key map.'
    );
  const legacyRaw = environment.REMOTE_TERMINAL_STATE_KEYS_JSON?.trim();
  const legacy = legacyRaw
    ? staticKeys(legacyRaw, 'REMOTE_TERMINAL_STATE_KEYS_JSON')
    : Object.freeze({
        keys: Object.freeze([]) as readonly RemoteTerminalStateStaticKey[],
        encodedValues: Object.freeze([]) as readonly string[],
      });
  return Object.freeze({
    provider,
    activeKeyId,
    region: required(environment, 'REMOTE_TERMINAL_STATE_KMS_AWS_REGION'),
    keyArns: configuredKeyArns,
    operationTimeoutMs: timeout(environment),
    legacyStaticKeys: legacy.keys,
    encodedSecretValues: legacy.encodedValues,
  });
};
