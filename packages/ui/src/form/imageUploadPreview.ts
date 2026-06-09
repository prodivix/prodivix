import {
  MAX_SVG_PREVIEW_BYTES,
  SVG_MIME_TYPE,
  isSvgFileLike,
  sanitizeSvgMarkup,
} from '@prodivix/shared/safety';

const PREVIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

const PREVIEWABLE_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
];

export const isBlobPreviewUrl = (url: string) => url.startsWith('blob:');

const isPreviewableBitmapFile = (file: File) => {
  const type = file.type.toLowerCase();
  if (PREVIEWABLE_IMAGE_TYPES.has(type)) return true;
  if (type) return false;

  const name = file.name.toLowerCase();
  return PREVIEWABLE_IMAGE_EXTENSIONS.some((extension) =>
    name.endsWith(extension)
  );
};

const createSvgPreviewUrl = async (file: File) => {
  if (file.size > MAX_SVG_PREVIEW_BYTES) return null;

  const safeMarkup = sanitizeSvgMarkup(await file.text());
  if (!safeMarkup) return null;

  const blob = new Blob([safeMarkup], { type: SVG_MIME_TYPE });
  return URL.createObjectURL(blob);
};

export const createImageUploadPreviewUrl = async (file: File) => {
  if (isSvgFileLike(file)) {
    return createSvgPreviewUrl(file);
  }
  if (!isPreviewableBitmapFile(file)) return null;

  const url = URL.createObjectURL(file);
  return isBlobPreviewUrl(url) ? url : null;
};
