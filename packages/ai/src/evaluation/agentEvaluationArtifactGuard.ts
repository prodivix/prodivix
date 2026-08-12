import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import type { AgentJsonValue } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import type { AgentSecurityFinding } from '../security/agentSecurity.types';
import type {
  AgentEvaluationPublicArtifactKind,
  AgentEvaluationPublicArtifactScan,
} from './agentEvaluationCorpusMaterial.types';

const maximumMaterialBytes = 2_097_152;
const redactedProtectedMaterial = '[REDACTED_PROTECTED_MATERIAL]';

const utf8Bytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    result += alphabet[(chunk >>> 18) & 63];
    result += alphabet[(chunk >>> 12) & 63];
    result += index + 1 < bytes.length ? alphabet[(chunk >>> 6) & 63] : '=';
    result += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }
  return result;
};

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const canarySignatures = (canaries: readonly string[]): readonly string[] => {
  const signatures = new Set<string>();
  for (const canary of canaries) {
    const bytes = utf8Bytes(canary);
    const base64 = bytesToBase64(bytes);
    signatures.add(canary);
    signatures.add(encodeURIComponent(canary));
    signatures.add(
      [...bytes]
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
        .join('')
    );
    signatures.add(bytesToHex(bytes));
    signatures.add(bytesToHex(bytes).toUpperCase());
    signatures.add(base64);
    signatures.add(
      base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
    );
  }
  return Object.freeze(
    [...signatures]
      .filter((entry) => entry.length > 0)
      .sort((left, right) => right.length - left.length)
  );
};

const replaceSignatures = (
  value: string,
  signatures: readonly string[]
): string => {
  let result = value;
  for (const signature of signatures) {
    result = result.replaceAll(signature, redactedProtectedMaterial);
  }
  return result;
};

const redactSafeJson = (
  value: AgentJsonValue,
  signatures: readonly string[]
): AgentJsonValue => {
  if (typeof value === 'string') return replaceSignatures(value, signatures);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) => redactSafeJson(entry, signatures))
    );
  }
  const redacted: Record<string, AgentJsonValue> = Object.create(
    null
  ) as Record<string, AgentJsonValue>;
  let index = 0;
  for (const [key, child] of Object.entries(value).sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right)
  )) {
    const candidateKey = replaceSignatures(key, signatures);
    const safeKey = Object.hasOwn(redacted, candidateKey)
      ? `redacted-field-${index}`
      : candidateKey;
    redacted[safeKey] = redactSafeJson(child, signatures);
    index += 1;
  }
  return Object.freeze(redacted);
};

const unsafeArtifactFinding = (): AgentSecurityFinding =>
  Object.freeze({
    code: 'AI-9001',
    path: '/',
    category: 'unsafe-artifact',
    message: 'Evaluation public artifact is not bounded safe JSON.',
    blocking: true,
  });

/** Redacts known material and fails closed when a public value contains it. */
export const scanAndRedactAgentEvaluationPublicArtifact = (
  artifactKind: AgentEvaluationPublicArtifactKind,
  artifact: unknown,
  input: Readonly<{
    protectedMaterialCanaries: readonly string[];
    secretCanaries?: readonly string[];
  }>
): AgentEvaluationPublicArtifactScan => {
  const protectedMaterialCanaries = Object.freeze([
    ...input.protectedMaterialCanaries,
  ]);
  const secretCanaries = Object.freeze([...(input.secretCanaries ?? [])]);
  const invalidCanaries = [
    ...protectedMaterialCanaries,
    ...secretCanaries,
  ].some((canary) => typeof canary !== 'string' || canary.length < 8);
  if (
    invalidCanaries ||
    new Set(protectedMaterialCanaries).size !==
      protectedMaterialCanaries.length ||
    new Set(secretCanaries).size !== secretCanaries.length
  ) {
    throw new TypeError('Evaluation artifact canaries are invalid.');
  }
  const bounded = inspectAgentControlJson(artifact, maximumMaterialBytes);
  const findings: AgentSecurityFinding[] = [
    ...(bounded.length > 0 ? [unsafeArtifactFinding()] : []),
    ...(protectedMaterialCanaries.length > 0
      ? scanAgentArtifactForProtectedHoldoutLeak(
          artifact,
          protectedMaterialCanaries
        )
      : []),
    ...(secretCanaries.length > 0
      ? scanAgentArtifactForSecretCanaries(artifact, secretCanaries)
      : []),
  ];
  findings.sort(
    (left, right) =>
      compareUnicodeCodePoints(left.path, right.path) ||
      compareUnicodeCodePoints(left.category, right.category)
  );
  const safeArtifact =
    bounded.length === 0
      ? (cloneAgentControlJson(artifact) as AgentJsonValue)
      : null;
  const redactedArtifact = safeArtifact
    ? redactSafeJson(
        safeArtifact,
        canarySignatures([...protectedMaterialCanaries, ...secretCanaries])
      )
    : null;
  const safe = findings.every(({ blocking }) => !blocking);
  const base = Object.freeze({
    artifactKind,
    safe,
    redactedArtifact,
    findings: Object.freeze(findings),
  });
  return Object.freeze({
    ...base,
    scanDigest: digestAgentCanonicalValue(base),
  });
};
