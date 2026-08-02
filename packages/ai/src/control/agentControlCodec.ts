import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { AgentControlFact } from './agentControl.types';
import {
  cloneAgentControlJson,
  controlIssue,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
} from './agentControlValidation';
import { isAgentAuditExport } from './agentAudit';
import { isAgentControlEvent, isAgentRunSnapshot } from './agentRunFacts';
import { isAgentTaskRecord } from './agentTask';
import { agentControlFactWireSchema } from '../wire/agentControlWire';

export type AgentControlFactWire = AgentControlFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentControlFactDecodeResult =
  | Readonly<{ ok: true; value: AgentControlFact }>
  | Readonly<{
      ok: false;
      issues: readonly ReturnType<typeof controlIssue>[];
    }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(agentControlFactWireSchema);

const validateFact = (value: AgentControlFact): boolean => {
  switch (value.factType) {
    case 'task-record':
      return isAgentTaskRecord(value.value);
    case 'run-snapshot':
      return isAgentRunSnapshot(value.value);
    case 'run-event':
      return isAgentControlEvent(value.value);
    case 'audit-export':
      return isAgentAuditExport(value.value);
  }
};

const invalid = (message: string): AgentControlFactDecodeResult =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([controlIssue('AI-9001', '/', message)]),
  });

export const encodeAgentControlFact = (
  value: AgentControlFact
): AgentControlFactWire => {
  if (!validateFact(value)) {
    throw new TypeError('Agent control fact failed current-model validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: value.factType,
    value: cloneAgentControlJson(value.value),
  }) as AgentControlFactWire;
};

export const decodeAgentControlFact = (
  input: unknown
): AgentControlFactDecodeResult => {
  const inspection = inspectAgentControlJson(input);
  if (inspection.length > 0) {
    return Object.freeze({ ok: false, issues: inspection });
  }
  if (
    !validateWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'factType', 'value']) ||
    input.wireVersion !== 1
  ) {
    return invalid('Agent control wire envelope is unsupported or malformed.');
  }
  const cloned = cloneAgentControlJson(input) as AgentControlFactWire;
  const current = Object.freeze({
    factType: cloned.factType,
    value: cloned.value,
  }) as AgentControlFact;
  if (!validateFact(current)) {
    return invalid('Agent control fact failed strict semantic validation.');
  }
  const encoded = encodeAgentControlFact(current);
  if (!sameCanonicalJson(encoded, cloned)) {
    return invalid('Agent control fact is not in canonical current form.');
  }
  return Object.freeze({ ok: true, value: current });
};

export const serializeAgentControlFact = (value: AgentControlFact): string =>
  canonicalJsonText(encodeAgentControlFact(value));
