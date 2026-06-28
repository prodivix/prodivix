import type {
  AnimationKeyframe,
  AnimationTimeline,
  AnimationTrack,
  PIRDocument,
  SvgFilterDefinition,
} from '@prodivix/shared/types/pir';
import { toSafeExportIdentifier } from '#src/export/naming';
import type {
  ExportFileContribution,
  ExportModule,
  ExportProgramContribution,
  ExportRuntimeRequirement,
  ExportSourceTrace,
  ExportStyleContribution,
} from '#src/export/types';

type CssKeyframe = Record<string, number | string>;
type CssFilterTrack = Extract<AnimationTrack, { kind: 'css-filter' }>;
type StyleTrack = Extract<AnimationTrack, { kind: 'style' }>;
type SvgFilterAttrTrack = Extract<AnimationTrack, { kind: 'svg-filter-attr' }>;

const createTimelineSourceTrace = (
  timeline: AnimationTimeline,
  index: number
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'animation',
      id: timeline.id,
      path: `/animation/timelines/${index}`,
    },
    ownerRootId: timeline.id,
  },
];

const sanitizeCssIdentifier = (value: string, fallback: string) => {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
};

const createNodeSelector = (nodeId: string) =>
  `[data-pir-node-id="${nodeId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"] > *`;

const collectTimelineOffsets = (timeline: AnimationTimeline): number[] => {
  const offsets = new Set<number>([0, timeline.durationMs]);
  timeline.bindings.forEach((binding) => {
    binding.tracks.forEach((track) => {
      track.keyframes.forEach((keyframe) => offsets.add(keyframe.atMs));
    });
  });
  return Array.from(offsets)
    .filter((offset) => Number.isFinite(offset))
    .map((offset) => Math.min(Math.max(0, offset), timeline.durationMs))
    .sort((left, right) => left - right);
};

const normalizeKeyframes = (keyframes: AnimationKeyframe[]) =>
  [...keyframes].sort((left, right) => left.atMs - right.atMs);

const resolveKeyframedValue = (
  keyframes: AnimationKeyframe[],
  atMs: number
): number | string | undefined => {
  const sorted = normalizeKeyframes(keyframes);
  if (!sorted.length) return undefined;
  if (sorted.length === 1) return sorted[0].value;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (atMs <= first.atMs) return first.value;
  if (atMs >= last.atMs) return last.value;

  let previous = first;
  let next = last;
  for (const keyframe of sorted) {
    if (keyframe.atMs <= atMs) previous = keyframe;
    if (keyframe.atMs >= atMs) {
      next = keyframe;
      break;
    }
  }

  if (previous.atMs === next.atMs || previous.hold) return previous.value;
  if (typeof previous.value !== 'number' || typeof next.value !== 'number') {
    return previous.value;
  }

  const duration = next.atMs - previous.atMs;
  if (duration <= 0) return previous.value;
  const progress = Math.min(1, Math.max(0, (atMs - previous.atMs) / duration));
  return previous.value + (next.value - previous.value) * progress;
};

const resolveCssFilterUnit = (
  fn: CssFilterTrack['fn'],
  unit?: CssFilterTrack['unit']
) => {
  if (unit) return unit;
  if (fn === 'hue-rotate') return 'deg';
  if (fn === 'blur') return 'px';
  return '%';
};

const getStyleDeclaration = (
  track: StyleTrack,
  value: number | string
): Partial<CssKeyframe> => {
  if (track.property === 'opacity') return { opacity: value };
  if (track.property === 'color') return { color: value };
  if (track.property === 'transform.translateX') {
    return { transform: `translateX(${value}px)` };
  }
  if (track.property === 'transform.translateY') {
    return { transform: `translateY(${value}px)` };
  }
  if (track.property === 'transform.scale') {
    return { transform: `scale(${value})` };
  }
  return {};
};

const buildCssFilterValue = (
  tracks: CssFilterTrack[],
  atMs: number
): string | undefined => {
  const parts = tracks
    .map((track) => {
      const value = resolveKeyframedValue(track.keyframes, atMs);
      if (value === undefined) return null;
      return `${track.fn}(${value}${resolveCssFilterUnit(track.fn, track.unit)})`;
    })
    .filter((value): value is string => value !== null);
  return parts.length ? parts.join(' ') : undefined;
};

const buildBindingKeyframes = (
  timeline: AnimationTimeline,
  binding: AnimationTimeline['bindings'][number],
  offsets: number[]
): CssKeyframe[] => {
  const cssFilterTracks = binding.tracks.filter(
    (track): track is CssFilterTrack => track.kind === 'css-filter'
  );

  return offsets.map((offsetMs) => {
    const frame: CssKeyframe = {
      offset: timeline.durationMs > 0 ? offsetMs / timeline.durationMs : 0,
    };
    const transforms: string[] = [];

    binding.tracks.forEach((track) => {
      if (track.kind !== 'style') return;
      const value = resolveKeyframedValue(track.keyframes, offsetMs);
      if (value === undefined) return;
      const declaration = getStyleDeclaration(track, value);
      const transform = declaration.transform;
      if (typeof transform === 'string') {
        transforms.push(transform);
        return;
      }
      Object.assign(frame, declaration);
    });

    if (transforms.length) frame.transform = transforms.join(' ');
    const filter = buildCssFilterValue(cssFilterTracks, offsetMs);
    if (filter) frame.filter = filter;
    if (frame.transform) frame.transformOrigin = 'center';
    return frame;
  });
};

const buildTimelineKeyframeManifest = (timeline: AnimationTimeline) => {
  const offsets = collectTimelineOffsets(timeline);
  return timeline.bindings
    .map((binding) => ({
      bindingId: binding.id,
      targetNodeId: binding.targetNodeId,
      selector: createNodeSelector(binding.targetNodeId),
      keyframes: buildBindingKeyframes(timeline, binding, offsets).filter(
        (frame) => Object.keys(frame).length > 1
      ),
    }))
    .filter((binding) => binding.keyframes.length > 0);
};

const buildTimelineSvgFilterPatchManifest = (timeline: AnimationTimeline) => {
  const offsets = collectTimelineOffsets(timeline);
  return timeline.bindings
    .flatMap((binding) =>
      binding.tracks
        .filter(
          (track): track is SvgFilterAttrTrack =>
            track.kind === 'svg-filter-attr'
        )
        .map((track) => ({
          bindingId: binding.id,
          targetNodeId: binding.targetNodeId,
          filterId: track.filterId,
          primitiveId: track.primitiveId,
          attr: track.attr,
          keyframes: offsets
            .map((offsetMs) => {
              const value = resolveKeyframedValue(track.keyframes, offsetMs);
              if (value === undefined) return null;
              return {
                offset:
                  timeline.durationMs > 0 ? offsetMs / timeline.durationMs : 0,
                value,
              };
            })
            .filter(
              (
                keyframe
              ): keyframe is { offset: number; value: number | string } =>
                keyframe !== null
            ),
        }))
    )
    .filter((patch) => patch.keyframes.length > 0);
};

const hasSvgFilterTracks = (timeline: AnimationTimeline) =>
  timeline.bindings.some((binding) =>
    binding.tracks.some((track) => track.kind === 'svg-filter-attr')
  );

const createTimelineModuleBody = (input: {
  exportName: string;
  timeline: AnimationTimeline;
}) => {
  const keyframeManifest = buildTimelineKeyframeManifest(input.timeline);
  const svgFilterPatchManifest = buildTimelineSvgFilterPatchManifest(
    input.timeline
  );
  const timingExpression = `{
  durationMs: ${JSON.stringify(input.timeline.durationMs)},
  delayMs: ${JSON.stringify(input.timeline.delayMs ?? 0)},
  iterations: ${input.timeline.iterations === 'infinite' ? 'Infinity' : JSON.stringify(input.timeline.iterations ?? 1)},
  direction: ${JSON.stringify(input.timeline.direction ?? 'normal')},
  fillMode: ${JSON.stringify(input.timeline.fillMode ?? 'both')},
  easing: ${JSON.stringify(input.timeline.easing ?? 'linear')},
} as const`;
  return `export const ${input.exportName}Timeline = ${JSON.stringify(
    input.timeline,
    null,
    2
  )} as const;

const ${input.exportName}Timing = ${timingExpression};

export const ${input.exportName}Keyframes = ${JSON.stringify(
    keyframeManifest,
    null,
    2
  )} as const;

export const ${input.exportName}SvgFilterPatches = ${JSON.stringify(
    svgFilterPatchManifest,
    null,
    2
  )} as const;

const create${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}Keyframes = (
  keyframes: readonly Record<string, number | string>[]
): Keyframe[] => keyframes.map((keyframe) => ({ ...keyframe }));

const escape${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}SelectorPart = (value: string) =>
  value.replace(/["\\\\#.:,[\\]>+~*'()=\\s]/g, '\\\\$&');

const resolve${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}PatchValue = (
  keyframes: readonly { offset: number; value: number | string }[],
  progress: number
) => {
  if (!keyframes.length) return undefined;
  const clamped = Math.min(1, Math.max(0, progress));
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (clamped <= first.offset) return first.value;
  if (clamped >= last.offset) return last.value;

  let previous = first;
  let next = last;
  for (const keyframe of keyframes) {
    if (keyframe.offset <= clamped) previous = keyframe;
    if (keyframe.offset >= clamped) {
      next = keyframe;
      break;
    }
  }

  if (previous.offset === next.offset) return previous.value;
  if (typeof previous.value !== 'number' || typeof next.value !== 'number') {
    return previous.value;
  }
  const localProgress = (clamped - previous.offset) / (next.offset - previous.offset);
  return previous.value + (next.value - previous.value) * localProgress;
};

export const apply${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}SvgFilterPatches = (
  root: ParentNode,
  progress: number
) => {
  ${input.exportName}SvgFilterPatches.forEach((patch) => {
    const value = resolve${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}PatchValue(patch.keyframes, progress);
    if (value === undefined) return;
    const filterSelector = \`#\${escape${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}SelectorPart(patch.filterId)}\`;
    const primitiveSelector = escape${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}SelectorPart(patch.primitiveId);
    const primitive =
      root.querySelector(\`\${filterSelector} [data-prodivix-svg-primitive-id="\${patch.primitiveId.replace(/"/g, '\\\\"')}"]\`) ??
      root.querySelector(\`\${filterSelector} #\${primitiveSelector}\`);
    primitive?.setAttribute(patch.attr, String(value));
  });
};

export const create${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}Animations = (
  root: ParentNode
) => {
  const animations = ${input.exportName}Keyframes.flatMap((binding) => {
    const element = root.querySelector(binding.selector);
    if (!element) return [];
    return [
      element.animate(create${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}Keyframes(binding.keyframes), {
        duration: ${input.exportName}Timing.durationMs,
        delay: ${input.exportName}Timing.delayMs,
        iterations: ${input.exportName}Timing.iterations,
        direction: ${input.exportName}Timing.direction,
        fill: ${input.exportName}Timing.fillMode,
        easing: ${input.exportName}Timing.easing,
      }),
    ];
  });
  return animations.map((animation) => createAnimationHandle(animation));
};

export const create${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}Animation = (
  element: Element
) => createAnimationHandle(
  element.animate(create${input.exportName.charAt(0).toUpperCase()}${input.exportName.slice(1)}Keyframes(${input.exportName}Keyframes[0]?.keyframes ?? []), {
    duration: ${input.exportName}Timing.durationMs,
    delay: ${input.exportName}Timing.delayMs,
    iterations: ${input.exportName}Timing.iterations,
    direction: ${input.exportName}Timing.direction,
    fill: ${input.exportName}Timing.fillMode,
    easing: ${input.exportName}Timing.easing,
  })
);
`;
};

const createTimelineStyleContribution = (
  timeline: AnimationTimeline,
  index: number
): ExportStyleContribution | null => {
  if (
    !timeline.bindings.some((binding) =>
      binding.tracks.some((track) => track.kind === 'css-filter')
    )
  ) {
    return null;
  }
  const durationVar = `--prodivix-animation-${sanitizeCssIdentifier(timeline.id, `timeline-${index + 1}`)}-duration`;
  return {
    id: `animation-style:${timeline.id}`,
    ownerRootId: timeline.id,
    scope: 'component',
    suggestedName: toSafeExportIdentifier(
      timeline.name,
      `animation${index + 1}`
    ),
    cssText: `:root {\n  ${durationVar}: ${timeline.durationMs}ms;\n}\n`,
    orderHint: {
      group: 'animation',
      index,
    },
    sourceTrace: createTimelineSourceTrace(timeline, index),
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};

const createSvgFilterContribution = (
  svgFilters: SvgFilterDefinition[],
  timelines: AnimationTimeline[]
): ExportFileContribution[] => {
  if (!svgFilters.length || !timelines.some(hasSvgFilterTracks)) return [];
  return [
    {
      id: 'animation:svg-filters',
      desiredPath: 'animations/svg-filters.json',
      baseDirectory: 'source-root',
      kind: 'metadata',
      language: 'json',
      mimeType: 'application/json',
      importMode: 'copy-only',
      contents: `${JSON.stringify(svgFilters, null, 2)}\n`,
      sourceTrace: [
        {
          sourceRef: {
            domain: 'animation',
            id: 'svg-filters',
            path: '/animation/svgFilters',
          },
        },
      ],
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    },
  ];
};

export const compileAnimationExportContributions = (
  pirDoc: PIRDocument
): ExportProgramContribution[] => {
  const timelines = pirDoc.animation?.timelines ?? [];
  if (!timelines.length) return [];

  const modules: ExportModule[] = [];
  const styles: ExportStyleContribution[] = [];
  const runtimeRequirements: ExportRuntimeRequirement[] = [];

  timelines.forEach((timeline, index) => {
    const exportName = toSafeExportIdentifier(
      timeline.name,
      `animation${index + 1}`
    );
    const sourceTrace = createTimelineSourceTrace(timeline, index);
    const moduleId = `animation:${timeline.id}`;
    modules.push({
      id: moduleId,
      kind: 'animation-runtime',
      ownerRootId: timeline.id,
      suggestedName: exportName,
      language: 'ts',
      imports: [],
      body: createTimelineModuleBody({ exportName, timeline }),
      sourceTrace,
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    });
    const style = createTimelineStyleContribution(timeline, index);
    if (style) styles.push(style);
    runtimeRequirements.push({
      id: `animation-runtime:${timeline.id}`,
      kind: 'animation-runtime',
      ownerModuleId: moduleId,
      importName: 'createAnimationHandle',
      importKind: 'named',
      sourceTrace,
    });
  });

  return [
    {
      roots: timelines.map((timeline, index) => ({
        id: timeline.id,
        kind: 'animation',
        displayName: timeline.name,
        sourceRef: createTimelineSourceTrace(timeline, index)[0].sourceRef,
      })),
      modules,
      styles,
      files: createSvgFilterContribution(
        pirDoc.animation?.svgFilters ?? [],
        timelines
      ),
      runtimeRequirements,
    },
  ];
};
