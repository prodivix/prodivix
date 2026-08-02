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
import { agentVerificationFactWireSchema } from '../wire/agentVerificationWire';
import {
  isAgentCommittedVerificationPlanBinding,
  isAgentRepairRoundReceipt,
  isAgentVerificationClosureReceipt,
} from './agentVerification';
import type { AgentVerificationFact } from './agentVerification.types';

export type AgentVerificationFactWire = AgentVerificationFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentVerificationFactDecodeResult =
  | Readonly<{ ok: true; value: AgentVerificationFact }>
  | Readonly<{ ok: false; message: string }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(
  agentVerificationFactWireSchema
);

const validateFact = (fact: AgentVerificationFact): boolean => {
  switch (fact.factType) {
    case 'committed-plan-binding':
      return isAgentCommittedVerificationPlanBinding(fact.value);
    case 'verification-closure-receipt':
      return isAgentVerificationClosureReceipt(fact.value);
    case 'repair-round-receipt':
      return isAgentRepairRoundReceipt(fact.value);
  }
};

export const encodeAgentVerificationFact = (
  fact: AgentVerificationFact
): AgentVerificationFactWire => {
  if (!validateFact(fact)) {
    throw new TypeError('Agent verification fact failed current validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: fact.factType,
    value: cloneAgentControlJson(fact.value),
  }) as AgentVerificationFactWire;
};

export const decodeAgentVerificationFact = (
  input: unknown
): AgentVerificationFactDecodeResult => {
  const inspection = inspectAgentControlJson(input, 8_388_608);
  if (inspection.length > 0) {
    return Object.freeze({
      ok: false,
      message: inspection.map(({ message }) => message).join('; '),
    });
  }
  if (
    !validateWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'factType', 'value']) ||
    input.wireVersion !== 1
  ) {
    return Object.freeze({
      ok: false,
      message: 'Agent verification wire envelope is unsupported or malformed.',
    });
  }
  const cloned = cloneAgentControlJson(input) as AgentVerificationFactWire;
  const current = Object.freeze({
    factType: cloned.factType,
    value: cloned.value,
  }) as AgentVerificationFact;
  if (!validateFact(current)) {
    return Object.freeze({
      ok: false,
      message: 'Agent verification fact failed strict semantic validation.',
    });
  }
  if (!sameCanonicalJson(encodeAgentVerificationFact(current), cloned)) {
    return Object.freeze({
      ok: false,
      message: 'Agent verification fact is not canonical.',
    });
  }
  return Object.freeze({ ok: true, value: current });
};

export const serializeAgentVerificationFact = (
  fact: AgentVerificationFact
): string => canonicalJsonText(encodeAgentVerificationFact(fact));
