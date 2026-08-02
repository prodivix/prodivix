import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentCapabilityProfile,
  AgentContextTransformReceipt,
  AgentProviderCacheReceipt,
  AgentProviderConfigurationIdentity,
  AgentProviderDataPolicy,
  AgentProviderEvent,
  AgentProviderJobReceipt,
  AgentProviderStateReceipt,
  AgentModelLineage,
  AgentOpaqueContinuationRef,
  AgentUsageVector,
} from './agentProvider.types';
import {
  createAgentCapabilityProfile,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
} from './agentProviderIdentity';
import {
  createAgentContextTransformReceipt,
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
  createAgentProviderEvent,
  createAgentProviderStateReceipt,
} from './agentInvocation';
import { createAgentUsageVector } from '../usage/agentUsage';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { agentProviderFactWireSchema } from '../wire/agentProviderWire';
import {
  createAgentProviderJobEvent,
  type AgentProviderJobEvent,
} from './agentProviderJob';

export type AgentProviderCatalogEntry = Readonly<{
  provider: AgentProviderConfigurationIdentity;
  model: AgentModelLineage;
  dataPolicy: AgentProviderDataPolicy;
  capabilityProfile: AgentCapabilityProfile;
}>;

export type AgentProviderFact =
  | Readonly<{
      factType: 'provider-catalog-entry';
      value: AgentProviderCatalogEntry;
    }>
  | Readonly<{
      factType: 'context-transform-receipt';
      value: AgentContextTransformReceipt;
    }>
  | Readonly<{
      factType: 'opaque-continuation';
      value: AgentOpaqueContinuationRef;
    }>
  | Readonly<{
      factType: 'provider-state-receipt';
      value: AgentProviderStateReceipt;
    }>
  | Readonly<{
      factType: 'provider-cache-receipt';
      value: AgentProviderCacheReceipt;
    }>
  | Readonly<{ factType: 'usage-vector'; value: AgentUsageVector }>
  | Readonly<{ factType: 'provider-event'; value: AgentProviderEvent }>
  | Readonly<{
      factType: 'provider-job-event';
      value: AgentProviderJobEvent;
    }>
  | Readonly<{
      factType: 'provider-job-receipt';
      value: AgentProviderJobReceipt;
    }>;

export type AgentProviderFactWire = AgentProviderFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentProviderFactDecodeIssue = Readonly<{
  code: 'AI-9001';
  path: string;
  message: string;
}>;

export type AgentProviderFactDecodeResult =
  | Readonly<{ ok: true; value: AgentProviderFact }>
  | Readonly<{
      ok: false;
      issues: readonly AgentProviderFactDecodeIssue[];
    }>;

const MAXIMUM_FACT_BYTES = 1_048_576;
const MAXIMUM_FACT_DEPTH = 32;
const MAXIMUM_FACT_NODES = 50_000;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});
const validateProviderFactWire: ValidateFunction = ajv.compile(
  agentProviderFactWireSchema
);

const issue = (path: string, message: string): AgentProviderFactDecodeIssue =>
  Object.freeze({ code: 'AI-9001', path, message });

const issuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

const schemaIssues = (
  errors: ErrorObject[] | null | undefined
): readonly AgentProviderFactDecodeIssue[] =>
  Object.freeze(
    (errors ?? []).map((error) =>
      issue(
        issuePath(error),
        error.message
          ? `Agent provider fact ${error.message}.`
          : 'Agent provider fact does not match its wire schema.'
      )
    )
  );

const inspectExternalFact = (
  value: unknown
): readonly AgentProviderFactDecodeIssue[] => {
  const issues: AgentProviderFactDecodeIssue[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;

  const visit = (candidate: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > MAXIMUM_FACT_NODES) {
      if (!issues.some((entry) => entry.path === '/')) {
        issues.push(issue('/', 'Agent provider fact exceeds its node limit.'));
      }
      return;
    }
    if (depth > MAXIMUM_FACT_DEPTH) {
      issues.push(issue(path, 'Agent provider fact exceeds its depth limit.'));
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
        issues.push(issue(path, 'Agent provider fact numbers must be finite.'));
      }
      return;
    }
    if (typeof candidate !== 'object') {
      issues.push(issue(path, 'Agent provider facts contain JSON data only.'));
      return;
    }
    if (ancestors.has(candidate)) {
      issues.push(issue(path, 'Agent provider facts must not contain cycles.'));
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
          Object.getOwnPropertySymbols(candidate).length !== 0 ||
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index))
        ) {
          issues.push(
            issue(path, 'Agent provider fact arrays must be dense JSON arrays.')
          );
          return;
        }
        candidate.forEach((_entry, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            issues.push(
              issue(
                `${path}/${index}`,
                'Agent provider fact accessors are forbidden.'
              )
            );
            return;
          }
          visit(descriptor.value, `${path}/${index}`, depth + 1);
        });
        return;
      }
      if (!isPlainObject(candidate)) {
        issues.push(
          issue(path, 'Agent provider fact values must be plain objects.')
        );
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Object.getOwnPropertySymbols(candidate).length !== 0) {
        issues.push(
          issue(path, 'Agent provider fact objects use string keys only.')
        );
      }
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const childPath = `${path === '/' ? '' : path}/${key
          .replaceAll('~', '~0')
          .replaceAll('/', '~1')}`;
        if (isUnsafeObjectKey(key)) {
          issues.push(
            issue(childPath, 'Unsafe Agent provider fact object key.')
          );
          continue;
        }
        const descriptor = descriptors[key];
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          issues.push(
            issue(childPath, 'Agent provider fact accessors are forbidden.')
          );
          continue;
        }
        visit(descriptor.value, childPath, depth + 1);
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
        MAXIMUM_FACT_BYTES
    ) {
      issues.push(
        issue(
          '/',
          `Agent provider fact exceeds the ${MAXIMUM_FACT_BYTES} byte limit.`
        )
      );
    }
  } catch {
    issues.push(issue('/', 'Agent provider fact cannot be safely inspected.'));
  }
  return Object.freeze(issues);
};

const cloneJson = <T>(value: T): T => JSON.parse(canonicalJsonText(value)) as T;

const omitDigest = <T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  digestKey: K
): Omit<T, K> => {
  const { [digestKey]: _digest, ...base } = value;
  return base;
};

const normalizeCatalogEntry = (
  value: AgentProviderCatalogEntry
): AgentProviderCatalogEntry => {
  const adapter = createAgentProviderAdapterIdentity(
    omitDigest(value.provider.adapter, 'adapterDigest')
  );
  const dataPolicy = createAgentProviderDataPolicy(
    omitDigest(value.dataPolicy, 'policyDigest')
  );
  if (value.provider.dataPolicyDigest !== dataPolicy.policyDigest) {
    throw new TypeError(
      'Provider configuration data-policy digest does not match its catalog entry.'
    );
  }
  const provider = createAgentProviderConfigurationIdentity({
    ...value.provider,
    adapter,
  });
  const model = createAgentModelLineage(
    omitDigest(value.model, 'lineageDigest')
  );
  const capabilityProfile = createAgentCapabilityProfile(
    omitDigest(value.capabilityProfile, 'profileDigest')
  );
  return Object.freeze({ provider, model, dataPolicy, capabilityProfile });
};

const normalizeProviderFact = (value: AgentProviderFact): AgentProviderFact => {
  switch (value.factType) {
    case 'provider-catalog-entry':
      return Object.freeze({
        factType: value.factType,
        value: normalizeCatalogEntry(value.value),
      });
    case 'context-transform-receipt':
      return Object.freeze({
        factType: value.factType,
        value: createAgentContextTransformReceipt(
          omitDigest(value.value, 'receiptDigest')
        ),
      });
    case 'opaque-continuation':
      return Object.freeze({
        factType: value.factType,
        value: createAgentOpaqueContinuation(
          omitDigest(value.value, 'continuationDigest')
        ),
      });
    case 'provider-state-receipt':
      return Object.freeze({
        factType: value.factType,
        value: createAgentProviderStateReceipt(
          omitDigest(value.value, 'receiptDigest')
        ),
      });
    case 'provider-cache-receipt': {
      const {
        receiptDigest: _receiptDigest,
        provenIsolation,
        ...receipt
      } = value.value;
      return Object.freeze({
        factType: value.factType,
        value: createAgentProviderCacheReceipt({
          receipt,
          isolation: provenIsolation,
        }),
      });
    }
    case 'usage-vector':
      return Object.freeze({
        factType: value.factType,
        value: createAgentUsageVector(value.value.amounts),
      });
    case 'provider-event':
      return Object.freeze({
        factType: value.factType,
        value: createAgentProviderEvent(omitDigest(value.value, 'eventDigest')),
      });
    case 'provider-job-event':
      return Object.freeze({
        factType: value.factType,
        value: createAgentProviderJobEvent(
          omitDigest(value.value, 'eventDigest')
        ),
      });
    case 'provider-job-receipt': {
      const { receiptDigest: _receiptDigest, ...base } = value.value;
      if (
        (base.phase === 'terminal') !== (base.outcome !== undefined) ||
        digestAgentCanonicalValue(base) !== value.value.receiptDigest
      ) {
        throw new TypeError(
          'Provider job receipt terminal state or digest has drifted.'
        );
      }
      return Object.freeze({
        factType: value.factType,
        value: Object.freeze({ ...value.value }),
      });
    }
  }
};

/**
 * Provider facts have no admitted legacy shape in alpha. The migration boundary
 * is explicit so an unknown/future wire version cannot silently reach current.
 */
export const migrateAgentProviderFactWire = (
  value: unknown
): AgentProviderFactDecodeResult => {
  const inspectionIssues = inspectExternalFact(value);
  if (inspectionIssues.length > 0) {
    return Object.freeze({ ok: false, issues: inspectionIssues });
  }
  if (!isPlainObject(value) || value.wireVersion !== 1) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          '/wireVersion',
          'Unsupported Agent provider fact wire version; expected wireVersion 1.'
        ),
      ]),
    });
  }
  if (!validateProviderFactWire(value)) {
    return Object.freeze({
      ok: false,
      issues: schemaIssues(validateProviderFactWire.errors),
    });
  }
  const wire = cloneJson(value as AgentProviderFactWire);
  const { wireVersion: _wireVersion, ...current } = wire;
  try {
    const normalized = normalizeProviderFact(current);
    if (!sameCanonicalJson(normalized, current)) {
      return Object.freeze({
        ok: false,
        issues: Object.freeze([
          issue(
            '/value',
            'Agent provider fact is not in canonical order or its digest has drifted.'
          ),
        ]),
      });
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
            : 'Agent provider fact failed semantic validation.'
        ),
      ]),
    });
  }
};

export const decodeAgentProviderFact = migrateAgentProviderFactWire;

export const encodeAgentProviderFact = (
  value: AgentProviderFact
): AgentProviderFactWire => {
  const normalized = normalizeProviderFact(value);
  if (!sameCanonicalJson(normalized, value)) {
    throw new TypeError(
      'Agent provider fact is not canonical or its digest has drifted.'
    );
  }
  return Object.freeze({ ...cloneJson(normalized), wireVersion: 1 });
};

export const serializeAgentProviderFact = (value: AgentProviderFact): string =>
  canonicalJsonText(encodeAgentProviderFact(value));
