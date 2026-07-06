export const CSS_ABSOLUTE_LENGTH_UNITS = [
  'px',
  'cm',
  'mm',
  'Q',
  'in',
  'pt',
  'pc',
] as const;

export const CSS_FONT_RELATIVE_LENGTH_UNITS = [
  'em',
  'rem',
  'ex',
  'rex',
  'cap',
  'rcap',
  'ch',
  'rch',
  'ic',
  'ric',
  'lh',
  'rlh',
] as const;

export const CSS_VIEWPORT_LENGTH_UNITS = [
  'vw',
  'vh',
  'vi',
  'vb',
  'vmin',
  'vmax',
  'svw',
  'svh',
  'svi',
  'svb',
  'lvw',
  'lvh',
  'lvi',
  'lvb',
  'dvw',
  'dvh',
  'dvi',
  'dvb',
] as const;

export const CSS_CONTAINER_LENGTH_UNITS = [
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
] as const;

export const CSS_PERCENTAGE_UNIT = '%' as const;

export const CSS_LENGTH_UNITS = [
  ...CSS_ABSOLUTE_LENGTH_UNITS,
  ...CSS_FONT_RELATIVE_LENGTH_UNITS,
  ...CSS_VIEWPORT_LENGTH_UNITS,
  ...CSS_CONTAINER_LENGTH_UNITS,
] as const;

export const CSS_LENGTH_OR_PERCENTAGE_UNITS = [
  ...CSS_LENGTH_UNITS,
  CSS_PERCENTAGE_UNIT,
] as const;

export type CssLengthUnit = (typeof CSS_LENGTH_UNITS)[number];
export type CssLengthOrPercentageUnit =
  (typeof CSS_LENGTH_OR_PERCENTAGE_UNITS)[number];
