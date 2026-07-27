import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AnimationComposition,
  AnimationCompositionNode,
  AnimationDefinition,
  AnimationMarkerKind,
  AnimationMotionMode,
  AnimationTimeline,
} from './animation.types';
import { validateAnimationDefinition } from './animationValidator';

export type AnimationCompositionCompileIssueCode =
  | 'ANIMATION_COMPOSITION_DOCUMENT_INVALID'
  | 'ANIMATION_COMPOSITION_NOT_FOUND'
  | 'ANIMATION_COMPOSITION_REFERENCE_CYCLE'
  | 'ANIMATION_COMPOSITION_REFERENCE_INVALID'
  | 'ANIMATION_COMPOSITION_UNBOUNDED'
  | 'ANIMATION_COMPOSITION_BUDGET_EXCEEDED'
  | 'ANIMATION_COMPOSITION_MARKER_INVALID'
  | 'ANIMATION_COMPOSITION_REDUCED_SEMANTICS_MISMATCH';

export type AnimationCompositionCompileIssue = Readonly<{
  code: AnimationCompositionCompileIssueCode;
  path: string;
  message: string;
}>;

export type AnimationTimelineEffectMode =
  'animate' | 'disabled' | 'final-state';

export type AnimationCompositionProgramEvent = Readonly<{
  sequence: number;
  atMs: number;
  kind:
    | 'timeline-started'
    | 'timeline-completed'
    | 'timeline-cancelled'
    | 'marker-reached'
    | 'settled';
  compositionNodeId: string;
  timelineId?: string;
  resolvedTimelineId?: string;
  timelineDigest?: string;
  effectMode?: AnimationTimelineEffectMode;
  markerId?: string;
  markerKind?: AnimationMarkerKind;
  requiredInReducedMotion?: boolean;
  iteration?: number;
}>;

export type AnimationCompositionProgram = Readonly<{
  compositionId: string;
  motionMode: AnimationMotionMode;
  motionIntent: AnimationComposition['motionIntent'];
  durationMs: number;
  requiredMarkerIds: readonly string[];
  events: readonly AnimationCompositionProgramEvent[];
  programDigest: string;
}>;

export type AnimationCompositionProgramBundle = Readonly<{
  compositionId: string;
  full: AnimationCompositionProgram;
  reduced: AnimationCompositionProgram;
}>;

export type AnimationCompositionCompileResult =
  | Readonly<{
      ok: true;
      bundle: AnimationCompositionProgramBundle;
    }>
  | Readonly<{
      ok: false;
      issues: readonly AnimationCompositionCompileIssue[];
    }>;

export type AnimationCompositionCompileBudgets = Readonly<{
  maximumNodes?: number;
  maximumEvents?: number;
  maximumDurationMs?: number;
  maximumTimelineIterations?: number;
}>;

type ResolvedBudgets = Readonly<{
  maximumNodes: number;
  maximumEvents: number;
  maximumDurationMs: number;
  maximumTimelineIterations: number;
}>;

type PendingEvent = Omit<AnimationCompositionProgramEvent, 'sequence'> &
  Readonly<{ ordinal: number }>;

type CompiledFragment = Readonly<{
  durationMs: number;
  events: readonly PendingEvent[];
}>;

type CompileContext = {
  definition: AnimationDefinition;
  timelineById: ReadonlyMap<string, AnimationTimeline>;
  compositionById: ReadonlyMap<string, AnimationComposition>;
  mode: AnimationMotionMode;
  budgets: ResolvedBudgets;
  issues: AnimationCompositionCompileIssue[];
  referenceStack: string[];
  nodesVisited: number;
  nextOrdinal: number;
};

const resolveBudgets = (
  input: AnimationCompositionCompileBudgets | undefined
): ResolvedBudgets => ({
  maximumNodes: input?.maximumNodes ?? 10_000,
  maximumEvents: input?.maximumEvents ?? 100_000,
  maximumDurationMs: input?.maximumDurationMs ?? 300_000,
  maximumTimelineIterations: input?.maximumTimelineIterations ?? 10_000,
});

const compileIssue = (
  code: AnimationCompositionCompileIssueCode,
  path: string,
  message: string
): AnimationCompositionCompileIssue => ({ code, path, message });

const digestCanonicalValue = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

const nextOrdinal = (context: CompileContext): number => {
  const ordinal = context.nextOrdinal;
  context.nextOrdinal += 1;
  return ordinal;
};

const timelineIterationCount = (
  timeline: AnimationTimeline,
  path: string,
  context: CompileContext
): number | null => {
  if (timeline.iterations === 'infinite') {
    context.issues.push(
      compileIssue(
        'ANIMATION_COMPOSITION_UNBOUNDED',
        path,
        `Timeline "${timeline.id}" has unbounded iterations.`
      )
    );
    return null;
  }
  const iterations = timeline.iterations ?? 1;
  if (iterations > context.budgets.maximumTimelineIterations) {
    context.issues.push(
      compileIssue(
        'ANIMATION_COMPOSITION_BUDGET_EXCEEDED',
        path,
        `Timeline "${timeline.id}" exceeds the iteration budget.`
      )
    );
    return null;
  }
  return iterations;
};

const markerOffsetForIteration = (
  timeline: AnimationTimeline,
  atMs: number,
  iteration: number
): number => {
  const direction = timeline.direction ?? 'normal';
  const reverse =
    direction === 'reverse' ||
    (direction === 'alternate' && iteration % 2 === 1) ||
    (direction === 'alternate-reverse' && iteration % 2 === 0);
  return reverse ? timeline.durationMs - atMs : atMs;
};

const timelineMarkerOccurrences = (
  timeline: AnimationTimeline,
  iterations: number,
  requiredOnly: boolean
) =>
  Array.from({ length: iterations }, (_, iteration) =>
    timeline.markers
      .filter((marker) => !requiredOnly || marker.requiredInReducedMotion)
      .map((marker, markerIndex) => ({
        marker,
        markerIndex,
        iteration,
        atMs:
          (timeline.delayMs ?? 0) +
          iteration * timeline.durationMs +
          markerOffsetForIteration(timeline, marker.atMs, iteration),
      }))
  )
    .flat()
    .sort(
      (left, right) =>
        left.atMs - right.atMs ||
        left.iteration - right.iteration ||
        left.markerIndex - right.markerIndex
    );

const compileTimeline = (
  semanticTimeline: AnimationTimeline,
  node: Extract<AnimationCompositionNode, { kind: 'timeline-ref' }>,
  path: string,
  context: CompileContext
): CompiledFragment | null => {
  let resolvedTimeline = semanticTimeline;
  let effectMode: AnimationTimelineEffectMode = 'animate';
  if (context.mode === 'reduced') {
    switch (semanticTimeline.reducedMotion.kind) {
      case 'disabled':
        effectMode = 'disabled';
        break;
      case 'final-state':
        effectMode = 'final-state';
        break;
      case 'retain':
        effectMode = 'animate';
        break;
      case 'timeline-ref': {
        const referenced = context.timelineById.get(
          semanticTimeline.reducedMotion.timelineId
        );
        if (!referenced) {
          context.issues.push(
            compileIssue(
              'ANIMATION_COMPOSITION_REFERENCE_INVALID',
              `${path}/timelineId`,
              `Reduced timeline "${semanticTimeline.reducedMotion.timelineId}" is missing.`
            )
          );
          return null;
        }
        resolvedTimeline = referenced;
        break;
      }
    }
  }

  const timelineDigest = digestCanonicalValue({
    semanticTimeline,
    resolvedTimeline,
    effectMode,
  });
  const events: PendingEvent[] = [
    {
      ordinal: nextOrdinal(context),
      atMs: 0,
      kind: 'timeline-started',
      compositionNodeId: node.id,
      timelineId: semanticTimeline.id,
      resolvedTimelineId: resolvedTimeline.id,
      timelineDigest,
      effectMode,
    },
  ];
  if (
    context.mode === 'reduced' &&
    (effectMode === 'disabled' || effectMode === 'final-state')
  ) {
    const semanticIterations = timelineIterationCount(
      semanticTimeline,
      path,
      context
    );
    if (semanticIterations === null) return null;
    timelineMarkerOccurrences(
      semanticTimeline,
      semanticIterations,
      true
    ).forEach(({ marker, iteration }) => {
      events.push({
        ordinal: nextOrdinal(context),
        atMs: 0,
        kind: 'marker-reached',
        compositionNodeId: node.id,
        timelineId: semanticTimeline.id,
        resolvedTimelineId: resolvedTimeline.id,
        timelineDigest,
        markerId: marker.id,
        markerKind: marker.kind,
        requiredInReducedMotion: true,
        iteration,
      });
    });
    events.push({
      ordinal: nextOrdinal(context),
      atMs: 0,
      kind: 'timeline-completed',
      compositionNodeId: node.id,
      timelineId: semanticTimeline.id,
      resolvedTimelineId: resolvedTimeline.id,
      timelineDigest,
      effectMode,
    });
    return { durationMs: 0, events };
  }

  const iterations = timelineIterationCount(resolvedTimeline, path, context);
  if (iterations === null) return null;
  const delayMs = resolvedTimeline.delayMs ?? 0;
  const durationMs = delayMs + resolvedTimeline.durationMs * iterations;
  timelineMarkerOccurrences(resolvedTimeline, iterations, false).forEach(
    ({ marker, iteration, atMs }) => {
      events.push({
        ordinal: nextOrdinal(context),
        atMs,
        kind: 'marker-reached',
        compositionNodeId: node.id,
        timelineId: semanticTimeline.id,
        resolvedTimelineId: resolvedTimeline.id,
        timelineDigest,
        markerId: marker.id,
        markerKind: marker.kind,
        requiredInReducedMotion: marker.requiredInReducedMotion,
        iteration,
      });
    }
  );
  events.push({
    ordinal: nextOrdinal(context),
    atMs: durationMs,
    kind: 'timeline-completed',
    compositionNodeId: node.id,
    timelineId: semanticTimeline.id,
    resolvedTimelineId: resolvedTimeline.id,
    timelineDigest,
    effectMode,
  });
  return { durationMs, events };
};

const shiftFragment = (
  fragment: CompiledFragment,
  offsetMs: number
): CompiledFragment => ({
  durationMs: fragment.durationMs + offsetMs,
  events: fragment.events.map((event) => ({
    ...event,
    atMs: event.atMs + offsetMs,
  })),
});

const compileNode = (
  node: AnimationCompositionNode,
  path: string,
  context: CompileContext
): CompiledFragment | null => {
  context.nodesVisited += 1;
  if (context.nodesVisited > context.budgets.maximumNodes) {
    context.issues.push(
      compileIssue(
        'ANIMATION_COMPOSITION_BUDGET_EXCEEDED',
        path,
        'Animation composition exceeds its node budget.'
      )
    );
    return null;
  }
  if (node.kind === 'timeline-ref') {
    const timeline = context.timelineById.get(node.timelineId);
    if (!timeline) {
      context.issues.push(
        compileIssue(
          'ANIMATION_COMPOSITION_REFERENCE_INVALID',
          `${path}/timelineId`,
          `Unknown Animation timeline "${node.timelineId}".`
        )
      );
      return null;
    }
    return compileTimeline(timeline, node, path, context);
  }
  if (node.kind === 'composition-ref') {
    const composition = context.compositionById.get(node.compositionId);
    if (!composition) {
      context.issues.push(
        compileIssue(
          'ANIMATION_COMPOSITION_REFERENCE_INVALID',
          `${path}/compositionId`,
          `Unknown Animation composition "${node.compositionId}".`
        )
      );
      return null;
    }
    if (context.referenceStack.includes(composition.id)) {
      context.issues.push(
        compileIssue(
          'ANIMATION_COMPOSITION_REFERENCE_CYCLE',
          path,
          `Animation composition reference cycle: ${[
            ...context.referenceStack,
            composition.id,
          ].join(' -> ')}.`
        )
      );
      return null;
    }
    context.referenceStack.push(composition.id);
    const root =
      context.mode === 'reduced' && composition.reducedRoot
        ? composition.reducedRoot
        : composition.root;
    const result = compileNode(
      root,
      `/compositions/${composition.id}/${
        context.mode === 'reduced' && composition.reducedRoot
          ? 'reducedRoot'
          : 'root'
      }`,
      context
    );
    context.referenceStack.pop();
    return result;
  }
  if (node.kind === 'conditional-variant') {
    return compileNode(
      context.mode === 'full' ? node.full : node.reduced,
      `${path}/${context.mode}`,
      context
    );
  }
  if (node.kind === 'marker') {
    if (context.mode === 'reduced' && !node.requiredInReducedMotion) {
      return { durationMs: 0, events: [] };
    }
    return {
      durationMs: 0,
      events: [
        {
          ordinal: nextOrdinal(context),
          atMs: 0,
          kind: 'marker-reached',
          compositionNodeId: node.id,
          markerId: node.markerId,
          markerKind: node.markerKind,
          requiredInReducedMotion: node.requiredInReducedMotion,
        },
      ],
    };
  }
  if (node.kind === 'hold') {
    return { durationMs: node.durationMs, events: [] };
  }
  if (node.kind === 'settle') {
    return {
      durationMs: 0,
      events: [
        {
          ordinal: nextOrdinal(context),
          atMs: 0,
          kind: 'settled',
          compositionNodeId: node.id,
          ...(node.markerId ? { markerId: node.markerId } : {}),
        },
      ],
    };
  }

  const children = node.children
    .map((child, index) =>
      compileNode(child, `${path}/children/${index}`, context)
    )
    .filter((child): child is CompiledFragment => child !== null);
  if (children.length !== node.children.length) return null;

  if (node.kind === 'sequence') {
    let offsetMs = 0;
    const events: PendingEvent[] = [];
    children.forEach((child) => {
      const shifted = shiftFragment(child, offsetMs);
      events.push(...shifted.events);
      offsetMs += child.durationMs;
    });
    return { durationMs: offsetMs, events };
  }

  const offsets =
    node.kind === 'stagger'
      ? children.map((_, index) => node.intervalMs * index)
      : children.map(() => 0);
  const shiftedChildren = children.map((child, index) =>
    shiftFragment(child, offsets[index] ?? 0)
  );
  if (node.kind === 'stagger') {
    return {
      durationMs: Math.max(
        0,
        ...shiftedChildren.map((child) => child.durationMs)
      ),
      events: shiftedChildren.flatMap((child) => child.events),
    };
  }

  const childDurations = shiftedChildren.map((child) => child.durationMs);
  const durationMs =
    node.join === 'all'
      ? Math.max(0, ...childDurations)
      : Math.min(...childDurations);
  const events = shiftedChildren.flatMap((child) =>
    child.events.filter((event) => event.atMs <= durationMs)
  );
  if (node.join !== 'all' && node.cancelLosers) {
    shiftedChildren.forEach((child) => {
      if (child.durationMs <= durationMs) return;
      const startedTimelines = child.events.filter(
        (event) => event.kind === 'timeline-started'
      );
      startedTimelines.forEach((started) => {
        events.push({
          ...started,
          ordinal: nextOrdinal(context),
          atMs: durationMs,
          kind: 'timeline-cancelled',
        });
      });
    });
  }
  return { durationMs, events };
};

const createProgramDigest = (
  value: Omit<AnimationCompositionProgram, 'programDigest'>
): string => digestCanonicalValue(value);

const comparePendingEvents = (
  left: PendingEvent,
  right: PendingEvent
): number =>
  left.atMs - right.atMs ||
  left.ordinal - right.ordinal ||
  compareUnicodeCodePoints(left.compositionNodeId, right.compositionNodeId);

const compileMode = (
  definition: AnimationDefinition,
  composition: AnimationComposition,
  mode: AnimationMotionMode,
  budgets: ResolvedBudgets
):
  | Readonly<{ ok: true; program: AnimationCompositionProgram }>
  | Readonly<{
      ok: false;
      issues: readonly AnimationCompositionCompileIssue[];
    }> => {
  const context: CompileContext = {
    definition,
    timelineById: new Map(
      definition.timelines.map((timeline) => [timeline.id, timeline])
    ),
    compositionById: new Map(
      definition.compositions.map((candidate) => [candidate.id, candidate])
    ),
    mode,
    budgets,
    issues: [],
    referenceStack: [composition.id],
    nodesVisited: 0,
    nextOrdinal: 0,
  };
  const root =
    mode === 'reduced' && composition.reducedRoot
      ? composition.reducedRoot
      : composition.root;
  const fragment = compileNode(
    root,
    `/compositions/${composition.id}/${
      mode === 'reduced' && composition.reducedRoot ? 'reducedRoot' : 'root'
    }`,
    context
  );
  if (!fragment || context.issues.length) {
    return { ok: false, issues: context.issues };
  }
  if (
    fragment.durationMs > budgets.maximumDurationMs ||
    fragment.events.length > budgets.maximumEvents
  ) {
    return {
      ok: false,
      issues: [
        compileIssue(
          'ANIMATION_COMPOSITION_BUDGET_EXCEEDED',
          `/compositions/${composition.id}`,
          'Animation composition exceeds its duration or event budget.'
        ),
      ],
    };
  }
  const sorted = [...fragment.events].sort(comparePendingEvents);
  const reachedMarkerIds = new Set<string>();
  for (const event of sorted) {
    if (event.kind === 'marker-reached' && event.markerId) {
      reachedMarkerIds.add(event.markerId);
    }
    if (
      event.kind === 'settled' &&
      event.markerId &&
      !reachedMarkerIds.has(event.markerId)
    ) {
      return {
        ok: false,
        issues: [
          compileIssue(
            'ANIMATION_COMPOSITION_MARKER_INVALID',
            `/compositions/${composition.id}`,
            `Settle marker "${event.markerId}" is not reached before the settle barrier.`
          ),
        ],
      };
    }
  }
  const events = Object.freeze(
    sorted.map(({ ordinal: _ordinal, ...event }, index) =>
      Object.freeze({ ...event, sequence: index + 1 })
    )
  );
  const requiredMarkerIds = Object.freeze(
    events
      .filter(
        (event) =>
          event.kind === 'marker-reached' &&
          event.requiredInReducedMotion === true &&
          event.markerId
      )
      .map((event) => event.markerId as string)
  );
  const unsigned = Object.freeze({
    compositionId: composition.id,
    motionMode: mode,
    motionIntent: composition.motionIntent,
    durationMs: fragment.durationMs,
    requiredMarkerIds,
    events,
  });
  return {
    ok: true,
    program: Object.freeze({
      ...unsigned,
      programDigest: createProgramDigest(unsigned),
    }),
  };
};

/**
 * Compiles both motion modes so publication cannot activate a reduced variant
 * that drops required semantic markers.
 */
export const compileAnimationComposition = (
  input: Readonly<{
    definition: AnimationDefinition;
    compositionId?: string;
    budgets?: AnimationCompositionCompileBudgets;
  }>
): AnimationCompositionCompileResult => {
  const validation = validateAnimationDefinition(input.definition);
  if (!validation.valid) {
    return {
      ok: false,
      issues: validation.issues.map((validationIssue) =>
        compileIssue(
          'ANIMATION_COMPOSITION_DOCUMENT_INVALID',
          validationIssue.path,
          validationIssue.message
        )
      ),
    };
  }
  const compositionId =
    input.compositionId ?? validation.definition.entryCompositionId;
  const composition = validation.definition.compositions.find(
    (candidate) => candidate.id === compositionId
  );
  if (!composition) {
    return {
      ok: false,
      issues: [
        compileIssue(
          'ANIMATION_COMPOSITION_NOT_FOUND',
          '/entryCompositionId',
          `Animation composition "${compositionId ?? ''}" was not found.`
        ),
      ],
    };
  }
  const budgets = resolveBudgets(input.budgets);
  const full = compileMode(validation.definition, composition, 'full', budgets);
  const reduced = compileMode(
    validation.definition,
    composition,
    'reduced',
    budgets
  );
  if (!full.ok || !reduced.ok) {
    const combined = [
      ...(full.ok ? [] : full.issues),
      ...(reduced.ok ? [] : reduced.issues),
    ];
    const issueKeys = new Set<string>();
    const issues = combined.filter((candidate) => {
      const key = canonicalJsonText(candidate);
      if (issueKeys.has(key)) return false;
      issueKeys.add(key);
      return true;
    });
    return {
      ok: false,
      issues,
    };
  }
  if (
    !sameCanonicalJson(
      full.program.requiredMarkerIds,
      reduced.program.requiredMarkerIds
    )
  ) {
    return {
      ok: false,
      issues: [
        compileIssue(
          'ANIMATION_COMPOSITION_REDUCED_SEMANTICS_MISMATCH',
          `/compositions/${composition.id}`,
          'Full and reduced variants must preserve required marker identity and order.'
        ),
      ],
    };
  }
  return {
    ok: true,
    bundle: Object.freeze({
      compositionId: composition.id,
      full: full.program,
      reduced: reduced.program,
    }),
  };
};
