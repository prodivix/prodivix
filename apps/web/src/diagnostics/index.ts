export { createDiagnostic } from './createDiagnostic';
export { isDiagnostic } from './isDiagnostic';
export {
  buildDiagnosticPresentation,
  createDefaultDiagnosticPresentationTemplate,
} from './buildDiagnosticPresentation';
export {
  COD_DIAGNOSTIC_DEFINITIONS,
  PIR_DIAGNOSTIC_REGISTRY,
  UX_DIAGNOSTIC_DEFINITIONS,
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
  DiagnosticDefinition,
  DiagnosticPlacement,
  DiagnosticRegistryEntry,
} from './diagnosticRegistry';
