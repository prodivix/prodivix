import {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import type {
  VerificationExemption,
  VerificationPolicy,
  VerificationPolicyEvaluationFacts,
  VerificationPolicyEvaluationResult,
  VerificationPolicyRule,
} from './verification.types';

const intersects = (
  selector: readonly string[],
  values: readonly string[]
): boolean =>
  selector.length === 0 || selector.some((value) => values.includes(value));

const matchesRule = (
  rule: VerificationPolicyRule,
  facts: VerificationPolicyEvaluationFacts
): boolean =>
  intersects(rule.checkKinds, [facts.checkKind]) &&
  intersects(rule.scenarioIds, facts.scenarioId ? [facts.scenarioId] : []) &&
  intersects(rule.scenarioTags, facts.scenarioTags) &&
  intersects(
    rule.criticalities,
    facts.criticality ? [facts.criticality] : []
  ) &&
  intersects(rule.impactedDomains, facts.impactedDomains) &&
  intersects(rule.riskFlags, facts.riskFlags);

const specificity = (rule: VerificationPolicyRule): number =>
  [
    rule.checkKinds,
    rule.scenarioIds,
    rule.scenarioTags,
    rule.criticalities,
    rule.impactedDomains,
    rule.riskFlags,
  ].reduce((total, values) => total + (values.length > 0 ? 1 : 0), 0);

const findById = <T extends Readonly<{ id: string }>>(
  values: readonly T[],
  id: string
): T | undefined => values.find((value) => value.id === id);

const activeExemptions = (
  exemptions: readonly VerificationExemption[],
  ruleIds: readonly string[],
  facts: VerificationPolicyEvaluationFacts,
  instant: number
): readonly VerificationExemption[] =>
  Object.freeze(
    exemptions
      .filter((exemption) => {
        if (!ruleIds.includes(exemption.ruleId)) return false;
        if (
          ![facts.checkId, facts.scenarioId, facts.targetId].includes(
            exemption.targetId
          )
        ) {
          return false;
        }
        const createdAt = parseVerificationInstant(exemption.createdAt);
        const expiresAt = parseVerificationInstant(exemption.expiresAt);
        return (
          createdAt !== undefined &&
          expiresAt !== undefined &&
          createdAt <= instant &&
          instant < expiresAt
        );
      })
      .sort((left, right) => compareVerificationText(left.id, right.id))
  );

/**
 * Evaluates one check/scenario target without consulting rule array order or
 * ambient identity/time.
 */
export const evaluateVerificationPolicy = (
  policy: VerificationPolicy,
  facts: VerificationPolicyEvaluationFacts,
  policyEvaluationInstant: string
): VerificationPolicyEvaluationResult => {
  const instant = parseVerificationInstant(policyEvaluationInstant);
  if (instant === undefined) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-2001',
      message:
        'policyEvaluationInstant must be an explicit UTC RFC 3339 instant.',
      conflictingRuleIds: Object.freeze([]),
    });
  }

  const matched = policy.rules
    .filter((rule) => matchesRule(rule, facts))
    .sort(
      (left, right) =>
        specificity(right) - specificity(left) ||
        compareVerificationText(left.id, right.id)
    );
  const forbidden = matched.filter((rule) => rule.requirement === 'forbidden');
  const highestSpecificity = matched.length > 0 ? specificity(matched[0]!) : 0;
  const winning =
    forbidden.length > 0
      ? forbidden
      : matched.filter((rule) => specificity(rule) === highestSpecificity);
  const requirements = uniqueVerificationText(
    winning.map((rule) => rule.requirement)
  );
  const conflicting =
    forbidden.length === 0 && requirements.length > 1
      ? winning.map((rule) => rule.id)
      : [];
  if (conflicting.length > 0) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-2001',
      message:
        'Equally specific policy rules resolve to incompatible requirements.',
      conflictingRuleIds: uniqueVerificationText(conflicting),
    });
  }
  const winningConfigurations = uniqueVerificationText(
    winning.map((rule) =>
      digestVerificationValue({
        requirement: rule.requirement,
        matrixProfileId: rule.matrixProfileId,
        retryPolicyId: rule.retryPolicyId,
        evidenceTrust: rule.evidenceTrust,
        controlProfileRef: rule.controlProfileRef,
        ...(rule.fixtureSetRef ? { fixtureSetRef: rule.fixtureSetRef } : {}),
        ...(rule.baselineSetRef ? { baselineSetRef: rule.baselineSetRef } : {}),
      })
    )
  );
  if (forbidden.length === 0 && winningConfigurations.length > 1) {
    return Object.freeze({
      status: 'invalid',
      reasonCode: 'VER-2001',
      message:
        'Equally specific policy rules resolve to incompatible matrix, retry, trust, control, fixture, or baseline inputs.',
      conflictingRuleIds: uniqueVerificationText(
        winning.map((rule) => rule.id)
      ),
    });
  }

  const selectedRule = winning[0];
  let requirement = selectedRule?.requirement ?? policy.defaultRequirement;
  const ruleIds = winning.map((rule) => rule.id);
  const exemptions =
    requirement === 'required' &&
    (facts.checkKind === 'accessibility' || facts.checkKind === 'visual')
      ? activeExemptions(policy.exemptions, ruleIds, facts, instant)
      : Object.freeze([]);
  if (exemptions.length > 0) requirement = 'advisory';

  if (selectedRule && requirement === 'forbidden') {
    return Object.freeze({
      status: 'resolved',
      evaluation: Object.freeze({
        requirement,
        evidenceRequirements: policy.evidenceRequirements,
        trace: Object.freeze({
          matchedRuleIds: uniqueVerificationText(
            matched.map((rule) => rule.id)
          ),
          winningRuleIds: uniqueVerificationText(ruleIds),
          forbiddenRuleIds: uniqueVerificationText(
            forbidden.map((rule) => rule.id)
          ),
          appliedExemptionIds: Object.freeze([]),
          specificity: specificity(selectedRule),
          messages: Object.freeze([
            `Selected forbidden hard-cut rule ${selectedRule.id} at specificity ${specificity(selectedRule)}.`,
          ]),
        }),
      }),
    });
  }

  if (selectedRule) {
    const matrixProfile = findById(
      policy.matrixProfiles,
      selectedRule.matrixProfileId
    );
    const retryPolicy = findById(
      policy.retryPolicies,
      selectedRule.retryPolicyId
    );
    if (!matrixProfile || !retryPolicy) {
      return Object.freeze({
        status: 'invalid',
        reasonCode: 'VER-2001',
        message: `Policy rule "${selectedRule.id}" references an unknown matrix or retry policy.`,
        conflictingRuleIds: Object.freeze([selectedRule.id]),
      });
    }
    if (
      !policy.evidenceRequirements.acceptedTrust.includes(
        selectedRule.evidenceTrust
      )
    ) {
      return Object.freeze({
        status: 'invalid',
        reasonCode: 'VER-2001',
        message: `Policy rule "${selectedRule.id}" requires Evidence trust that the global Evidence policy does not accept.`,
        conflictingRuleIds: Object.freeze([selectedRule.id]),
      });
    }
    return Object.freeze({
      status: 'resolved',
      evaluation: Object.freeze({
        requirement,
        matrixProfile,
        retryPolicy,
        evidenceRequirements: Object.freeze({
          ...policy.evidenceRequirements,
          acceptedTrust: Object.freeze([selectedRule.evidenceTrust]),
        }),
        controlProfileRef: selectedRule.controlProfileRef,
        ...(selectedRule.fixtureSetRef
          ? { fixtureSetRef: selectedRule.fixtureSetRef }
          : {}),
        ...(selectedRule.baselineSetRef
          ? { baselineSetRef: selectedRule.baselineSetRef }
          : {}),
        trace: Object.freeze({
          matchedRuleIds: uniqueVerificationText(
            matched.map((rule) => rule.id)
          ),
          winningRuleIds: uniqueVerificationText(ruleIds),
          forbiddenRuleIds: uniqueVerificationText(
            forbidden.map((rule) => rule.id)
          ),
          appliedExemptionIds: uniqueVerificationText(
            exemptions.map((exemption) => exemption.id)
          ),
          specificity: selectedRule ? specificity(selectedRule) : 0,
          messages: Object.freeze([
            selectedRule
              ? `Selected rule ${selectedRule.id} at specificity ${specificity(selectedRule)}.`
              : `Applied policy default ${policy.defaultRequirement}.`,
            ...(exemptions.length > 0
              ? ['An active authored exemption reduced required to advisory.']
              : []),
          ]),
        }),
      }),
    });
  }

  if (requirement === 'forbidden') {
    return Object.freeze({
      status: 'resolved',
      evaluation: Object.freeze({
        requirement,
        evidenceRequirements: policy.evidenceRequirements,
        trace: Object.freeze({
          matchedRuleIds: Object.freeze([]),
          winningRuleIds: Object.freeze([]),
          forbiddenRuleIds: Object.freeze([]),
          appliedExemptionIds: Object.freeze([]),
          specificity: 0,
          messages: Object.freeze([
            `Applied policy default ${policy.defaultRequirement}.`,
          ]),
        }),
      }),
    });
  }

  return Object.freeze({
    status: 'invalid',
    reasonCode: 'VER-2001',
    message:
      'A required or advisory default needs an explicit matching rule so matrix, retry, and deterministic control inputs are defined.',
    conflictingRuleIds: Object.freeze([]),
  });
};
