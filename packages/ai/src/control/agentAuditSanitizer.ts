import { canonicalJsonText } from '@prodivix/shared/canonical';
import type { AgentJsonValue } from '../domain/agent.types';
import {
  containsAgentControlCredentialLikeText,
  inspectAgentControlJson,
  isSafeAgentControlJson,
} from './agentControlValidation';

const privateFieldPattern =
  /^(?:authorization|cookie|credential|password|privateReasoning|rawPrompt|rawToolOutput|secret|secretValue|signedUrl|capabilityToken)$/iu;
const maximumAuditPayloadBytes = 65_536;

const sanitizeValue = (
  value: AgentJsonValue,
  secretCanaries: readonly string[]
): AgentJsonValue => {
  if (typeof value === 'string') {
    if (
      secretCanaries.some(
        (canary) => canary.length > 0 && value.includes(canary)
      ) ||
      containsAgentControlCredentialLikeText(value)
    ) {
      throw new TypeError('Agent audit payload contains Secret material.');
    }
    return value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) => sanitizeValue(entry, secretCanaries))
    );
  }
  const sanitized: Record<string, AgentJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(sanitized, key, {
      enumerable: true,
      configurable: false,
      writable: false,
      value: privateFieldPattern.test(key)
        ? '[redacted]'
        : sanitizeValue(entry, secretCanaries),
    });
  }
  return Object.freeze(sanitized);
};

/**
 * Produces the only payload shape admitted into normal Agent audit events.
 * Known private fields are replaced before persistence; canary or credential
 * material in an otherwise innocuous field fails closed.
 */
export const sanitizeAgentAuditPayload = (
  value: unknown,
  secretCanaries: readonly string[] = []
): AgentJsonValue => {
  const inspection = inspectAgentControlJson(value, maximumAuditPayloadBytes);
  if (inspection.length > 0 || !isSafeAgentControlJson(value)) {
    throw new TypeError(
      inspection.map(({ message }) => message).join('; ') ||
        'Agent audit payload is not safe JSON.'
    );
  }
  const sanitized = sanitizeValue(value, secretCanaries);
  if (
    new TextEncoder().encode(canonicalJsonText(sanitized)).byteLength >
    maximumAuditPayloadBytes
  ) {
    throw new TypeError(
      'Sanitized Agent audit payload exceeds its byte limit.'
    );
  }
  return sanitized;
};
