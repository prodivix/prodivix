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
import { agentEvaluationFactWireSchema } from '../wire/agentEvaluationWire';
import type { AgentEvaluationFact } from './agentEvaluation.types';
import { isAgentModelEvaluationPlan } from './agentEvaluationPlan';
import { hasExactAgentEvaluationFactShape } from './agentEvaluationShape';
import {
  isAgentEvaluationGraderReport,
  isAgentEvaluationMetricReport,
  isAgentEvaluationReviewCandidate,
  isAgentEvaluationReviewRasterScanReceipt,
  isAgentEvaluationShardCheckpoint,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
} from './agentEvaluationResults';

export type AgentEvaluationFactWire = AgentEvaluationFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentEvaluationFactDecodeResult =
  | Readonly<{ ok: true; value: AgentEvaluationFact }>
  | Readonly<{ ok: false; message: string }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(
  agentEvaluationFactWireSchema
);

const validateFact = (fact: AgentEvaluationFact): boolean => {
  if (!hasExactAgentEvaluationFactShape(fact)) return false;
  switch (fact.factType) {
    case 'evaluation-plan':
      return isAgentModelEvaluationPlan(fact.value);
    case 'evaluation-attempt':
      return isAgentModelEvaluationAttempt(fact.value);
    case 'evaluation-checkpoint':
      return isAgentEvaluationShardCheckpoint(fact.value);
    case 'evaluation-metric-report':
      return isAgentEvaluationMetricReport(fact.value);
    case 'evaluation-grader-report':
      return isAgentEvaluationGraderReport(fact.value);
    case 'evaluation-human-review-report':
      return isAgentHumanReviewReport(fact.value);
    case 'evaluation-review-candidate':
      return isAgentEvaluationReviewCandidate(fact.value);
    case 'evaluation-review-raster-scan-receipt':
      return isAgentEvaluationReviewRasterScanReceipt(fact.value);
    case 'evaluation-holdout-receipt':
      return isAgentHoldoutExecutionReceipt(fact.value);
    case 'evaluation-manifest':
      return isAgentModelEvaluationManifest(fact.value);
  }
};

export const encodeAgentEvaluationFact = (
  fact: AgentEvaluationFact
): AgentEvaluationFactWire => {
  if (!validateFact(fact)) {
    throw new TypeError('Agent evaluation fact failed current validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: fact.factType,
    value: cloneAgentControlJson(fact.value),
  }) as AgentEvaluationFactWire;
};

export const decodeAgentEvaluationFact = (
  input: unknown
): AgentEvaluationFactDecodeResult => {
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
      message: 'Agent evaluation wire envelope is unsupported or malformed.',
    });
  }
  const cloned = cloneAgentControlJson(input) as AgentEvaluationFactWire;
  const current = Object.freeze({
    factType: cloned.factType,
    value: cloned.value,
  }) as AgentEvaluationFact;
  if (!validateFact(current)) {
    return Object.freeze({
      ok: false,
      message: 'Agent evaluation fact failed strict semantic validation.',
    });
  }
  if (!sameCanonicalJson(encodeAgentEvaluationFact(current), cloned)) {
    return Object.freeze({
      ok: false,
      message: 'Agent evaluation fact is not canonical.',
    });
  }
  return Object.freeze({ ok: true, value: current });
};

export const serializeAgentEvaluationFact = (
  fact: AgentEvaluationFact
): string => canonicalJsonText(encodeAgentEvaluationFact(fact));
