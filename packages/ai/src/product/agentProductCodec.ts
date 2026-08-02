import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import {
  agentProductFactWireSchema,
  agentProductViewWireSchema,
} from '../wire/agentProductWire';
import type { AgentProductFact, AgentProductView } from './agentProduct.types';
import { isAgentProductFact, isAgentProductView } from './agentProduct';

export type AgentProductFactWire = AgentProductFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentProductViewWire = Readonly<{
  wireVersion: 1;
  kind: 'agent-product-view';
  value: AgentProductView;
}>;

export type AgentProductDecodeIssue = Readonly<{
  code: 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentProductFactDecodeResult =
  | Readonly<{ ok: true; value: AgentProductFact }>
  | Readonly<{ ok: false; issues: readonly AgentProductDecodeIssue[] }>;

export type AgentProductViewDecodeResult =
  | Readonly<{ ok: true; value: AgentProductView }>
  | Readonly<{ ok: false; issues: readonly AgentProductDecodeIssue[] }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateFactWire: ValidateFunction = ajv.compile(
  agentProductFactWireSchema
);
const validateViewWire: ValidateFunction = ajv.compile(
  agentProductViewWireSchema
);

const issue = (message: string): readonly AgentProductDecodeIssue[] =>
  Object.freeze([
    Object.freeze({
      code: 'AI-9001' as const,
      path: '/',
      message,
      blocking: true as const,
    }),
  ]);

export const encodeAgentProductFact = (
  value: AgentProductFact
): AgentProductFactWire => {
  if (!isAgentProductFact(value)) {
    throw new TypeError('Agent product fact failed current-model validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: value.factType,
    value: cloneAgentControlJson(value.value),
  }) as AgentProductFactWire;
};

export const decodeAgentProductFact = (
  input: unknown
): AgentProductFactDecodeResult => {
  if (inspectAgentControlJson(input, 8_388_608).length > 0) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product fact is not bounded safe JSON.'),
    });
  }
  if (
    !validateFactWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'factType', 'value']) ||
    input.wireVersion !== 1
  ) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product fact wire envelope is malformed.'),
    });
  }
  const cloned = cloneAgentControlJson(input) as AgentProductFactWire;
  const current = Object.freeze({
    factType: cloned.factType,
    value: cloned.value,
  }) as AgentProductFact;
  if (!isAgentProductFact(current)) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product fact failed strict semantic validation.'),
    });
  }
  if (!sameCanonicalJson(encodeAgentProductFact(current), cloned)) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product fact is not in canonical current form.'),
    });
  }
  return Object.freeze({ ok: true, value: current });
};

export const serializeAgentProductFact = (value: AgentProductFact): string =>
  canonicalJsonText(encodeAgentProductFact(value));

export const encodeAgentProductView = (
  value: AgentProductView
): AgentProductViewWire => {
  if (!isAgentProductView(value)) {
    throw new TypeError('Agent product view failed current-model validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    kind: 'agent-product-view',
    value: cloneAgentControlJson(value),
  });
};

export const decodeAgentProductView = (
  input: unknown
): AgentProductViewDecodeResult => {
  if (inspectAgentControlJson(input, 8_388_608).length > 0) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product view is not bounded safe JSON.'),
    });
  }
  if (
    !validateViewWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'kind', 'value']) ||
    input.wireVersion !== 1 ||
    input.kind !== 'agent-product-view'
  ) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product view wire envelope is malformed.'),
    });
  }
  const cloned = cloneAgentControlJson(input) as AgentProductViewWire;
  if (!isAgentProductView(cloned.value)) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product view failed strict semantic validation.'),
    });
  }
  if (!sameCanonicalJson(encodeAgentProductView(cloned.value), cloned)) {
    return Object.freeze({
      ok: false,
      issues: issue('Agent product view is not in canonical current form.'),
    });
  }
  return Object.freeze({ ok: true, value: cloned.value });
};

export const serializeAgentProductView = (value: AgentProductView): string =>
  canonicalJsonText(encodeAgentProductView(value));
