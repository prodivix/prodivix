import { parseHttpUrl } from './url';

export type SafeEmbedType =
  | 'YouTube'
  | 'Vimeo'
  | 'Twitter'
  | 'Instagram'
  | 'Facebook'
  | 'Custom';

const isDigitsOnly = (value: string) => {
  for (const char of value) {
    if (char < '0' || char > '9') return false;
  }
  return value.length > 0;
};

export const readYouTubeVideoId = (url: string) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  if (parsed.hostname === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id?.length === 11 ? id : null;
  }

  if (
    parsed.hostname === 'youtube.com' ||
    parsed.hostname === 'www.youtube.com' ||
    parsed.hostname === 'm.youtube.com'
  ) {
    const queryId = parsed.searchParams.get('v');
    if (queryId?.length === 11) return queryId;

    const segments = parsed.pathname.split('/').filter(Boolean);
    const markerIndex = segments.findIndex((segment) =>
      ['embed', 'e', 'v', 'shorts'].includes(segment)
    );
    const id = markerIndex >= 0 ? segments[markerIndex + 1] : null;
    return id?.length === 11 ? id : null;
  }

  return null;
};

export const readVimeoVideoId = (url: string) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  if (parsed.hostname !== 'vimeo.com' && parsed.hostname !== 'www.vimeo.com') {
    return null;
  }

  const id = parsed.pathname.split('/').filter(Boolean).at(-1);
  return id && isDigitsOnly(id) ? id : null;
};

export const readFacebookVideoId = (url: string) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  if (
    parsed.hostname !== 'facebook.com' &&
    parsed.hostname !== 'www.facebook.com'
  ) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const videosIndex = segments.indexOf('videos');
  const id = videosIndex >= 0 ? segments[videosIndex + 1] : null;
  return id && isDigitsOnly(id) ? id : null;
};

export const resolveSafeEmbedUrl = (type: SafeEmbedType, url: string) => {
  switch (type) {
    case 'YouTube': {
      const videoId = readYouTubeVideoId(url);
      return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    }

    case 'Vimeo': {
      const videoId = readVimeoVideoId(url);
      return videoId ? `https://player.vimeo.com/video/${videoId}` : '';
    }

    case 'Twitter':
    case 'Instagram':
      return parseHttpUrl(url)?.toString() ?? '';

    case 'Facebook': {
      const videoId = readFacebookVideoId(url);
      return videoId
        ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}`
        : '';
    }

    case 'Custom':
    default:
      return parseHttpUrl(url)?.toString() ?? '';
  }
};
