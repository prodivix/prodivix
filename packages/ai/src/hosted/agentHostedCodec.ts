import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import { agentHostedFactWireSchema } from '../wire/agentHostedWire';
import {
  createAgentComputerUseSession,
  createAgentHostedSandboxDescriptor,
  createAgentMcpServerIdentity,
} from './agentCapabilityBoundaries';
import type {
  AgentHostedFact,
  AgentParallelToolJoinReceipt,
  AgentRetrievalQueryReceipt,
  AgentToolCallReceipt,
  AgentToolDiscoveryReceipt,
} from './agentHosted.types';
import {
  createAgentExternalSourceResult,
  createAgentRetrievalIndexDeletionReceipt,
  createAgentRetrievalIndexIdentity,
} from './agentRetrieval';
import {
  createAgentToolDescriptor,
  createAgentToolRegistrySnapshot,
} from './agentToolRegistry';

export type AgentHostedFactWire = AgentHostedFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentHostedFactDecodeIssue = Readonly<{
  code: 'AI-9001';
  path: string;
  message: string;
}>;

export type AgentHostedFactDecodeResult =
  | Readonly<{ ok: true; value: AgentHostedFact }>
  | Readonly<{
      ok: false;
      issues: readonly AgentHostedFactDecodeIssue[];
    }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(agentHostedFactWireSchema);
const maximumBytes = 2_097_152;
const maximumDepth = 32;
const maximumNodes = 50_000;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const lifecyclePhases = new Set([
  'decoded',
  'preflighted',
  'authorized',
  'budget-reserved',
  'executed',
  'normalized',
  'redacted',
  'staged',
  'finalized',
  'cleaned',
]);

const issue = (path: string, message: string): AgentHostedFactDecodeIssue =>
  Object.freeze({ code: 'AI-9001', path, message });

const inspect = (value: unknown): readonly AgentHostedFactDecodeIssue[] => {
  const issues: AgentHostedFactDecodeIssue[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > maximumNodes) {
      issues.push(issue('/', 'Hosted capability fact exceeds its node limit.'));
      return;
    }
    if (depth > maximumDepth) {
      issues.push(
        issue(path, 'Hosted capability fact exceeds its depth limit.')
      );
      return;
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        issues.push(issue(path, 'Hosted capability numbers must be finite.'));
      }
      return;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      issues.push(issue(path, 'Hosted capability facts must be acyclic JSON.'));
      return;
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        if (
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index)) ||
          Object.getOwnPropertySymbols(candidate).length > 0
        ) {
          issues.push(issue(path, 'Hosted capability arrays must be dense.'));
          return;
        }
        keys.forEach((key) => {
          const descriptor = descriptors[key];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            issues.push(
              issue(
                `${path}/${key}`,
                'Hosted capability accessors are forbidden.'
              )
            );
            return;
          }
          visit(descriptor.value, `${path}/${key}`, depth + 1);
        });
        return;
      }
      if (!isPlainObject(candidate)) {
        issues.push(
          issue(path, 'Hosted capability values must be plain objects.')
        );
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
        const child = `${path === '/' ? '' : path}/${escaped}`;
        if (isUnsafeObjectKey(key)) {
          issues.push(issue(child, 'Unsafe Hosted capability object key.'));
          continue;
        }
        const descriptor = descriptors[key];
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          issues.push(
            issue(child, 'Hosted capability accessors are forbidden.')
          );
          continue;
        }
        visit(descriptor.value, child, depth + 1);
      }
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        issues.push(issue(path, 'Hosted capability keys must be strings.'));
      }
    } finally {
      ancestors.delete(candidate);
    }
  };
  try {
    visit(value, '/', 0);
    if (
      issues.length === 0 &&
      new TextEncoder().encode(canonicalJsonText(value)).byteLength >
        maximumBytes
    ) {
      issues.push(issue('/', 'Hosted capability fact exceeds its byte limit.'));
    }
  } catch {
    issues.push(
      issue('/', 'Hosted capability fact cannot be safely inspected.')
    );
  }
  return Object.freeze(issues);
};

const cloneJson = <T>(value: T): T => JSON.parse(canonicalJsonText(value)) as T;

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const validIdentity = (value: unknown): value is string =>
  typeof value === 'string' && identityPattern.test(value);

const validInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const canonicalDigestArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.every(isAgentCanonicalDigest) &&
  new Set(value).size === value.length;

const canonicalIdentityArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.every(validIdentity) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 ||
      compareUnicodeCodePoints(value[index - 1] as string, entry) <= 0
  );

const digestObjectIsExact = (
  value: Record<string, unknown>,
  digestKey: string
): boolean => {
  const { [digestKey]: digest, ...base } = value;
  return (
    isAgentCanonicalDigest(digest) && digestAgentCanonicalValue(base) === digest
  );
};

const normalizeDiscovery = (
  value: AgentToolDiscoveryReceipt
): AgentToolDiscoveryReceipt => {
  if (
    !exactKeys(
      value,
      [
        'invocationId',
        'registryDigest',
        'queryDigest',
        'matchedDescriptorDigests',
        'expandedDescriptorDigests',
        'receiptDigest',
      ],
      ['providerReceiptDigest']
    ) ||
    !validIdentity(value.invocationId) ||
    !isAgentCanonicalDigest(value.registryDigest) ||
    !isAgentCanonicalDigest(value.queryDigest) ||
    !canonicalDigestArray(value.matchedDescriptorDigests) ||
    !canonicalDigestArray(value.expandedDescriptorDigests) ||
    (value.providerReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(value.providerReceiptDigest)) ||
    !value.expandedDescriptorDigests.every((digest) =>
      value.matchedDescriptorDigests.includes(digest)
    ) ||
    !digestObjectIsExact(value, 'receiptDigest')
  ) {
    throw new TypeError('Tool discovery receipt is invalid or drifted.');
  }
  return cloneJson(value);
};

const normalizeToolCallReceipt = (
  value: AgentToolCallReceipt
): AgentToolCallReceipt => {
  if (
    !exactKeys(
      value,
      [
        'identity',
        'registryDigest',
        'descriptorDigest',
        'executionLocus',
        'effect',
        'authorizationDigest',
        'reservationId',
        'lifecycle',
        'terminalStatus',
        'resultDisposition',
        'outputByteLength',
        'artifactRefs',
        'usage',
        'cleanupReceiptDigest',
        'completedAt',
        'receiptDigest',
      ],
      ['normalizedOutputDigest']
    ) ||
    !exactKeys(
      value.identity,
      ['callId', 'invocationId', 'taskId', 'runId', 'generation', 'depth'],
      ['parentCallId']
    ) ||
    ![
      value.identity.callId,
      value.identity.invocationId,
      value.identity.taskId,
      value.identity.runId,
    ].every(validIdentity) ||
    (value.identity.parentCallId !== undefined &&
      !validIdentity(value.identity.parentCallId)) ||
    !Number.isSafeInteger(value.identity.generation) ||
    value.identity.generation < 0 ||
    !Number.isSafeInteger(value.identity.depth) ||
    value.identity.depth < 0 ||
    ![
      value.registryDigest,
      value.descriptorDigest,
      value.authorizationDigest,
      value.cleanupReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    (value.normalizedOutputDigest !== undefined &&
      !isAgentCanonicalDigest(value.normalizedOutputDigest)) ||
    ![
      'client-hosted',
      'prodivix-runtime',
      'provider-hosted',
      'pinned-mcp',
    ].includes(value.executionLocus) ||
    !['read', 'ephemeral-execute', 'proposal', 'external-side-effect'].includes(
      value.effect
    ) ||
    !['succeeded', 'failed', 'cancelled', 'fenced'].includes(
      value.terminalStatus
    ) ||
    ![
      'context-data-only',
      'staged-proposal-only',
      'discarded',
      'audit-only',
    ].includes(value.resultDisposition) ||
    !validIdentity(value.reservationId) ||
    !Array.isArray(value.lifecycle) ||
    value.lifecycle.length === 0 ||
    value.lifecycle[0] !== 'decoded' ||
    value.lifecycle[value.lifecycle.length - 1] !== 'cleaned' ||
    value.lifecycle.some((phase) => !lifecyclePhases.has(phase)) ||
    new Set(value.lifecycle).size !== value.lifecycle.length ||
    !canonicalIdentityArray(value.artifactRefs) ||
    !Number.isSafeInteger(value.outputByteLength) ||
    value.outputByteLength < 0 ||
    value.outputByteLength > 0 !==
      (value.normalizedOutputDigest !== undefined) ||
    !validInstant(value.completedAt) ||
    !sameCanonicalJson(
      createAgentUsageVector(value.usage.amounts),
      value.usage
    ) ||
    !digestObjectIsExact(value, 'receiptDigest')
  ) {
    throw new TypeError('Tool call receipt is invalid or drifted.');
  }
  return cloneJson(value);
};

const normalizeRetrievalQuery = (
  value: AgentRetrievalQueryReceipt
): AgentRetrievalQueryReceipt => {
  if (
    !exactKeys(
      value,
      [
        'queryId',
        'toolDescriptorDigest',
        'queryDigest',
        'purpose',
        'networkPolicyDigest',
        'sourceResultRefs',
        'sourceResultDigests',
        'usageRef',
        'startedAt',
        'completedAt',
        'receiptDigest',
      ],
      ['indexDigest', 'retrievalConfigurationDigest']
    ) ||
    !validIdentity(value.queryId) ||
    !validIdentity(value.usageRef) ||
    !['public-research', 'authorized-project-retrieval'].includes(
      value.purpose
    ) ||
    ![
      value.toolDescriptorDigest,
      value.queryDigest,
      value.networkPolicyDigest,
    ].every(isAgentCanonicalDigest) ||
    (value.indexDigest !== undefined &&
      !isAgentCanonicalDigest(value.indexDigest)) ||
    (value.retrievalConfigurationDigest !== undefined &&
      !isAgentCanonicalDigest(value.retrievalConfigurationDigest)) ||
    !canonicalIdentityArray(value.sourceResultRefs) ||
    !canonicalDigestArray(value.sourceResultDigests) ||
    value.sourceResultRefs.length !== value.sourceResultDigests.length ||
    !validInstant(value.startedAt) ||
    !validInstant(value.completedAt) ||
    Date.parse(value.completedAt) < Date.parse(value.startedAt) ||
    !digestObjectIsExact(value, 'receiptDigest')
  ) {
    throw new TypeError('Retrieval query receipt is invalid or drifted.');
  }
  return cloneJson(value);
};

const normalizeParallelJoin = (
  value: AgentParallelToolJoinReceipt
): AgentParallelToolJoinReceipt => {
  if (
    !exactKeys(
      value,
      [
        'groupId',
        'planDigest',
        'generation',
        'joinedCallIds',
        'cancelledCallIds',
        'lateCallIds',
        'status',
        'receiptDigest',
      ],
      ['resultDigest']
    ) ||
    !validIdentity(value.groupId) ||
    !isAgentCanonicalDigest(value.planDigest) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !['joined', 'conflicted', 'incomplete', 'fenced'].includes(value.status) ||
    ![value.joinedCallIds, value.cancelledCallIds, value.lateCallIds].every(
      (ids) => canonicalIdentityArray(ids)
    ) ||
    (value.status === 'joined') !== (value.resultDigest !== undefined) ||
    (value.resultDigest !== undefined &&
      !isAgentCanonicalDigest(value.resultDigest)) ||
    !digestObjectIsExact(value, 'receiptDigest')
  ) {
    throw new TypeError('Parallel Tool join receipt is invalid or drifted.');
  }
  return cloneJson(value);
};

const normalizeFact = (fact: AgentHostedFact): AgentHostedFact => {
  switch (fact.factType) {
    case 'tool-descriptor':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentToolDescriptor(fact.value),
      });
    case 'tool-registry-snapshot':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentToolRegistrySnapshot(fact.value),
      });
    case 'tool-discovery-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeDiscovery(fact.value),
      });
    case 'tool-call-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeToolCallReceipt(fact.value),
      });
    case 'external-source-result':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentExternalSourceResult(fact.value),
      });
    case 'retrieval-query-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeRetrievalQuery(fact.value),
      });
    case 'retrieval-index-identity':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentRetrievalIndexIdentity(fact.value),
      });
    case 'retrieval-index-deletion-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentRetrievalIndexDeletionReceipt(fact.value),
      });
    case 'hosted-sandbox-descriptor':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentHostedSandboxDescriptor(fact.value),
      });
    case 'mcp-server-identity':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentMcpServerIdentity(fact.value),
      });
    case 'computer-use-session':
      return Object.freeze({
        factType: fact.factType,
        value: createAgentComputerUseSession(fact.value),
      });
    case 'parallel-tool-join-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeParallelJoin(fact.value),
      });
  }
};

export const migrateAgentHostedFactWire = (
  value: unknown
): AgentHostedFactDecodeResult => {
  const inspectionIssues = inspect(value);
  if (inspectionIssues.length > 0) {
    return Object.freeze({ ok: false, issues: inspectionIssues });
  }
  if (!isPlainObject(value) || value.wireVersion !== 1) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          '/wireVersion',
          'Unsupported Hosted capability fact wire version.'
        ),
      ]),
    });
  }
  if (!validateWire(value)) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          '/',
          'Hosted capability fact does not match its strict envelope.'
        ),
      ]),
    });
  }
  const wire = cloneJson(value as AgentHostedFactWire);
  const { wireVersion: _wireVersion, ...current } = wire;
  try {
    const normalized = normalizeFact(current);
    if (!sameCanonicalJson(normalized, current)) {
      throw new TypeError(
        'Hosted capability fact is non-canonical, has unknown fields, or drifted.'
      );
    }
    return Object.freeze({ ok: true, value: normalized });
  } catch (caught) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          '/value',
          caught instanceof Error
            ? caught.message
            : 'Hosted capability fact semantic validation failed.'
        ),
      ]),
    });
  }
};

export const decodeAgentHostedFact = migrateAgentHostedFactWire;

export const encodeAgentHostedFact = (
  fact: AgentHostedFact
): AgentHostedFactWire => {
  const normalized = normalizeFact(fact);
  if (!sameCanonicalJson(normalized, fact)) {
    throw new TypeError('Hosted capability fact is not canonical.');
  }
  return Object.freeze({ ...cloneJson(normalized), wireVersion: 1 });
};

export const serializeAgentHostedFact = (fact: AgentHostedFact): string =>
  canonicalJsonText(encodeAgentHostedFact(fact));
