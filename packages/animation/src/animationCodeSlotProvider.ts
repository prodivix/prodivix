import {
  createSemanticId,
  type AuthoringContext,
  type CodeSlotBinding,
  type CodeSlotBindingProjection,
  type CodeSlotContract,
  type CodeSlotKind,
  type CodeSlotProvider,
} from '@prodivix/authoring';
import type {
  AnimationDefinition,
  AnimationTimelineCodeSlots,
} from './animation.types';

export type AnimationTimelineCodeSlotRole =
  'custom-easing' | 'shader' | 'script';

const SLOT_DESCRIPTORS: readonly Readonly<{
  role: AnimationTimelineCodeSlotRole;
  field: keyof AnimationTimelineCodeSlots;
  kind: CodeSlotKind;
  inputTypeRef: string;
  outputTypeRef: string;
  capabilityId: string;
}>[] = Object.freeze([
  {
    role: 'custom-easing',
    field: 'customEasing',
    kind: 'animation-function',
    inputTypeRef: 'number',
    outputTypeRef: 'number',
    capabilityId: 'animation-custom-easing',
  },
  {
    role: 'shader',
    field: 'shader',
    kind: 'shader',
    inputTypeRef: 'AnimationShaderContext',
    outputTypeRef: 'AnimationShaderOutput',
    capabilityId: 'animation-shader',
  },
  {
    role: 'script',
    field: 'script',
    kind: 'animation-script',
    inputTypeRef: 'AnimationTimelineScriptContext',
    outputTypeRef: 'void | Promise<void>',
    capabilityId: 'animation-timeline-script',
  },
]);

export const createAnimationTimelineCodeSlotId = (
  documentId: string,
  timelineId: string,
  role: AnimationTimelineCodeSlotRole
): string =>
  createSemanticId('animation-code-slot', documentId, timelineId, role);

export const createAnimationTimelineCodeReferenceId = (
  workspaceId: string,
  documentId: string,
  timelineId: string,
  role: AnimationTimelineCodeSlotRole
): string =>
  createSemanticId(
    'animation-code-reference',
    workspaceId,
    documentId,
    timelineId,
    role
  );

const matchesContext = (
  context: AuthoringContext,
  documentId: string,
  timelineId: string,
  artifactId?: string
): boolean => {
  const target = context.targetRef;
  return (
    (!target ||
      ((target.kind === 'animation-timeline' ||
        target.kind === 'animation-track') &&
        target.documentId === documentId &&
        target.timelineId === timelineId) ||
      (target.kind === 'document' && target.documentId === documentId)) &&
    (!context.artifactId || context.artifactId === artifactId)
  );
};

/** Projects timeline code capabilities from a canonical Animation document. */
export const createAnimationCodeSlotProvider = (input: {
  workspaceId: string;
  documentId: string;
  definition: AnimationDefinition;
}): CodeSlotProvider => {
  const slots: CodeSlotContract[] = [];
  const bindings: CodeSlotBindingProjection[] = [];
  const timelineBySlotId = new Map<string, string>();

  for (const timeline of [...input.definition.timelines].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    for (const descriptor of SLOT_DESCRIPTORS) {
      const binding: CodeSlotBinding | undefined =
        timeline.codeSlots?.[descriptor.field];
      const slot: CodeSlotContract = {
        id:
          binding?.slotId ??
          createAnimationTimelineCodeSlotId(
            input.documentId,
            timeline.id,
            descriptor.role
          ),
        ownerRef: {
          kind: 'animation-timeline',
          documentId: input.documentId,
          timelineId: timeline.id,
        },
        kind: descriptor.kind,
        inputTypeRef: descriptor.inputTypeRef,
        outputTypeRef: descriptor.outputTypeRef,
        capabilityIds: [descriptor.capabilityId],
        defaultPlacement: ['animation-timeline', 'code-editor', 'issues-panel'],
      };
      slots.push(slot);
      timelineBySlotId.set(slot.id, timeline.id);
      if (!binding) continue;
      bindings.push({
        binding,
        ownerRef: slot.ownerRef,
        semanticReferenceId: createAnimationTimelineCodeReferenceId(
          input.workspaceId,
          input.documentId,
          timeline.id,
          descriptor.role
        ),
      });
    }
  }

  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const bindingsById = new Map(
    bindings.map((projection) => [projection.binding.slotId, projection])
  );

  return {
    id: `core.animation.code-slots.${input.documentId}`,
    source: { kind: 'animation' },
    listSlots(context) {
      return slots.filter((slot) => {
        const timelineId = timelineBySlotId.get(slot.id);
        return timelineId
          ? matchesContext(
              context,
              input.documentId,
              timelineId,
              bindingsById.get(slot.id)?.binding.reference.artifactId
            )
          : false;
      });
    },
    getSlot(id) {
      return slotsById.get(id) ?? null;
    },
    listBindingProjections(context) {
      return bindings.filter((projection) => {
        const timelineId = timelineBySlotId.get(projection.binding.slotId);
        return timelineId
          ? matchesContext(
              context,
              input.documentId,
              timelineId,
              projection.binding.reference.artifactId
            )
          : false;
      });
    },
    getBindingProjection(id) {
      return bindingsById.get(id) ?? null;
    },
  };
};
