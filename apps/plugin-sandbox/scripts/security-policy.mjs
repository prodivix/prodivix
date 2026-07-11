const commonDirectives = [
  "default-src 'none'",
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'none'",
].join('; ');

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

const sharedHeaders = Object.freeze({
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Permissions-Policy': permissionsPolicy,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

/**
 * Produces the immutable policy shared by the generated static artifacts,
 * Cloudflare-compatible headers file, production Nginx image, and deployment
 * conformance checks.
 */
export const createSandboxSecurityPolicy = ({ runtimeHash, uiHash }) => {
  const scriptHeaders = Object.freeze({
    ...sharedHeaders,
    'Access-Control-Allow-Origin': '*',
  });
  return Object.freeze({
    '/runtime-broker.html': Object.freeze({
      ...sharedHeaders,
      'Content-Security-Policy': `${commonDirectives}; script-src '${runtimeHash}' blob:; worker-src blob:`,
    }),
    '/ui-conformance.html': Object.freeze({
      ...sharedHeaders,
      'Content-Security-Policy': `${commonDirectives}; script-src '${uiHash}'; worker-src 'none'`,
    }),
    '/runtime-broker.js': scriptHeaders,
    '/ui-conformance.js': scriptHeaders,
    '/index.html': Object.freeze({
      ...sharedHeaders,
      'Content-Security-Policy': commonDirectives,
    }),
  });
};

export const renderCloudflareHeaders = (headers) =>
  Object.entries(headers)
    .map(
      ([route, values]) =>
        `${route}\n${Object.entries(values)
          .map(([name, value]) => `  ${name}: ${value}`)
          .join('\n')}`
    )
    .join('\n\n');

export const renderNginxConfig = (headers) => {
  const locations = Object.entries(headers)
    .map(
      ([route, values]) => `location = ${route} {
${Object.entries(values)
  .map(([name, value]) => `  add_header ${name} "${value}" always;`)
  .join('\n')}
  try_files ${route} =404;
}`
    )
    .join('\n\n');
  return `server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  types { text/html html; application/javascript js; application/json json; }
  default_type application/octet-stream;

${locations}

  location / { return 404; }
}
`;
};
