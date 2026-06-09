export type SafeNavigateLinkKind = 'external' | 'internal';

export const normalizeBaseURL = (baseURL: string) => {
  let end = baseURL.length;
  while (end > 0 && baseURL[end - 1] === '/') {
    end -= 1;
  }
  return baseURL.slice(0, end);
};

export const parseHttpUrl = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

export const getNavigateLinkKind = (
  to: string
): SafeNavigateLinkKind | null => {
  if (to.startsWith('https://') || to.startsWith('http://')) return 'external';
  if (to.startsWith('/')) return 'internal';
  if (to.startsWith('#') || to.startsWith('?')) return 'internal';
  return null;
};

export const isSafeNavigateTo = (to: string) =>
  getNavigateLinkKind(to) !== null;
