export { createDiagnostic } from './createDiagnostic';
export {
  isDiagnostic,
  isDiagnosticDomain,
  PRODIVIX_DIAGNOSTIC_DOMAINS,
} from './isDiagnostic';
export {
  buildDiagnosticPresentation,
  createDefaultDiagnosticPresentationTemplate,
} from './buildDiagnosticPresentation';
export {
  createDiagnosticIssueCollectionState,
  createDiagnosticIssueFingerprint,
  queryDiagnosticIssues,
  removeDiagnosticProviderSnapshot,
  summarizeDiagnosticIssues,
  upsertDiagnosticProviderSnapshot,
} from './diagnosticIssueCollection';
export {
  copyReportAction,
  createDefinition,
  createExemptionAction,
  openDocsAction,
  openSourceAction,
  openTargetAction,
  retryAction,
  upstreamEvidence,
  uxEvidence,
  uxStandardEvidence,
} from './diagnosticRegistry';
export type { DiagnosticPresentationResolver } from './buildDiagnosticPresentation';
export type {
  CreateDiagnosticInput,
  DiagnosticActionKind,
  DiagnosticActionPresentation,
  DiagnosticActionRequirement,
  DiagnosticActionTemplate,
  DiagnosticDetailSectionKind,
  DiagnosticDetailSectionPresentation,
  DiagnosticDetailSectionTemplate,
  DiagnosticEvidencePresentation,
  DiagnosticEvidenceTemplate,
  DiagnosticLocationPreference,
  DiagnosticLocationPresentation,
  DiagnosticMessageTemplate,
  DiagnosticPresentation,
  DiagnosticPresentationLocationKind,
  DiagnosticPresentationTemplate,
  DiagnosticQuickFixReference,
  DiagnosticSurface,
  DiagnosticTargetRef,
  DiagnosticTemplateVariable,
  ProdivixDiagnostic,
  ProdivixDiagnosticDomain,
  ProdivixDiagnosticSeverity,
  SourceSpan,
  UpstreamDiagnostic,
  UxDiagnostic,
  UxDiagnosticEvidence,
  UxDiagnosticMeta,
  UxStandardRef,
} from './diagnostic.types';
export type {
  DiagnosticIssue,
  DiagnosticIssueCollectionState,
  DiagnosticIssueQuery,
  DiagnosticIssueRevision,
  DiagnosticIssueSource,
  DiagnosticIssueStatus,
  DiagnosticIssueSummary,
  DiagnosticIssueUpdateResult,
  DiagnosticProviderSnapshot,
} from './diagnosticIssue.types';
export type {
  DiagnosticDefinition,
  DiagnosticPlacement,
  DiagnosticRegistryEntry,
} from './diagnosticRegistry';
