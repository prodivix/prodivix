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
import { isAgentControlIdentity } from '../control/agentControlValidation';

export const AGENT_EVALUATION_PUBLIC_REVIEW_RUBRIC_MAXIMUM_BYTES = 65_536;

export type AgentEvaluationHumanReviewCriterionVerdict = Readonly<{
  criterionId: string;
  verdict: 'failed' | 'passed';
}>;

export type AgentEvaluationPublicReviewRubricCriterion = Readonly<{
  criterionId: string;
  label: string;
  instruction: string;
  required: boolean;
  anchors: readonly Readonly<{
    verdict: 'failed' | 'passed';
    label: string;
    description: string;
  }>[];
}>;

export type AgentEvaluationPublicReviewRubricMetricMapping = Readonly<{
  metricId: string;
  criterionIds: readonly string[];
  aggregation: 'all-pass';
}>;

export type AgentEvaluationPublicReviewRubric = Readonly<{
  format: 'prodivix.g4-public-human-review-rubric';
  version: 1;
  rubricId: string;
  title: string;
  criteria: readonly AgentEvaluationPublicReviewRubricCriterion[];
  metricMappings: readonly AgentEvaluationPublicReviewRubricMetricMapping[];
  interRaterDisagreementMetricId: string;
  scale: 'binary-pass-fail';
  accessibilityInstructions: readonly string[];
  rubricDigest: string;
}>;

const exact = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key)) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const containsDisallowedControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint === 0x7f ||
      (codePoint <= 0x1f &&
        codePoint !== 0x09 &&
        codePoint !== 0x0a &&
        codePoint !== 0x0d)
    );
  });

const boundedText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= maximum &&
  value === value.trim() &&
  !containsDisallowedControlCharacter(value);

const parseAnchor = (
  value: unknown,
  expectedVerdict: 'failed' | 'passed'
): AgentEvaluationPublicReviewRubricCriterion['anchors'][number] => {
  if (!exact(value, ['verdict', 'label', 'description'])) {
    throw new TypeError('Evaluation public rubric anchor shape is invalid.');
  }
  if (
    value.verdict !== expectedVerdict ||
    !boundedText(value.label, 128) ||
    !boundedText(value.description, 2_048)
  ) {
    throw new TypeError('Evaluation public rubric anchor is invalid.');
  }
  return Object.freeze({
    verdict: expectedVerdict,
    label: value.label,
    description: value.description,
  });
};

const parseCriterion = (
  value: unknown
): AgentEvaluationPublicReviewRubricCriterion => {
  if (
    !exact(value, [
      'criterionId',
      'label',
      'instruction',
      'required',
      'anchors',
    ]) ||
    !isAgentControlIdentity(value.criterionId) ||
    !boundedText(value.label, 128) ||
    !boundedText(value.instruction, 4_096) ||
    typeof value.required !== 'boolean' ||
    !Array.isArray(value.anchors) ||
    value.anchors.length !== 2
  ) {
    throw new TypeError('Evaluation public rubric criterion is invalid.');
  }
  return Object.freeze({
    criterionId: value.criterionId,
    label: value.label,
    instruction: value.instruction,
    required: value.required,
    anchors: Object.freeze([
      parseAnchor(value.anchors[0], 'failed'),
      parseAnchor(value.anchors[1], 'passed'),
    ]),
  });
};

const parseMetricMapping = (
  value: unknown,
  requiredCriterionIds: ReadonlySet<string>
): AgentEvaluationPublicReviewRubricMetricMapping => {
  if (
    !exact(value, ['metricId', 'criterionIds', 'aggregation']) ||
    !isAgentControlIdentity(value.metricId) ||
    value.aggregation !== 'all-pass' ||
    !Array.isArray(value.criterionIds) ||
    value.criterionIds.length < 1 ||
    value.criterionIds.length > 32 ||
    !value.criterionIds.every(
      (criterionId): criterionId is string =>
        isAgentControlIdentity(criterionId) &&
        requiredCriterionIds.has(criterionId)
    )
  ) {
    throw new TypeError('Evaluation public rubric metric mapping is invalid.');
  }
  const criterionIds = Object.freeze([...value.criterionIds]);
  if (
    new Set(criterionIds).size !== criterionIds.length ||
    !sameCanonicalJson(
      criterionIds,
      [...criterionIds].sort(compareUnicodeCodePoints)
    )
  ) {
    throw new TypeError(
      'Evaluation public rubric metric criterion ids are not canonical.'
    );
  }
  return Object.freeze({
    metricId: value.metricId,
    criterionIds,
    aggregation: 'all-pass' as const,
  });
};

export const validateAgentEvaluationPublicReviewRubric = (
  value: unknown,
  expectedDigest?: string
): AgentEvaluationPublicReviewRubric => {
  if (
    !exact(value, [
      'format',
      'version',
      'rubricId',
      'title',
      'criteria',
      'metricMappings',
      'interRaterDisagreementMetricId',
      'scale',
      'accessibilityInstructions',
      'rubricDigest',
    ]) ||
    value.format !== 'prodivix.g4-public-human-review-rubric' ||
    value.version !== 1 ||
    !isAgentControlIdentity(value.rubricId) ||
    !boundedText(value.title, 256) ||
    value.scale !== 'binary-pass-fail' ||
    !Array.isArray(value.criteria) ||
    value.criteria.length < 1 ||
    value.criteria.length > 32 ||
    !Array.isArray(value.metricMappings) ||
    value.metricMappings.length < 1 ||
    value.metricMappings.length > 32 ||
    !isAgentControlIdentity(value.interRaterDisagreementMetricId) ||
    !Array.isArray(value.accessibilityInstructions) ||
    value.accessibilityInstructions.length < 1 ||
    value.accessibilityInstructions.length > 16 ||
    !isAgentCanonicalDigest(value.rubricDigest)
  ) {
    throw new TypeError('Evaluation public rubric is invalid.');
  }
  const criteria = Object.freeze(value.criteria.map(parseCriterion));
  const criterionIds = criteria.map(({ criterionId }) => criterionId);
  if (
    new Set(criterionIds).size !== criteria.length ||
    !sameCanonicalJson(
      criterionIds,
      [...criterionIds].sort(compareUnicodeCodePoints)
    )
  ) {
    throw new TypeError('Evaluation public rubric criteria are not canonical.');
  }
  const requiredCriterionIds = new Set(
    criteria
      .filter(({ required }) => required)
      .map(({ criterionId }) => criterionId)
  );
  if (requiredCriterionIds.size < 1) {
    throw new TypeError('Evaluation public rubric requires a criterion.');
  }
  const metricMappings = Object.freeze(
    value.metricMappings.map((entry) =>
      parseMetricMapping(entry, requiredCriterionIds)
    )
  );
  const metricIds = metricMappings.map(({ metricId }) => metricId);
  const mappedCriterionIds = new Set(
    metricMappings.flatMap(({ criterionIds: entries }) => entries)
  );
  if (
    new Set(metricIds).size !== metricMappings.length ||
    !sameCanonicalJson(
      metricIds,
      [...metricIds].sort(compareUnicodeCodePoints)
    ) ||
    metricIds.includes(value.interRaterDisagreementMetricId) ||
    [...requiredCriterionIds].some(
      (criterionId) => !mappedCriterionIds.has(criterionId)
    )
  ) {
    throw new TypeError('Evaluation public rubric metric mappings drifted.');
  }
  const accessibilityInstructions = Object.freeze(
    value.accessibilityInstructions.map((entry) => {
      if (!boundedText(entry, 2_048)) {
        throw new TypeError(
          'Evaluation public rubric accessibility instruction is invalid.'
        );
      }
      return entry;
    })
  );
  const base = Object.freeze({
    format: 'prodivix.g4-public-human-review-rubric' as const,
    version: 1 as const,
    rubricId: value.rubricId,
    title: value.title,
    criteria,
    metricMappings,
    interRaterDisagreementMetricId: value.interRaterDisagreementMetricId,
    scale: 'binary-pass-fail' as const,
    accessibilityInstructions,
  });
  const rubric = Object.freeze({
    ...base,
    rubricDigest: digestAgentCanonicalValue(base),
  });
  if (
    new TextEncoder().encode(canonicalJsonText(rubric)).byteLength >
      AGENT_EVALUATION_PUBLIC_REVIEW_RUBRIC_MAXIMUM_BYTES ||
    !sameCanonicalJson(rubric, value) ||
    (expectedDigest !== undefined && rubric.rubricDigest !== expectedDigest)
  ) {
    throw new TypeError('Evaluation public rubric digest drifted.');
  }
  return rubric;
};

export const normalizeAgentEvaluationHumanReviewCriterionVerdicts = (
  value: readonly AgentEvaluationHumanReviewCriterionVerdict[],
  expectedCriterionIds?: readonly string[]
): readonly AgentEvaluationHumanReviewCriterionVerdict[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 32 ||
    !value.every(
      (entry) =>
        exact(entry, ['criterionId', 'verdict']) &&
        isAgentControlIdentity(entry.criterionId) &&
        (entry.verdict === 'failed' || entry.verdict === 'passed')
    )
  ) {
    throw new TypeError('Human review criterion verdicts are invalid.');
  }
  const normalized = Object.freeze(
    value.map((entry) =>
      Object.freeze({
        criterionId: entry.criterionId,
        verdict: entry.verdict,
      })
    )
  );
  const criterionIds = normalized.map(({ criterionId }) => criterionId);
  if (
    new Set(criterionIds).size !== criterionIds.length ||
    !sameCanonicalJson(
      criterionIds,
      [...criterionIds].sort(compareUnicodeCodePoints)
    ) ||
    (expectedCriterionIds !== undefined &&
      !sameCanonicalJson(criterionIds, expectedCriterionIds))
  ) {
    throw new TypeError('Human review criterion verdict set drifted.');
  }
  return normalized;
};

export const verdictForRequiredHumanReviewCriteria = (
  criterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[]
): 'failed' | 'passed' =>
  criterionVerdicts.every(({ verdict }) => verdict === 'passed')
    ? 'passed'
    : 'failed';
