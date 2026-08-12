import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  isAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeProviderRequestIntent,
} from './agentCapabilityProbeProgram';

export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT =
  'prodivix.agent-capability-probe-response-spool-aad' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_ENCRYPTION_PROFILE_FORMAT =
  'prodivix.g4-capability-probe-response-spool-encryption' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_ID =
  'g4-capability-probe-response-spool' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_DIGEST_FORMAT =
  'prodivix.g4-capability-probe-response-spool-namespace' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES =
  1_048_576 as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS =
  8 * 24 * 60 * 60 * 1_000;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_RETENTION_DISPOSITION =
  'delete-after-durable-probe-admission-or-maximum-age' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION = 1 as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_ENVELOPE_FORMAT =
  'prodivix.agent-capability-probe-response-spool-ciphertext-envelope' as const;
export const AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_PACKING =
  'nonce-ciphertext-authentication-tag' as const;

export type AgentCapabilityProbeRequestPhase =
  AgentCapabilityProbeProviderRequestIntent['requestPhases'][number];

export type AgentCapabilityProbeResponseSpoolAad = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION;
  namespaceDigest: CanonicalDigest;
  repositoryCommit: string;
  admissionRequestDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  phase: AgentCapabilityProbeRequestPhase;
  sequence: number;
  phaseRequestDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  spoolRef: string;
  responseDigest: CanonicalDigest;
}>;

export type CreateAgentCapabilityProbeResponseSpoolAadInput = Omit<
  AgentCapabilityProbeResponseSpoolAad,
  | 'format'
  | 'version'
  | 'namespaceDigest'
  | 'probeProgramDigest'
  | 'profileProjectionDigest'
  | 'encryptionProfileDigest'
  | 'encryptionPolicyDigest'
  | 'keyRefDigest'
>;

export type AgentCapabilityProbeResponseSpoolEncryptionProfile = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_ENCRYPTION_PROFILE_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION;
  algorithm: 'AES-256-GCM';
  nonceBytes: 12;
  authenticationTagBytes: 16;
  aadFormat: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT;
  aadVersion: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION;
  namespaceId: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_ID;
  namespaceDigest: CanonicalDigest;
  keyId: string;
  keyVersion: number;
  keyEnvironmentName: string;
  keyRef: string;
  keyRefDigest: CanonicalDigest;
  maximumPlaintextBytes: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES;
  retention: Readonly<{
    maximumAgeMs: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS;
    disposition: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_RETENTION_DISPOSITION;
    retentionPolicyDigest: CanonicalDigest;
  }>;
  encryptionProfileDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
}>;

export type CreateAgentCapabilityProbeResponseSpoolEncryptionProfileInput =
  Readonly<{
    keyId: string;
    keyVersion: number;
    keyEnvironmentName: string;
    keyRef: string;
  }>;

/**
 * Compact durable projection reconstructed from AAD and packed ciphertext.
 * Packed bytes are exactly nonce[12] || ciphertext[plaintext length] || tag[16].
 */
export type AgentCapabilityProbeResponseSpoolCiphertextEnvelope = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_ENVELOPE_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION;
  algorithm: 'AES-256-GCM';
  packing: typeof AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_PACKING;
  encryptionProfileDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  aadDigest: CanonicalDigest;
  nonceBytes: 12;
  authenticationTagBytes: 16;
  plaintextSizeBytes: number;
  packedCiphertextSizeBytes: number;
  packedCiphertextDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
}>;

/** Existing runner/backend wire stays two-key while ciphertextBase64 is packed. */
export type AgentCapabilityProbeResponseSpoolCiphertextWire = Readonly<{
  envelopeDigest: CanonicalDigest;
  ciphertextBase64: string;
}>;

export type AgentCapabilityProbeResponseSpoolDecodedCiphertext = Readonly<{
  envelope: AgentCapabilityProbeResponseSpoolCiphertextEnvelope;
  nonceBytes: Uint8Array;
  ciphertextBytes: Uint8Array;
  authenticationTagBytes: Uint8Array;
}>;

export type AgentCapabilityProbeResponseSpoolEncrypt = (
  input: Readonly<{
    algorithm: 'AES-256-GCM';
    keyRef: string;
    nonceBytes: Uint8Array;
    aadBytes: Uint8Array;
    plaintextBytes: Uint8Array;
  }>
) =>
  | Promise<
      Readonly<{
        ciphertextBytes: Uint8Array;
        authenticationTagBytes: Uint8Array;
      }>
    >
  | Readonly<{
      ciphertextBytes: Uint8Array;
      authenticationTagBytes: Uint8Array;
    }>;

export type AgentCapabilityProbeResponseSpoolDecrypt = (
  input: Readonly<{
    algorithm: 'AES-256-GCM';
    keyRef: string;
    nonceBytes: Uint8Array;
    aadBytes: Uint8Array;
    ciphertextBytes: Uint8Array;
    authenticationTagBytes: Uint8Array;
  }>
) => Promise<Uint8Array> | Uint8Array;

const aadKeys = Object.freeze([
  'format',
  'version',
  'namespaceDigest',
  'repositoryCommit',
  'admissionRequestDigest',
  'probeProgramDigest',
  'profileProjectionDigest',
  'encryptionProfileDigest',
  'encryptionPolicyDigest',
  'keyRefDigest',
  'phase',
  'sequence',
  'phaseRequestDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'spoolRef',
  'responseDigest',
] as const);

const profileKeys = Object.freeze([
  'format',
  'version',
  'algorithm',
  'nonceBytes',
  'authenticationTagBytes',
  'aadFormat',
  'aadVersion',
  'namespaceId',
  'namespaceDigest',
  'keyId',
  'keyVersion',
  'keyEnvironmentName',
  'keyRef',
  'keyRefDigest',
  'maximumPlaintextBytes',
  'retention',
  'encryptionProfileDigest',
  'encryptionPolicyDigest',
] as const);

const retentionKeys = Object.freeze([
  'maximumAgeMs',
  'disposition',
  'retentionPolicyDigest',
] as const);

const ciphertextEnvelopeKeys = Object.freeze([
  'format',
  'version',
  'algorithm',
  'packing',
  'encryptionProfileDigest',
  'encryptionPolicyDigest',
  'keyRefDigest',
  'aadDigest',
  'nonceBytes',
  'authenticationTagBytes',
  'plaintextSizeBytes',
  'packedCiphertextSizeBytes',
  'packedCiphertextDigest',
  'envelopeDigest',
] as const);

const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const environmentNamePattern = /^[A-Z][A-Z0-9_]{2,127}$/u;
const requestPhases = new Set<AgentCapabilityProbeRequestPhase>([
  'cache-cold',
  'cache-warm',
  'continue',
  'dispatch-terminal',
  'poll',
  'resume',
  'submit',
]);

export const digestAgentCapabilityProbeResponseSpoolNamespace =
  (): CanonicalDigest =>
    digestAgentCanonicalValue({
      format: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_DIGEST_FORMAT,
      version: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION,
      namespaceId: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_ID,
    });

export const isAgentCapabilityProbeResponseSpoolAad = (
  value: unknown
): value is AgentCapabilityProbeResponseSpoolAad => {
  if (!hasExactAgentControlKeys(value, aadKeys)) return false;
  const aad = value as AgentCapabilityProbeResponseSpoolAad;
  return (
    aad.format === AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT &&
    aad.version === AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION &&
    aad.namespaceDigest ===
      digestAgentCapabilityProbeResponseSpoolNamespace() &&
    repositoryCommitPattern.test(aad.repositoryCommit) &&
    [
      aad.admissionRequestDigest,
      aad.probeProgramDigest,
      aad.profileProjectionDigest,
      aad.encryptionProfileDigest,
      aad.encryptionPolicyDigest,
      aad.keyRefDigest,
      aad.phaseRequestDigest,
      aad.dispatchIntentDigest,
      aad.transportReceiptDigest,
      aad.responseDigest,
    ].every(isAgentCanonicalDigest) &&
    Number.isSafeInteger(aad.sequence) &&
    aad.sequence >= 0 &&
    aad.sequence < 6 &&
    requestPhases.has(aad.phase) &&
    isAgentControlIdentity(aad.spoolRef) &&
    inspectAgentControlJson(aad, 16_384).length === 0 &&
    !containsAgentControlCredentialLikeText(JSON.stringify(aad))
  );
};

export const matchAgentCapabilityProbeResponseSpoolAadProgram = (
  aad: AgentCapabilityProbeResponseSpoolAad,
  program: AgentCapabilityProbeProgram
): boolean =>
  isAgentCapabilityProbeResponseSpoolAad(aad) &&
  isAgentCapabilityProbeProgram(program) &&
  aad.probeProgramDigest === program.programDigest &&
  aad.profileProjectionDigest === program.profileProjectionDigest &&
  resolveAgentCapabilityProbeNetworkRoundTripPhase(program, aad.sequence) ===
    aad.phase;

export const matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile = (
  aad: AgentCapabilityProbeResponseSpoolAad,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile
): boolean =>
  isAgentCapabilityProbeResponseSpoolAad(aad) &&
  isAgentCapabilityProbeResponseSpoolEncryptionProfile(profile) &&
  aad.namespaceDigest === profile.namespaceDigest &&
  aad.encryptionProfileDigest === profile.encryptionProfileDigest &&
  aad.encryptionPolicyDigest === profile.encryptionPolicyDigest &&
  aad.keyRefDigest === profile.keyRefDigest;

export const createAgentCapabilityProbeResponseSpoolAad = (
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  input: CreateAgentCapabilityProbeResponseSpoolAadInput
): AgentCapabilityProbeResponseSpoolAad => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !isAgentCapabilityProbeResponseSpoolEncryptionProfile(profile) ||
    !hasExactAgentControlKeys(input, [
      'repositoryCommit',
      'admissionRequestDigest',
      'phase',
      'sequence',
      'phaseRequestDigest',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'spoolRef',
      'responseDigest',
    ])
  ) {
    throw new TypeError('Capability probe response-spool AAD is invalid.');
  }
  const aad = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT,
    version: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION,
    namespaceDigest: profile.namespaceDigest,
    ...input,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    encryptionProfileDigest: profile.encryptionProfileDigest,
    encryptionPolicyDigest: profile.encryptionPolicyDigest,
    keyRefDigest: profile.keyRefDigest,
  });
  if (
    !matchAgentCapabilityProbeResponseSpoolAadProgram(aad, program) ||
    !matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile(aad, profile)
  ) {
    throw new TypeError('Capability probe response-spool AAD is invalid.');
  }
  return aad;
};

export const matchAgentCapabilityProbeResponseSpoolAadBinding = (
  aad: AgentCapabilityProbeResponseSpoolAad,
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  input: CreateAgentCapabilityProbeResponseSpoolAadInput
): boolean => {
  try {
    return sameCanonicalJson(
      aad,
      createAgentCapabilityProbeResponseSpoolAad(program, profile, input)
    );
  } catch {
    return false;
  }
};

export const digestAgentCapabilityProbeResponseSpoolAad = (
  aad: AgentCapabilityProbeResponseSpoolAad
): CanonicalDigest => {
  if (!isAgentCapabilityProbeResponseSpoolAad(aad)) {
    throw new TypeError('Capability probe response-spool AAD is invalid.');
  }
  return digestAgentCanonicalValue(aad);
};

const createProfile = (
  input: CreateAgentCapabilityProbeResponseSpoolEncryptionProfileInput
): AgentCapabilityProbeResponseSpoolEncryptionProfile => {
  const namespaceDigest = digestAgentCapabilityProbeResponseSpoolNamespace();
  const keyRefBase = Object.freeze({ ...input });
  const retentionBase = Object.freeze({
    maximumAgeMs: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS,
    disposition: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_RETENTION_DISPOSITION,
  });
  const retention = Object.freeze({
    ...retentionBase,
    retentionPolicyDigest: digestAgentCanonicalValue(retentionBase),
  });
  const encryptionProfileBase = Object.freeze({
    algorithm: 'AES-256-GCM' as const,
    nonceBytes: 12 as const,
    authenticationTagBytes: 16 as const,
    aadFormat: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT,
    aadVersion: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION,
    maximumPlaintextBytes:
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
  });
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_ENCRYPTION_PROFILE_FORMAT,
    version: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION,
    ...encryptionProfileBase,
    namespaceId: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_ID,
    namespaceDigest,
    ...input,
    keyRefDigest: digestAgentCanonicalValue(keyRefBase),
    retention,
    encryptionProfileDigest: digestAgentCanonicalValue(encryptionProfileBase),
  });
  return Object.freeze({
    ...base,
    encryptionPolicyDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentCapabilityProbeResponseSpoolEncryptionProfile = (
  value: unknown
): value is AgentCapabilityProbeResponseSpoolEncryptionProfile => {
  if (!hasExactAgentControlKeys(value, profileKeys)) return false;
  const profile = value as AgentCapabilityProbeResponseSpoolEncryptionProfile;
  if (
    !hasExactAgentControlKeys(profile.retention, retentionKeys) ||
    profile.format !==
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_ENCRYPTION_PROFILE_FORMAT ||
    profile.version !== AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION ||
    profile.algorithm !== 'AES-256-GCM' ||
    profile.nonceBytes !== 12 ||
    profile.authenticationTagBytes !== 16 ||
    profile.aadFormat !== AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT ||
    profile.aadVersion !== AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION ||
    profile.namespaceId !==
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_NAMESPACE_ID ||
    profile.namespaceDigest !==
      digestAgentCapabilityProbeResponseSpoolNamespace() ||
    !isAgentControlIdentity(profile.keyId) ||
    !Number.isSafeInteger(profile.keyVersion) ||
    profile.keyVersion < 1 ||
    !environmentNamePattern.test(profile.keyEnvironmentName) ||
    typeof profile.keyRef !== 'string' ||
    profile.keyRef.length < 1 ||
    profile.keyRef.length > 256 ||
    profile.maximumPlaintextBytes !==
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
    profile.retention.maximumAgeMs !==
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS ||
    profile.retention.disposition !==
      AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_RETENTION_DISPOSITION ||
    ![
      profile.keyRefDigest,
      profile.retention.retentionPolicyDigest,
      profile.encryptionProfileDigest,
      profile.encryptionPolicyDigest,
    ].every(isAgentCanonicalDigest) ||
    inspectAgentControlJson(profile, 16_384).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(profile))
  ) {
    return false;
  }
  return sameCanonicalJson(
    profile,
    createProfile({
      keyId: profile.keyId,
      keyVersion: profile.keyVersion,
      keyEnvironmentName: profile.keyEnvironmentName,
      keyRef: profile.keyRef,
    })
  );
};

export const createAgentCapabilityProbeResponseSpoolEncryptionProfile = (
  input: CreateAgentCapabilityProbeResponseSpoolEncryptionProfileInput
): AgentCapabilityProbeResponseSpoolEncryptionProfile => {
  if (
    !hasExactAgentControlKeys(input, [
      'keyId',
      'keyVersion',
      'keyEnvironmentName',
      'keyRef',
    ])
  ) {
    throw new TypeError(
      'Capability probe response-spool encryption profile is invalid.'
    );
  }
  const profile = createProfile(input);
  if (!isAgentCapabilityProbeResponseSpoolEncryptionProfile(profile)) {
    throw new TypeError(
      'Capability probe response-spool encryption profile is invalid.'
    );
  }
  return profile;
};

const base64Alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const encodeBase64 = (bytes: Uint8Array): string => {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += base64Alphabet[first >> 2]!;
    result += base64Alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)]!;
    result +=
      second === undefined
        ? '='
        : base64Alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]!;
    result += third === undefined ? '=' : base64Alphabet[third & 0x3f]!;
  }
  return result;
};

const decodeBase64 = (value: string): Uint8Array => {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new TypeError('Capability probe packed ciphertext is invalid.');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = base64Alphabet.indexOf(value[index]!);
    const b = base64Alphabet.indexOf(value[index + 1]!);
    const c =
      value[index + 2] === '=' ? 0 : base64Alphabet.indexOf(value[index + 2]!);
    const d =
      value[index + 3] === '=' ? 0 : base64Alphabet.indexOf(value[index + 3]!);
    if ([a, b, c, d].some((entry) => entry < 0)) {
      throw new TypeError('Capability probe packed ciphertext is invalid.');
    }
    if (offset < bytes.length) bytes[offset++] = (a << 2) | (b >> 4);
    if (offset < bytes.length) bytes[offset++] = ((b & 0x0f) << 4) | (c >> 2);
    if (offset < bytes.length) bytes[offset++] = ((c & 0x03) << 6) | d;
  }
  if (encodeBase64(bytes) !== value) {
    throw new TypeError('Capability probe packed ciphertext is not canonical.');
  }
  return bytes;
};

const cloneBytes = (value: Uint8Array): Uint8Array =>
  new Uint8Array(
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  );

const bytesDigest = (value: Uint8Array): CanonicalDigest =>
  digestAgentCanonicalValue({
    encoding: 'base64',
    bytes: encodeBase64(value),
  });

const aadBytes = (aad: AgentCapabilityProbeResponseSpoolAad): Uint8Array =>
  new TextEncoder().encode(canonicalJsonText(aad));

const createCiphertextEnvelope = (
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad,
  packed: Uint8Array
): AgentCapabilityProbeResponseSpoolCiphertextEnvelope => {
  const overhead = profile.nonceBytes + profile.authenticationTagBytes;
  const plaintextSizeBytes = packed.byteLength - overhead;
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !matchAgentCapabilityProbeResponseSpoolAadProgram(aad, program) ||
    !matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile(aad, profile) ||
    plaintextSizeBytes <= 0 ||
    plaintextSizeBytes > profile.maximumPlaintextBytes ||
    plaintextSizeBytes > program.hardLimits.maximumResponseBytes
  ) {
    throw new TypeError(
      'Capability probe response-spool ciphertext envelope is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_ENVELOPE_FORMAT,
    version: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_VERSION,
    algorithm: profile.algorithm,
    packing: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_CIPHERTEXT_PACKING,
    encryptionProfileDigest: profile.encryptionProfileDigest,
    encryptionPolicyDigest: profile.encryptionPolicyDigest,
    keyRefDigest: profile.keyRefDigest,
    aadDigest: digestAgentCapabilityProbeResponseSpoolAad(aad),
    nonceBytes: profile.nonceBytes,
    authenticationTagBytes: profile.authenticationTagBytes,
    plaintextSizeBytes,
    packedCiphertextSizeBytes: packed.byteLength,
    packedCiphertextDigest: bytesDigest(packed),
  });
  return Object.freeze({
    ...base,
    envelopeDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentCapabilityProbeResponseSpoolCiphertextEnvelope = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad,
  packedCiphertext: Uint8Array
): value is AgentCapabilityProbeResponseSpoolCiphertextEnvelope => {
  if (!hasExactAgentControlKeys(value, ciphertextEnvelopeKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createCiphertextEnvelope(
        program,
        profile,
        aad,
        cloneBytes(packedCiphertext)
      )
    );
  } catch {
    return false;
  }
};

export const createAgentCapabilityProbeResponseSpoolCiphertextWire = (
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad,
  input: Readonly<{
    nonceBytes: Uint8Array;
    ciphertextBytes: Uint8Array;
    authenticationTagBytes: Uint8Array;
  }>
): AgentCapabilityProbeResponseSpoolCiphertextWire => {
  if (
    !hasExactAgentControlKeys(input, [
      'nonceBytes',
      'ciphertextBytes',
      'authenticationTagBytes',
    ]) ||
    !(input.nonceBytes instanceof Uint8Array) ||
    !(input.ciphertextBytes instanceof Uint8Array) ||
    !(input.authenticationTagBytes instanceof Uint8Array) ||
    input.nonceBytes.byteLength !== profile.nonceBytes ||
    input.authenticationTagBytes.byteLength !==
      profile.authenticationTagBytes ||
    input.ciphertextBytes.byteLength <= 0
  ) {
    throw new TypeError('Capability probe packed ciphertext is invalid.');
  }
  const packed = new Uint8Array(
    input.nonceBytes.byteLength +
      input.ciphertextBytes.byteLength +
      input.authenticationTagBytes.byteLength
  );
  packed.set(input.nonceBytes, 0);
  packed.set(input.ciphertextBytes, input.nonceBytes.byteLength);
  packed.set(
    input.authenticationTagBytes,
    input.nonceBytes.byteLength + input.ciphertextBytes.byteLength
  );
  const envelope = createCiphertextEnvelope(program, profile, aad, packed);
  return Object.freeze({
    envelopeDigest: envelope.envelopeDigest,
    ciphertextBase64: encodeBase64(packed),
  });
};

export const decodeAgentCapabilityProbeResponseSpoolCiphertextWire = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad
): AgentCapabilityProbeResponseSpoolDecodedCiphertext => {
  if (
    !hasExactAgentControlKeys(value, ['envelopeDigest', 'ciphertextBase64']) ||
    !isAgentCanonicalDigest(value.envelopeDigest) ||
    typeof value.ciphertextBase64 !== 'string' ||
    value.ciphertextBase64.length >
      Math.ceil(
        (profile.maximumPlaintextBytes +
          profile.nonceBytes +
          profile.authenticationTagBytes) /
          3
      ) *
        4
  ) {
    throw new TypeError('Capability probe packed ciphertext wire is invalid.');
  }
  const packed = decodeBase64(value.ciphertextBase64);
  const envelope = createCiphertextEnvelope(program, profile, aad, packed);
  if (value.envelopeDigest !== envelope.envelopeDigest) {
    throw new TypeError('Capability probe packed ciphertext digest drifted.');
  }
  const ciphertextEnd = packed.byteLength - profile.authenticationTagBytes;
  return Object.freeze({
    envelope,
    nonceBytes: cloneBytes(packed.subarray(0, profile.nonceBytes)),
    ciphertextBytes: cloneBytes(
      packed.subarray(profile.nonceBytes, ciphertextEnd)
    ),
    authenticationTagBytes: cloneBytes(packed.subarray(ciphertextEnd)),
  });
};

export const encryptAgentCapabilityProbeResponseSpoolPlaintext = async (
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad,
  input: Readonly<{
    plaintextBytes: Uint8Array;
    nonceBytes: Uint8Array;
    encrypt: AgentCapabilityProbeResponseSpoolEncrypt;
  }>
): Promise<AgentCapabilityProbeResponseSpoolCiphertextWire> => {
  if (
    !hasExactAgentControlKeys(input, [
      'plaintextBytes',
      'nonceBytes',
      'encrypt',
    ]) ||
    !(input.plaintextBytes instanceof Uint8Array) ||
    !(input.nonceBytes instanceof Uint8Array) ||
    input.plaintextBytes.byteLength <= 0 ||
    input.plaintextBytes.byteLength > profile.maximumPlaintextBytes ||
    input.plaintextBytes.byteLength > program.hardLimits.maximumResponseBytes ||
    input.nonceBytes.byteLength !== profile.nonceBytes ||
    typeof input.encrypt !== 'function'
  ) {
    throw new TypeError(
      'Capability probe response-spool plaintext is invalid.'
    );
  }
  const result = await input.encrypt(
    Object.freeze({
      algorithm: profile.algorithm,
      keyRef: profile.keyRef,
      nonceBytes: cloneBytes(input.nonceBytes),
      aadBytes: aadBytes(aad),
      plaintextBytes: cloneBytes(input.plaintextBytes),
    })
  );
  if (
    !hasExactAgentControlKeys(result, [
      'ciphertextBytes',
      'authenticationTagBytes',
    ]) ||
    !(result.ciphertextBytes instanceof Uint8Array) ||
    !(result.authenticationTagBytes instanceof Uint8Array) ||
    result.ciphertextBytes.byteLength !== input.plaintextBytes.byteLength
  ) {
    throw new TypeError(
      'Capability probe response-spool encryption result is invalid.'
    );
  }
  return createAgentCapabilityProbeResponseSpoolCiphertextWire(
    program,
    profile,
    aad,
    {
      nonceBytes: input.nonceBytes,
      ciphertextBytes: result.ciphertextBytes,
      authenticationTagBytes: result.authenticationTagBytes,
    }
  );
};

export const decryptAgentCapabilityProbeResponseSpoolPlaintext = async (
  wire: AgentCapabilityProbeResponseSpoolCiphertextWire,
  program: AgentCapabilityProbeProgram,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  aad: AgentCapabilityProbeResponseSpoolAad,
  decrypt: AgentCapabilityProbeResponseSpoolDecrypt
): Promise<Uint8Array> => {
  if (typeof decrypt !== 'function') {
    throw new TypeError(
      'Capability probe response-spool decryption callback is invalid.'
    );
  }
  const decoded = decodeAgentCapabilityProbeResponseSpoolCiphertextWire(
    wire,
    program,
    profile,
    aad
  );
  const plaintext = await decrypt(
    Object.freeze({
      algorithm: profile.algorithm,
      keyRef: profile.keyRef,
      nonceBytes: cloneBytes(decoded.nonceBytes),
      aadBytes: aadBytes(aad),
      ciphertextBytes: cloneBytes(decoded.ciphertextBytes),
      authenticationTagBytes: cloneBytes(decoded.authenticationTagBytes),
    })
  );
  if (
    !(plaintext instanceof Uint8Array) ||
    plaintext.byteLength !== decoded.envelope.plaintextSizeBytes
  ) {
    throw new TypeError(
      'Capability probe response-spool decrypted plaintext is invalid.'
    );
  }
  return cloneBytes(plaintext);
};
