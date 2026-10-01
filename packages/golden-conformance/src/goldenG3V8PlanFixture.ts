import {
  createVerificationPlan,
  digestVerificationValue,
  normalizeVerificationPolicy,
  type VerificationPlan,
  type VerificationPlanResult,
  type VerificationPolicy,
  type VerificationImpactSet,
} from '@prodivix/verification';
import {
  createGoldenG3V6PlanInput,
  GOLDEN_G3_V6_IDS,
  GOLDEN_G3_V6_POLICY,
} from './goldenG3V6AdapterMatrixFixture';

export const GOLDEN_G3_V8_IDS = Object.freeze({
  policy: 'policy:g3-v8-authenticated-catalog-closure',
  contract: 'g3-v8-authenticated-catalog-closure',
});

export const GOLDEN_G3_V8_POLICY: VerificationPolicy = Object.freeze(
  normalizeVerificationPolicy({
    ...GOLDEN_G3_V6_POLICY,
    id: GOLDEN_G3_V8_IDS.policy,
    name: 'G3 V8 authenticated catalog trusted closure',
    rules: GOLDEN_G3_V6_POLICY.rules.map((rule) =>
      Object.freeze({
        ...rule,
        evidenceTrust:
          rule.matrixProfileId === GOLDEN_G3_V6_IDS.profiles.previewPrimary
            ? ('remote-attested' as const)
            : ('ci-attested' as const),
      })
    ),
    evidenceRequirements: Object.freeze({
      ...GOLDEN_G3_V6_POLICY.evidenceRequirements,
      acceptedTrust: Object.freeze(['remote-attested', 'ci-attested'] as const),
      requireAttestation: true,
    }),
  })
);

export const createGoldenG3V8Plan = (
  options: Readonly<{ impactSet?: VerificationImpactSet }> = {}
): VerificationPlanResult => {
  const base = createGoldenG3V6PlanInput({
    ...(options.impactSet ? { impactSet: options.impactSet } : {}),
  });
  return createVerificationPlan({
    ...base,
    policy: GOLDEN_G3_V8_POLICY,
    policyRevision: 2,
    policyDigest: digestVerificationValue(GOLDEN_G3_V8_POLICY),
    compilerDigest: digestVerificationValue({
      compiler: '@prodivix/prodivix-compiler',
      contract: GOLDEN_G3_V8_IDS.contract,
    }),
    plannerDigest: digestVerificationValue({
      planner: '@prodivix/verification',
      contract: GOLDEN_G3_V8_IDS.contract,
    }),
  });
};

const planResult = createGoldenG3V8Plan();
if (planResult.status !== 'ready') {
  throw new Error(
    `Golden G3 V8 Plan is blocked: ${JSON.stringify(planResult.plan.issues)}`
  );
}

export const GOLDEN_G3_V8_PLAN: VerificationPlan = planResult.plan;

// Updated only when the reviewed canonical V8 policy, matrix, or baseline identity changes.
export const GOLDEN_G3_V8_LOCKED_PLAN_DIGEST =
  'sha256-13a6055440b9956d9f16b2d93586340ab6f7cf6c1310f5c89be4724d6a9c445e';
