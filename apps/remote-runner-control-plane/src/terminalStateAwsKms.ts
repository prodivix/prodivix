import { createHash, timingSafeEqual } from 'node:crypto';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  DecryptCommand,
  EncryptCommand,
  KMSClient,
  type DecryptCommandInput,
  type DecryptCommandOutput,
  type EncryptCommandInput,
  type EncryptCommandOutput,
} from '@aws-sdk/client-kms';
import { RemoteExecutionTerminalStateCipherUnavailableError } from '@prodivix/runtime-remote';
import type { RemoteExecutionTerminalStateKeyManagementService } from './terminalStateManagedCipher';

export const REMOTE_TERMINAL_STATE_AWS_KMS_PROVIDER_ID = 'aws.kms/v1';

const maximumKeys = 8;
const maximumOperationTimeoutMs = 30_000;
const maximumAdditionalDataBytes = 16 * 1_024;
const maximumWrappedDataKeyBytes = 3 * 1_024;
const keyArnPattern =
  /^arn:(aws|aws-us-gov|aws-cn):kms:([a-z]{2}-[a-z0-9-]+-[0-9]+):([0-9]{12}):key\/([A-Za-z0-9-]{1,128})$/u;
const regionPattern = /^[a-z]{2}-[a-z0-9-]+-[0-9]+$/u;

export type AwsKmsRemoteExecutionTerminalStateOperations = Readonly<{
  encrypt(
    input: EncryptCommandInput,
    abortSignal: AbortSignal
  ): Promise<EncryptCommandOutput>;
  decrypt(
    input: DecryptCommandInput,
    abortSignal: AbortSignal
  ): Promise<DecryptCommandOutput>;
}>;

export type CreateAwsKmsRemoteExecutionTerminalStateKeyManagementInput =
  Readonly<{
    region: string;
    activeKeyId: string;
    keyArns: Readonly<Record<string, string>>;
    operationTimeoutMs: number;
    operations?: AwsKmsRemoteExecutionTerminalStateOperations;
  }>;

const normalizeKeyId = (value: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value))
    throw new TypeError('Remote Terminal AWS KMS key id is invalid.');
  return value;
};

const readConfiguration = (
  input: CreateAwsKmsRemoteExecutionTerminalStateKeyManagementInput
): Readonly<{
  region: string;
  activeKeyId: string;
  keyArns: ReadonlyMap<string, string>;
  operationTimeoutMs: number;
}> => {
  if (!regionPattern.test(input.region))
    throw new TypeError('Remote Terminal AWS KMS region is invalid.');
  const entries = Object.entries(input.keyArns).sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right)
  );
  if (entries.length < 1 || entries.length > maximumKeys)
    throw new TypeError('Remote Terminal AWS KMS key count is invalid.');
  const keyArns = new Map<string, string>();
  entries.forEach(([rawKeyId, keyArn]) => {
    const keyId = normalizeKeyId(rawKeyId);
    const match = keyArnPattern.exec(keyArn);
    if (!match || match[2] !== input.region || keyArns.has(keyId))
      throw new TypeError('Remote Terminal AWS KMS key ARN is invalid.');
    keyArns.set(keyId, keyArn);
  });
  const activeKeyId = normalizeKeyId(input.activeKeyId);
  if (!keyArns.has(activeKeyId))
    throw new TypeError('Remote Terminal active AWS KMS key is unavailable.');
  if (
    !Number.isSafeInteger(input.operationTimeoutMs) ||
    input.operationTimeoutMs < 1 ||
    input.operationTimeoutMs > maximumOperationTimeoutMs
  )
    throw new TypeError('Remote Terminal AWS KMS timeout is invalid.');
  return Object.freeze({
    region: input.region,
    activeKeyId,
    keyArns,
    operationTimeoutMs: input.operationTimeoutMs,
  });
};

export const createAwsSdkRemoteExecutionTerminalStateOperations = (
  region: string
): AwsKmsRemoteExecutionTerminalStateOperations => {
  if (!regionPattern.test(region))
    throw new TypeError('Remote Terminal AWS KMS region is invalid.');
  const client = new KMSClient({ region });
  return Object.freeze({
    encrypt: (input, abortSignal) =>
      client.send(new EncryptCommand(input), { abortSignal }),
    decrypt: (input, abortSignal) =>
      client.send(new DecryptCommand(input), { abortSignal }),
  });
};

const additionalDataDigest = (additionalData: Uint8Array): Buffer => {
  if (
    !(additionalData instanceof Uint8Array) ||
    additionalData.byteLength < 1 ||
    additionalData.byteLength > maximumAdditionalDataBytes
  )
    throw new TypeError('Remote Terminal AWS KMS additional data is invalid.');
  return createHash('sha256').update(additionalData).digest();
};

const encryptionContext = (
  additionalData: Uint8Array
): Readonly<Record<string, string>> =>
  Object.freeze({
    'prodivix-aad-sha256': additionalDataDigest(additionalData).toString('hex'),
    'prodivix-purpose': 'remote-terminal-state-data-key-v2',
  });

const wrappedKeyMetadata = (
  keyId: string,
  keyArn: string,
  wrappedKey: Uint8Array,
  additionalData: Uint8Array
): Buffer =>
  createHash('sha256')
    .update('prodivix.remote-terminal.state.aws-kms-wrapped-key.v2')
    .update(Buffer.from([0]))
    .update(keyId)
    .update(Buffer.from([0]))
    .update(stableKeyIdentity(keyArn))
    .update(Buffer.from([0]))
    .update(wrappedKey)
    .update(Buffer.from([0]))
    .update(additionalDataDigest(additionalData))
    .digest();

const stableKeyIdentity = (keyArn: string): string => {
  const match = keyArnPattern.exec(keyArn);
  if (!match)
    throw new TypeError('Remote Terminal AWS KMS key ARN is invalid.');
  const [, partition, , accountId, resourceId] = match;
  return resourceId!.startsWith('mrk-')
    ? `arn:${partition}:kms:*:${accountId}:key/${resourceId}`
    : keyArn;
};

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const operation = async <Value>(
  timeoutMs: number,
  action: (signal: AbortSignal) => Promise<Value>
): Promise<Value> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await action(controller.signal);
  } catch (error) {
    const record =
      error && typeof error === 'object'
        ? (error as Readonly<{
            name?: unknown;
            code?: unknown;
            $retryable?: unknown;
            $metadata?: Readonly<{ httpStatusCode?: unknown }>;
          }>)
        : undefined;
    const status = record?.$metadata?.httpStatusCode;
    if (
      controller.signal.aborted ||
      record?.$retryable !== undefined ||
      (typeof status === 'number' && status >= 500) ||
      (typeof record?.name === 'string' &&
        [
          'AbortError',
          'TimeoutError',
          'ThrottlingException',
          'DependencyTimeoutException',
          'KMSInternalException',
          'KeyUnavailableException',
          'ServiceUnavailableException',
        ].includes(record.name)) ||
      (typeof record?.code === 'string' &&
        ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(
          record.code
        ))
    )
      throw new RemoteExecutionTerminalStateCipherUnavailableError();
    throw new TypeError('Remote Terminal managed KMS operation failed.');
  } finally {
    clearTimeout(timeout);
  }
};

export const createAwsKmsRemoteExecutionTerminalStateKeyManagementService = (
  input: CreateAwsKmsRemoteExecutionTerminalStateKeyManagementInput
): RemoteExecutionTerminalStateKeyManagementService => {
  const configuration = readConfiguration(input);
  const operations =
    input.operations ??
    createAwsSdkRemoteExecutionTerminalStateOperations(configuration.region);
  return Object.freeze({
    providerId: REMOTE_TERMINAL_STATE_AWS_KMS_PROVIDER_ID,
    activeKeyId: configuration.activeKeyId,
    async wrapDataKey(value) {
      if (
        !(value.dataKey instanceof Uint8Array) ||
        value.dataKey.byteLength !== 32
      )
        throw new TypeError('Remote Terminal managed data key is invalid.');
      const keyArn = configuration.keyArns.get(configuration.activeKeyId)!;
      const plaintext = Uint8Array.from(value.dataKey);
      let output: EncryptCommandOutput;
      try {
        output = await operation(configuration.operationTimeoutMs, (signal) =>
          operations.encrypt(
            {
              KeyId: keyArn,
              Plaintext: plaintext,
              EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
              EncryptionContext: encryptionContext(value.additionalData),
            },
            signal
          )
        );
      } finally {
        plaintext.fill(0);
      }
      if (
        output.KeyId !== keyArn ||
        output.EncryptionAlgorithm !== 'SYMMETRIC_DEFAULT' ||
        !(output.CiphertextBlob instanceof Uint8Array) ||
        output.CiphertextBlob.byteLength < 33 ||
        output.CiphertextBlob.byteLength > maximumWrappedDataKeyBytes
      )
        throw new TypeError('Remote Terminal AWS KMS response is invalid.');
      const wrappedKey = Uint8Array.from(output.CiphertextBlob);
      return Object.freeze({
        keyId: configuration.activeKeyId,
        metadata: Uint8Array.from(
          wrappedKeyMetadata(
            configuration.activeKeyId,
            keyArn,
            wrappedKey,
            value.additionalData
          )
        ),
        wrappedKey,
      });
    },
    async unwrapDataKey(value) {
      const keyId = normalizeKeyId(value.keyId);
      const keyArn = configuration.keyArns.get(keyId);
      if (
        !keyArn ||
        !(value.metadata instanceof Uint8Array) ||
        value.metadata.byteLength !== 32 ||
        !(value.wrappedKey instanceof Uint8Array) ||
        value.wrappedKey.byteLength < 33 ||
        value.wrappedKey.byteLength > maximumWrappedDataKeyBytes ||
        !sameBytes(
          value.metadata,
          wrappedKeyMetadata(
            keyId,
            keyArn,
            value.wrappedKey,
            value.additionalData
          )
        )
      )
        throw new TypeError('Remote Terminal wrapped data key is invalid.');
      const output = await operation(
        configuration.operationTimeoutMs,
        (signal) =>
          operations.decrypt(
            {
              KeyId: keyArn,
              CiphertextBlob: Uint8Array.from(value.wrappedKey),
              EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
              EncryptionContext: encryptionContext(value.additionalData),
            },
            signal
          )
      );
      if (
        output.KeyId !== keyArn ||
        output.EncryptionAlgorithm !== 'SYMMETRIC_DEFAULT' ||
        !(output.Plaintext instanceof Uint8Array) ||
        output.Plaintext.byteLength !== 32 ||
        (output.CiphertextForRecipient instanceof Uint8Array &&
          output.CiphertextForRecipient.byteLength > 0)
      ) {
        if (output.Plaintext instanceof Uint8Array) output.Plaintext.fill(0);
        throw new TypeError('Remote Terminal AWS KMS response is invalid.');
      }
      const dataKey = Uint8Array.from(output.Plaintext);
      output.Plaintext.fill(0);
      return dataKey;
    },
  });
};
