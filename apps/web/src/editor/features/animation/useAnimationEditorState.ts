import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampMs,
  coerceKeyframeValueInput,
  createDefaultBinding,
  createDefaultSvgFilter,
  createDefaultSvgPrimitive,
  createDefaultTimeline,
  createDefaultTrack,
  createEmptyAnimationDefinition,
  hasAnySvgTrack,
  normalizeAnimationDefinition,
  normalizeKeyframeRows,
  reconcileSvgTrackReferences,
  resolveActiveTimelineId,
  resolveTrackFallbackValue,
  serializeAnimationDefinition,
  withEditorState,
  type AnimationBinding,
  type AnimationDefinition,
  type AnimationTimeline,
  type AnimationTrack,
  type SvgFilterDefinition,
} from '@prodivix/animation';
import { createBrowserAnimationIdFactory } from '@prodivix/runtime-browser';
import {
  selectActivePirDocumentRecord,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { materializePirRoot } from '@prodivix/pir';
import { collectNodeTargets } from './state/nodeTargetOptions';
import { useParams } from 'react-router';
import { useAuthStore } from '@/auth/useAuthStore';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { enqueueWorkspaceOperationOutboxAndDispatch } from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import {
  createWorkspacePirDocumentUpdateCommand,
  selectActivePirWorkspaceDocument,
} from '@prodivix/workspace';

type StyleTrackProperty = Extract<
  AnimationTrack,
  { kind: 'style' }
>['property'];
type CssFilterFn = Extract<AnimationTrack, { kind: 'css-filter' }>['fn'];
type CssFilterUnit = NonNullable<
  Extract<AnimationTrack, { kind: 'css-filter' }>['unit']
>;
type SvgFilterPrimitive = SvgFilterDefinition['primitives'][number];

const clampZoom = (value: number) =>
  Math.min(4, Math.max(0.2, Math.round(value * 100) / 100));

export const useAnimationEditorState = () => {
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const animationIdFactory = useRef(createBrowserAnimationIdFactory()).current;
  const activePirDocument = useEditorStore(selectActivePirDocumentRecord)!;
  const pirDoc = activePirDocument.content;
  const pirAnimation = useMemo(
    () => normalizeAnimationDefinition(pirDoc.animation),
    [pirDoc.animation]
  );
  const initialAnimation = useMemo(
    () => pirAnimation ?? createEmptyAnimationDefinition(),
    [pirAnimation]
  );
  const [animation, setAnimation] =
    useState<AnimationDefinition>(initialAnimation);
  const currentSignature = useMemo(
    () => serializeAnimationDefinition(animation),
    [animation]
  );
  const currentSignatureRef = useRef(currentSignature);
  const committedSignatureRef = useRef(currentSignature);
  const suppressNextPersistenceRef = useRef(false);
  const persistenceChainRef = useRef(Promise.resolve());

  useEffect(() => {
    currentSignatureRef.current = currentSignature;
  }, [currentSignature]);

  useEffect(() => {
    const nextAnimation = pirAnimation ?? createEmptyAnimationDefinition();
    const nextSignature = serializeAnimationDefinition(nextAnimation);
    if (nextSignature === currentSignatureRef.current) {
      committedSignatureRef.current = nextSignature;
      return;
    }

    if (nextSignature === committedSignatureRef.current) {
      return;
    }

    suppressNextPersistenceRef.current = true;
    setAnimation(nextAnimation);
    currentSignatureRef.current = nextSignature;
    committedSignatureRef.current = nextSignature;
  }, [pirAnimation]);

  useEffect(() => {
    if (suppressNextPersistenceRef.current) {
      suppressNextPersistenceRef.current = false;
      return;
    }
    if (currentSignature === committedSignatureRef.current) return;
    const localWorkspace = isLocalProjectId(projectId);
    if (!localWorkspace && !token) return;
    committedSignatureRef.current = currentSignature;
    const documentId = activePirDocument.id;
    persistenceChainRef.current = persistenceChainRef.current
      .then(async () => {
        const state = useEditorStore.getState();
        const workspace = state.workspace;
        if (!workspace) return;
        const document = selectActivePirWorkspaceDocument({
          ...workspace,
          activeDocumentId: documentId,
        });
        if (!document || document.id !== documentId) return;
        const before = document.content;
        const existingSignature = serializeAnimationDefinition(
          normalizeAnimationDefinition(before.animation)
        );
        if (existingSignature === currentSignature) return;
        const command = createWorkspacePirDocumentUpdateCommand({
          workspace: { ...workspace, activeDocumentId: documentId },
          before,
          after: { ...before, animation },
          commandId: createWorkspaceClientOperationId('animation'),
          namespace: 'core.animation',
          type: 'definition.update',
          domainHint: 'animation',
          mergeKey: 'animation-definition',
          label: 'Update animation',
        });
        if (!command) return;
        if (localWorkspace) {
          state.dispatchWorkspaceCommand(command);
          return;
        }
        const outcome = await enqueueWorkspaceOperationOutboxAndDispatch({
          workspace,
          operation: { kind: 'command', command },
        });
        if (outcome.status === 'rejected') {
          console.warn(
            '[animation] workspace operation rejected',
            outcome.message
          );
        }
      })
      .catch((error: unknown) => {
        console.warn('[animation] workspace operation failed', error);
      });
  }, [activePirDocument.id, animation, currentSignature, projectId, token]);

  const activeTimelineId = resolveActiveTimelineId(animation);
  const activeTimeline = useMemo(
    () =>
      animation.timelines.find((timeline) => timeline.id === activeTimelineId),
    [animation.timelines, activeTimelineId]
  );

  useEffect(() => {
    const hasActive = Boolean(
      activeTimelineId &&
      animation.timelines.some((timeline) => timeline.id === activeTimelineId)
    );
    if (hasActive) return;
    const fallbackId = animation.timelines[0]?.id;
    setAnimation((prev) => {
      if (!fallbackId && !prev['x-animationEditor']?.activeTimelineId) {
        return prev;
      }
      return {
        ...prev,
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            if (fallbackId) {
              nextState.activeTimelineId = fallbackId;
            } else {
              delete nextState.activeTimelineId;
            }
          }
        ),
      };
    });
  }, [activeTimelineId, animation.timelines]);

  const nodeTargetOptions = useMemo(
    () => collectNodeTargets(materializePirRoot(pirDoc)),
    [pirDoc]
  );
  const svgFilters = animation.svgFilters ?? [];
  const expandedTrackIds =
    animation['x-animationEditor']?.expandedTrackIds ?? [];
  const expandedTrackIdSet = useMemo(
    () => new Set(expandedTrackIds),
    [expandedTrackIds]
  );

  const updateActiveTimeline = useCallback(
    (updater: (timeline: AnimationTimeline) => AnimationTimeline) => {
      if (!activeTimelineId) return;
      setAnimation((prev) => {
        let changed = false;
        const nextTimelines = prev.timelines.map((timeline) => {
          if (timeline.id !== activeTimelineId) return timeline;
          const nextTimeline = updater(timeline);
          if (nextTimeline === timeline) return timeline;
          changed = true;
          return nextTimeline;
        });
        if (!changed) return prev;
        return {
          ...prev,
          timelines: nextTimelines,
        };
      });
    },
    [activeTimelineId]
  );

  const updateBindingById = useCallback(
    (
      bindingId: string,
      updater: (binding: AnimationBinding) => AnimationBinding
    ) => {
      updateActiveTimeline((timeline) => {
        let changed = false;
        const nextBindings = timeline.bindings.map((binding) => {
          if (binding.id !== bindingId) return binding;
          const nextBinding = updater(binding);
          if (nextBinding === binding) return binding;
          changed = true;
          return nextBinding;
        });
        if (!changed) return timeline;
        return {
          ...timeline,
          bindings: nextBindings,
        };
      });
    },
    [updateActiveTimeline]
  );

  const updateTrackById = useCallback(
    (
      bindingId: string,
      trackId: string,
      updater: (track: AnimationTrack) => AnimationTrack
    ) => {
      updateBindingById(bindingId, (binding) => {
        let changed = false;
        const nextTracks = binding.tracks.map((track) => {
          if (track.id !== trackId) return track;
          const nextTrack = updater(track);
          if (nextTrack === track) return track;
          changed = true;
          return nextTrack;
        });
        if (!changed) return binding;
        return {
          ...binding,
          tracks: nextTracks,
        };
      });
    },
    [updateBindingById]
  );

  const selectTimeline = useCallback((timelineId: string) => {
    setAnimation((prev) => {
      if (prev['x-animationEditor']?.activeTimelineId === timelineId)
        return prev;
      return {
        ...prev,
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            nextState.activeTimelineId = timelineId;
          }
        ),
      };
    });
  }, []);

  const addTimeline = useCallback(() => {
    setAnimation((prev) => {
      const nextTimeline = createDefaultTimeline({
        idFactory: animationIdFactory,
        index: prev.timelines.length,
      });
      return {
        ...prev,
        timelines: [...prev.timelines, nextTimeline],
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            nextState.activeTimelineId = nextTimeline.id;
          }
        ),
      };
    });
  }, []);

  const deleteTimeline = useCallback((timelineId: string) => {
    setAnimation((prev) => {
      const nextTimelines = prev.timelines.filter(
        (timeline) => timeline.id !== timelineId
      );
      if (nextTimelines.length === prev.timelines.length) return prev;
      const currentActive = prev['x-animationEditor']?.activeTimelineId;
      const nextActive =
        currentActive === timelineId ? nextTimelines[0]?.id : currentActive;
      return {
        ...prev,
        timelines: nextTimelines,
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            if (nextActive) {
              nextState.activeTimelineId = nextActive;
            } else {
              delete nextState.activeTimelineId;
            }
          }
        ),
      };
    });
  }, []);

  const updateActiveTimelineName = useCallback(
    (name: string) => {
      updateActiveTimeline((timeline) =>
        timeline.name === name
          ? timeline
          : {
              ...timeline,
              name,
            }
      );
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineDuration = useCallback(
    (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return;
      const nextDuration = Math.max(1, parsed);
      updateActiveTimeline((timeline) => {
        if (timeline.durationMs === nextDuration) return timeline;
        return {
          ...timeline,
          durationMs: nextDuration,
          bindings: timeline.bindings.map((binding) => ({
            ...binding,
            tracks: binding.tracks.map((track) => ({
              ...track,
              keyframes: normalizeKeyframeRows(
                track,
                track.keyframes,
                nextDuration
              ),
            })),
          })),
        };
      });
      setCursorDraftMs((prev) => clampMs(prev, nextDuration));
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineDelayMs = useCallback(
    (rawMs: string) => {
      const parsed = Number.parseInt(rawMs, 10);
      if (!Number.isFinite(parsed)) return;
      const nextDelayMs = Math.max(0, parsed);
      updateActiveTimeline((timeline) =>
        (timeline.delayMs ?? 0) === nextDelayMs
          ? timeline
          : {
              ...timeline,
              delayMs: nextDelayMs,
            }
      );
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineIterations = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      updateActiveTimeline((timeline) => {
        if (!trimmed) {
          if (timeline.iterations === undefined) return timeline;
          const { iterations: _dropped, ...rest } = timeline;
          return rest;
        }
        if (trimmed === 'infinite') {
          return timeline.iterations === 'infinite'
            ? timeline
            : {
                ...timeline,
                iterations: 'infinite',
              };
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return timeline;
        return timeline.iterations === parsed
          ? timeline
          : {
              ...timeline,
              iterations: parsed,
            };
      });
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineDirection = useCallback(
    (direction: AnimationTimeline['direction'] | undefined) => {
      updateActiveTimeline((timeline) => {
        if (!direction) {
          if (!timeline.direction) return timeline;
          const { direction: _dropped, ...rest } = timeline;
          return rest;
        }
        return timeline.direction === direction
          ? timeline
          : {
              ...timeline,
              direction,
            };
      });
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineFillMode = useCallback(
    (fillMode: AnimationTimeline['fillMode'] | undefined) => {
      updateActiveTimeline((timeline) => {
        if (!fillMode) {
          if (!timeline.fillMode) return timeline;
          const { fillMode: _dropped, ...rest } = timeline;
          return rest;
        }
        return timeline.fillMode === fillMode
          ? timeline
          : {
              ...timeline,
              fillMode,
            };
      });
    },
    [updateActiveTimeline]
  );

  const updateActiveTimelineEasing = useCallback(
    (easing: string) => {
      updateActiveTimeline((timeline) => {
        const trimmed = easing.trim();
        if (!trimmed) {
          if (!timeline.easing) return timeline;
          const { easing: _dropped, ...rest } = timeline;
          return rest;
        }
        return timeline.easing === trimmed
          ? timeline
          : {
              ...timeline,
              easing: trimmed,
            };
      });
    },
    [updateActiveTimeline]
  );

  const [cursorDraftMs, setCursorDraftMs] = useState(() => {
    const initialCursor = animation['x-animationEditor']?.cursorMs;
    if (typeof initialCursor !== 'number' || !Number.isFinite(initialCursor)) {
      return 0;
    }
    return Math.max(0, Math.round(initialCursor));
  });
  const [zoom, setZoomState] = useState(() => {
    const rawZoom = animation['x-animationEditor']?.zoom;
    if (
      typeof rawZoom !== 'number' ||
      !Number.isFinite(rawZoom) ||
      rawZoom <= 0
    ) {
      return 1;
    }
    return clampZoom(rawZoom);
  });

  useEffect(() => {
    if (!activeTimeline) {
      setCursorDraftMs((prev) => (prev === 0 ? prev : 0));
      return;
    }
    setCursorDraftMs((prev) => clampMs(prev, activeTimeline.durationMs));
  }, [activeTimeline?.id, activeTimeline?.durationMs]);

  const cursorMs = activeTimeline
    ? clampMs(cursorDraftMs, activeTimeline.durationMs)
    : 0;

  const setCursorMs = useCallback(
    (value: number) => {
      if (!activeTimeline) return;
      setCursorDraftMs((prev) => {
        const clamped = clampMs(value, activeTimeline.durationMs);
        return prev === clamped ? prev : clamped;
      });
    },
    [activeTimeline]
  );

  const setZoom = useCallback((nextZoom: number) => {
    const sanitized =
      typeof nextZoom === 'number' && Number.isFinite(nextZoom) && nextZoom > 0
        ? clampZoom(nextZoom)
        : 1;
    setZoomState((prev) => {
      return prev === sanitized ? prev : sanitized;
    });
  }, []);

  const setTrackExpanded = useCallback((trackId: string, expanded: boolean) => {
    setAnimation((prev) => {
      const nextTrackIds = new Set(
        prev['x-animationEditor']?.expandedTrackIds ?? []
      );
      if (expanded) {
        nextTrackIds.add(trackId);
      } else {
        nextTrackIds.delete(trackId);
      }
      const serializedNext = Array.from(nextTrackIds);
      const serializedCurrent =
        prev['x-animationEditor']?.expandedTrackIds ?? [];
      if (
        serializedCurrent.length === serializedNext.length &&
        serializedCurrent.every((item) => nextTrackIds.has(item))
      ) {
        return prev;
      }
      return {
        ...prev,
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            if (serializedNext.length) {
              nextState.expandedTrackIds = serializedNext;
            } else {
              delete nextState.expandedTrackIds;
            }
          }
        ),
      };
    });
  }, []);

  const toggleTrackExpanded = useCallback((trackId: string) => {
    setAnimation((prev) => {
      const nextTrackIds = new Set(
        prev['x-animationEditor']?.expandedTrackIds ?? []
      );
      if (nextTrackIds.has(trackId)) {
        nextTrackIds.delete(trackId);
      } else {
        nextTrackIds.add(trackId);
      }
      const serializedNext = Array.from(nextTrackIds);
      return {
        ...prev,
        'x-animationEditor': withEditorState(
          prev['x-animationEditor'],
          (nextState) => {
            if (serializedNext.length) {
              nextState.expandedTrackIds = serializedNext;
            } else {
              delete nextState.expandedTrackIds;
            }
          }
        ),
      };
    });
  }, []);

  const addBinding = useCallback((): string | null => {
    if (!activeTimeline) return null;
    const defaultTargetNodeId = nodeTargetOptions[0]?.id ?? 'root';
    let createdId: string | null = null;
    updateActiveTimeline((timeline) => {
      const nextBinding = createDefaultBinding({
        idFactory: animationIdFactory,
        targetNodeId: defaultTargetNodeId,
      });
      createdId = nextBinding.id;
      return {
        ...timeline,
        bindings: [...timeline.bindings, nextBinding],
      };
    });
    return createdId;
  }, [activeTimeline, nodeTargetOptions, updateActiveTimeline]);

  const deleteBinding = useCallback(
    (bindingId: string) => {
      updateActiveTimeline((timeline) => {
        const nextBindings = timeline.bindings.filter(
          (binding) => binding.id !== bindingId
        );
        if (nextBindings.length === timeline.bindings.length) return timeline;
        return {
          ...timeline,
          bindings: nextBindings,
        };
      });
    },
    [updateActiveTimeline]
  );

  const updateBindingTarget = useCallback(
    (bindingId: string, targetNodeId: string) => {
      const nextTarget = targetNodeId.trim();
      if (!nextTarget) return;
      updateBindingById(bindingId, (binding) =>
        binding.targetNodeId === nextTarget
          ? binding
          : {
              ...binding,
              targetNodeId: nextTarget,
            }
      );
    },
    [updateBindingById]
  );

  const addTrack = useCallback(
    (bindingId: string, kind: AnimationTrack['kind']): string | null => {
      if (!activeTimeline) return null;
      const nextTrack = createDefaultTrack({
        idFactory: animationIdFactory,
        kind,
        durationMs: activeTimeline.durationMs,
        svgFilters,
      });
      updateBindingById(bindingId, (binding) => ({
        ...binding,
        tracks: [...binding.tracks, nextTrack],
      }));
      setTrackExpanded(nextTrack.id, true);
      return nextTrack.id;
    },
    [activeTimeline, setTrackExpanded, svgFilters, updateBindingById]
  );

  const deleteTrack = useCallback(
    (bindingId: string, trackId: string) => {
      updateBindingById(bindingId, (binding) => {
        const nextTracks = binding.tracks.filter(
          (track) => track.id !== trackId
        );
        if (nextTracks.length === binding.tracks.length) return binding;
        return {
          ...binding,
          tracks: nextTracks,
        };
      });
      setTrackExpanded(trackId, false);
    },
    [setTrackExpanded, updateBindingById]
  );

  const updateTrackKind = useCallback(
    (bindingId: string, trackId: string, kind: AnimationTrack['kind']) => {
      if (!activeTimeline) return;
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind === kind) return track;
        const nextTrack = createDefaultTrack({
          idFactory: animationIdFactory,
          kind,
          durationMs: activeTimeline.durationMs,
          svgFilters,
        });
        nextTrack.id = track.id;
        return nextTrack;
      });
    },
    [activeTimeline, svgFilters, updateTrackById]
  );

  const updateStyleTrackProperty = useCallback(
    (bindingId: string, trackId: string, property: StyleTrackProperty) => {
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'style') return track;
        if (track.property === property) return track;
        return {
          ...track,
          property,
        };
      });
    },
    [updateTrackById]
  );

  const updateCssTrackFn = useCallback(
    (bindingId: string, trackId: string, fn: CssFilterFn) => {
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'css-filter') return track;
        const nextUnit: CssFilterUnit =
          fn === 'hue-rotate' ? 'deg' : fn === 'blur' ? 'px' : '%';
        if (track.fn === fn && track.unit === nextUnit) return track;
        return {
          ...track,
          fn,
          unit: nextUnit,
        };
      });
    },
    [updateTrackById]
  );

  const updateCssTrackUnit = useCallback(
    (bindingId: string, trackId: string, unit: CssFilterUnit) => {
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'css-filter') return track;
        if (track.unit === unit) return track;
        return {
          ...track,
          unit,
        };
      });
    },
    [updateTrackById]
  );

  const updateSvgTrackFilter = useCallback(
    (bindingId: string, trackId: string, filterId: string) => {
      const nextFilterId = filterId.trim();
      if (!nextFilterId) return;
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'svg-filter-attr') return track;
        const matchedFilter =
          svgFilters.find((filter) => filter.id === nextFilterId) ??
          svgFilters[0];
        const nextPrimitiveId =
          matchedFilter?.primitives[0]?.id ?? track.primitiveId;
        if (
          track.filterId === nextFilterId &&
          track.primitiveId === nextPrimitiveId
        ) {
          return track;
        }
        return {
          ...track,
          filterId: nextFilterId,
          primitiveId: nextPrimitiveId,
        };
      });
    },
    [svgFilters, updateTrackById]
  );

  const updateSvgTrackPrimitive = useCallback(
    (bindingId: string, trackId: string, primitiveId: string) => {
      const nextPrimitiveId = primitiveId.trim();
      if (!nextPrimitiveId) return;
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'svg-filter-attr') return track;
        if (track.primitiveId === nextPrimitiveId) return track;
        return {
          ...track,
          primitiveId: nextPrimitiveId,
        };
      });
    },
    [updateTrackById]
  );

  const updateSvgTrackAttr = useCallback(
    (bindingId: string, trackId: string, attr: string) => {
      const nextAttr = attr.trim();
      if (!nextAttr) return;
      updateTrackById(bindingId, trackId, (track) => {
        if (track.kind !== 'svg-filter-attr') return track;
        if (track.attr === nextAttr) return track;
        return {
          ...track,
          attr: nextAttr,
        };
      });
    },
    [updateTrackById]
  );

  const addKeyframe = useCallback(
    (bindingId: string, trackId: string) => {
      if (!activeTimeline) return;
      updateTrackById(bindingId, trackId, (track) => {
        const occupied = new Set(
          track.keyframes.map((keyframe) => keyframe.atMs)
        );
        let atMs = clampMs(cursorMs, activeTimeline.durationMs);
        while (occupied.has(atMs) && atMs < activeTimeline.durationMs) {
          atMs += 1;
        }
        while (occupied.has(atMs) && atMs > 0) {
          atMs -= 1;
        }
        const nearest = [...track.keyframes].sort(
          (a, b) => Math.abs(a.atMs - atMs) - Math.abs(b.atMs - atMs)
        )[0]?.value;
        const fallbackValue = nearest ?? resolveTrackFallbackValue(track);
        return {
          ...track,
          keyframes: normalizeKeyframeRows(
            track,
            [...track.keyframes, { atMs, value: fallbackValue }],
            activeTimeline.durationMs
          ),
        };
      });
    },
    [activeTimeline, cursorMs, updateTrackById]
  );

  const deleteKeyframe = useCallback(
    (bindingId: string, trackId: string, index: number) => {
      updateTrackById(bindingId, trackId, (track) => {
        if (track.keyframes.length <= 1) return track;
        const nextKeyframes = track.keyframes.filter((_, itemIndex) => {
          return itemIndex !== index;
        });
        if (nextKeyframes.length === track.keyframes.length) return track;
        const durationMs = activeTimeline?.durationMs ?? 1000;
        return {
          ...track,
          keyframes: normalizeKeyframeRows(track, nextKeyframes, durationMs),
        };
      });
    },
    [activeTimeline?.durationMs, updateTrackById]
  );

  const updateKeyframeAtMs = useCallback(
    (bindingId: string, trackId: string, index: number, rawMs: string) => {
      const parsed = Number.parseInt(rawMs, 10);
      if (!Number.isFinite(parsed) || !activeTimeline) return;
      updateTrackById(bindingId, trackId, (track) => {
        if (!track.keyframes[index]) return track;
        const nextRows = track.keyframes.map((keyframe, itemIndex) =>
          itemIndex === index
            ? {
                ...keyframe,
                atMs: clampMs(parsed, activeTimeline.durationMs),
              }
            : keyframe
        );
        return {
          ...track,
          keyframes: normalizeKeyframeRows(
            track,
            nextRows,
            activeTimeline.durationMs
          ),
        };
      });
    },
    [activeTimeline, updateTrackById]
  );

  const updateKeyframeValue = useCallback(
    (bindingId: string, trackId: string, index: number, rawValue: string) => {
      updateTrackById(bindingId, trackId, (track) => {
        const current = track.keyframes[index];
        if (!current) return track;
        const nextValue = coerceKeyframeValueInput(
          track,
          rawValue,
          current.value
        );
        if (nextValue === current.value) return track;
        const nextRows = track.keyframes.map((keyframe, itemIndex) =>
          itemIndex === index
            ? {
                ...keyframe,
                value: nextValue,
              }
            : keyframe
        );
        const durationMs = activeTimeline?.durationMs ?? 1000;
        return {
          ...track,
          keyframes: normalizeKeyframeRows(track, nextRows, durationMs),
        };
      });
    },
    [activeTimeline?.durationMs, updateTrackById]
  );

  const updateKeyframeEasing = useCallback(
    (bindingId: string, trackId: string, index: number, easing: string) => {
      updateTrackById(bindingId, trackId, (track) => {
        const current = track.keyframes[index];
        if (!current) return track;
        const trimmed = easing.trim();
        const nextRows = track.keyframes.map((keyframe, itemIndex) => {
          if (itemIndex !== index) return keyframe;
          if (!trimmed) {
            if (!keyframe.easing) return keyframe;
            const { easing: _dropped, ...rest } = keyframe;
            return rest;
          }
          if (keyframe.easing === trimmed) return keyframe;
          return {
            ...keyframe,
            easing: trimmed,
          };
        });
        return {
          ...track,
          keyframes: nextRows,
        };
      });
    },
    [updateTrackById]
  );

  const updateKeyframeHold = useCallback(
    (bindingId: string, trackId: string, index: number, hold: boolean) => {
      updateTrackById(bindingId, trackId, (track) => {
        const current = track.keyframes[index];
        if (!current) return track;
        if (Boolean(current.hold) === hold) return track;
        const nextRows = track.keyframes.map((keyframe, itemIndex) => {
          if (itemIndex !== index) return keyframe;
          if (!hold) {
            const { hold: _dropped, ...rest } = keyframe;
            return rest;
          }
          return {
            ...keyframe,
            hold: true,
          };
        });
        return {
          ...track,
          keyframes: nextRows,
        };
      });
    },
    [updateTrackById]
  );

  const addSvgFilter = useCallback(() => {
    setAnimation((prev) => {
      const nextFilters = [
        ...(prev.svgFilters ?? []),
        createDefaultSvgFilter({ idFactory: animationIdFactory }),
      ];
      return {
        ...prev,
        svgFilters: nextFilters,
      };
    });
  }, []);

  const deleteSvgFilter = useCallback((filterId: string) => {
    setAnimation((prev) => {
      const currentFilters = prev.svgFilters ?? [];
      const nextFilters = currentFilters.filter(
        (filter) => filter.id !== filterId
      );
      if (nextFilters.length === currentFilters.length) return prev;
      if (!nextFilters.length && hasAnySvgTrack(prev.timelines)) {
        return prev;
      }
      return {
        ...prev,
        svgFilters: nextFilters.length ? nextFilters : undefined,
        timelines: reconcileSvgTrackReferences(prev.timelines, nextFilters),
      };
    });
  }, []);

  const updateSvgFilterUnits = useCallback(
    (
      filterId: string,
      units: NonNullable<SvgFilterDefinition['units']> | undefined
    ) => {
      setAnimation((prev) => {
        const nextFilters = (prev.svgFilters ?? []).map((filter) => {
          if (filter.id !== filterId) return filter;
          if (filter.units === units) return filter;
          if (!units) {
            const { units: _dropped, ...rest } = filter;
            return rest;
          }
          return {
            ...filter,
            units,
          };
        });
        if (!nextFilters.length) return prev;
        return {
          ...prev,
          svgFilters: nextFilters,
        };
      });
    },
    []
  );

  const addSvgPrimitive = useCallback((filterId: string) => {
    setAnimation((prev) => {
      let changed = false;
      const nextFilters = (prev.svgFilters ?? []).map((filter) => {
        if (filter.id !== filterId) return filter;
        changed = true;
        return {
          ...filter,
          primitives: [
            ...filter.primitives,
            createDefaultSvgPrimitive({ idFactory: animationIdFactory }),
          ],
        };
      });
      if (!changed) return prev;
      return {
        ...prev,
        svgFilters: nextFilters,
      };
    });
  }, []);

  const deleteSvgPrimitive = useCallback(
    (filterId: string, primitiveId: string) => {
      setAnimation((prev) => {
        let changed = false;
        const nextFilters = (prev.svgFilters ?? []).map((filter) => {
          if (filter.id !== filterId) return filter;
          if (filter.primitives.length <= 1) return filter;
          const nextPrimitives = filter.primitives.filter(
            (primitive) => primitive.id !== primitiveId
          );
          if (nextPrimitives.length === filter.primitives.length) return filter;
          changed = true;
          return {
            ...filter,
            primitives: nextPrimitives,
          };
        });
        if (!changed) return prev;
        return {
          ...prev,
          svgFilters: nextFilters,
          timelines: reconcileSvgTrackReferences(prev.timelines, nextFilters),
        };
      });
    },
    []
  );

  const updateSvgPrimitiveType = useCallback(
    (
      filterId: string,
      primitiveId: string,
      type: SvgFilterPrimitive['type']
    ) => {
      setAnimation((prev) => {
        let changed = false;
        const nextFilters = (prev.svgFilters ?? []).map((filter) => {
          if (filter.id !== filterId) return filter;
          const nextPrimitives = filter.primitives.map((primitive) => {
            if (primitive.id !== primitiveId) return primitive;
            if (primitive.type === type) return primitive;
            changed = true;
            return {
              ...primitive,
              type,
            };
          });
          return changed
            ? {
                ...filter,
                primitives: nextPrimitives,
              }
            : filter;
        });
        if (!changed) return prev;
        return {
          ...prev,
          svgFilters: nextFilters,
        };
      });
    },
    []
  );

  const activeTimelineDisplayName =
    activeTimeline?.name.trim() || 'Untitled timeline';
  const canRemoveSvgFilter =
    (svgFilters.length > 1 && svgFilters.length > 0) ||
    !hasAnySvgTrack(animation.timelines);

  return {
    animation,
    setAnimation,
    pirDoc,
    pirAnimation,
    initialAnimation,
    currentSignature,
    currentSignatureRef,
    committedSignatureRef,
    activeTimelineId,
    activeTimeline,
    nodeTargetOptions,
    svgFilters,
    expandedTrackIds,
    expandedTrackIdSet,
    updateActiveTimeline,
    updateBindingById,
    updateTrackById,
    selectTimeline,
    addTimeline,
    deleteTimeline,
    updateActiveTimelineName,
    updateActiveTimelineDuration,
    updateActiveTimelineDelayMs,
    updateActiveTimelineIterations,
    updateActiveTimelineDirection,
    updateActiveTimelineFillMode,
    updateActiveTimelineEasing,
    cursorMs,
    setCursorMs,
    zoom,
    setZoom,
    setTrackExpanded,
    toggleTrackExpanded,
    addBinding,
    deleteBinding,
    updateBindingTarget,
    addTrack,
    deleteTrack,
    updateTrackKind,
    updateStyleTrackProperty,
    updateCssTrackFn,
    updateCssTrackUnit,
    updateSvgTrackFilter,
    updateSvgTrackPrimitive,
    updateSvgTrackAttr,
    addKeyframe,
    deleteKeyframe,
    updateKeyframeAtMs,
    updateKeyframeValue,
    updateKeyframeEasing,
    updateKeyframeHold,
    addSvgFilter,
    deleteSvgFilter,
    updateSvgFilterUnits,
    addSvgPrimitive,
    deleteSvgPrimitive,
    updateSvgPrimitiveType,
    activeTimelineDisplayName,
    canRemoveSvgFilter,
  };
};
