export { compileWorkspacePirReactModules } from '#src/react/workspaceCompiler';
export { createPirReactModuleId } from '#src/react/moduleNaming';
export {
  CONTROLLED_REACT_JSX_NODE_ID_ATTRIBUTE,
  CONTROLLED_REACT_JSX_ISSUE_CODES,
  parseControlledReactJsxToPirDocument,
  projectPirDocumentToControlledReactJsx,
  type ControlledReactJsxIssue,
  type ControlledReactJsxIssueCode,
  type ControlledReactJsxParseResult,
  type ControlledReactJsxProjectionResult,
} from '#src/react/controlledReactJsx';
export {
  CONTROLLED_CSS_ISSUE_CODES,
  CONTROLLED_CSS_NODE_ID_ATTRIBUTE,
  CONTROLLED_CSS_NUMBER_MARKER,
  parseControlledCssToPirDocument,
  projectPirDocumentToControlledCss,
  type ControlledCssIssue,
  type ControlledCssIssueCode,
  type ControlledCssParseResult,
  type ControlledCssProjectionResult,
} from '#src/react/controlledCss';
export {
  CONTROLLED_ROUND_TRIP_ISSUE_CODES,
  augmentWorkspaceOperationWithControlledSource,
  createControlledCodeDocumentsPlan,
  createControlledCodeEditPlan,
  createControlledSourceAttachmentPlan,
  type ControlledCodeDocumentInput,
  type ControlledRoundTripAugmentResult,
  type ControlledRoundTripIssue,
  type ControlledRoundTripIssueCode,
  type ControlledRoundTripPlanResult,
} from '#src/react/controlledRoundTrip';
export type {
  CompileWorkspacePirReactModulesInput,
  PIRReactCollectionProjectionIssueReport,
  PIRReactCodeReference,
  PIRReactRuntimePort,
  PIRReactStateUpdater,
  PIRReactRuntimeTriggerDispatch,
  WorkspacePirReactCompileBlocked,
  WorkspacePirReactCompileReady,
  WorkspacePirReactCompileResult,
} from '#src/react/compiler.types';
