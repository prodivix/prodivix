import type { AnimationTrack } from '@prodivix/animation';

export const TRACK_KINDS: AnimationTrack['kind'][] = [
  'style',
  'css-filter',
  'svg-filter-attr',
];

export const STYLE_PROPERTIES: Extract<
  AnimationTrack,
  { kind: 'style' }
>['property'][] = [
  'opacity',
  'transform.translateX',
  'transform.translateY',
  'transform.scale',
  'color',
];

export const CSS_FILTER_FNS: Extract<
  AnimationTrack,
  { kind: 'css-filter' }
>['fn'][] = [
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
];

export const CSS_FILTER_UNITS: NonNullable<
  Extract<AnimationTrack, { kind: 'css-filter' }>['unit']
>[] = ['px', '%', 'deg'];

export const SVG_UNITS = ['objectBoundingBox', 'userSpaceOnUse'] as const;

export const SVG_TYPES = [
  'feGaussianBlur',
  'feColorMatrix',
  'feComponentTransfer',
  'feOffset',
  'feBlend',
  'feMerge',
] as const;

export const isHexColor = (value: unknown) =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

export const getTrackTitle = (track: AnimationTrack) => {
  if (track.kind === 'style') return `style.${track.property}`;
  if (track.kind === 'css-filter') return `filter.${track.fn}`;
  return `svg.${track.filterId}.${track.primitiveId}.${track.attr}`;
};
