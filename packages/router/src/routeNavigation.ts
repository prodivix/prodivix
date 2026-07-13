export type NavigateLinkKind = 'external' | 'internal';

export const getNavigateLinkKind = (
  target: string
): NavigateLinkKind | null => {
  if (target.startsWith('https://') || target.startsWith('http://')) {
    return 'external';
  }
  if (
    target.startsWith('/') ||
    target.startsWith('#') ||
    target.startsWith('?')
  ) {
    return 'internal';
  }
  return null;
};

export const isSafeNavigateTo = (target: string) =>
  getNavigateLinkKind(target) !== null;
