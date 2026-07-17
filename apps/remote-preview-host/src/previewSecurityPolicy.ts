const permissionsPolicy = [
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

const normalizedCapabilityOrigin = (value?: string): string => {
  if (!value) return "'none'";
  const url = new URL(value);
  const loopback =
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.hostname.endsWith('.localhost');
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.origin !== value
  )
    throw new TypeError('Preview capability origin is invalid.');
  return url.origin;
};

export const createPreviewSecurityHeaders = (
  editorOrigins: readonly string[],
  capabilityOrigin?: string
): Readonly<Record<string, string>> => {
  const connectSource = normalizedCapabilityOrigin(capabilityOrigin);
  return Object.freeze({
    'access-control-allow-origin': '*',
    'cache-control': 'private, no-store',
    'content-security-policy': [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "media-src 'self' data: blob:",
      `connect-src ${connectSource}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${editorOrigins.join(' ')}`,
      'sandbox allow-scripts',
    ].join('; '),
    'cross-origin-embedder-policy': 'credentialless',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'cross-origin',
    'origin-agent-cluster': '?1',
    'permissions-policy': permissionsPolicy,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
};
