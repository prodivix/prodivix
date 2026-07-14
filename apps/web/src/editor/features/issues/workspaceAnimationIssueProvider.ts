import {
  CSS_FILTER_FUNCTIONS,
  STYLE_TRACK_PROPERTIES,
} from '@prodivix/animation';
import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
} from '@prodivix/diagnostics';
import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';

type UnknownRecord = Record<string, unknown>;

export type WorkspaceAnimationSource = Readonly<{
  document: WorkspaceDocument;
  definition: unknown;
  definitionPath: '';
  pirNodeIds: ReadonlySet<string>;
}>;

export type WorkspaceAnimationTrackLocation = Readonly<{
  documentId: string;
  timelineId: string;
  bindingId: string;
  trackId: string;
}>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const readPirNodeIds = (content: unknown): ReadonlySet<string> | undefined => {
  if (!isRecord(content) || !isRecord(content.ui)) return undefined;
  const graph = isRecord(content.ui.graph) ? content.ui.graph : undefined;
  if (!graph || !isRecord(graph.nodesById)) return undefined;
  return new Set(Object.keys(graph.nodesById));
};

export const listWorkspaceAnimationSources = (
  workspace: WorkspaceSnapshot
): WorkspaceAnimationSource[] =>
  Object.values(workspace.docsById)
    .sort((left, right) => compareText(left.id, right.id))
    .flatMap<WorkspaceAnimationSource>((document) => {
      if (document.type !== 'pir-animation') return [];
      const target = isRecord(document.content)
        ? document.content.target
        : undefined;
      const targetDocumentId =
        isRecord(target) &&
        target.kind === 'pir-document' &&
        typeof target.documentId === 'string'
          ? target.documentId
          : '';
      const targetDocument = workspace.docsById[targetDocumentId];
      const pirNodeIds =
        targetDocument &&
        (targetDocument.type === 'pir-page' ||
          targetDocument.type === 'pir-layout' ||
          targetDocument.type === 'pir-component')
          ? readPirNodeIds(targetDocument.content)
          : undefined;
      return [
        {
          document,
          definition: document.content,
          definitionPath: '' as const,
          pirNodeIds: pirNodeIds ?? new Set<string>(),
        },
      ];
    });

const documentTarget = (
  workspaceId: string,
  documentId: string
): DiagnosticTargetRef => ({ kind: 'document', workspaceId, documentId });

const trackTarget = (input: {
  workspaceId: string;
  documentId: string;
  timelineId: unknown;
  bindingId: unknown;
  trackId: unknown;
}): DiagnosticTargetRef =>
  typeof input.timelineId === 'string' &&
  input.timelineId.trim() &&
  typeof input.bindingId === 'string' &&
  input.bindingId.trim() &&
  typeof input.trackId === 'string' &&
  input.trackId.trim()
    ? {
        kind: 'animation-track',
        documentId: input.documentId,
        timelineId: input.timelineId,
        bindingId: input.bindingId,
        trackId: input.trackId,
      }
    : documentTarget(input.workspaceId, input.documentId);

const diagnostic = (input: {
  code:
    | 'ANI-1001'
    | 'ANI-1002'
    | 'ANI-2001'
    | 'ANI-3001'
    | 'ANI-3002'
    | 'ANI-4001'
    | 'ANI-9001';
  message: string;
  targetRef: DiagnosticTargetRef;
  path: string;
  meta?: Record<string, unknown>;
}): ProdivixDiagnostic => ({
  code: input.code,
  severity:
    input.code === 'ANI-3001' || input.code === 'ANI-4001'
      ? 'warning'
      : 'error',
  domain: 'animation',
  message: input.message,
  docsUrl: `/reference/diagnostics/${input.code.toLowerCase()}`,
  retryable: input.code === 'ANI-9001' ? true : undefined,
  targetRef: input.targetRef,
  meta: { path: input.path, ...input.meta },
});

const malformedDiagnostic = (input: {
  workspaceId: string;
  documentId: string;
  path: string;
}): ProdivixDiagnostic =>
  diagnostic({
    code: 'ANI-9001',
    message:
      'The animation definition contains a structure that cannot be analyzed.',
    targetRef: documentTarget(input.workspaceId, input.documentId),
    path: input.path,
    meta: { documentId: input.documentId, stage: 'timeline' },
  });

const collectTrackDiagnostics = (input: {
  workspaceId: string;
  documentId: string;
  definitionPath: string;
  timeline: UnknownRecord;
  timelineIndex: number;
  binding: UnknownRecord;
  bindingIndex: number;
  track: unknown;
  trackIndex: number;
  filterPrimitivesById: ReadonlyMap<string, ReadonlySet<string>>;
}): ProdivixDiagnostic[] => {
  const {
    workspaceId,
    documentId,
    definitionPath,
    timeline,
    timelineIndex,
    binding,
    bindingIndex,
    trackIndex,
  } = input;
  const basePath = `${definitionPath}/timelines/${timelineIndex}/bindings/${bindingIndex}`;
  if (!isRecord(input.track)) {
    return [
      malformedDiagnostic({
        workspaceId,
        documentId,
        path: `${basePath}/tracks/${trackIndex}`,
      }),
    ];
  }

  const track = input.track;
  const targetRef = trackTarget({
    workspaceId,
    documentId,
    timelineId: timeline.id,
    bindingId: binding.id,
    trackId: track.id,
  });
  const trackPath = `${basePath}/tracks/${trackIndex}`;
  const diagnostics: ProdivixDiagnostic[] = [];
  const styleProperties = STYLE_TRACK_PROPERTIES as readonly string[];
  const cssFilterFunctions = CSS_FILTER_FUNCTIONS as readonly string[];

  const supported =
    (track.kind === 'style' &&
      typeof track.property === 'string' &&
      styleProperties.includes(track.property)) ||
    (track.kind === 'css-filter' &&
      typeof track.fn === 'string' &&
      cssFilterFunctions.includes(track.fn)) ||
    track.kind === 'svg-filter-attr';
  if (!supported) {
    diagnostics.push(
      diagnostic({
        code: 'ANI-3001',
        message: 'The animation track uses an unsupported kind or property.',
        targetRef,
        path: `${trackPath}/${track.kind === 'style' ? 'property' : 'kind'}`,
        meta: {
          documentId,
          timelineId: timeline.id,
          trackId: track.id,
          stage: 'track',
        },
      })
    );
  }

  if (track.kind === 'svg-filter-attr') {
    const primitives =
      typeof track.filterId === 'string'
        ? input.filterPrimitivesById.get(track.filterId)
        : undefined;
    if (
      !primitives ||
      typeof track.primitiveId !== 'string' ||
      !primitives.has(track.primitiveId)
    ) {
      diagnostics.push(
        diagnostic({
          code: 'ANI-3002',
          message:
            'The animation track references an SVG filter primitive that does not exist.',
          targetRef,
          path: `${trackPath}/primitiveId`,
          meta: {
            documentId,
            timelineId: timeline.id,
            trackId: track.id,
            filterId: track.filterId,
            primitiveId: track.primitiveId,
            stage: 'track',
          },
        })
      );
    }
  }

  if (Array.isArray(track.keyframes)) {
    let previousAtMs: number | undefined;
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      const atMs = isRecord(keyframe) ? keyframe.atMs : undefined;
      if (
        typeof atMs === 'number' &&
        Number.isFinite(atMs) &&
        previousAtMs !== undefined &&
        atMs <= previousAtMs
      ) {
        diagnostics.push(
          diagnostic({
            code: 'ANI-4001',
            message: 'Animation keyframe times must be strictly increasing.',
            targetRef,
            path: `${trackPath}/keyframes/${keyframeIndex}/atMs`,
            meta: {
              documentId,
              timelineId: timeline.id,
              trackId: track.id,
              keyframeIndex,
              stage: 'keyframe',
            },
          })
        );
      }
      if (typeof atMs === 'number' && Number.isFinite(atMs)) {
        previousAtMs = atMs;
      }
    });
  }

  return diagnostics;
};

const readFilterPrimitives = (
  definition: UnknownRecord
): ReadonlyMap<string, ReadonlySet<string>> => {
  const result = new Map<string, ReadonlySet<string>>();
  if (!Array.isArray(definition.svgFilters)) return result;
  for (const filter of definition.svgFilters) {
    if (!isRecord(filter) || typeof filter.id !== 'string') continue;
    const primitiveIds = new Set<string>();
    if (Array.isArray(filter.primitives)) {
      for (const primitive of filter.primitives) {
        if (isRecord(primitive) && typeof primitive.id === 'string') {
          primitiveIds.add(primitive.id);
        }
      }
    }
    result.set(filter.id, primitiveIds);
  }
  return result;
};

const collectSourceDiagnostics = (
  workspaceId: string,
  source: WorkspaceAnimationSource
): ProdivixDiagnostic[] => {
  const { document, definitionPath } = source;
  if (
    !isRecord(source.definition) ||
    !Array.isArray(source.definition.timelines)
  ) {
    return [
      malformedDiagnostic({
        workspaceId,
        documentId: document.id,
        path: definitionPath || '/',
      }),
    ];
  }

  const definition = source.definition as UnknownRecord & {
    timelines: unknown[];
  };
  const filterPrimitivesById = readFilterPrimitives(definition);
  const seenTimelineIds = new Set<string>();
  const diagnostics: ProdivixDiagnostic[] = [];

  definition.timelines.forEach((timelineValue, timelineIndex) => {
    const timelinePath = `${definitionPath}/timelines/${timelineIndex}`;
    if (!isRecord(timelineValue)) {
      diagnostics.push(
        malformedDiagnostic({
          workspaceId,
          documentId: document.id,
          path: timelinePath,
        })
      );
      return;
    }
    const timeline = timelineValue;
    const timelineTarget = documentTarget(workspaceId, document.id);
    if (
      typeof timeline.durationMs !== 'number' ||
      !Number.isFinite(timeline.durationMs) ||
      timeline.durationMs <= 0
    ) {
      diagnostics.push(
        diagnostic({
          code: 'ANI-1001',
          message: 'Animation timeline duration must be greater than zero.',
          targetRef: timelineTarget,
          path: `${timelinePath}/durationMs`,
          meta: {
            documentId: document.id,
            timelineId: timeline.id,
            stage: 'timeline',
          },
        })
      );
    }

    if (typeof timeline.id === 'string' && timeline.id.trim()) {
      if (seenTimelineIds.has(timeline.id)) {
        diagnostics.push(
          diagnostic({
            code: 'ANI-1002',
            message: 'Animation timeline ids must be unique within a document.',
            targetRef: timelineTarget,
            path: `${timelinePath}/id`,
            meta: {
              documentId: document.id,
              timelineId: timeline.id,
              stage: 'timeline',
            },
          })
        );
      }
      seenTimelineIds.add(timeline.id);
    }

    if (!Array.isArray(timeline.bindings)) return;
    timeline.bindings.forEach((bindingValue, bindingIndex) => {
      if (!isRecord(bindingValue)) return;
      const bindingPath = `${timelinePath}/bindings/${bindingIndex}`;
      if (
        typeof bindingValue.targetNodeId !== 'string' ||
        !source.pirNodeIds.has(bindingValue.targetNodeId)
      ) {
        diagnostics.push(
          diagnostic({
            code: 'ANI-2001',
            message:
              'The animation binding target node does not exist in its target PIR document.',
            targetRef: timelineTarget,
            path: `${bindingPath}/targetNodeId`,
            meta: {
              documentId: document.id,
              timelineId: timeline.id,
              bindingId: bindingValue.id,
              targetNodeId: bindingValue.targetNodeId,
              stage: 'binding',
            },
          })
        );
      }

      if (!Array.isArray(bindingValue.tracks)) return;
      bindingValue.tracks.forEach((track, trackIndex) => {
        diagnostics.push(
          ...collectTrackDiagnostics({
            workspaceId,
            documentId: document.id,
            definitionPath,
            timeline,
            timelineIndex,
            binding: bindingValue,
            bindingIndex,
            track,
            trackIndex,
            filterPrimitivesById,
          })
        );
      });
    });
  });

  return diagnostics;
};

/** Validates persisted animation semantics before the editor normalizer repairs them. */
export const collectWorkspaceAnimationDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] =>
  listWorkspaceAnimationSources(workspace).flatMap((source) =>
    collectSourceDiagnostics(workspace.id, source)
  );

export const resolveWorkspaceAnimationTrackLocation = (
  workspace: WorkspaceSnapshot,
  target: Extract<DiagnosticTargetRef, { kind: 'animation-track' }>
): WorkspaceAnimationTrackLocation | null => {
  for (const source of listWorkspaceAnimationSources(workspace)) {
    if (source.document.id !== target.documentId) continue;
    if (
      !isRecord(source.definition) ||
      !Array.isArray(source.definition.timelines)
    ) {
      continue;
    }
    const timeline = source.definition.timelines.find(
      (candidate) => isRecord(candidate) && candidate.id === target.timelineId
    );
    if (!isRecord(timeline) || !Array.isArray(timeline.bindings)) continue;
    const binding = timeline.bindings.find(
      (candidate) => isRecord(candidate) && candidate.id === target.bindingId
    );
    if (!isRecord(binding) || !Array.isArray(binding.tracks)) continue;
    const track = binding.tracks.find(
      (candidate) => isRecord(candidate) && candidate.id === target.trackId
    );
    if (!track) continue;
    return {
      documentId: source.document.id,
      timelineId: target.timelineId,
      bindingId: target.bindingId,
      trackId: target.trackId,
    };
  }
  return null;
};
