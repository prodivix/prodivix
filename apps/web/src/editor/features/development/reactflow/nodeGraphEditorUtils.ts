const createId = (prefix: string, sliceLength: number) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, sliceLength)}`;

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createNodeId = () => createId('node', 6);
export const createSwitchCaseId = () => createId('case', 5);
export const createFetchStatusId = () => createId('status', 5);
export const createBranchId = () => createId('branch', 5);
export const createBindingId = () => createId('bind', 5);

export const resolveColorModeFromDocument = (): 'light' | 'dark' => {
  if (typeof document === 'undefined') return 'light';
  const themeAttr = document.documentElement.getAttribute('data-theme');
  if (themeAttr === 'dark') return 'dark';
  if (themeAttr === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
};

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
