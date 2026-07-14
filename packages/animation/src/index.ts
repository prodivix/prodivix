export {
  CSS_FILTER_FUNCTIONS,
  CSS_FILTER_UNITS,
  DEFAULT_BINDING_TARGET_NODE_ID,
  DEFAULT_TIMELINE_DURATION_MS,
  DEFAULT_TIMELINE_NAME,
  STYLE_TRACK_PROPERTIES,
  SVG_FILTER_PRIMITIVE_TYPES,
  createDefaultBinding,
  createDefaultSvgFilter,
  createDefaultSvgPrimitive,
  createDefaultTimeline,
  createDefaultTrack,
  createEmptyAnimationDefinition,
  ensureAnimationDefinition,
  normalizeAnimationDefinition,
  resolveCssFilterUnit,
  resolveTrackFallbackValue,
  serializeAnimationDefinition,
} from './animationCodec';
export {
  ANIMATION_VALIDATION_CODES,
  validateAnimationDefinition,
} from './animationValidator';
export {
  clampMs,
  coerceKeyframeValueInput,
  hasAnySvgTrack,
  normalizeKeyframeRows,
  reconcileSvgTrackReferences,
  resolveActiveTimelineId,
  withEditorState,
} from './animationAuthoring';
export {
  evaluateAnimationFrame,
  evaluateAnimationTimelineAtCursor,
  resolveKeyframedValue,
  resolveTimelineCursorMs,
} from './animationEvaluation';
export {
  ANIMATION_SEMANTIC_PROVIDER_DESCRIPTOR,
  createAnimationSemanticContributionProvider,
} from './animationSemanticContributionProvider';
export {
  createAnimationCodeSlotProvider,
  createAnimationTimelineCodeReferenceId,
  createAnimationTimelineCodeSlotId,
  type AnimationTimelineCodeSlotRole,
} from './animationCodeSlotProvider';

export type {
  AnimationBinding,
  AnimationCssFilterTrack,
  AnimationDefinition,
  AnimationEditorState,
  AnimationEntityKind,
  AnimationFrame,
  AnimationIdFactory,
  AnimationIterations,
  AnimationKeyframe,
  AnimationNodeStyle,
  AnimationStyleTrack,
  AnimationSvgFilterAttributeTrack,
  AnimationTimeline,
  AnimationTimelineCodeSlots,
  AnimationTrack,
  AnimationTargetReference,
  SvgFilterDefinition,
  SvgFilterPrimitive,
} from './animation.types';
export type {
  AnimationValidationCode,
  AnimationValidationIssue,
  AnimationValidationResult,
} from './animationValidator';
export type {
  AnimationSemanticSourceInput,
  CreateAnimationSemanticContributionProviderInput,
} from './animationSemanticContributionProvider';
