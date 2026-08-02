export {
  GOLDEN_ASSET_MATERIALIZATIONS,
  GOLDEN_CODEGEN_POLICY,
  GOLDEN_IDS,
  createGoldenBaseWorkspace,
  createGoldenCheckoutPir,
  createGoldenDocuments,
  createGoldenOrderSummaryPir,
} from './goldenApp.fixture';
export {
  authorGoldenWorkspace,
  runGoldenConformance,
  type GoldenAuthoringResult,
  type GoldenConformanceReport,
} from './goldenScenario';
export {
  GOLDEN_G1_DEFAULT_DEFINITION_TEXT,
  GOLDEN_G1_IDS,
  authorGoldenG1Workspace,
  runGoldenG1Conformance,
  type GoldenG1AuthoringEvidence,
  type GoldenG1AuthoringResult,
  type GoldenG1CompilerEvidence,
  type GoldenG1ConformanceReport,
} from './goldenG1Scenario';
export {
  projectGoldenTestSemantics,
  runGoldenG2ExecutionMatrix,
  type GoldenG2ExecutionMatrixReport,
  type GoldenTestSemantics,
} from './goldenG2ExecutionMatrix';
export {
  runGoldenG2AuthServerMatrix,
  type GoldenG2AuthServerFunction,
  type GoldenG2AuthServerMatrixReport,
  type GoldenG2AuthServerTarget,
  type GoldenG2AuthServerTargetMatrix,
} from './goldenG2AuthServerMatrix';
export {
  createGoldenG3CatalogProgram,
  createGoldenG3ProductionSecurityProgram,
  createGoldenG3ReactCatalogBundle,
  createGoldenG3ReactCatalogSnapshot,
  createGoldenG3V6ReactCatalogBundle,
  createGoldenG3V6ReactCatalogSnapshot,
  createGoldenG3V6VueCatalogBundle,
  createGoldenG3V6VueCatalogSnapshot,
  createGoldenG3VerificationCompileProfile,
  createGoldenG3VueCatalogBundle,
  createGoldenG3VueCatalogSnapshot,
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_CONTROL_PROFILE_DIGEST,
  GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
  GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
  GOLDEN_G3_SCENARIO_IDS,
} from './goldenG3ScenarioFixture';
export {
  createGoldenG3BehaviorCompositionProgram,
  createGoldenG3CompositionReactSnapshot,
  createGoldenG3CompositionVueSnapshot,
  GOLDEN_G3_COMPOSITION_ANIMATION,
  GOLDEN_G3_COMPOSITION_GRAPH,
  GOLDEN_G3_COMPOSITION_IDS,
  GOLDEN_G3_COMPOSITION_SCENARIO,
  GOLDEN_G3_COMPOSITION_WORKSPACE,
  runGoldenG3AnimationComposition,
  runGoldenG3BehaviorCompositionSurface,
  type GoldenG3BehaviorCompositionSurface,
} from './goldenG3BehaviorCompositionFixture';
export {
  digestGoldenG3V6AdapterRegistry,
  goldenG3V6AdapterFactorySlotForCheckKind,
  goldenG3V6CheckContractForKind,
  GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS,
  GOLDEN_G3_V6_ADAPTER_IDS,
  GOLDEN_G3_V6_FRAMEWORK_TARGETS,
  GOLDEN_G3_V6_ADAPTERS,
  type GoldenG3V6AdapterFactorySlot,
  type GoldenG3V6AdapterFactorySlotId,
} from './goldenG3V6AdapterRegistryFixture';
export {
  createGoldenG3V6Plan,
  createGoldenG3V6PlanInput,
  GOLDEN_G3_V6_AGGREGATE_ROW_COUNT,
  GOLDEN_G3_V6_CHECKS,
  GOLDEN_G3_V6_IDS,
  GOLDEN_G3_V6_IMPACT,
  GOLDEN_G3_V6_MATRIX_GROUPS,
  GOLDEN_G3_V6_POLICY,
  GOLDEN_G3_V6_REQUIRED_CELL_COUNT,
  GOLDEN_G3_V6_SCENARIOS,
  type GoldenG3V6MatrixGroupId,
} from './goldenG3V6AdapterMatrixFixture';
export {
  createGoldenG3V6ControlledMatrixManifest,
  type GoldenG3V6AttemptProvider,
  type GoldenG3V6ControlledMatrixManifest,
  type GoldenG3V6MatrixCellManifest,
  type GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
export {
  assertGoldenG3V6CanonicalAttemptDimensions,
  assertGoldenG3V6CanonicalAttemptManifest,
  createGoldenG3V6CanonicalAttemptManifest,
  type GoldenG3V6CanonicalAttemptControlEvidence,
  type GoldenG3V6CanonicalAttemptDimension,
  type GoldenG3V6CanonicalAttemptEvidence,
  type GoldenG3V6CanonicalAttemptManifest,
} from './goldenG3V6CanonicalAttemptManifest';
export {
  executeGoldenG3V6StaticAdapterCells,
  type GoldenG3V6StaticAdapterAttempt,
  type GoldenG3V6StaticAdapterExecutionEvidence,
  type GoldenG3V6StaticArtifactRetirementEvidence,
  type GoldenG3V6StaticRuntimeControlEvidence,
} from './goldenG3V6StaticAdapterExecution';
export {
  createGoldenG3V6ControlledEnvironmentEvidence,
  createGoldenG3V6StaticRuntimeEnvironmentEvidence,
  type GoldenG3V6ControlledEnvironmentAttemptBinding,
  type GoldenG3V6ControlledEnvironmentEvidence,
  type GoldenG3V6StaticRuntimeEnvironmentEvidence,
} from './goldenG3V6ControlledEnvironmentEvidence';
export {
  GOLDEN_G4_V8_EVALUATION_MATRIX,
  GOLDEN_G4_V8_REQUIRED_CONFIGURATIONS,
  GOLDEN_G4_V8_REQUIRED_PROFILES,
  createGoldenG4V8NativeNormalization,
  createGoldenG4V8SecurityMatrix,
} from './goldenG4V8SecurityModelEvalFixture';
export {
  GOLDEN_G4_V9_CLOCK,
  GOLDEN_G4_V9_COMMIT,
  GOLDEN_G4_V9_PROJECTION,
  GOLDEN_G4_V9_TIME,
  executeGoldenG4V9Closure,
  type GoldenG4V9ClosureHarness,
} from './goldenG4V9ClosureFixture';
