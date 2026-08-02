import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import type { AgentModelInvocationReceipt } from './agentProvider.types';

export type AgentInvocationIssue = Readonly<{
  code: 'AI-6010' | 'AI-6011' | 'AI-6012' | 'AI-6013' | 'AI-7001' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentInvocationPreflightResult =
  | Readonly<{ ok: true; requestDigest: CanonicalDigest }>
  | Readonly<{ ok: false; issues: readonly AgentInvocationIssue[] }>;

export type AgentInvocationReceiptResult =
  | Readonly<{ ok: true; receipt: AgentModelInvocationReceipt }>
  | Readonly<{ ok: false; issues: readonly AgentInvocationIssue[] }>;

export const createAgentInvocationIssue = (
  code: AgentInvocationIssue['code'],
  path: string,
  message: string
): AgentInvocationIssue =>
  Object.freeze({ code, path, message, blocking: true });

export const compareAgentInvocationIssues = (
  left: AgentInvocationIssue,
  right: AgentInvocationIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

export const isValidAgentInvocationInstant = (value: Instant): boolean =>
  Number.isFinite(Date.parse(value));

export const agentCacheScopeOrder = Object.freeze({
  invocation: 0,
  task: 1,
  workspace: 2,
});
