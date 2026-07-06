export type LayoutGroupExpansionState = Record<string, boolean>;

const BUILTIN_DEFAULT_KEYS = [
  'spacing',
  'size',
  'appearance',
  'flex',
  'grid',
] as const;

const DEFAULT_EXPANDED: LayoutGroupExpansionState = Object.fromEntries(
  BUILTIN_DEFAULT_KEYS.map((key) => [key, false])
);

let persistedState: LayoutGroupExpansionState = { ...DEFAULT_EXPANDED };

export const getLayoutGroupExpansionState = (): LayoutGroupExpansionState => ({
  ...persistedState,
});

export const setLayoutGroupExpansionState = (
  next: LayoutGroupExpansionState
) => {
  persistedState = { ...next };
};

export const resetLayoutGroupExpansionPersistence = () => {
  persistedState = { ...DEFAULT_EXPANDED };
};
