export {
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
