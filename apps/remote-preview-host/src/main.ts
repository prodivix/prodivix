import { createServer } from 'node:http';
import { createPreviewHttpHandler } from './previewHttpHandler';
import { createPreviewSessionStore } from './previewSessionStore';

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`);
  return value;
};

const internalToken = process.env.REMOTE_PREVIEW_HOST_TOKEN?.trim();
if (!internalToken)
  throw new TypeError('REMOTE_PREVIEW_HOST_TOKEN is required.');

const editorOrigins = (
  process.env.REMOTE_PREVIEW_EDITOR_ORIGINS ?? 'http://localhost:5173'
)
  .split(',')
  .map((origin) => new URL(origin.trim()).origin);
const maximumTtlMs =
  positiveInteger('REMOTE_PREVIEW_MAXIMUM_TTL_SECONDS', 600) * 1_000;
const store = createPreviewSessionStore({
  maximumSessions: positiveInteger('REMOTE_PREVIEW_MAXIMUM_SESSIONS', 128),
  maximumTotalBytes: positiveInteger(
    'REMOTE_PREVIEW_MAXIMUM_TOTAL_BYTES',
    256 * 1024 * 1024
  ),
  maximumTtlMs,
});
const handler = createPreviewHttpHandler({
  internalToken,
  publicBaseUrl:
    process.env.REMOTE_PREVIEW_PUBLIC_BASE_URL ??
    'http://preview.localhost:4180',
  editorOrigins,
  store,
  maximumUploadBytes: positiveInteger(
    'REMOTE_PREVIEW_MAXIMUM_UPLOAD_BYTES',
    64 * 1024 * 1024
  ),
  defaultTtlMs: Math.min(
    positiveInteger('REMOTE_PREVIEW_DEFAULT_TTL_SECONDS', 600) * 1_000,
    maximumTtlMs
  ),
});
const port = positiveInteger('REMOTE_PREVIEW_PORT', 4180);
const host = process.env.REMOTE_PREVIEW_HOST ?? '127.0.0.1';

createServer(handler).listen(port, host, () => {
  process.stdout.write(`Remote Preview Host listening on ${host}:${port}.\n`);
});
