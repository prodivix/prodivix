import type {
  AgentContextPack,
  AgentNetworkRule,
  AgentRuntimeZone,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';

export type AgentSecurityFinding = Readonly<{
  code: 'AI-7002' | 'AI-7003' | 'AI-7004' | 'AI-8011' | 'AI-9001';
  path: string;
  category:
    | 'authority-confusion'
    | 'prompt-injection-signal'
    | 'secret-canary'
    | 'holdout-leak'
    | 'network-policy'
    | 'unsafe-artifact';
  message: string;
  blocking: boolean;
}>;

export type AgentDnsResolutionReceipt = Readonly<{
  hostname: string;
  resolvedAddresses: readonly string[];
  resolverPolicyDigest: CanonicalDigest;
  resolvedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEgressRequest = Readonly<{
  requestId: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  requestBytes: number;
  expectedMaximumResponseBytes: number;
  timeoutMs: number;
  purpose: string;
  runtimeZone: AgentRuntimeZone;
  redirectChain: readonly string[];
  dnsReceipt: AgentDnsResolutionReceipt;
  requestedAt: Instant;
}>;

export type AgentEgressAuthorization = Readonly<{
  allowed: boolean;
  matchedRuleId?: string;
  findings: readonly AgentSecurityFinding[];
  requestDigest: CanonicalDigest;
  decisionDigest: CanonicalDigest;
}>;

export type AgentSecretCallbackLease = Readonly<{
  leaseId: string;
  invocationId: string;
  callbackId: string;
  secretRefs: readonly string[];
  purpose: string;
  runtimeZone: Exclude<AgentRuntimeZone, 'browser'>;
  authorityDigest: CanonicalDigest;
  issuedAt: Instant;
  expiresAt: Instant;
  leaseDigest: CanonicalDigest;
}>;

export type AgentSecretCallbackUseReceipt = Readonly<{
  leaseId: string;
  invocationId: string;
  callbackId: string;
  purpose: string;
  resultDigest: CanonicalDigest;
  usedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentContextSecurityInspection = Readonly<{
  contextPackDigest: CanonicalDigest;
  findings: readonly AgentSecurityFinding[];
  safe: boolean;
}>;

export type AgentEgressPolicyInput = Readonly<{
  rules: readonly AgentNetworkRule[];
  allowedPurposes: readonly string[];
  allowedRuntimeZones: readonly AgentRuntimeZone[];
  maximumTimeoutMs: number;
  resolverPolicyDigest: CanonicalDigest;
}>;

export type AgentContextPackForSecurity = AgentContextPack;
