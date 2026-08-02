import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { CanonicalDigest } from '../domain/agent.types';
import { isAgentCanonicalDigest } from '../domain/agentCanonical';
import type { AgentHostedCapabilityIssue } from './agentHosted.types';

export const HOSTED_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

export const assertHostedIdentity = (value: string, label: string): string => {
  if (!HOSTED_IDENTITY_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
};

export const assertHostedDigest = (
  value: CanonicalDigest,
  label: string
): void => {
  if (!isAgentCanonicalDigest(value))
    throw new TypeError(`${label} is invalid.`);
};

export const assertHostedInstant = (value: string, label: string): void => {
  if (!Number.isFinite(Date.parse(value)))
    throw new TypeError(`${label} is invalid.`);
};

export const assertHostedCount = (
  value: number,
  label: string,
  minimum = 0
): number => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}.`);
  }
  return value;
};

export const canonicalHostedDigests = (
  values: readonly CanonicalDigest[],
  label: string
): readonly CanonicalDigest[] => {
  values.forEach((value) => assertHostedDigest(value, label));
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} values must be unique.`);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

export const createHostedBlockedResult = (
  code: AgentHostedCapabilityIssue['code'],
  path: string,
  message: string
): Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code, path, message, blocking: true as const }),
    ]),
  });
