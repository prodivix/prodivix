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
  createGoldenG3ReactCatalogBundle,
  createGoldenG3ReactCatalogSnapshot,
  createGoldenG3VueCatalogBundle,
  createGoldenG3VueCatalogSnapshot,
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
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
