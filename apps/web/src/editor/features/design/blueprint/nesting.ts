const NON_NESTABLE_TYPE_LIST = [
  'input',
  'prodivixinput',
  'textarea',
  'prodivixtextarea',
  'button',
  'prodivixbutton',
  'prodivixbuttonlink',
  'prodivixheading',
  'prodivixtext',
  'prodivixparagraph',
] as const;

export const NON_NESTABLE_TYPES = new Set<string>(NON_NESTABLE_TYPE_LIST);

export const isNonNestableType = (type: string) =>
  NON_NESTABLE_TYPES.has(type.toLowerCase());
