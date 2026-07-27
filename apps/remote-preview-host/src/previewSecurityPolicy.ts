import { carriesCredentialsSafely } from '@prodivix/shared/safety';

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
  if (
    !carriesCredentialsSafely(url) ||
    url.username ||
    url.password ||
    url.origin !== value
  )
    throw new TypeError('Preview capability origin is invalid.');
  return url.origin;
};

/**
 * Preview documents must keep the tuple origin of their per-session capability
 * subdomain. The editor bridge authenticates every frame message by exact
 * `event.origin` and answers with `postMessage(response, previewOrigin)`, so the
 * origin model has to stay `https://<capability>.<preview-host>` on both sides.
 *
 * That is why no CSP `sandbox` directive is emitted: CSP sandbox flags union with
 * the embedder's iframe `sandbox` attribute and can never widen it, so any
 * `sandbox` value without `allow-same-origin` would force an opaque origin, make
 * every bridge message arrive as `origin: 'null'`, and make every targeted reply
 * undeliverable. Isolation is carried instead by the unguessable per-session
 * capability origin, `frame-ancestors`, COOP/COEP/CORP, the `'none'`-by-default
 * fetch directives with `connect-src` pinned to the capability origin, the
 * Permissions-Policy denylist, and the embedder's own iframe `sandbox` attribute.
 */
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
