export {
  decodeVerificationBaselineSet,
  decodeVerificationDocument,
  decodeVerificationPolicy,
  encodeVerificationBaselineSet,
  encodeVerificationDocument,
  encodeVerificationPolicy,
  isVerificationBaselineSet,
  isVerificationPolicy,
  migrateVerificationDocumentWire,
  normalizeVerificationBaselineSet,
  normalizeVerificationPolicy,
  validateVerificationDocument,
} from './verificationCodec';
export {
  VERIFICATION_DIAGNOSTIC_CODES,
  VERIFICATION_DIAGNOSTIC_REGISTRY,
} from './verificationDiagnosticRegistry';
export {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
  serializeVerificationValue,
  uniqueVerificationText,
} from './verificationCanonical';
export { createVerificationImpactSet } from './verificationImpact';
export { evaluateVerificationPolicy } from './verificationPolicyEvaluator';
export { createVerificationPlan } from './verificationPlanner';
export {
  decodeVerificationPlan,
  encodeVerificationPlan,
  normalizeVerificationPlan,
  validateVerificationPlan,
  type VerificationPlanDecodeResult,
  type VerificationPlanWire,
  type VerificationPlanWireIssue,
} from './verificationPlanCodec';
export { MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS } from './verificationPlannerGraph';
export {
  evaluateVerificationClosure,
  isVerificationClosureForPlan,
} from './verificationClosure';
export { projectVerificationPlanExplanation } from './verificationExplanation';
export * from './verificationArtifactPolicy';
export * from './verificationArtifactEnvelope';
export * from './verificationAttestation';
export * from './verificationComparison';
export * from './verificationCiIdentity';
export * from './verificationEvidenceCodec';
export {
  decodeVerificationEvidenceSourceTraces,
  type VerificationEvidenceSourceTraceDecodeResult,
} from './verificationEvidenceCandidateSourceTrace';
export * from './verificationEvidenceManifest';
export * from './verificationEvidenceNormalization';
export * from './verificationEvidencePromotion';
export * from './verificationEvidenceRepository';
export * from './verificationEvidenceSupersession';
export * from './verificationRetention';
export * from './verificationRevocation';
export {
  verificationBaselineSetWireSchema,
  verificationDocumentWireSchemas,
  verificationPlanWireSchema,
  verificationPolicyWireSchema,
  VERIFICATION_PLAN_WIRE_VERSION,
} from './wire';
export type {
  VerificationAdapter,
  VerificationAdapterBudgets,
  VerificationAdapterDescriptor,
  VerificationAdapterIdentity,
  VerificationArtifactKind,
  VerificationArtifactManifest,
  VerificationAttemptOutcome,
  VerificationAbortSignal,
  VerificationBaselineAssetRef,
  VerificationBaselineEntry,
  VerificationBaselineSet,
  VerificationBrowserEngine,
  VerificationCellStatus,
  VerificationCheckKind,
  VerificationClosure,
  VerificationClosureIssue,
  VerificationClosureResult,
  VerificationClosureVerdict,
  VerificationColorScheme,
  VerificationDecodeIssue,
  VerificationDecodeResult,
  VerificationDocumentByKind,
  VerificationDocumentKind,
  VerificationEvidence,
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateArtifact,
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceCandidateProvenance,
  VerificationEvidenceCandidateResult,
  VerificationEvidenceRequirements,
  VerificationEvidenceSourceTrace,
  VerificationEvidenceTrust,
  VerificationEvidenceTargetPolicy,
  VerificationExemption,
  VerificationImpactSet,
  VerificationImpactCompleteness,
  VerificationImpactContribution,
  VerificationImpactPath,
  VerificationImpactReason,
  VerificationImpactReasonKind,
  VerificationImpactRelationship,
  VerificationImpactSetResult,
  VerificationImplementationIdentity,
  VerificationInputKind,
  VerificationJsonValue,
  VerificationMatrix,
  VerificationMatrixAxis,
  VerificationMatrixProfile,
  VerificationMotion,
  VerificationPartitionRevisions,
  VerificationPlan,
  VerificationPlanBudgetSummary,
  VerificationPlanBudgets,
  VerificationPlanCell,
  VerificationPlanCellPreflight,
  VerificationPlanIssue,
  VerificationPlanExplanation,
  VerificationPlanResource,
  VerificationPlanResult,
  VerificationPlanSelectionExplanation,
  VerificationPolicy,
  VerificationPolicyEvaluation,
  VerificationPolicyEvaluationFacts,
  VerificationPolicyEvaluationResult,
  VerificationPolicyEvaluationTrace,
  VerificationPolicyRequirement,
  VerificationPolicyRule,
  VerificationRequirement,
  VerificationRetryPolicy,
  VerificationRetentionClass,
  VerificationRunContext,
  VerificationCheckReportCandidate,
  VerificationCiRepositoryIdentity,
  VerificationPreflightResult,
  VerificationSurface,
  VerificationViewportAxis,
  VerificationWireDocument,
  CreateVerificationImpactSetInput,
  CreateVerificationPlanInput,
  EvaluateVerificationClosureInput,
  VerificationAdapterRegistration,
  VerificationCheckCost,
  VerificationCheckDefinition,
  VerificationScenarioDescriptor,
} from './verification.types';
export type { VerificationDiagnosticCode } from './verificationDiagnosticRegistry';
