import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { normalizeAnimationDefinition } from './animationCodec';
import type {
  AnimationCompositionNode,
  AnimationDecodeIssue,
  AnimationDefinition,
} from './animation.types';

export const ANIMATION_VALIDATION_CODES = Object.freeze({
  documentInvalid: 'ANI_DOCUMENT_INVALID',
  targetInvalid: 'ANI_TARGET_INVALID',
  identityDuplicate: 'ANI_IDENTITY_DUPLICATE',
  referenceInvalid: 'ANI_REFERENCE_INVALID',
  compositionInvalid: 'ANI_COMPOSITION_INVALID',
  reducedMotionInvalid: 'ANI_REDUCED_MOTION_INVALID',
} as const);

export type AnimationValidationCode =
  (typeof ANIMATION_VALIDATION_CODES)[keyof typeof ANIMATION_VALIDATION_CODES];

export type AnimationValidationIssue = Readonly<{
  code: AnimationValidationCode;
  path: string;
  message: string;
}>;

export type AnimationValidationResult =
  | Readonly<{ valid: true; definition: AnimationDefinition; issues: [] }>
  | Readonly<{
      valid: false;
      issues: readonly AnimationValidationIssue[];
    }>;

const issue = (
  code: AnimationValidationCode,
  path: string,
  message: string
): AnimationValidationIssue => ({ code, path, message });

const collectCompositionNodes = (
  node: AnimationCompositionNode,
  path: string,
  visit: (node: AnimationCompositionNode, path: string) => void
): void => {
  visit(node, path);
  if (
    node.kind === 'sequence' ||
    node.kind === 'parallel' ||
    node.kind === 'stagger'
  ) {
    node.children.forEach((child, index) =>
      collectCompositionNodes(child, `${path}/children/${index}`, visit)
    );
  } else if (node.kind === 'conditional-variant') {
    collectCompositionNodes(node.full, `${path}/full`, visit);
    collectCompositionNodes(node.reduced, `${path}/reduced`, visit);
  }
};

const validateSemanticModel = (
  definition: AnimationDefinition
): AnimationValidationIssue[] => {
  const issues: AnimationValidationIssue[] = [];
  const timelineById = new Map(
    definition.timelines.map((timeline) => [timeline.id, timeline])
  );
  if (timelineById.size !== definition.timelines.length) {
    issues.push(
      issue(
        ANIMATION_VALIDATION_CODES.identityDuplicate,
        '/timelines',
        'Animation timeline identities must be unique.'
      )
    );
  }
  const compositionById = new Map(
    definition.compositions.map((composition) => [composition.id, composition])
  );
  if (compositionById.size !== definition.compositions.length) {
    issues.push(
      issue(
        ANIMATION_VALIDATION_CODES.identityDuplicate,
        '/compositions',
        'Animation composition identities must be unique.'
      )
    );
  }
  if (
    definition.entryCompositionId &&
    !compositionById.has(definition.entryCompositionId)
  ) {
    issues.push(
      issue(
        ANIMATION_VALIDATION_CODES.referenceInvalid,
        '/entryCompositionId',
        'Animation entryCompositionId must reference an existing composition.'
      )
    );
  }

  const markerIds = new Set<string>();
  definition.timelines.forEach((timeline) =>
    timeline.markers.forEach((marker) => markerIds.add(marker.id))
  );
  definition.compositions.forEach((composition, compositionIndex) => {
    const roots: readonly (readonly [AnimationCompositionNode, string])[] = [
      [composition.root, `/compositions/${compositionIndex}/root`],
      ...(composition.reducedRoot
        ? ([
            [
              composition.reducedRoot,
              `/compositions/${compositionIndex}/reducedRoot`,
            ],
          ] as const)
        : []),
    ];
    roots.forEach(([root, rootPath]) =>
      collectCompositionNodes(root, rootPath, (node) => {
        if (node.kind !== 'marker') return;
        markerIds.add(node.markerId);
      })
    );
  });

  definition.timelines.forEach((timeline, timelineIndex) => {
    const path = `/timelines/${timelineIndex}/reducedMotion`;
    if (timeline.motionIntent === 'essential') {
      if (
        timeline.reducedMotion.kind !== 'retain' &&
        timeline.reducedMotion.kind !== 'timeline-ref'
      ) {
        issues.push(
          issue(
            ANIMATION_VALIDATION_CODES.reducedMotionInvalid,
            path,
            'Essential motion requires an explicit retained or reduced timeline variant.'
          )
        );
      }
    }
    if (
      timeline.motionIntent === 'continuous' &&
      timeline.reducedMotion.kind === 'retain'
    ) {
      issues.push(
        issue(
          ANIMATION_VALIDATION_CODES.reducedMotionInvalid,
          path,
          'Continuous motion must stop or use a static reduced representation.'
        )
      );
    }
    if (timeline.reducedMotion.kind !== 'timeline-ref') return;
    const reducedTimeline = timelineById.get(timeline.reducedMotion.timelineId);
    if (!reducedTimeline || reducedTimeline.id === timeline.id) {
      issues.push(
        issue(
          ANIMATION_VALIDATION_CODES.referenceInvalid,
          `${path}/timelineId`,
          'Reduced motion timeline must reference a different existing timeline.'
        )
      );
      return;
    }
    const requiredMarkers = timeline.markers
      .filter((marker) => marker.requiredInReducedMotion)
      .map((marker) => marker.id);
    const reducedMarkers = reducedTimeline.markers
      .filter((marker) => marker.requiredInReducedMotion)
      .map((marker) => marker.id);
    if (!sameCanonicalJson(requiredMarkers, reducedMarkers)) {
      issues.push(
        issue(
          ANIMATION_VALIDATION_CODES.reducedMotionInvalid,
          path,
          'Reduced timeline variants must preserve required marker identity and order.'
        )
      );
    }
  });

  const nodeIds = new Set<string>();
  const compositionReferences = new Map<string, Set<string>>();
  definition.compositions.forEach((composition, compositionIndex) => {
    const references = new Set<string>();
    compositionReferences.set(composition.id, references);
    const roots: readonly (readonly [AnimationCompositionNode, string])[] = [
      [composition.root, `/compositions/${compositionIndex}/root`],
      ...(composition.reducedRoot
        ? ([
            [
              composition.reducedRoot,
              `/compositions/${compositionIndex}/reducedRoot`,
            ],
          ] as const)
        : []),
    ];
    roots.forEach(([root, rootPath]) =>
      collectCompositionNodes(root, rootPath, (node, path) => {
        if (nodeIds.has(node.id)) {
          issues.push(
            issue(
              ANIMATION_VALIDATION_CODES.identityDuplicate,
              `${path}/id`,
              `Animation composition node "${node.id}" is not document-unique.`
            )
          );
        }
        nodeIds.add(node.id);
        if (
          (node.kind === 'sequence' ||
            node.kind === 'parallel' ||
            node.kind === 'stagger') &&
          node.children.length === 0
        ) {
          issues.push(
            issue(
              ANIMATION_VALIDATION_CODES.compositionInvalid,
              `${path}/children`,
              'Animation composition containers require at least one child.'
            )
          );
        }
        if (
          node.kind === 'timeline-ref' &&
          !timelineById.has(node.timelineId)
        ) {
          issues.push(
            issue(
              ANIMATION_VALIDATION_CODES.referenceInvalid,
              `${path}/timelineId`,
              `Unknown Animation timeline "${node.timelineId}".`
            )
          );
        }
        if (node.kind === 'composition-ref') {
          references.add(node.compositionId);
          if (!compositionById.has(node.compositionId)) {
            issues.push(
              issue(
                ANIMATION_VALIDATION_CODES.referenceInvalid,
                `${path}/compositionId`,
                `Unknown Animation composition "${node.compositionId}".`
              )
            );
          }
        }
        if (
          node.kind === 'settle' &&
          node.markerId &&
          !markerIds.has(node.markerId)
        ) {
          issues.push(
            issue(
              ANIMATION_VALIDATION_CODES.referenceInvalid,
              `${path}/markerId`,
              `Unknown Animation settle marker "${node.markerId}".`
            )
          );
        }
      })
    );
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitComposition = (compositionId: string): void => {
    if (visiting.has(compositionId)) {
      issues.push(
        issue(
          ANIMATION_VALIDATION_CODES.compositionInvalid,
          '/compositions',
          `Animation composition reference cycle includes "${compositionId}".`
        )
      );
      return;
    }
    if (visited.has(compositionId)) return;
    visiting.add(compositionId);
    for (const reference of compositionReferences.get(compositionId) ?? []) {
      if (compositionById.has(reference)) visitComposition(reference);
    }
    visiting.delete(compositionId);
    visited.add(compositionId);
  };
  definition.compositions.forEach((composition) =>
    visitComposition(composition.id)
  );
  return issues;
};

/** Validates an unversioned canonical Animation current domain document. */
export const validateAnimationDefinition = (
  source: unknown
): AnimationValidationResult => {
  if (!isPlainObject(source)) {
    return {
      valid: false,
      issues: [
        issue(
          ANIMATION_VALIDATION_CODES.documentInvalid,
          '/',
          'Animation document content must be an object.'
        ),
      ],
    };
  }
  if (Object.hasOwn(source, 'version')) {
    return {
      valid: false,
      issues: [
        issue(
          ANIMATION_VALIDATION_CODES.documentInvalid,
          '/version',
          'Animation current domain documents do not contain wire versions.'
        ),
      ],
    };
  }
  const target = source.target;
  if (
    !isPlainObject(target) ||
    target.kind !== 'pir-document' ||
    typeof target.documentId !== 'string' ||
    !target.documentId.trim()
  ) {
    return {
      valid: false,
      issues: [
        issue(
          ANIMATION_VALIDATION_CODES.targetInvalid,
          '/target',
          'Animation documents require one explicit PIR document target.'
        ),
      ],
    };
  }
  const definition = normalizeAnimationDefinition(source);
  if (!definition || !sameCanonicalJson(source, definition)) {
    return {
      valid: false,
      issues: [
        issue(
          ANIMATION_VALIDATION_CODES.documentInvalid,
          '/',
          'Animation document content must already be canonical.'
        ),
      ],
    };
  }
  const issues = validateSemanticModel(definition);
  if (issues.length) return { valid: false, issues };
  return { valid: true, definition, issues: [] };
};

export type { AnimationDecodeIssue };
