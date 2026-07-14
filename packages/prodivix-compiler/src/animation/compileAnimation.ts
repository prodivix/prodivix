import type {
  AnimationDefinition,
  AnimationTimeline,
  AnimationTrack,
  SvgFilterDefinition,
} from '@prodivix/animation';
import {
  resolveCssFilterUnit,
  resolveKeyframedValue as resolveAnimationKeyframedValue,
} from '@prodivix/animation';
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
  documentId: string,
  index: number
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'animation',
      id: documentId,
      path: `/timelines/${index}`,
    },
    ownerRootId: documentId,
  },
];

const sanitizeCssIdentifier = (value: string, fallback: string) => {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
};

const escapeSelectorValue = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

const createNodeSelector = (documentId: string, nodeId: string) =>
  `[data-pir-document-id="${escapeSelectorValue(documentId)}"][data-pir-node-id="${escapeSelectorValue(nodeId)}"]`;

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

const resolveKeyframedValue = (
  keyframes: AnimationTrack['keyframes'],
  atMs: number
) =>
  keyframes.length
    ? resolveAnimationKeyframedValue(
        [...keyframes].sort((left, right) => left.atMs - right.atMs),
        atMs
      )
    : undefined;

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
      return `${track.fn}(${value}${track.unit ?? resolveCssFilterUnit(track.fn)})`;
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

const buildTimelineKeyframeManifest = (
  timeline: AnimationTimeline,
  targetDocumentId: string
) => {
  const offsets = collectTimelineOffsets(timeline);
  return timeline.bindings
    .map((binding) => ({
      bindingId: binding.id,
      targetNodeId: binding.targetNodeId,
      selector: createNodeSelector(targetDocumentId, binding.targetNodeId),
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
  targetDocumentId: string;
}) => {
  const keyframeManifest = buildTimelineKeyframeManifest(
    input.timeline,
    input.targetDocumentId
  );
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
  documentId: string,
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
    id: `animation-style:${documentId}:${timeline.id}`,
    ownerRootId: documentId,
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
    sourceTrace: createTimelineSourceTrace(documentId, index),
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};

const createSvgFilterContribution = (
  documentId: string,
  svgFilters: SvgFilterDefinition[],
  timelines: AnimationTimeline[]
): ExportFileContribution[] => {
  if (!svgFilters.length || !timelines.some(hasSvgFilterTracks)) return [];
  return [
    {
      id: `animation:${documentId}:svg-filters`,
      desiredPath: `animations/${sanitizeCssIdentifier(documentId, 'animation')}-svg-filters.json`,
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
            id: documentId,
            path: '/svgFilters',
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

export type CompileAnimationExportInput = Readonly<{
  documentId: string;
  displayName?: string;
  definition: AnimationDefinition;
}>;

export const compileAnimationExportContributions = (
  input: CompileAnimationExportInput
): ExportProgramContribution[] => {
  const definition = input.definition;
  const timelines = definition.timelines;
  if (!timelines.length) return [];

  const modules: ExportModule[] = [];
  const styles: ExportStyleContribution[] = [];
  const runtimeRequirements: ExportRuntimeRequirement[] = [];

  timelines.forEach((timeline, index) => {
    const exportName = toSafeExportIdentifier(
      timeline.name,
      `animation${index + 1}`
    );
    const sourceTrace = createTimelineSourceTrace(input.documentId, index);
    const moduleId = `animation:${input.documentId}:${timeline.id}`;
    modules.push({
      id: moduleId,
      kind: 'animation-runtime',
      ownerRootId: input.documentId,
      suggestedName: exportName,
      language: 'ts',
      imports: [],
      body: createTimelineModuleBody({
        exportName,
        timeline,
        targetDocumentId: definition.target.documentId,
      }),
      sourceTrace,
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    });
    const style = createTimelineStyleContribution(
      input.documentId,
      timeline,
      index
    );
    if (style) styles.push(style);
    runtimeRequirements.push({
      id: `animation-runtime:${input.documentId}:${timeline.id}`,
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
        id: `${input.documentId}:${timeline.id}`,
        kind: 'animation',
        displayName: timeline.name,
        sourceRef: createTimelineSourceTrace(input.documentId, index)[0]
          .sourceRef,
      })),
      modules,
      styles,
      files: createSvgFilterContribution(
        input.documentId,
        definition.svgFilters ?? [],
        timelines
      ),
      runtimeRequirements,
    },
  ];
};
