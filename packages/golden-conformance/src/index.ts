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
