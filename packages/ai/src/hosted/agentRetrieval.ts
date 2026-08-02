import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentExternalSourceResult,
  AgentExternalSourceTraceMapping,
  AgentHostedCapabilityIssue,
  AgentRetrievalIndexDeletionReceipt,
  AgentRetrievalIndexIdentity,
  AgentRetrievalQueryReceipt,
} from './agentHosted.types';
import type {
  AgentNetworkRule,
  AgentSensitivity,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const localHostPattern =
  /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/iu;
const privateAddressPattern =
  /^(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)$/iu;
const sensitivityOrder: Readonly<Record<AgentSensitivity, number>> =
  Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });

const assertIdentity = (value: string, label: string): string => {
  if (!identityPattern.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
};

const assertDigest = (value: CanonicalDigest, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
};

const assertInstant = (value: string, label: string): void => {
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} is invalid.`);
  }
};

export const canonicalizeAgentRetrievalUrl = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new TypeError('Retrieval URL is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    localHostPattern.test(url.hostname)
  ) {
    throw new TypeError('Retrieval URL violates the public HTTPS boundary.');
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.port === '443') url.port = '';
  return url.toString();
};

export type AgentRetrievalFetchPreflightResult =
  | Readonly<{
      ok: true;
      canonicalUrl: string;
      networkPolicyDigest: CanonicalDigest;
      attemptDigest: CanonicalDigest;
    }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }>;

/** Must be called for every initial fetch, redirect, and retry attempt. */
export const preflightAgentRetrievalFetch = (
  input: Readonly<{
    policy: AgentNetworkRule;
    url: string;
    method: 'GET' | 'HEAD' | 'POST';
    redirectFrom?: string;
    resolvedAddresses: readonly string[];
    requestBytes: number;
    expectedResponseBytes: number;
    disclosedSensitivity: AgentSensitivity;
    maximumSensitivity: AgentSensitivity;
  }>
): AgentRetrievalFetchPreflightResult => {
  const issues: AgentHostedCapabilityIssue[] = [];
  const add = (path: string, message: string) =>
    issues.push(
      Object.freeze({
        code: 'AI-7004' as const,
        path,
        message,
        blocking: true as const,
      })
    );
  let canonicalUrl: string | undefined;
  try {
    canonicalUrl = canonicalizeAgentRetrievalUrl(input.url);
  } catch (caught) {
    add(
      '/url',
      caught instanceof Error ? caught.message : 'Retrieval URL is invalid.'
    );
  }
  const parsed = canonicalUrl ? new URL(canonicalUrl) : undefined;
  const hostAllowed =
    parsed !== undefined &&
    input.policy.hosts.some((entry) => {
      const expected = entry.toLowerCase();
      return expected.startsWith('*.')
        ? parsed.hostname.endsWith(expected.slice(1)) &&
            parsed.hostname !== expected.slice(2)
        : parsed.hostname === expected;
    });
  if (
    input.policy.effect !== 'allow' ||
    input.policy.tls !== 'required' ||
    !hostAllowed ||
    !input.policy.methods.includes(input.method)
  ) {
    add('/policy', 'Retrieval host, method, or TLS is not allowed.');
  }
  if (
    input.resolvedAddresses.length === 0 ||
    input.resolvedAddresses.some(
      (address) => !address.trim() || privateAddressPattern.test(address)
    )
  ) {
    add(
      '/resolvedAddresses',
      'Retrieval DNS resolution is missing or private.'
    );
  }
  if (
    !Number.isSafeInteger(input.requestBytes) ||
    input.requestBytes < 0 ||
    input.requestBytes > input.policy.maxRequestBytes ||
    !Number.isSafeInteger(input.expectedResponseBytes) ||
    input.expectedResponseBytes < 0 ||
    input.expectedResponseBytes > input.policy.maxResponseBytes
  ) {
    add('/bytes', 'Retrieval request or response exceeds the network policy.');
  }
  if (
    sensitivityOrder[input.disclosedSensitivity] >
    sensitivityOrder[input.maximumSensitivity]
  ) {
    add(
      '/sensitivity',
      'Retrieval query would disclose over-classified Context.'
    );
  }
  if (input.redirectFrom) {
    try {
      const from = new URL(canonicalizeAgentRetrievalUrl(input.redirectFrom));
      if (
        input.policy.redirectPolicy === 'deny' ||
        !parsed ||
        from.origin !== parsed.origin
      ) {
        add('/redirectFrom', 'Retrieval redirect violates the network policy.');
      }
    } catch {
      add('/redirectFrom', 'Retrieval redirect origin is invalid.');
    }
  }
  if (issues.length > 0 || !canonicalUrl) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const policyDigest = digestAgentCanonicalValue(input.policy);
  const attemptBase = {
    canonicalUrl,
    method: input.method,
    ...(input.redirectFrom
      ? { redirectFrom: canonicalizeAgentRetrievalUrl(input.redirectFrom) }
      : {}),
    resolvedAddresses: Object.freeze(
      [...input.resolvedAddresses].sort(compareUnicodeCodePoints)
    ),
    requestBytes: input.requestBytes,
    expectedResponseBytes: input.expectedResponseBytes,
    disclosedSensitivity: input.disclosedSensitivity,
    networkPolicyDigest: policyDigest,
  } as const;
  return Object.freeze({
    ok: true,
    canonicalUrl,
    networkPolicyDigest: policyDigest,
    attemptDigest: digestAgentCanonicalValue(attemptBase),
  });
};

export const createAgentExternalSourceResult = (
  input: Omit<
    AgentExternalSourceResult,
    'authority' | 'instructionBoundary' | 'resultDigest'
  >
): AgentExternalSourceResult => {
  assertIdentity(input.sourceResultId, 'External source result id');
  assertInstant(input.retrievedAt, 'External source retrieval instant');
  const canonicalUrl = input.canonicalUrl
    ? canonicalizeAgentRetrievalUrl(input.canonicalUrl)
    : undefined;
  if (input.contentDigest)
    assertDigest(input.contentDigest, 'Source content digest');
  if (input.snapshotRef)
    assertIdentity(input.snapshotRef, 'Source snapshot ref');
  if (input.providerCitationRef) {
    assertIdentity(input.providerCitationRef, 'Provider citation ref');
  }
  if (
    !['snapshotted', 'reference-only', 'unavailable'].includes(
      input.availability
    ) ||
    (input.availability === 'snapshotted' &&
      (!canonicalUrl || !input.contentDigest || !input.snapshotRef)) ||
    (input.availability === 'reference-only' &&
      (!canonicalUrl || input.snapshotRef !== undefined)) ||
    (input.availability === 'unavailable' &&
      (input.contentDigest !== undefined || input.snapshotRef !== undefined))
  ) {
    throw new TypeError(
      'External source availability claims are inconsistent.'
    );
  }
  const base = {
    sourceResultId: input.sourceResultId,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    retrievedAt: input.retrievedAt,
    ...(input.contentDigest ? { contentDigest: input.contentDigest } : {}),
    ...(input.snapshotRef ? { snapshotRef: input.snapshotRef } : {}),
    ...(input.providerCitationRef
      ? { providerCitationRef: input.providerCitationRef }
      : {}),
    authority: 'external-untrusted' as const,
    instructionBoundary: 'data-only' as const,
    availability: input.availability,
  } as const;
  return Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentExternalSourceResult = (
  source: AgentExternalSourceResult
): boolean => {
  try {
    const {
      authority: _authority,
      instructionBoundary: _instructionBoundary,
      resultDigest: _digest,
      ...base
    } = source;
    return sameCanonicalJson(createAgentExternalSourceResult(base), source);
  } catch {
    return false;
  }
};

export const createAgentRetrievalQueryReceipt = (
  input: Readonly<{
    queryId: string;
    toolDescriptorDigest: CanonicalDigest;
    queryDigest: CanonicalDigest;
    purpose: AgentRetrievalQueryReceipt['purpose'];
    networkPolicyDigest: CanonicalDigest;
    sources: readonly AgentExternalSourceResult[];
    indexDigest?: CanonicalDigest;
    retrievalConfigurationDigest?: CanonicalDigest;
    usageRef: string;
    startedAt: string;
    completedAt: string;
  }>
): AgentRetrievalQueryReceipt => {
  assertIdentity(input.queryId, 'Retrieval query id');
  assertIdentity(input.usageRef, 'Retrieval usage ref');
  if (
    !['public-research', 'authorized-project-retrieval'].includes(input.purpose)
  ) {
    throw new TypeError('Retrieval purpose is invalid.');
  }
  for (const [label, digest] of [
    ['Tool descriptor digest', input.toolDescriptorDigest],
    ['Retrieval query digest', input.queryDigest],
    ['Network policy digest', input.networkPolicyDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  if (input.indexDigest)
    assertDigest(input.indexDigest, 'Retrieval index digest');
  if (input.retrievalConfigurationDigest) {
    assertDigest(
      input.retrievalConfigurationDigest,
      'Retrieval configuration digest'
    );
  }
  assertInstant(input.startedAt, 'Retrieval start instant');
  assertInstant(input.completedAt, 'Retrieval completion instant');
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) {
    throw new TypeError('Retrieval cannot complete before it starts.');
  }
  if (
    input.sources.some((source) => !validateAgentExternalSourceResult(source))
  ) {
    throw new TypeError('Retrieval receipt contains an invalid source result.');
  }
  const sources = [...input.sources].sort((left, right) =>
    compareUnicodeCodePoints(left.sourceResultId, right.sourceResultId)
  );
  if (
    new Set(sources.map(({ sourceResultId }) => sourceResultId)).size !==
    sources.length
  ) {
    throw new TypeError('Retrieval source result ids must be unique.');
  }
  const base = {
    queryId: input.queryId,
    toolDescriptorDigest: input.toolDescriptorDigest,
    queryDigest: input.queryDigest,
    purpose: input.purpose,
    networkPolicyDigest: input.networkPolicyDigest,
    sourceResultRefs: Object.freeze(
      sources.map(({ sourceResultId }) => sourceResultId)
    ),
    sourceResultDigests: Object.freeze(
      sources.map(({ resultDigest }) => resultDigest)
    ),
    ...(input.indexDigest ? { indexDigest: input.indexDigest } : {}),
    ...(input.retrievalConfigurationDigest
      ? { retrievalConfigurationDigest: input.retrievalConfigurationDigest }
      : {}),
    usageRef: input.usageRef,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const mapAgentExternalSourceToSourceTrace = (
  input: Readonly<{
    source: AgentExternalSourceResult;
    sourceTraceRef: string;
    sourceOwnerId: string;
    verifiedSnapshotDigest?: CanonicalDigest;
    mappedAt: string;
  }>
): AgentExternalSourceTraceMapping => {
  if (!validateAgentExternalSourceResult(input.source)) {
    throw new TypeError('SourceTrace mapping requires an exact source result.');
  }
  assertIdentity(input.sourceTraceRef, 'SourceTrace ref');
  assertIdentity(input.sourceOwnerId, 'Source owner id');
  assertInstant(input.mappedAt, 'SourceTrace mapping instant');
  if (
    input.verifiedSnapshotDigest &&
    (input.source.availability !== 'snapshotted' ||
      input.source.contentDigest !== input.verifiedSnapshotDigest)
  ) {
    throw new TypeError(
      'SourceTrace verified snapshot does not match the source.'
    );
  }
  const base = {
    sourceResultId: input.source.sourceResultId,
    sourceResultDigest: input.source.resultDigest,
    sourceTraceRef: input.sourceTraceRef,
    sourceOwnerId: input.sourceOwnerId,
    ...(input.verifiedSnapshotDigest
      ? { verifiedSnapshotDigest: input.verifiedSnapshotDigest }
      : {}),
    mappedAt: input.mappedAt,
  } as const;
  return Object.freeze({
    ...base,
    mappingDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentRetrievalIndexIdentity = (
  input: Omit<
    AgentRetrievalIndexIdentity,
    'ambientMemory' | 'indexDigest' | 'corpusRevision'
  > &
    Readonly<{ corpusRevision: AgentWorkspaceRevisionVector }>
): AgentRetrievalIndexIdentity => {
  for (const [label, value] of [
    ['Retrieval index id', input.indexId],
    ['Project id', input.projectId],
    ['Workspace id', input.workspaceId],
    ['Retrieval index operator id', input.operatorId],
    ['Chunker id', input.chunkerId],
    ['Chunker version', input.chunkerVersion],
  ] as const) {
    assertIdentity(value, label);
  }
  if (input.providerConfigurationId) {
    assertIdentity(input.providerConfigurationId, 'Provider configuration id');
  }
  if (input.storageRegion) {
    assertIdentity(input.storageRegion, 'Retrieval storage region');
  }
  for (const [label, value] of [
    ['Corpus manifest digest', input.corpusManifestDigest],
    ['Chunker digest', input.chunkerDigest],
    ['Embedding model digest', input.embeddingModelDigest],
    ['Ranker digest', input.rankerDigest],
    ['Visibility policy digest', input.visibilityPolicyDigest],
    ['Retention policy digest', input.retentionPolicyDigest],
  ] as const) {
    assertDigest(value, label);
  }
  assertInstant(input.createdAt, 'Retrieval index creation instant');
  assertInstant(input.expiresAt, 'Retrieval index expiry instant');
  if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
    throw new TypeError('Retrieval index must expire after creation.');
  }
  if (!['proven', 'unproven'].includes(input.tenantIsolation)) {
    throw new TypeError('Retrieval index tenant isolation is invalid.');
  }
  const base = {
    indexId: input.indexId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    operatorId: input.operatorId,
    ...(input.providerConfigurationId
      ? { providerConfigurationId: input.providerConfigurationId }
      : {}),
    corpusRevision: canonicalizeAgentWorkspaceRevision(input.corpusRevision),
    corpusManifestDigest: input.corpusManifestDigest,
    chunkerId: input.chunkerId,
    chunkerVersion: input.chunkerVersion,
    chunkerDigest: input.chunkerDigest,
    embeddingModelDigest: input.embeddingModelDigest,
    rankerDigest: input.rankerDigest,
    visibilityPolicyDigest: input.visibilityPolicyDigest,
    ...(input.storageRegion ? { storageRegion: input.storageRegion } : {}),
    retentionPolicyDigest: input.retentionPolicyDigest,
    tenantIsolation: input.tenantIsolation,
    ambientMemory: 'disabled' as const,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  } as const;
  return Object.freeze({
    ...base,
    indexDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentRetrievalIndexIdentity = (
  identity: AgentRetrievalIndexIdentity
): boolean => {
  try {
    const { ambientMemory: _ambient, indexDigest: _digest, ...base } = identity;
    return sameCanonicalJson(createAgentRetrievalIndexIdentity(base), identity);
  } catch {
    return false;
  }
};

export type AgentRetrievalIndexAdmissionResult =
  | Readonly<{ ok: true; indexDigest: CanonicalDigest }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }>;

export const admitAgentRetrievalIndex = (
  input: Readonly<{
    identity: AgentRetrievalIndexIdentity;
    projectId: string;
    workspaceId: string;
    currentRevision: AgentWorkspaceRevisionVector;
    at: string;
    taskMode: 'explain' | 'plan' | 'propose' | 'apply';
  }>
): AgentRetrievalIndexAdmissionResult => {
  const issues: AgentHostedCapabilityIssue[] = [];
  const add = (path: string, message: string) =>
    issues.push(
      Object.freeze({
        code: 'AI-7013' as const,
        path,
        message,
        blocking: true as const,
      })
    );
  if (!validateAgentRetrievalIndexIdentity(input.identity)) {
    add('/identity', 'Retrieval index identity is invalid or drifted.');
  }
  if (
    input.identity.projectId !== input.projectId ||
    input.identity.workspaceId !== input.workspaceId
  ) {
    add('/scope', 'Retrieval index belongs to another project or Workspace.');
  }
  if (
    !Number.isFinite(Date.parse(input.at)) ||
    Date.parse(input.at) >= Date.parse(input.identity.expiresAt)
  ) {
    add('/expiresAt', 'Retrieval index is expired.');
  }
  if (input.identity.tenantIsolation !== 'proven') {
    add('/tenantIsolation', 'Retrieval index tenant isolation is unproven.');
  }
  if (
    (input.taskMode === 'propose' || input.taskMode === 'apply') &&
    !sameAgentWorkspaceRevision(
      input.identity.corpusRevision,
      input.currentRevision
    )
  ) {
    add(
      '/corpusRevision',
      'Stale retrieval index cannot ground a current proposal.'
    );
  }
  return issues.length > 0
    ? Object.freeze({ ok: false, issues: Object.freeze(issues) })
    : Object.freeze({ ok: true, indexDigest: input.identity.indexDigest });
};

export const createAgentRetrievalIndexDeletionReceipt = (
  input: Omit<AgentRetrievalIndexDeletionReceipt, 'receiptDigest'>
): AgentRetrievalIndexDeletionReceipt => {
  assertIdentity(input.indexId, 'Retrieval index id');
  assertIdentity(input.operatorId, 'Retrieval index operator id');
  assertDigest(input.indexDigest, 'Retrieval index digest');
  assertInstant(input.deletedAt, 'Retrieval index deletion instant');
  if (input.providerReceiptDigest) {
    assertDigest(
      input.providerReceiptDigest,
      'Provider deletion receipt digest'
    );
  }
  if (
    !['deleted', 'not-found', 'failed'].includes(input.status) ||
    !['none', 'detected', 'unknown'].includes(input.residualState)
  ) {
    throw new TypeError('Retrieval index deletion status is invalid.');
  }
  if (
    (input.status === 'deleted' || input.status === 'not-found') &&
    input.residualState !== 'none'
  ) {
    throw new TypeError(
      'Successful index deletion cannot retain residual state.'
    );
  }
  const base = {
    indexId: input.indexId,
    indexDigest: input.indexDigest,
    operatorId: input.operatorId,
    status: input.status,
    residualState: input.residualState,
    deletedAt: input.deletedAt,
    ...(input.providerReceiptDigest
      ? { providerReceiptDigest: input.providerReceiptDigest }
      : {}),
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentRetrievalIndexDeletionComplete = (
  receipt: AgentRetrievalIndexDeletionReceipt
): boolean => {
  try {
    const { receiptDigest: _digest, ...base } = receipt;
    return (
      sameCanonicalJson(
        createAgentRetrievalIndexDeletionReceipt(base),
        receipt
      ) &&
      receipt.status !== 'failed' &&
      receipt.residualState === 'none'
    );
  } catch {
    return false;
  }
};
