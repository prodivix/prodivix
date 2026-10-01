import { isAbsolute } from 'node:path';
import { driverIdentity, exactDriverRecord } from '#src/g3/contract.js';
import type { ProductionChromiumRuntimeAuthorityInput } from '@prodivix/verification-browser';

export type G3DriverConfiguration = Readonly<{
  repositoryRoot: string;
  backendURL: string;
  backendCredentialEnvironmentVariable: string;
  driverCredentialEnvironmentVariable: string;
  providerId: string;
  port: number;
  maximumConcurrentRuns: number;
  stateDirectory: string;
  adapterIds?: readonly string[];
  attestation: Readonly<{
    keyId: string;
    issuer: string;
    audience: string;
    subject: string;
    policyGeneration: number;
    privateKeyEnvironmentVariable: string;
  }>;
  chromium?: ProductionChromiumRuntimeAuthorityInput;
}>;
const environmentName = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value))
    throw new TypeError('G3 environment reference is invalid.');
  return value;
};
const absolutePath = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 4096 || !isAbsolute(value))
    throw new TypeError('G3 driver path is invalid.');
  return value;
};
export const decodeG3DriverConfiguration = (
  value: unknown
): G3DriverConfiguration => {
  const record = exactDriverRecord(
    value,
    [
      'repositoryRoot',
      'backendURL',
      'backendCredentialEnvironmentVariable',
      'driverCredentialEnvironmentVariable',
      'providerId',
      'port',
      'maximumConcurrentRuns',
      'stateDirectory',
      'attestation',
    ],
    ['chromium', 'adapterIds']
  );
  if (typeof record.backendURL !== 'string')
    throw new TypeError('G3 Backend URL is invalid.');
  const backend = new URL(record.backendURL);
  if (
    backend.username ||
    backend.password ||
    backend.search ||
    backend.hash ||
    (backend.protocol !== 'https:' &&
      !(
        backend.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)
      ))
  )
    throw new TypeError('G3 Backend transport is invalid.');
  if (
    !Number.isSafeInteger(record.port) ||
    (record.port as number) < 1 ||
    (record.port as number) > 65535 ||
    !Number.isSafeInteger(record.maximumConcurrentRuns) ||
    (record.maximumConcurrentRuns as number) < 1 ||
    (record.maximumConcurrentRuns as number) > 16
  )
    throw new TypeError('G3 driver budget is invalid.');
  const attestation = exactDriverRecord(record.attestation, [
    'keyId',
    'issuer',
    'audience',
    'subject',
    'policyGeneration',
    'privateKeyEnvironmentVariable',
  ]);
  if (
    !Number.isSafeInteger(attestation.policyGeneration) ||
    (attestation.policyGeneration as number) < 1 ||
    ['issuer', 'audience', 'subject'].some(
      (key) =>
        typeof attestation[key] !== 'string' ||
        (attestation[key] as string).length < 1 ||
        (attestation[key] as string).length > 4096
    )
  )
    throw new TypeError('G3 attestation policy is invalid.');
  const chromium =
    record.chromium === undefined
      ? undefined
      : exactDriverRecord(record.chromium, [
          'machineClass',
          'operatingSystemImageDigest',
          'browserVersion',
          'fontSetDigest',
          'devicePixelRatio',
          'cacheClass',
          'rendererGeneration',
          'normalizer',
          'browserImageAuthority',
          'executablePath',
        ]);
  if (chromium) absolutePath(chromium.executablePath);
  if (
    record.adapterIds !== undefined &&
    (!Array.isArray(record.adapterIds) ||
      record.adapterIds.length < 1 ||
      record.adapterIds.length > 5 ||
      new Set(record.adapterIds).size !== record.adapterIds.length)
  )
    throw new TypeError('G3 adapter selection is invalid.');
  const adapterIds =
    record.adapterIds === undefined
      ? undefined
      : (record.adapterIds as unknown[]).map(driverIdentity);
  return {
    repositoryRoot: absolutePath(record.repositoryRoot),
    backendURL: backend.href,
    backendCredentialEnvironmentVariable: environmentName(
      record.backendCredentialEnvironmentVariable
    ),
    driverCredentialEnvironmentVariable: environmentName(
      record.driverCredentialEnvironmentVariable
    ),
    providerId: driverIdentity(record.providerId),
    port: record.port as number,
    maximumConcurrentRuns: record.maximumConcurrentRuns as number,
    stateDirectory: absolutePath(record.stateDirectory),
    attestation: {
      keyId: driverIdentity(attestation.keyId),
      issuer: attestation.issuer as string,
      audience: attestation.audience as string,
      subject: attestation.subject as string,
      policyGeneration: attestation.policyGeneration as number,
      privateKeyEnvironmentVariable: environmentName(
        attestation.privateKeyEnvironmentVariable
      ),
    },
    ...(chromium
      ? {
          chromium:
            chromium as unknown as ProductionChromiumRuntimeAuthorityInput,
        }
      : {}),
    ...(adapterIds ? { adapterIds } : {}),
  };
};
