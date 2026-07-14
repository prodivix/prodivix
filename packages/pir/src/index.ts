export {
  decodePirDocument,
  encodePirDocument,
  normalizePirDocument,
  tryNormalizePirDocument,
  type PIRDecodeIssue,
  type PIRDecodeIssueCode,
  type PIRDecodeResult,
} from './codec/pirCodec';
export {
  createEmptyPirComponentContract,
  createEmptyPirDocument,
  type CreateEmptyPIRDocumentOptions,
} from './pirFactory';
export {
  PIR_VALIDATION_CODES,
  validatePirDocument,
  type PIRValidationCode,
  type PIRValidationIssue,
  type PIRValidationOptions,
  type PIRValidationResult,
} from './pirValidator';
export * from './pirBindingValidator';
export * from './mutations/pirComponentMutations';
export * from './mutations/pirNodeAuthoringMutations';
export * from './mutations/pirGraphFragmentMutation';
export * from './mutations/pirGraphAuthoringMutations';
export * from './mutations/pirElementAuthoringMutations';
export * from './extraction/pirSubtreeExtraction';
export * from './projection/pirComponentProjection';
export * from './projection/pirCollectionProjection';
export * from './projection/pirProjectionPath';
export { readValueByPath } from './projection/readValueByPath';
export {
  PIR_SEMANTIC_PROVIDER_DESCRIPTOR,
  createPirSemanticContributionProvider,
  type CreatePIRSemanticContributionProviderInput,
  type PIRSemanticDocumentInput,
  type PIRSemanticDocumentType,
} from './authoring/pirSemanticContributionProvider';
export {
  createPirCodeSlotProvider,
  createPirMountedCssCodeSlotId,
} from './authoring/pirCodeSlotProvider';
export * from './authoring/pirBindingScope';
export * from './authoring/pirBindingCandidate';
export * from './pir.types';
export { PIR_DIAGNOSTIC_REGISTRY } from './diagnostics/pirDiagnosticRegistry';
