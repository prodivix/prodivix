export const createPlaceholderSvg = (
  label: string,
  width = 160,
  height = 120
) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eef1f6"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#7b8794" dominant-baseline="middle" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const PLACEHOLDER_IMAGE = createPlaceholderSvg('IMG');
export const PLACEHOLDER_AVATAR = createPlaceholderSvg('AV', 80, 80);
export const PLACEHOLDER_VIDEO = createPlaceholderSvg('VIDEO');
export const PLACEHOLDER_IFRAME = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:Arial,sans-serif;color:#6b7280;">Iframe</div>`;
export const EMBED_PLACEHOLDER_URL = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:Arial,sans-serif;color:#6b7280;">Embed</div>'
)}`;
