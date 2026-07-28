import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { VerificationArtifactKind } from './verification.types';
import {
  hasVerificationJpegSignature,
  hasVerificationPngSignature,
} from './verificationArtifactImage';
import type { VerificationArtifactDetectedMediaType } from './verificationArtifactPolicy.types';
import { decodeVerificationArtifactUtf8Strict } from './verificationArtifactUtf8';

const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const GZIP_SIGNATURE = new Uint8Array([0x1f, 0x8b]);
const SEVEN_ZIP_SIGNATURE = new Uint8Array([
  0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
]);
const RAR_SIGNATURE = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
const PDF_SIGNATURE = utf8ToBytes('%PDF-');
const TAR_SIGNATURE_OFFSET = 257;
const TAR_SIGNATURE = utf8ToBytes('ustar');

export const JSON_VERIFICATION_ARTIFACT_KINDS =
  new Set<VerificationArtifactKind>([
    'accessibility-report',
    'trace',
    'network-summary',
    'console-summary',
    'coverage-summary',
    'performance-profile',
    'security-report',
    'replay-record',
  ]);

export const IMAGE_VERIFICATION_ARTIFACT_KINDS =
  new Set<VerificationArtifactKind>(['screenshot', 'visual-diff']);

export const SUPPORTED_VERIFICATION_ARTIFACT_KINDS =
  new Set<VerificationArtifactKind>([
    ...JSON_VERIFICATION_ARTIFACT_KINDS,
    ...IMAGE_VERIFICATION_ARTIFACT_KINDS,
    'build-log',
  ]);

export const ACTIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/ecmascript',
  'text/html',
  'text/javascript',
  'text/xml',
]);

export const ARCHIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES = new Set([
  'application/gzip',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-gzip',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/zip',
]);

export const ACTIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA =
  new Set<VerificationArtifactDetectedMediaType>([
    'application/javascript',
    'application/xml',
    'image/svg+xml',
    'text/html',
  ]);

export const ARCHIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA =
  new Set<VerificationArtifactDetectedMediaType>([
    'application/gzip',
    'application/x-archive',
    'application/zip',
  ]);

export const UNSUPPORTED_DETECTED_VERIFICATION_ARTIFACT_MEDIA =
  new Set<VerificationArtifactDetectedMediaType>([
    'application/octet-stream',
    'application/pdf',
    'application/wasm',
  ]);

const hasPrefix = (
  contents: Uint8Array,
  prefix: Uint8Array,
  offset = 0
): boolean =>
  offset >= 0 &&
  contents.byteLength >= offset + prefix.byteLength &&
  prefix.every((byte, index) => contents[offset + index] === byte);

const looksLikeJson = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const normalizeVerificationArtifactMediaType = (
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === value &&
    normalized.length <= 127 &&
    MEDIA_TYPE_PATTERN.test(normalized)
    ? normalized
    : undefined;
};

export const isVerificationArtifactJsonMediaType = (
  mediaType: string
): boolean =>
  mediaType === 'application/json' ||
  (mediaType.startsWith('application/') && mediaType.endsWith('+json'));

export const sniffVerificationArtifactMediaType = (
  contents: Uint8Array
): VerificationArtifactDetectedMediaType => {
  if (!(contents instanceof Uint8Array)) {
    throw new TypeError('Verification artifact contents must be bytes.');
  }
  if (hasVerificationPngSignature(contents)) return 'image/png';
  if (hasVerificationJpegSignature(contents)) return 'image/jpeg';
  if (
    contents.byteLength >= 4 &&
    contents[0] === 0x50 &&
    contents[1] === 0x4b &&
    ((contents[2] === 0x03 && contents[3] === 0x04) ||
      (contents[2] === 0x05 && contents[3] === 0x06) ||
      (contents[2] === 0x07 && contents[3] === 0x08))
  ) {
    return 'application/zip';
  }
  if (hasPrefix(contents, GZIP_SIGNATURE)) return 'application/gzip';
  if (
    hasPrefix(contents, SEVEN_ZIP_SIGNATURE) ||
    hasPrefix(contents, RAR_SIGNATURE) ||
    hasPrefix(contents, TAR_SIGNATURE, TAR_SIGNATURE_OFFSET)
  ) {
    return 'application/x-archive';
  }
  if (hasPrefix(contents, PDF_SIGNATURE)) return 'application/pdf';
  if (
    contents.byteLength >= 4 &&
    contents[0] === 0x00 &&
    contents[1] === 0x61 &&
    contents[2] === 0x73 &&
    contents[3] === 0x6d
  ) {
    return 'application/wasm';
  }
  const text = decodeVerificationArtifactUtf8Strict(contents);
  if (text === undefined) return 'application/octet-stream';
  const trimmed = text.trimStart();
  const lower = trimmed.slice(0, 512).toLowerCase();
  if (/^<svg(?:\s|>)/u.test(lower)) return 'image/svg+xml';
  if (/^<\?xml(?:\s|\?>)/u.test(lower)) return 'application/xml';
  if (
    /^<!doctype\s+html(?:\s|>)/u.test(lower) ||
    /^<(?:html|head|body|script|iframe|object|embed|link|style)(?:\s|>)/u.test(
      lower
    )
  ) {
    return 'text/html';
  }
  if (
    /^(?:"use strict";?|import\s|export\s|function\s|(?:const|let|var)\s)/u.test(
      trimmed
    )
  ) {
    return 'application/javascript';
  }
  return looksLikeJson(text) ? 'application/json' : 'text/plain';
};
