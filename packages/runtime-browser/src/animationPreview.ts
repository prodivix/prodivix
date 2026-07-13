import {
  evaluateAnimationFrame,
  evaluateAnimationTimelineAtCursor,
} from '@prodivix/animation';
import type {
  AnimationFrame,
  AnimationTimeline,
  SvgFilterDefinition,
} from '@prodivix/animation';

export type AnimationPreviewSnapshot = {
  cssText: string;
  svgFilters: SvgFilterDefinition[];
};

const escapeCssAttributeValue = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\a ')
    .replaceAll('\r', '\\d ')
    .replaceAll('\f', '\\c ');

const projectFrame = (frame: AnimationFrame): AnimationPreviewSnapshot => {
  const rules: string[] = [];
  frame.stylesByNodeId.forEach((style, nodeId) => {
    const declarations: string[] = [];
    if (style.opacity !== undefined)
      declarations.push(`opacity:${style.opacity};`);
    if (style.color) declarations.push(`color:${style.color};`);
    if (style.transform) {
      declarations.push(`transform:${style.transform};`);
      declarations.push('transform-origin:center;');
    }
    if (style.filter) declarations.push(`filter:${style.filter};`);
    if (!declarations.length) return;
    rules.push(
      `[data-pir-node-id="${escapeCssAttributeValue(nodeId)}"] > * {${declarations.join('')}}`
    );
  });
  return { cssText: rules.join('\n'), svgFilters: frame.svgFilters };
};

export const buildAnimationPreviewSnapshot = ({
  timeline,
  cursorMs,
  svgFilters,
}: {
  timeline: AnimationTimeline | undefined;
  cursorMs: number;
  svgFilters: SvgFilterDefinition[];
}): AnimationPreviewSnapshot =>
  projectFrame(
    evaluateAnimationTimelineAtCursor({ timeline, cursorMs, svgFilters })
  );

export const buildAnimationPreviewSnapshotFromTimelines = ({
  timelines,
  globalMs,
  svgFilters,
}: {
  timelines: AnimationTimeline[];
  globalMs: number;
  svgFilters: SvgFilterDefinition[];
}): AnimationPreviewSnapshot =>
  projectFrame(evaluateAnimationFrame({ timelines, globalMs, svgFilters }));
