export const compareSemanticText = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const sortedUniqueSemanticText = <Value extends string>(
  values: readonly Value[] | undefined
): readonly Value[] | undefined => {
  if (!values) return undefined;
  return Object.freeze(Array.from(new Set(values)).sort(compareSemanticText));
};
